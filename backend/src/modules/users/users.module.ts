import { Module } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { CreateUserUseCase } from './application/create-user.use-case.js';
import { DeleteUserUseCase } from './application/delete-user.use-case.js';
import { GetCurrentUserUseCase } from './application/get-current-user.use-case.js';
import { GetUserUseCase } from './application/get-user.use-case.js';
import { PasswordExpiryReminder } from './application/password-expiry.reminder.js';
import { PasswordPolicyService, SECURITY_POLICY } from './application/password-policy.service.js';
import { ListUsersUseCase } from './application/list-users.use-case.js';
import { RestoreUserUseCase } from './application/restore-user.use-case.js';
import { UpdateMyProfileUseCase } from './application/update-my-profile.use-case.js';
import { UpdateUserUseCase } from './application/update-user.use-case.js';
import { UserApprovalHandlers } from './application/user-approval.handlers.js';
import { UserOptionSource } from './application/user-option.source.js';
import {
  EndUserSessionsUseCase,
  ResetUserPasswordUseCase,
  UnlockUserUseCase,
} from './application/user-admin.use-cases.js';
import type { SecurityPolicy } from './domain/password-policy.js';
import { PASSWORD_HISTORY, USER_REPOSITORY } from './domain/user.repository.js';
import {
  PrismaPasswordHistoryRepository,
  PrismaUserRepository,
} from './infrastructure/prisma-user.repository.js';
import { UsersController } from './presentation/users.controller.js';

@Module({
  controllers: [UsersController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: PASSWORD_HISTORY, useClass: PrismaPasswordHistoryRepository },
    {
      provide: SECURITY_POLICY,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig): SecurityPolicy => c.securityPolicy,
    },
    PasswordPolicyService,
    PasswordExpiryReminder,
    GetCurrentUserUseCase,
    GetUserUseCase,
    ListUsersUseCase,
    CreateUserUseCase,
    UpdateUserUseCase,
    UpdateMyProfileUseCase,
    DeleteUserUseCase,
    RestoreUserUseCase,
    UnlockUserUseCase,
    ResetUserPasswordUseCase,
    EndUserSessionsUseCase,
    UserApprovalHandlers,
    UserOptionSource,
  ],
  exports: [USER_REPOSITORY, GetCurrentUserUseCase, PasswordPolicyService, SECURITY_POLICY],
})
export class UsersModule {}
