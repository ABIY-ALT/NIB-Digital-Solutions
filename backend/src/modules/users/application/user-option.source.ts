import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  OPTION_SOURCES,
  option,
  type OptionItem,
  type OptionSource,
  type OptionSourceRegistry,
  type OptionsRequest,
} from '#core/application/ports/option-source.port.js';
import type { Principal } from '#core/application/security/principal.js';
import { mapPage, type FilterCondition, type Page } from '#core/domain/pagination.js';
import { AuthorizationService } from '#modules/authorization/application/authorization.service.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';
import { UserPermissions } from './user-resource.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "users" picker source (value = user id). Row-level scope is the same as the
 * user list: branch-scoped readers only see their branch. `parent` filters by
 * branch code.
 */
@Injectable()
export class UserOptionSource implements OptionSource, OnModuleInit {
  readonly key = 'users';
  readonly permissions = [UserPermissions.read] as const;

  constructor(
    @Inject(OPTION_SOURCES) private readonly registry: OptionSourceRegistry,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly authz: AuthorizationService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async find(principal: Principal, request: OptionsRequest): Promise<Page<OptionItem>> {
    const constraint = this.authz.listConstraint(principal, UserPermissions.read);
    const values = request.values?.filter((v) => UUID.test(v));
    const filters: FilterCondition[] = values
      ? [{ field: 'id', operator: 'in', value: values }]
      : [{ field: 'status', operator: 'ne', value: 'DISABLED' }];
    if (request.parent && !values) {
      filters.push({ field: 'branchCode', operator: 'eq', value: request.parent.toUpperCase() });
    }
    const page = await this.users.findPageConstrained(
      {
        page: values ? 1 : request.page,
        pageSize: values ? Math.max(1, values.length) : request.pageSize,
        sort: [{ field: 'fullName', direction: 'asc' }],
        search: values ? undefined : request.search,
        filters,
      },
      constraint.kind === 'all' ? null : constraint.constraints,
    );
    return mapPage(page, (u) =>
      option(u.id, u.fullName, {
        hint: u.branchCode,
        description: `${u.username} · ${u.email}`,
        disabled: u.status === 'DISABLED',
      }),
    );
  }
}
