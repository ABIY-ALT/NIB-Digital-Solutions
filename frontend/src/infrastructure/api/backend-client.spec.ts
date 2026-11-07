import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  decryptPayload,
  encryptPayload,
  parseKeyRing,
  requestPurpose,
  responsePurpose,
} from '@/infrastructure/security/payload-crypto';
import { verifySignature } from '@/infrastructure/security/request-signature';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClientError } from '@/shared/errors/api-client-error';
import { BackendClient } from '@/infrastructure/api/backend-client';

const KEY_SPEC = `k1:${Buffer.alloc(32, 7).toString('base64')}`;
const SECRET = 'test-client-secret-test-client-secret';
const ring = parseKeyRing(KEY_SPEC, 'k1');

/** Tiny fake backend implementing the AppCore wire protocol. */
let server: Server;
let baseUrl = '';
let flakyCalls = 0;

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (c: Buffer) => (data += c.toString()));
    req.on('end', () => resolve(data));
  });

beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      const raw = await readBody(req);
      const h = (n: string) => String(req.headers[n] ?? '');
      const ok = verifySignature(
        {
          method: req.method!,
          pathWithQuery: req.url!,
          timestamp: h('x-appcore-timestamp'),
          nonce: h('x-appcore-nonce'),
          correlationId: h('x-correlation-id'),
          clientIp: h('x-appcore-client-ip'),
          body: raw || undefined,
        },
        SECRET,
        h('x-appcore-signature'),
      );
      const corr = h('x-correlation-id');
      res.setHeader('content-type', 'application/json');
      if (!ok) {
        res.statusCode = 401;
        res.end(
          JSON.stringify({
            success: false,
            error: { code: 'SERVICE_AUTH_FAILED', message: 'no' },
            correlationId: corr,
            timestamp: '',
          }),
        );
        return;
      }
      // Replies that are not AppCore envelopes (a proxy error page, a broken upstream).
      const plain = /^\/api\/v1\/plain(\d{3})/.exec(req.url!);
      if (plain) {
        res.statusCode = Number(plain[1]);
        res.end(JSON.stringify({ unexpected: true }));
        return;
      }
      if (req.url!.startsWith('/api/v1/flaky') && ++flakyCalls < 3) {
        res.statusCode = 503;
        res.end(
          JSON.stringify({
            success: false,
            error: { code: 'SERVICE_UNAVAILABLE', message: 'x' },
            correlationId: corr,
            timestamp: '',
          }),
        );
        return;
      }
      let body: unknown = raw ? JSON.parse(raw) : null;
      if (h('x-appcore-encrypted') === '1' && body) {
        const enc = (body as { enc: Parameters<typeof decryptPayload>[0] }).enc;
        body = JSON.parse(
          decryptPayload(enc, ring.keys.get('k1')!, requestPurpose(req.method!, req.url!)),
        );
      }
      const envelope = {
        success: true,
        data: { echo: body, path: req.url },
        message: null,
        correlationId: corr,
        timestamp: '',
      };
      if (h('x-appcore-encrypted') === '1') {
        res.setHeader('x-appcore-encrypted', '1');
        res.end(
          JSON.stringify({
            enc: encryptPayload(
              JSON.stringify(envelope),
              ring.keys.get('k1')!,
              'k1',
              responsePurpose(corr),
            ),
          }),
        );
        return;
      }
      res.end(JSON.stringify(envelope));
    })();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('BackendClient', () => {
  it('signs, encrypts and decrypts end to end', async () => {
    const client = new BackendClient({
      baseUrl,
      apiPrefix: '/api/v1',
      clientId: 'appcore-web',
      clientSecret: SECRET,
      encryption: { enabled: true, keyRing: ring },
    });
    const res = await client.post<{ echo: unknown }>('/auth/login', { username: 'a' });
    expect(res.data.echo).toEqual({ username: 'a' });
  });

  it('retries idempotent calls on 503', async () => {
    const client = new BackendClient({
      baseUrl,
      apiPrefix: '/api/v1',
      clientId: 'x',
      clientSecret: SECRET,
      retries: 3,
    });
    const res = await client.get<{ path: string }>('/flaky', { query: { a: 1 } });
    expect(res.data.path).toBe('/api/v1/flaky?a=1');
    expect(flakyCalls).toBe(3);
  });

  it('normalises backend errors', async () => {
    const client = new BackendClient({
      baseUrl,
      apiPrefix: '/api/v1',
      clientId: 'x',
      clientSecret: 'wrong-secret-wrong-secret-wrong-secret',
    });
    await expect(client.get('/anything')).rejects.toMatchObject({
      code: 'SERVICE_AUTH_FAILED',
      status: 401,
    });
  });

  it('maps network failures', async () => {
    const client = new BackendClient({
      baseUrl: 'http://127.0.0.1:1',
      apiPrefix: '',
      clientId: 'x',
      clientSecret: SECRET,
      retries: 0,
    });
    const err = await client.get('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).code).toBe('NETWORK_ERROR');
  });

  it('turns replies that are not envelopes into client errors', async () => {
    const client = new BackendClient({
      baseUrl,
      apiPrefix: '/api/v1',
      clientId: 'x',
      clientSecret: SECRET,
      retries: 0,
    });
    await expect(client.get('/plain500')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      status: 500,
    });
    await expect(client.get('/plain404')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      status: 404,
    });
    await expect(client.get('/plain200')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 502,
    });
  });
});
