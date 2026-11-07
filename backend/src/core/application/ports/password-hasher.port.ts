export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
  /** True when the hash uses outdated parameters and should be re-hashed on next login. */
  needsRehash(hash: string): boolean;
}

export const PASSWORD_HASHER = Symbol('PasswordHasher');
