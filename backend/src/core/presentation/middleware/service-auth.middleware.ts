import { Inject, Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { SecurityError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import { RequestContext } from '#core/infrastructure/context/request-context.js';
import {
  SignatureHeaders,
  verifySignature,
} from '#core/infrastructure/crypto/request-signature.js';
import { KEY_VALUE_STORE, type KeyValueStore } from '#core/infrastructure/kv/key-value-store.js';

const header = (req: Request, name: string): string | undefined => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

/**
 * Authenticates the calling BFF (service-to-service identity).
 *
 * Every non-exempt request must carry a valid HMAC signature from a registered
 * client, a fresh timestamp and a never-seen nonce. Only after this succeeds do
 * we trust the forwarded end-user IP (X-AppCore-Client-Ip).
 */
@Injectable()
export class ServiceAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ServiceAuthMiddleware.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(KEY_VALUE_STORE) private readonly kv: KeyValueStore,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const { serviceAuth } = this.config;
    const path = req.originalUrl.split('?')[0] ?? '';
    if (!serviceAuth.enabled || serviceAuth.exemptPathPrefixes.some((p) => path.startsWith(p))) {
      return next();
    }

    const fail = (reason: string): void => {
      this.logger.warn(
        { reason, path, correlationId: req.correlationId },
        'Service authentication failed',
      );
      next(new SecurityError(ErrorCode.SERVICE_AUTH_FAILED));
    };

    const clientId = header(req, SignatureHeaders.clientId);
    const timestamp = header(req, SignatureHeaders.timestamp);
    const nonce = header(req, SignatureHeaders.nonce);
    const signature = header(req, SignatureHeaders.signature);
    const clientIp = header(req, SignatureHeaders.clientIp) ?? '';
    if (!clientId || !timestamp || !nonce || !signature) return fail('missing_headers');

    const secret = serviceAuth.clients.get(clientId);
    if (!secret) return fail('unknown_client');

    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > serviceAuth.maxSkewSeconds * 1000) {
      return fail('stale_timestamp');
    }
    if (nonce.length < 16 || nonce.length > 128) return fail('bad_nonce');

    const valid = verifySignature(
      {
        method: req.method,
        pathWithQuery: req.originalUrl,
        timestamp,
        nonce,
        correlationId: header(req, SignatureHeaders.correlationId) ?? '',
        clientIp,
        body: req.rawBody,
      },
      secret,
      signature,
    );
    if (!valid) return fail('bad_signature');

    // Replay protection: each nonce is accepted once within the skew window.
    const fresh = await this.kv.set(`nonce:${clientId}:${nonce}`, '1', {
      ttlSeconds: serviceAuth.maxSkewSeconds * 2,
      onlyIfAbsent: true,
    });
    if (!fresh) return fail('replayed_nonce');

    req.serviceClientId = clientId;
    RequestContext.setServiceClient(clientId);
    const ctx = RequestContext.get();
    if (ctx && clientIp) ctx.ipAddress = clientIp;
    const ua = header(req, 'x-appcore-client-ua');
    if (ctx && ua) ctx.userAgent = ua.slice(0, 512);
    next();
  }
}
