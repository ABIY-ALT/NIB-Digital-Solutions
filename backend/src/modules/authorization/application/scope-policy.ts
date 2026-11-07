import type { Principal, ResourceContext } from '#core/application/security/principal.js';

/**
 * An attribute-based rule attached to a permission scope (`users:read:branch`).
 * Features register their own policies in the PolicyRegistry.
 */
export interface ScopePolicy {
  readonly scope: string;
  /** Decides access for a concrete resource. */
  isSatisfied(principal: Principal, resource: ResourceContext): boolean;
  /**
   * Row filter for list queries, expressed on resource attributes
   * (e.g. { branchCode: 'ADD01' }). `null` means the scope cannot be
   * expressed as a filter and the list is denied.
   */
  toConstraint(principal: Principal): Record<string, string | null> | null;
}

/** `:own` — the resource belongs to the caller. */
export const OwnScopePolicy: ScopePolicy = {
  scope: 'own',
  isSatisfied: (principal, resource) => !!resource.ownerId && resource.ownerId === principal.userId,
  toConstraint: (principal) => ({ ownerId: principal.userId }),
};

/** `:branch` — the resource is in the caller's branch. */
export const BranchScopePolicy: ScopePolicy = {
  scope: 'branch',
  isSatisfied: (principal, resource) => {
    const branch = principal.attributes['branchCode'];
    return !!branch && resource.attributes?.['branchCode'] === branch;
  },
  toConstraint: (principal) => {
    const branch = principal.attributes['branchCode'];
    return branch ? { branchCode: branch } : null;
  },
};
