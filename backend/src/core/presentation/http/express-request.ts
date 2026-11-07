import type { Principal } from '#core/application/security/principal.js';

/**
 * Request properties AppCore attaches during the pipeline.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Correlation id assigned at the edge (CorrelationIdMiddleware). */
      correlationId?: string;
      /** Authenticated end user (JwtAuthGuard). */
      principal?: Principal;
      /** Verified BFF client id (ServiceAuthMiddleware). */
      serviceClientId?: string;
      /** True when the request body arrived encrypted → the response is encrypted too. */
      payloadEncrypted?: boolean;
      /** Raw body bytes (Nest `rawBody: true`), used for signature verification. */
      rawBody?: Buffer;
    }
  }
}

export {};
