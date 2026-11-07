export type IsolationLevel = 'ReadCommitted' | 'RepeatableRead' | 'Serializable';

export interface TransactionOptions {
  isolationLevel?: IsolationLevel;
  /** Max time (ms) the transaction may run. */
  timeoutMs?: number;
}

/**
 * Unit of work. Every repository call made inside `run` joins the same database
 * transaction; if `work` throws, all changes roll back. Nested calls reuse the
 * outer transaction.
 */
export interface TransactionManager {
  run<T>(work: () => Promise<T>, options?: TransactionOptions): Promise<T>;
}

export const TRANSACTION_MANAGER = Symbol('TransactionManager');
