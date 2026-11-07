import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  OPTION_SOURCES,
  option,
  type OptionItem,
  type OptionSource,
  type OptionSourceRegistry,
  type OptionsRequest,
} from '#core/application/ports/option-source.port.js';
import { mapPage, type Page } from '#core/domain/pagination.js';
import { ROLE_REPOSITORY, type RoleRepository } from '../domain/role.repository.js';

/**
 * "roles" picker source (value = role code). Open to role readers and to
 * anyone who assigns roles (user administration, broadcasts by role).
 */
@Injectable()
export class RoleOptionSource implements OptionSource, OnModuleInit {
  readonly key = 'roles';
  readonly permissions = [
    'roles:read',
    'users:create',
    'users:update',
    'notifications:broadcast',
  ] as const;

  constructor(
    @Inject(OPTION_SOURCES) private readonly registry: OptionSourceRegistry,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async find(_principal: unknown, request: OptionsRequest): Promise<Page<OptionItem>> {
    const values = request.values?.map((v) => v.toUpperCase());
    const page = await this.roles.findPage({
      page: values ? 1 : request.page,
      pageSize: values ? Math.max(1, values.length) : request.pageSize,
      sort: [{ field: 'name', direction: 'asc' }],
      search: values ? undefined : request.search,
      filters: values ? [{ field: 'code', operator: 'in', value: values }] : [],
    });
    return mapPage(page, (r) =>
      option(r.code, r.name, { hint: r.code, description: r.description }),
    );
  }
}
