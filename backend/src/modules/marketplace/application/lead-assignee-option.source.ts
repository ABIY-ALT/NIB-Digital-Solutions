import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { pageOptions } from '#core/application/option-paging.js';
import {
  OPTION_SOURCES,
  option,
  type OptionItem,
  type OptionSource,
  type OptionSourceRegistry,
  type OptionsRequest,
} from '#core/application/ports/option-source.port.js';
import type { Principal } from '#core/application/security/principal.js';
import { ForbiddenError, NotFoundError } from '#core/domain/errors/app-error.js';
import type { Page } from '#core/domain/pagination.js';
import { AuthorizationService } from '#modules/authorization/application/authorization.service.js';
import { USER_REPOSITORY, type UserRepository } from '#modules/users/domain/user.repository.js';
import { assigneePermission, type LeadKind } from './lead-assignment.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Variant (the lead resource) → lead kind. */
const VARIANTS: Record<string, LeadKind> = {
  'demo-requests': 'demo',
  'product-inquiries': 'inquiry',
};

/** Upper bound of the staff list (the picker searches and pages it in memory). */
const MAX_ASSIGNEES = 500;

/**
 * "lead-assignees.demo-requests" / "lead-assignees.product-inquiries" picker
 * source (value = user id): the active staff who may own such a lead. Anyone
 * who can read that kind of lead may list them (to see and filter by owner);
 * assigning still needs the update permission. Current owners resolve even
 * when they no longer qualify (shown disabled), and so do legacy free-text
 * owners from before assignment was linked to accounts.
 */
@Injectable()
export class LeadAssigneeOptionSource implements OptionSource, OnModuleInit {
  readonly key = 'lead-assignees';
  readonly permissions = ['demo-requests:read', 'product-inquiries:read'] as const;
  readonly requiresVariant = true;

  constructor(
    @Inject(OPTION_SOURCES) private readonly registry: OptionSourceRegistry,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly authz: AuthorizationService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async find(
    principal: Principal,
    request: OptionsRequest,
    variant?: string,
  ): Promise<Page<OptionItem>> {
    const kind = variant ? VARIANTS[variant] : undefined;
    if (!kind) throw new NotFoundError('Option source', `lead-assignees.${variant ?? ''}`);
    const readPermission = `${variant!}:read`;
    if (!this.authz.hasPermission(principal, readPermission)) {
      throw new ForbiddenError(`Requires ${readPermission}`);
    }
    const permission = assigneePermission(kind);
    const eligible = await this.users.findActiveUserIds(
      { allPermissions: [permission] },
      MAX_ASSIGNEES,
    );
    const ids = request.values ? request.values : eligible;
    const contacts = await this.users.findContacts(ids.filter((id) => UUID.test(id)));
    const qualified = new Set(eligible);
    const items = contacts
      .map((c) =>
        option(c.id, c.fullName, {
          description: c.username,
          disabled: !qualified.has(c.id),
        }),
      )
      .sort((a, b) => a.label.localeCompare(b.label));
    if (request.values) {
      // Owners recorded as plain text before assignment was linked to accounts.
      for (const value of request.values) {
        if (!UUID.test(value)) {
          items.push(option(value, value, { description: null, disabled: true }));
        }
      }
    }
    return pageOptions(items, request);
  }
}
