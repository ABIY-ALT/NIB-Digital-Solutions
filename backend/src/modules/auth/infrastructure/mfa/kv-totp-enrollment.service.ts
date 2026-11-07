import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { FieldEncryption } from '#core/infrastructure/crypto/field-encryption.js';
import { KEY_VALUE_STORE, type KeyValueStore } from '#core/infrastructure/kv/key-value-store.js';
import type {
  MfaEnrollmentService,
  TotpEnrollment,
} from '#modules/auth/application/ports/mfa-enrollment.port.js';
import { generateTotpSecret, otpauthUri, verifyTotp } from './totp.js';

const ENROLLMENT_TTL_SECONDS = 600;

/**
 * Pending TOTP secrets live encrypted in the key/value store for 10 minutes
 * until the user proves they added them to an authenticator app.
 */
@Injectable()
export class KeyValueTotpEnrollmentService implements MfaEnrollmentService {
  private readonly fields: FieldEncryption;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(KEY_VALUE_STORE) private readonly kv: KeyValueStore,
  ) {
    this.fields = new FieldEncryption(config.mfa.secretEncryptionKey);
  }

  async begin(userId: string, accountLabel: string): Promise<TotpEnrollment> {
    const secret = generateTotpSecret();
    await this.kv.set(`mfa-enroll:${userId}`, this.fields.encrypt(secret), {
      ttlSeconds: ENROLLMENT_TTL_SECONDS,
    });
    return {
      secret,
      otpauthUri: otpauthUri(secret, accountLabel, this.config.mfa.issuer),
      expiresAt: new Date(Date.now() + ENROLLMENT_TTL_SECONDS * 1000),
    };
  }

  async confirm(userId: string, code: string): Promise<string | null> {
    const pending = await this.kv.get(`mfa-enroll:${userId}`);
    if (!pending) return null;
    const secret = this.fields.decrypt(pending);
    if (verifyTotp(secret, code.trim()) === null) return null;
    await this.kv.delete(`mfa-enroll:${userId}`);
    // Store a freshly encrypted copy (new IV) on the user record.
    return this.fields.encrypt(secret);
  }
}
