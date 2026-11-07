import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { FieldEncryption } from '#core/infrastructure/crypto/field-encryption.js';
import { KEY_VALUE_STORE, type KeyValueStore } from '#core/infrastructure/kv/key-value-store.js';
import type { User } from '#modules/users/domain/user.entity.js';
import type { MfaInitiation, MfaProvider } from '#modules/auth/application/ports/auth.ports.js';
import { verifyTotp } from './totp.js';

/** Authenticator-app second factor. Secrets are stored AES-256-GCM encrypted. */
@Injectable()
export class TotpMfaProvider implements MfaProvider {
  readonly method = 'TOTP' as const;
  private readonly logger = new Logger(TotpMfaProvider.name);
  private readonly fieldEncryption: FieldEncryption;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(KEY_VALUE_STORE) private readonly kv: KeyValueStore,
  ) {
    this.fieldEncryption = new FieldEncryption(config.mfa.secretEncryptionKey);
  }

  initiate(_user: User, _challengeId: string): Promise<MfaInitiation> {
    return Promise.resolve({ deliveryHint: 'Enter the 6-digit code from your authenticator app.' });
  }

  async verify(user: User, code: string): Promise<boolean> {
    if (!user.mfaSecret) return false;
    let secret: string;
    try {
      secret = this.fieldEncryption.decrypt(user.mfaSecret);
    } catch (error) {
      this.logger.error({ err: error, userId: user.id }, 'Unable to decrypt TOTP secret');
      return false;
    }
    const step = verifyTotp(secret, code.trim());
    if (step === null) return false;
    // Replay protection: a code (time step) can be used only once.
    return this.kv.set(`totp-used:${user.id}:${step}`, '1', {
      ttlSeconds: 120,
      onlyIfAbsent: true,
    });
  }

  /** Encrypts a new secret for storage (used by enrolment and seeding). */
  encryptSecret(secretBase32: string): string {
    return this.fieldEncryption.encrypt(secretBase32);
  }
}
