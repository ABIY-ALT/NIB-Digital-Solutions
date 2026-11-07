/**
 * Contract of the centralized external API client (principle 4). Adapters in
 * the infrastructure layer depend on this; business code depends on feature
 * ports (e.g. CoreBankingPort), never on HTTP.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ExternalRequest {
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  /** Overrides the client default timeout. */
  timeoutMs?: number;
  /** Explicitly allow retrying a non-idempotent method (only when the remote API is idempotent). */
  retryable?: boolean;
  signal?: AbortSignal;
}

export interface ExternalResponse<T> {
  status: number;
  headers: Record<string, string>;
  data: T;
  durationMs: number;
}

export interface ExternalApiClient {
  readonly name: string;
  request<T>(req: ExternalRequest): Promise<ExternalResponse<T>>;
  /** Runs `primary`, falling back to `fallback` when the call fails or the circuit is open. */
  withFallback<T>(
    primary: () => Promise<T>,
    fallback: (error: unknown) => T | Promise<T>,
  ): Promise<T>;
}
