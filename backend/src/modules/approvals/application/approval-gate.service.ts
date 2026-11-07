import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { trackChange } from '#core/application/audit-changes.js';
import { AppEvents, type ApprovalSubmittedEvent } from '#core/application/events/app-events.js';
import type {
  ApprovalGate,
  ApprovalHandler,
  ApprovalTicket,
  GateOutcome,
  GateRequest,
} from '#core/application/ports/approval.port.js';
import { EVENT_BUS, type EventBus } from '#core/application/ports/event-bus.port.js';
import {
  REQUEST_CONTEXT,
  type RequestContextAccessor,
} from '#core/application/ports/request-context.port.js';
import type { Principal } from '#core/application/security/principal.js';
import { AppError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import { grantsUnscoped } from '#modules/authorization/domain/permission.js';
import { USER_REPOSITORY, type UserRepository } from '#modules/users/domain/user.repository.js';
import { ApprovalRequest } from '../domain/approval-request.js';
import { APPROVAL_REPOSITORY, type ApprovalRepository } from './approval.repository.js';

export interface ApprovalPolicy {
  enabled: boolean;
  /** Actions that need a checker. */
  actions: string[];
  expiryHours: number;
}

export const APPROVAL_POLICY = Symbol('ApprovalPolicy');

/** Every checker needs this, plus the handler's own permissions. */
export const APPROVE_PERMISSION = 'approvals:approve';

/**
 * The maker–checker gate. Features call `submit`; when the action is under
 * four-eyes control (configuration), the request is validated by its handler,
 * stored, and the entitled checkers are notified — otherwise it runs at once.
 */
@Injectable()
export class ApprovalGateService implements ApprovalGate, OnApplicationBootstrap {
  private readonly logger = new Logger('Approvals');
  private readonly handlers = new Map<string, ApprovalHandler>();

  constructor(
    @Inject(APPROVAL_REPOSITORY) private readonly repo: ApprovalRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(REQUEST_CONTEXT) private readonly context: RequestContextAccessor,
    @Inject(APPROVAL_POLICY) readonly policy: ApprovalPolicy,
  ) {}

  register(handler: ApprovalHandler): void {
    if (this.handlers.has(handler.action)) {
      throw new Error(`Approval handler for "${handler.action}" is already registered`);
    }
    this.handlers.set(handler.action, handler);
  }

  handler(action: string): ApprovalHandler | undefined {
    return this.handlers.get(action);
  }

  /** Registered actions with whether they currently require approval (policy view). */
  catalogue(): Array<{
    action: string;
    resourceType: string;
    checkerPermissions: string[];
    required: boolean;
  }> {
    return [...this.handlers.values()]
      .map((h) => ({
        action: h.action,
        resourceType: h.resourceType,
        checkerPermissions: [APPROVE_PERMISSION, ...h.checkerPermissions],
        required: this.isRequired(h.action),
      }))
      .sort((a, b) => a.action.localeCompare(b.action));
  }

  isRequired(action: string): boolean {
    return this.policy.enabled && this.policy.actions.includes(action) && this.handlers.has(action);
  }

  /** Actions the principal may decide (holds approvals:approve and each handler permission). */
  eligibleActions(principal: Principal): string[] {
    const holds = (perm: string) => principal.permissions.some((g) => grantsUnscoped(g, perm));
    if (!holds(APPROVE_PERMISSION)) return [];
    return [...this.handlers.values()]
      .filter((h) => h.checkerPermissions.every(holds))
      .map((h) => h.action);
  }

  async submit<T>(request: GateRequest<T>): Promise<GateOutcome<T>> {
    if (!this.isRequired(request.action)) {
      return { status: 'EXECUTED', result: await request.execute() };
    }
    const handler = this.handlers.get(request.action)!;
    // Fail fast: the maker learns about invalid input now, not after review.
    const description = await handler.describe(request.payload, request.principal);
    if (description.resourceId) {
      const pending = await this.repo.findPendingFor(handler.resourceType, description.resourceId);
      if (pending) {
        throw new AppError(ErrorCode.APPROVAL_ALREADY_PENDING, {
          details: { approvalId: pending.id },
        });
      }
    }

    const [maker] = await this.users.findContacts([request.principal.userId]);
    const makerName = maker?.fullName ?? request.principal.username;
    const approval = ApprovalRequest.submit({
      action: handler.action,
      resourceType: handler.resourceType,
      resourceId: description.resourceId,
      summary: description.summary,
      payload: request.payload,
      before: description.before ?? null,
      after: description.after ?? null,
      maker: { id: request.principal.userId, name: makerName },
      makerComment: request.comment?.trim() || null,
      checkerPermissions: [...handler.checkerPermissions],
      expiresAt: new Date(Date.now() + this.policy.expiryHours * 3_600_000),
      correlationId: this.context.current()?.correlationId ?? null,
    });
    await this.repo.create(approval);
    // The *_REQUESTED audit record shows the proposed values next to the current ones.
    trackChange(this.context.current(), {
      resourceType: handler.resourceType,
      resourceId: description.resourceId,
      before: description.before ?? null,
      after: description.after ?? null,
      proposed: true,
    });

    const checkerIds = await this.users.findActiveUserIds({
      allPermissions: [APPROVE_PERMISSION, ...handler.checkerPermissions],
      excludeIds: [request.principal.userId],
    });
    await this.events.publish<ApprovalSubmittedEvent>({
      name: AppEvents.ApprovalSubmitted,
      payload: {
        approvalId: approval.id,
        action: approval.action,
        summary: approval.summary,
        makerId: request.principal.userId,
        makerName,
        checkerIds,
        expiresAt: approval.expiresAt.toISOString(),
      },
    });
    if (checkerIds.length === 0) {
      this.logger.warn(
        { action: approval.action, approvalId: approval.id },
        'No active checker is entitled to decide this request',
      );
    }

    const ticket: ApprovalTicket = {
      approvalId: approval.id,
      status: 'PENDING',
      action: approval.action,
      resourceType: handler.resourceType,
      resourceId: description.resourceId,
      summary: approval.summary,
      expiresAt: approval.expiresAt.toISOString(),
    };
    return { status: 'PENDING', ticket };
  }

  /** Misconfiguration check: an action under approval without a handler is ignored. */
  onApplicationBootstrap(): void {
    const missing = this.policy.actions.filter((a) => !this.handlers.has(a));
    if (missing.length) {
      this.logger.warn(
        { actions: missing },
        'APPROVAL_ACTIONS lists actions without a registered handler; they run without approval',
      );
    }
  }
}
