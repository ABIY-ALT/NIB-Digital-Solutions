#!/usr/bin/env node
// Generates fresh random secrets for AppCore.
// Paste backend values into appcore/backend/.env and the SHARED values into
// appcore/frontend/apps/web/.env.local — shared values must match exactly.
import { randomBytes } from 'node:crypto';

const b64 = (n) => randomBytes(n).toString('base64');
const serviceSecret = randomBytes(32).toString('base64url');
const payloadKey = b64(32);

console.log('# ── Backend only ──────────────────────────────────────────────');
console.log(`JWT_ACCESS_SECRET=${b64(48)}`);
console.log(`MFA_SECRET_ENCRYPTION_KEY=${b64(32)}`);
console.log(`AUDIT_CHAIN_KEY=${b64(32)}`);
console.log('');
console.log('# ── Shared between backend and BFF (must match exactly) ───────');
console.log(`# backend : SERVICE_CLIENTS=appcore-web:${serviceSecret}`);
console.log('# frontend: BACKEND_SERVICE_CLIENT_ID=appcore-web');
console.log(`# frontend: BACKEND_SERVICE_CLIENT_SECRET=${serviceSecret}`);
console.log(`# both    : PAYLOAD_ENCRYPTION_KEYS=k1:${payloadKey}`);
console.log('# both    : PAYLOAD_ENCRYPTION_ACTIVE_KEY_ID=k1');
console.log('');
console.log('# ── Frontend only ─────────────────────────────────────────────');
console.log(`AUTH_SECRET=${b64(32)}`);
console.log(`CSRF_SECRET=${b64(32)}`);
