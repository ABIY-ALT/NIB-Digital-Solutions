export interface StoredResponse {
  statusCode: number;
  body: unknown;
}

export type IdempotencyBeginResult =
  | { state: 'started' }
  | { state: 'in_progress' }
  | { state: 'completed'; response: StoredResponse }
  | { state: 'fingerprint_mismatch' };

/**
 * Stores idempotency keys and the first response for each key, so a retried
 * request (same key + same payload) returns the original result instead of
 * executing twice.
 */
export interface IdempotencyStore {
  begin(key: string, fingerprint: string, ttlSeconds: number): Promise<IdempotencyBeginResult>;
  complete(
    key: string,
    fingerprint: string,
    response: StoredResponse,
    ttlSeconds: number,
  ): Promise<void>;
  /** Releases a key whose request failed, so the client may retry. */
  release(key: string): Promise<void>;
}

export const IDEMPOTENCY_STORE = Symbol('IdempotencyStore');
