import { Module } from '@nestjs/common';
import {
  CreateRoleUseCase,
  DeleteRoleUseCase,
  GetRoleUseCase,
  ListPermissionsUseCase,
  ListRolesUseCase,
  UpdateRoleUseCase,
} from './application/role.use-cases.js';
import { RoleApprovalHandlers } from './application/role-approval.handlers.js';
import { RoleDocumentSource } from './application/role-document.source.js';
import { RoleOptionSource } from './application/role-option.source.js';
import { ROLE_REPOSITORY } from './domain/role.repository.js';
import { PrismaRoleRepository } from './infrastructure/prisma-role.repository.js';
import { RolesController } from './presentation/roles.controller.js';

/** Role & permission management (RBAC administration). */
@Module({
  controllers: [RolesController],
  providers: [
    { provide: ROLE_REPOSITORY, useClass: PrismaRoleRepository },
    ListRolesUseCase,
    GetRoleUseCase,
    ListPermissionsUseCase,
    CreateRoleUseCase,
    UpdateRoleUseCase,
    DeleteRoleUseCase,
    RoleApprovalHandlers,
    RoleOptionSource,
    RoleDocumentSource,
  ],
})
export class RolesModule {}
