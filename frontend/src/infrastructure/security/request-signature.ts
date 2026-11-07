import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * AppCore BFF → backend service identity, protocol v1 (HMAC-SHA256). SERVER-SIDE ONLY.
 * Compatible with backend/src/core/infrastructure/crypto/request-signature.ts.
 */
export const SignatureHeaders = {
  clientId: 'x-appcore-client-id',
  timestamp: 'x-appcore-timestamp',
  nonce: 'x-appcore-nonce',
  clientIp: 'x-appcore-client-ip',
  clientUserAgent: 'x-appcore-client-ua',
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

export const sha256Hex = (body: Buffer | string | undefined): string =>
  createHash('sha256')
    .update(body ?? '')
    .digest('hex');

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
