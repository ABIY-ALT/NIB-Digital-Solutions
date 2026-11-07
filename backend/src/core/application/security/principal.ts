/**
 * The authenticated caller, as seen by the application layer. Built from a
 * validated access token + live session; never trusted from client input.
 */
export interface Principal {
  userId: string;
  username: string;
  sessionId: string;
  roles: readonly string[];
  permissions: readonly string[];
  /** ABAC attributes (branch, segment, ...). */
  attributes: Readonly<Record<string, string | null>>;
  mfaVerified: boolean;
  authMethod: 'password' | 'external';
}

/** Owner/attribute information about a resource used by ABAC policies. */
export interface ResourceContext {
  type: string;
  id?: string;
  ownerId?: string | null;
  attributes?: Readonly<Record<string, string | null | undefined>>;
}
