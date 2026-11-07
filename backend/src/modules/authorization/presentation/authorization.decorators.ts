import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'appcore:permissions';
export const ANY_PERMISSION_KEY = 'appcore:anyPermission';
export const ROLES_KEY = 'appcore:roles';
export const AUTHENTICATED_ONLY_KEY = 'appcore:authenticatedOnly';

/** Caller must hold ALL permissions (in any scope; scoped ones are enforced in the use case). */
export const RequirePermissions = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Caller must hold AT LEAST ONE of the permissions. */
export const RequireAnyPermission = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ANY_PERMISSION_KEY, permissions);

/** Caller must have at least one of the roles. */
export const RequireRoles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/**
 * Any authenticated user may call the endpoint (e.g. "my profile", "logout").
 * Explicit on purpose: endpoints WITHOUT authorization metadata are denied.
 */
export const AuthenticatedOnly = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHENTICATED_ONLY_KEY, true);
