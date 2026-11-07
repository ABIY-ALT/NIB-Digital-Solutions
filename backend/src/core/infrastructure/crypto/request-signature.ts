import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * AppCore BFF → backend service identity, protocol v1 (HMAC-SHA256).
 *
 * MUST stay compatible with frontend/packages/crypto/src/signature.ts.
 *
 * The BFF proves its identity on every call with a per-client shared secret.
 * The signature covers the method, path + query, timestamp, nonce, correlation
 * id, the end-user IP the BFF observed, and a SHA-256 of the exact body bytes
 * sent on the wire (ciphertext when encryption is on).
 *
 * Headers:
 *   X-AppCore-Client-Id   client id (e.g. "appcore-web")
 *   X-AppCore-Timestamp   unix epoch milliseconds
 *   X-AppCore-Nonce       unique per request (replay protection)
 *   X-AppCore-Client-Ip   end-user IP as seen by the BFF
 *   X-Correlation-Id      request correlation id
 *   X-AppCore-Signature   "v1=<base64url HMAC>"
 */
export const SignatureHeaders = {
  clientId: 'x-appcore-client-id',
  timestamp: 'x-appcore-timestamp',
  nonce: 'x-appcore-nonce',
  clientIp: 'x-appcore-client-ip',
  signature: 'x-appcore-signature',
  correlationId: 'x-correlation-id',
} as const;

export const SIGNATURE_SCHEME = 'APPCORE-HMAC-SHA256';

export interface SignatureInput {
  method: string;
  pathWithQuery: string;
  timestamp: string;
  nonce: string;
  correlationId: string;
  clientIp: string;
  body: Buffer | string | undefined;
}

export function sha256Hex(body: Buffer | string | undefined): string {
  return createHash('sha256')
    .update(body ?? '')
    .digest('hex');
}

export function canonicalString(input: SignatureInput): string {
  return [
    SIGNATURE_SCHEME,
    input.method.toUpperCase(),
    input.pathWithQuery,
    input.timestamp,
    input.nonce,
    input.correlationId,
    input.clientIp,
    sha256Hex(input.body),
  ].join('\n');
}

export function signRequest(input: SignatureInput, secret: string): string {
  return `v1=${createHmac('sha256', secret).update(canonicalString(input)).digest('base64url')}`;
}

export function verifySignature(input: SignatureInput, secret: string, provided: string): boolean {
  const expected = Buffer.from(signRequest(input, secret));
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
