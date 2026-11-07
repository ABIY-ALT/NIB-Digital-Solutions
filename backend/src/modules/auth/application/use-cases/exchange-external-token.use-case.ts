import { Injectable } from '@nestjs/common';
import type { UseCase } from '#core/application/use-case.js';
import type { AuthenticationOutcome, ClientInfo } from '../auth.results.js';
import { AuthenticationFlow } from '../services/authentication-flow.service.js';

export interface ExchangeExternalTokenInput extends ClientInfo {
  provider: string;
  token: string;
}

/**
 * Exchanges a token from an external OIDC identity provider (validated against
 * the IdP's JWKS) for an AppCore session. The BFF performs the OIDC redirect
 * flow with Auth.js and calls this endpoint with the resulting ID token.
 */
@Injectable()
export class ExchangeExternalTokenUseCase implements UseCase<
  ExchangeExternalTokenInput,
  AuthenticationOutcome
> {
  constructor(private readonly flow: AuthenticationFlow) {}

  execute(input: ExchangeExternalTokenInput): Promise<AuthenticationOutcome> {
    return this.flow.authenticate(
      { type: 'external', provider: input.provider, token: input.token },
      { ipAddress: input.ipAddress, userAgent: input.userAgent },
    );
  }
}
