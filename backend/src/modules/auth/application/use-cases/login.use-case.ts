import { Injectable } from '@nestjs/common';
import type { UseCase } from '#core/application/use-case.js';
import type { AuthenticationOutcome, ClientInfo } from '../auth.results.js';
import { AuthenticationFlow } from '../services/authentication-flow.service.js';

export interface LoginInput extends ClientInfo {
  username: string;
  password: string;
}

/** Credential login. Returns tokens, or an MFA challenge when a second factor is required. */
@Injectable()
export class LoginUseCase implements UseCase<LoginInput, AuthenticationOutcome> {
  constructor(private readonly flow: AuthenticationFlow) {}

  execute(input: LoginInput): Promise<AuthenticationOutcome> {
    return this.flow.authenticate(
      { type: 'password', username: input.username, password: input.password },
      { ipAddress: input.ipAddress, userAgent: input.userAgent },
    );
  }
}
