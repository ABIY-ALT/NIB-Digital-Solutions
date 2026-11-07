/**
 * Lets any feature end a user's sessions (e.g. after disabling or deleting the
 * user) without depending on the auth module's internals.
 */
export interface SessionTerminator {
  terminateAllForUser(userId: string, reason: string): Promise<number>;
}

export const SESSION_TERMINATOR = Symbol('SessionTerminator');
