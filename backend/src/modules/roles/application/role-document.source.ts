import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  DOCUMENT_SOURCES,
  type DocumentModel,
  type DocumentSource,
  type DocumentSourceRegistry,
} from '#core/application/ports/document.port.js';
import { ROLE_REPOSITORY, type RoleRepository } from '../domain/role.repository.js';

/**
 * "roles" document: a role and the permissions it grants, for access reviews
 * and sign-off. Also the reference for making any record printable.
 */
@Injectable()
export class RoleDocumentSource implements DocumentSource, OnModuleInit {
  readonly key = 'roles';
  readonly permissions = ['roles:read'] as const;

  constructor(
    @Inject(DOCUMENT_SOURCES) private readonly registry: DocumentSourceRegistry,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async build(_principal: unknown, id: string): Promise<DocumentModel> {
    const role = await this.roles.getById(id);
    const catalogue = new Map(
      (await this.roles.listPermissions()).map((p) => [p.code, p.description]),
    );
    const codes = [...role.permissionCodes].sort((a, b) => a.localeCompare(b));
    return {
      title: 'Role definition',
      number: role.code,
      filename: `role-${role.code.toLowerCase()}`,
      fields: [
        { label: 'Name', value: role.name },
        { label: 'Code', value: role.code },
        { label: 'Type', value: role.isSystem ? 'System role' : 'Custom role' },
        { label: 'Users assigned', value: role.userCount, format: 'number' },
        { label: 'Last changed', value: role.updatedAt.toISOString(), format: 'datetime' },
        { label: 'Version', value: role.version, format: 'number' },
      ],
      sections: [
        ...(role.description
          ? [{ kind: 'text' as const, title: 'Description', text: role.description }]
          : []),
        {
          kind: 'table',
          title: `Permissions (${codes.length})`,
          columns: [
            { key: 'code', label: 'Permission', weight: 2 },
            { key: 'description', label: 'Grants', weight: 3 },
          ],
          rows: codes.map((code) => ({ code, description: catalogue.get(code) ?? null })),
          emptyText: 'This role grants no permissions.',
        },
      ],
    };
  }
}
