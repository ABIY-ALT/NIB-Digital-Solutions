import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { SecurityError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import { ENCRYPTION_HEADER, isEncryptedBody } from '#core/infrastructure/crypto/payload-crypto.js';
import { PayloadCryptoService } from '#core/infrastructure/crypto/payload-crypto.service.js';

/**
 * Application-level payload decryption (second layer on top of TLS).
 *
 * When the BFF sends `X-AppCore-Encrypted: 1`, the JSON body is an encrypted
 * envelope; it is decrypted here, BEFORE validation, and the request is flagged
 * so the response is encrypted on the way out. With
 * PAYLOAD_ENCRYPTION_MODE=required, plaintext API requests are rejected.
 */
@Injectable()
export class PayloadDecryptionMiddleware implements NestMiddleware {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly crypto: PayloadCryptoService,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const mode = this.config.encryption.mode;
    const path = req.originalUrl.split('?')[0] ?? '';
    const exempt = this.config.serviceAuth.exemptPathPrefixes.some((p) => path.startsWith(p));
    const flagged = req.headers[ENCRYPTION_HEADER] === '1';

    if (mode === 'disabled' || exempt) return next();

    if (!flagged) {
      if (mode === 'required')
        return next(new SecurityError(ErrorCode.PAYLOAD_ENCRYPTION_REQUIRED));
      return next();
    }

    try {
      req.payloadEncrypted = true;
      const hasBody =
        req.body !== undefined && req.body !== null && Object.keys(req.body as object).length > 0;
      if (hasBody) {
        if (!isEncryptedBody(req.body))
          throw new SecurityError(ErrorCode.PAYLOAD_DECRYPTION_FAILED);
        req.body = this.crypto.decryptRequest(req.body, req.method, path);
      }
      next();
    } catch (error) {
      next(error);
    }
  }
}
