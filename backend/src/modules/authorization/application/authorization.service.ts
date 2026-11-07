import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '#core/application/ports/audit-logger.port.js';
import type { Principal, ResourceContext } from '#core/application/security/principal.js';
import { ForbiddenError } from '#core/domain/errors/app-error.js';
import { grantedScope, grantsUnscoped } from '../domain/permission.js';
import { BranchScopePolicy, OwnScopePolicy, type ScopePolicy } from './scope-policy.js';

export type AccessGrant =
  { kind: 'unscoped' } | { kind: 'scoped'; scopes: string[] } | { kind: 'none' };

/** List-query constraint derived from the caller's grant. */
export type ListConstraint =
  { kind: 'all' } | { kind: 'any-of'; constraints: Array<Record<string, string | null>> };

/**
 * Centralized, authoritative authorization (RBAC + ABAC).
 *
 *   1. RBAC — the principal's roles expand to permission codes (in the token).
 *   2. An UNSCOPED grant (users:read, users:*, *) allows any resource.
 *   3. SCOPED grants (users:read:branch, users:read:own) are evaluated by the
 *      ScopePolicy registered for that scope against resource attributes.
 *
 * Denials are audited here so every feature is covered consistently.
 */
@Injectable()
export class AuthorizationService {
  private readonly policies = new Map<string, ScopePolicy>();

  constructor(@Inject(AUDIT_LOGGER) private readonly audit: AuditLogger) {
    this.registerPolicy(OwnScopePolicy);
    this.registerPolicy(BranchScopePolicy);
  }

  /** Features add custom ABAC scopes here (e.g. "segment", "region"). */
  registerPolicy(policy: ScopePolicy): void {
    this.policies.set(policy.scope, policy);
  }

  grantFor(principal: Principal, permission: string): AccessGrant {
    if (principal.permissions.some((g) => grantsUnscoped(g, permission)))
      return { kind: 'unscoped' };
    const scopes = principal.permissions
      .map((g) => grantedScope(g, permission))
      .filter((s): s is string => s !== null && this.policies.has(s));
    return scopes.length > 0 ? { kind: 'scoped', scopes: [...new Set(scopes)] } : { kind: 'none' };
  }

  /** Coarse check (guard level): does the principal hold the permission in ANY scope? */
  hasPermission(principal: Principal, permission: string): boolean {
    return this.grantFor(principal, permission).kind !== 'none';
  }

  hasRole(principal: Principal, role: string): boolean {
    return principal.roles.includes(role);
  }

  /** Fine-grained check against a concrete resource. */
  can(principal: Principal, permission: string, resource?: ResourceContext): boolean {
    const grant = this.grantFor(principal, permission);
    if (grant.kind === 'unscoped') return true;
    if (grant.kind === 'none' || !resource) return false;
    return grant.scopes.some((scope) => this.policies.get(scope)!.isSatisfied(principal, resource));
  }

  /** Throws ForbiddenError (and audits the denial) when access is not allowed. */
  assert(principal: Principal, permission: string, resource?: ResourceContext): void {
    if (this.can(principal, permission, resource)) return;
    this.recordDenial(principal, permission, resource);
    throw new ForbiddenError();
  }

  /** Row-level constraint for list endpoints. Throws when no list access exists. */
  listConstraint(principal: Principal, permission: string): ListConstraint {
    const grant = this.grantFor(principal, permission);
    if (grant.kind === 'unscoped') return { kind: 'all' };
    if (grant.kind === 'scoped') {
      const constraints = grant.scopes
        .map((s) => this.policies.get(s)!.toConstraint(principal))
        .filter((c): c is Record<string, string | null> => c !== null);
      if (constraints.length > 0) return { kind: 'any-of', constraints };
    }
    this.recordDenial(principal, permission);
    throw new ForbiddenError();
  }

  recordDenial(
    principal: Principal | undefined,
    permission: string,
    resource?: ResourceContext,
  ): void {
    void this.audit.record({
      action: 'AUTHZ_DENIED',
      category: 'AUTHORIZATION',
      outcome: 'DENIED',
      errorCode: 'FORBIDDEN',
      actorId: principal?.userId ?? null,
      actorUsername: principal?.username ?? null,
      resourceType: resource?.type ?? null,
      resourceId: resource?.id ?? null,
      metadata: { permission },
    });
  }
}
