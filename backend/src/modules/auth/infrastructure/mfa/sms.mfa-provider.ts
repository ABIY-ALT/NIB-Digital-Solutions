import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { User } from '#modules/users/domain/user.entity.js';
import type {
  MfaChallenge,
  MfaInitiation,
  MfaProvider,
} from '#modules/auth/application/ports/auth.ports.js';

/**
 * Outbound SMS channel. Replace ConsoleSmsGateway with an adapter for the bank's
 * SMS gateway (built on ExternalApiClientFactory) in production.
 */
export interface SmsGateway {
  send(phoneNumber: string, message: string): Promise<void>;
}

@Injectable()
export class ConsoleSmsGateway implements SmsGateway {
  private readonly logger = new Logger('SmsGateway(dev)');

  send(phoneNumber: string, message: string): Promise<void> {
    // DEV ONLY: shows the OTP in the server log so the flow can be tested locally.
    this.logger.warn(`[DEV SMS] to ${mask(phoneNumber)}: ${message}`);
    return Promise.resolve();
  }
}

const mask = (phone: string): string => `••••${phone.slice(-4)}`;
const hash = (code: string, challengeId: string): string =>
  createHash('sha256').update(`${challengeId}:${code}`).digest('hex');

/** One-time code delivered by SMS; only a hash of the code is kept in the challenge. */
@Injectable()
export class SmsMfaProvider implements MfaProvider {
  readonly method = 'SMS' as const;

  constructor(private readonly gateway: ConsoleSmsGateway) {}

  async initiate(user: User, challengeId: string): Promise<MfaInitiation> {
    if (!user.phoneNumber) throw new Error('User has no phone number for SMS MFA');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.gateway.send(
      user.phoneNumber,
      `Your NIB verification code is ${code}. It expires in 5 minutes.`,
    );
    return {
      deliveryHint: `Code sent by SMS to ${mask(user.phoneNumber)}`,
      state: { codeHash: hash(code, challengeId) },
    };
  }

  verify(_user: User, code: string, challenge: MfaChallenge): Promise<boolean> {
    const expected = challenge.state?.['codeHash'];
    if (!expected || !/^\d{6}$/.test(code.trim())) return Promise.resolve(false);
    const actual = hash(code.trim(), challenge.id);
    return Promise.resolve(timingSafeEqual(Buffer.from(expected), Buffer.from(actual)));
  }
}
