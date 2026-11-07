import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AppEvents,
  type ApprovalDecidedEvent,
  type ApprovalFinalStatus,
} from '#core/application/events/app-events.js';
import { AUDIT_LOGGER, type AuditLogger } from '#core/application/ports/audit-logger.port.js';
import { EVENT_BUS, type EventBus } from '#core/application/ports/event-bus.port.js';
import type { Principal } from '#core/application/security/principal.js';
import { ForbiddenError, isAppError, NotFoundError } from '#core/domain/errors/app-error.js';
import type { Page } from '#core/domain/pagination.js';
import { grantsUnscoped } from '#modules/authorization/domain/permission.js';
import { USER_REPOSITORY, type UserRepository } from '#modules/users/domain/user.repository.js';
import type { ApprovalActor, ApprovalRequest, ApprovalStatus } from '../domain/approval-request.js';
import { APPROVE_PERMISSION, ApprovalGateService } from './approval-gate.service.js';
import {
  APPROVAL_REPOSITORY,
  type ApprovalBox,
  type ApprovalRepository,
} from './approval.repository.js';

export const READ_ALL_PERMISSION = 'approvals:read';

export interface ApprovalListInput {
  box: ApprovalBox;
  status?: ApprovalStatus[];
  action?: string;
  resourceType?: string;
  resourceId?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export interface ApprovalAccess {
  canDecide: boolean;
  canCancel: boolean;
}

/**
 * Reviewing, deciding and withdrawing maker–checker requests. On approval the
 * change is applied with the MAKER's current authority (if they lost the
 * permission meanwhile, the request fails instead of being applied).
 */
@Injectable()
export class ApprovalUseCases {
  private readonly logger = new Logger('Approvals');

  constructor(
    @Inject(APPROVAL_REPOSITORY) private readonly repo: ApprovalRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly gate: ApprovalGateService,
  ) {}

  // ── Queries ───────────────────────────────────────────────────────────────

  list(principal: Principal, input: ApprovalListInput): Promise<Page<ApprovalRequest>> {
    if (input.box === 'all' && !this.canReadAll(principal)) {
      throw new ForbiddenError('You cannot view every approval request.');
    }
    return this.repo.findPage({
      ...input,
      userId: principal.userId,
      eligibleActions: this.gate.eligibleActions(principal),
    });
  }

  async get(principal: Principal, id: string): Promise<ApprovalRequest> {
    const request = await this.repo.findById(id);
    if (!request) throw new NotFoundError('ApprovalRequest', id);
    const involved =
      request.maker.id === principal.userId ||
      request.checker?.id === principal.userId ||
      this.gate.eligibleActions(principal).includes(request.action) ||
      this.canReadAll(principal);
    if (!involved) throw new NotFoundError('ApprovalRequest', id); // no existence leak
    return request;
  }

  access(principal: Principal, request: ApprovalRequest): ApprovalAccess {
    const pending = request.status === 'PENDING' && !request.isExpired(new Date());
    return {
      canDecide:
        pending &&
        request.maker.id !== principal.userId &&
        this.gate.eligibleActions(principal).includes(request.action),
      canCancel: pending && request.maker.id === principal.userId,
    };
  }

  async summary(principal: Principal): Promise<{ inbox: number; mine: number }> {
    const [inbox, mine] = await Promise.all([
      this.repo.countInbox(principal.userId, this.gate.eligibleActions(principal)),
      this.repo.countPendingByMaker(principal.userId),
    ]);
    return { inbox, mine };
  }

  /** Resource id → pending approval id (drives "pending change" badges in lists). */
  pendingFor(resourceType: string, resourceIds: string[]): Promise<Map<string, string>> {
    return this.repo.pendingResourceIds(resourceType, resourceIds);
  }

  // ── Decisions ─────────────────────────────────────────────────────────────

  async approve(
    principal: Principal,
    id: string,
    comment: string | null,
  ): Promise<ApprovalRequest> {
    const request = await this.get(principal, id);
    this.assertEntitled(principal, request);
    request.approve(await this.actor(principal), comment);
    await this.repo.update(request); // claims the request (optimistic lock)

    const handler = this.gate.handler(request.action);
    try {
      if (!handler) throw new Error(`No handler for ${request.action}`);
      const maker = await this.makerPrincipal(request);
      const result = await handler.execute(request.payload, maker);
      request.markApplied(toJson(result));
      await this.repo.update(request);
      await this.record('APPROVAL_APPLIED', principal, request, 'SUCCESS', null);
      await this.publish(request, 'APPROVED', comment, null);
    } catch (error) {
      const code = isAppError(error) ? error.code : 'INTERNAL_ERROR';
      const message = isAppError(error)
        ? error.message
        : 'The change could not be applied. Try again or contact support.';
      if (!isAppError(error)) this.logger.error({ err: error, approvalId: id }, 'Apply failed');
      request.markFailed(code, message);
      await this.repo.update(request);
      await this.record('APPROVAL_APPLY_FAILED', principal, request, 'FAILURE', code);
      await this.publish(request, 'FAILED', comment, message);
    }
    return request;
  }

  async reject(principal: Principal, id: string, comment: string): Promise<ApprovalRequest> {
    const request = await this.get(principal, id);
    this.assertEntitled(principal, request);
    request.reject(await this.actor(principal), comment);
    await this.repo.update(request);
    await this.publish(request, 'REJECTED', comment, null);
    return request;
  }

  async cancel(principal: Principal, id: string): Promise<ApprovalRequest> {
    const request = await this.get(principal, id);
    request.cancel(await this.actor(principal));
    await this.repo.update(request);
    await this.publish(request, 'CANCELLED', null, null);
    return request;
  }

  /** Scheduled: pending requests past their deadline expire; makers are told. */
  async expireDue(now = new Date()): Promise<number> {
    let expired = 0;
    for (const request of await this.repo.findExpired(now, 200)) {
      try {
        request.expire(now);
        await this.repo.update(request);
        await this.publish(request, 'EXPIRED', null, null);
        expired += 1;
      } catch (error) {
        this.logger.warn({ err: error, approvalId: request.id }, 'Could not expire request');
      }
    }
    return expired;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private canReadAll(principal: Principal): boolean {
    return principal.permissions.some((g) => grantsUnscoped(g, READ_ALL_PERMISSION));
  }

  private assertEntitled(principal: Principal, request: ApprovalRequest): void {
    const holds = (p: string) => principal.permissions.some((g) => grantsUnscoped(g, p));
    if (!holds(APPROVE_PERMISSION) || !request.checkerPermissions.every(holds)) {
      if (request.maker.id !== principal.userId) {
        throw new ForbiddenError('You are not entitled to decide this request.');
      }
    }
  }

  private async actor(principal: Principal): Promise<ApprovalActor> {
    const [contact] = await this.users.findContacts([principal.userId]);
    return { id: principal.userId, name: contact?.fullName ?? principal.username };
  }

  /** The maker's CURRENT authority (roles may have changed since submission). */
  private async makerPrincipal(request: ApprovalRequest): Promise<Principal> {
    const maker = await this.users.findById(request.maker.id);
    if (!maker || maker.loginBlock(new Date()) === 'DISABLED') {
      throw new ForbiddenError("The requester's account is no longer active.");
    }
    return {
      userId: maker.id,
      username: maker.username,
      sessionId: `approval:${request.id}`,
      roles: [...maker.roleCodes],
      permissions: maker.permissions,
      attributes: maker.attributes,
      mfaVerified: true,
      authMethod: 'password',
    };
  }

  private async publish(
    request: ApprovalRequest,
    status: ApprovalFinalStatus,
    comment: string | null,
    error: string | null,
  ): Promise<void> {
    await this.events.publish<ApprovalDecidedEvent>({
      name: AppEvents.ApprovalDecided,
      payload: {
        approvalId: request.id,
        action: request.action,
        summary: request.summary,
        status,
        makerId: request.maker.id,
        checkerId: request.checker?.id ?? null,
        checkerName: request.checker?.name ?? null,
        comment,
        error,
      },
    });
  }

  private record(
    action: string,
    principal: Principal,
    request: ApprovalRequest,
    outcome: 'SUCCESS' | 'FAILURE',
    errorCode: string | null,
  ): Promise<void> {
    return this.audit.record({
      action,
      category: 'DATA_CHANGE',
      resourceType: 'ApprovalRequest',
      resourceId: request.id,
      outcome,
      errorCode,
      actorId: principal.userId,
      actorUsername: principal.username,
      metadata: {
        approvedAction: request.action,
        targetId: request.resourceId,
        makerId: request.maker.id,
      },
    });
  }
}

/** DTOs are plain JSON; anything else is stored as a string. */
function toJson(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') {
    // Serialise, not clone: dates become ISO strings, toJSON() applies, undefined is dropped.
    const json = JSON.stringify(value);
    return JSON.parse(json) as Record<string, unknown>;
  }
  return { value: typeof value === 'string' ? value : JSON.stringify(value) };
}
