import type { SecurityPolicy } from '#modules/users/domain/password-policy.js';
import {
  userResponseMapper,
  type UserProfileDto,
} from '#modules/users/presentation/user.response-mapper.js';
import type { AuthenticationOutcome, AuthTokens } from '../application/auth.results.js';

export interface TokensDto {
  tokenType: 'Bearer';
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  sessionId: string;
  idleTimeoutSeconds: number;
}

export type AuthOutcomeDto =
  | { status: 'AUTHENTICATED'; tokens: TokensDto; user: UserProfileDto }
  | {
      status: 'MFA_REQUIRED';
      mfa: { challengeId: string; method: string; expiresAt: string; deliveryHint?: string };
    }
  | {
      status: 'PASSWORD_CHANGE_REQUIRED';
      passwordChange: { changeToken: string; reason: 'EXPIRED' | 'RESET'; expiresAt: string };
    };

export const toTokensDto = (t: AuthTokens): TokensDto => ({
  tokenType: t.tokenType,
  accessToken: t.accessToken,
  accessTokenExpiresAt: t.accessTokenExpiresAt.toISOString(),
  refreshToken: t.refreshToken,
  refreshTokenExpiresAt: t.refreshTokenExpiresAt.toISOString(),
  sessionId: t.sessionId,
  idleTimeoutSeconds: t.idleTimeoutSeconds,
});

export function toAuthOutcomeDto(
  outcome: AuthenticationOutcome,
  policy?: SecurityPolicy,
): AuthOutcomeDto {
  if (outcome.status === 'PASSWORD_CHANGE_REQUIRED') {
    return {
      status: 'PASSWORD_CHANGE_REQUIRED',
      passwordChange: {
        changeToken: outcome.changeToken,
        reason: outcome.reason,
        expiresAt: outcome.expiresAt.toISOString(),
      },
    };
  }
  if (outcome.status === 'MFA_REQUIRED') {
    return {
      status: 'MFA_REQUIRED',
      mfa: {
        challengeId: outcome.challengeId,
        method: outcome.method,
        expiresAt: outcome.expiresAt.toISOString(),
        deliveryHint: outcome.deliveryHint,
      },
    };
  }
  return {
    status: 'AUTHENTICATED',
    tokens: toTokensDto(outcome.tokens),
    user: userResponseMapper.toProfile(outcome.user, policy),
  };
}
