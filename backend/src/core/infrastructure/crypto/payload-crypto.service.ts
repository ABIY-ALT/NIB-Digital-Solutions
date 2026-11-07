import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { SecurityError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import {
  decryptPayload,
  encryptPayload,
  requestPurpose,
  responsePurpose,
  type EncryptedBody,
} from './payload-crypto.js';

/** Key-ring aware wrapper around the payload encryption protocol. */
@Injectable()
export class PayloadCryptoService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get mode(): AppConfig['encryption']['mode'] {
    return this.config.encryption.mode;
  }

  decryptRequest(body: EncryptedBody, method: string, path: string): unknown {
    const key = this.config.encryption.keys.get(body.enc.kid);
    if (!key)
      throw new SecurityError(ErrorCode.PAYLOAD_DECRYPTION_FAILED, {
        details: { reason: 'unknown_kid' },
      });
    try {
      const json = decryptPayload(body.enc, key, requestPurpose(method, path));
      return json.length === 0 ? undefined : (JSON.parse(json) as unknown);
    } catch (error) {
      throw new SecurityError(ErrorCode.PAYLOAD_DECRYPTION_FAILED, { cause: error });
    }
  }

  encryptResponse(payload: unknown, correlationId: string): EncryptedBody {
    const { activeKeyId, keys } = this.config.encryption;
    const key = keys.get(activeKeyId)!;
    return {
      enc: encryptPayload(
        JSON.stringify(payload ?? null),
        key,
        activeKeyId,
        responsePurpose(correlationId),
      ),
    };
  }
}
