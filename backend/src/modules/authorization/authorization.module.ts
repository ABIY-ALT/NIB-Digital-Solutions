import { Global, Module } from '@nestjs/common';
import { AuthorizationService } from './application/authorization.service.js';
import { PermissionsGuard } from './presentation/permissions.guard.js';

@Global()
@Module({
  providers: [AuthorizationService, PermissionsGuard],
  exports: [AuthorizationService, PermissionsGuard],
})
export class AuthorizationModule {}
