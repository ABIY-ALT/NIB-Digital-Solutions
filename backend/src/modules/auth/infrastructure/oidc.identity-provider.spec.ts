import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '#config/app-config.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import type { ExternalApiClientFactory } from '#core/infrastructure/external-api/external-api.factory.js';
import { User } from '#modules/users/domain/user.entity.js';
import type { UserRepository } from '#modules/users/domain/user.repository.js';
import { OidcIdentityProvider } from './oidc.identity-provider.js';

const jose = vi.hoisted(() => ({
  payload: {},
  fail: null as Error | null,
  jwksUris: [] as string[],
}));

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn((url: URL) => {
    jose.jwksUris.push(url.toString());
    return () => undefined;
  }),
  jwtVerify: vi.fn(() =>
    jose.fail ? Promise.reject(jose.fail) : Promise.resolve({ payload: jose.payload }),
  ),
}));

const config = (oidc: Partial<AppConfig['oidc']> = {}) =>
  ({
    oidc: {
      enabled: true,
      providerName: 'entra',
      issuer: 'https://idp.example.com',
      audience: 'appcore',
      jwksUri: undefined,
      autoProvision: false,
      ...oidc,
    },
  }) as unknown as AppConfig;

const user = (overrides: Partial<{ username: string; email: string }> = {}) =>
  User.create(
    {
      username: overrides.username ?? 'jdoe',
      email: overrides.email ?? 'jdoe@example.com',
      fullName: 'Jane Doe',
      passwordHash: null,
      roleCodes: ['USER'],
    },
    null,
  );

function setup(
  cfg = config(),
  discovery: () => Promise<unknown> = () =>
    Promise.resolve({ data: { jwks_uri: 'https://idp.example.com/keys' } }),
) {
  const users = {
    findByExternalIdentity: vi.fn((): Promise<User | null> => Promise.resolve(null)),
    findByEmail: vi.fn((): Promise<User | null> => Promise.resolve(null)),
    update: vi.fn((u: User) => Promise.resolve(u)),
    save: vi.fn((u: User) => Promise.resolve(u)),
  };
  const request = vi.fn(discovery);
  const clients = { create: vi.fn(() => ({ request })) } as unknown as ExternalApiClientFactory;
  const provider = new OidcIdentityProvider(cfg, users as unknown as UserRepository, clients);
  return { provider, users, request, clients };
}

const external = { type: 'external', provider: 'entra', token: 'id-token' } as const;

describe('OidcIdentityProvider', () => {
  beforeEach(() => {
    jose.payload = { sub: 'sub-1', email: 'JDoe@Example.com', email_verified: true };
    jose.fail = null;
    jose.jwksUris = [];
  });

  it('supports external sign-ins for its own provider only when enabled', () => {
    const { provider } = setup();
    expect(provider.id).toBe('entra');
    expect(provider.supports(external as never)).toBe(true);
    expect(provider.supports({ ...external, provider: 'other' })).toBe(false);
    expect(provider.supports({ type: 'password' } as never)).toBe(false);
    expect(setup(config({ enabled: false })).provider.supports(external as never)).toBe(false);
  });

  it('refuses non-external requests', async () => {
    const { provider } = setup();
    await expect(provider.authenticate({ type: 'password' } as never)).rejects.toMatchObject({
      code: ErrorCode.AUTH_PROVIDER_UNAVAILABLE,
    });
  });

  it('signs in an already linked account, reading MFA from amr, and discovers the JWKS once', async () => {
    jose.payload = { ...jose.payload, amr: ['pwd', 'mfa'] };
    const { provider, users, request } = setup();
    const linked = user();
    users.findByExternalIdentity.mockResolvedValue(linked);
    const identity = await provider.authenticate(external);
    expect(identity).toMatchObject({
      user: linked,
      method: 'external',
      provider: 'entra',
      mfaSatisfied: true,
    });
    expect(users.update).toHaveBeenCalledWith(linked);

    jose.payload = { sub: 'sub-1' };
    expect((await provider.authenticate(external as never)).mfaSatisfied).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(jose.jwksUris).toEqual(['https://idp.example.com/keys']);
  });

  it('uses a configured JWKS URI without discovery', async () => {
    const { provider, users, request } = setup(config({ jwksUri: 'https://idp.example.com/jwks' }));
    users.findByExternalIdentity.mockResolvedValue(user());
    await provider.authenticate(external);
    expect(request).not.toHaveBeenCalled();
    expect(jose.jwksUris).toEqual(['https://idp.example.com/jwks']);
  });

  it('links an account by verified e-mail', async () => {
    const { provider, users } = setup();
    const byEmail = user();
    users.findByEmail.mockResolvedValue(byEmail);
    const identity = await provider.authenticate(external);
    expect(users.findByEmail).toHaveBeenCalledWith('jdoe@example.com');
    expect(identity.user).toBe(byEmail);
    expect(users.update).toHaveBeenCalledTimes(2);
  });

  it('does not link by an unverified e-mail', async () => {
    jose.payload = { sub: 'sub-1', email: 'jdoe@example.com', email_verified: false };
    const { provider, users } = setup();
    await expect(provider.authenticate(external as never)).rejects.toMatchObject({
      code: ErrorCode.AUTH_EXTERNAL_IDENTITY_UNLINKED,
    });
    expect(users.findByEmail).not.toHaveBeenCalled();
  });

  it('auto-provisions a new account when enabled', async () => {
    jose.payload = {
      sub: 'sub-2',
      email: 'New.User@example.com',
      name: 'New User',
      preferred_username: 'New User!',
    };
    const { provider, users } = setup(config({ autoProvision: true }));
    const identity = await provider.authenticate(external);
    expect(users.save).toHaveBeenCalledTimes(1);
    expect(identity.user.username).toBe('newuser');
    expect(identity.user.fullName).toBe('New User');

    jose.payload = { sub: 'sub-3', email: 'solo@example.com' };
    const second = await provider.authenticate(external);
    expect(second.user.username).toBe('solo');
    expect(second.user.fullName).toBe('solo');
  });

  it('does not provision without an e-mail', async () => {
    jose.payload = { sub: 'sub-4' };
    const { provider } = setup(config({ autoProvision: true }));
    await expect(provider.authenticate(external as never)).rejects.toMatchObject({
      code: ErrorCode.AUTH_EXTERNAL_IDENTITY_UNLINKED,
    });
  });

  it('refuses disabled and locked accounts', async () => {
    const { provider, users } = setup();
    const disabled = user();
    disabled.changeStatus('DISABLED', null);
    users.findByExternalIdentity.mockResolvedValue(disabled);
    await expect(provider.authenticate(external as never)).rejects.toMatchObject({
      code: ErrorCode.AUTH_ACCOUNT_DISABLED,
    });
    const locked = user();
    locked.changeStatus('LOCKED', null);
    users.findByExternalIdentity.mockResolvedValue(locked);
    await expect(provider.authenticate(external as never)).rejects.toMatchObject({
      code: ErrorCode.AUTH_ACCOUNT_LOCKED,
    });
  });

  it('rejects invalid tokens and tokens without a subject', async () => {
    jose.fail = new Error('signature verification failed');
    const { provider } = setup();
    await expect(provider.authenticate(external as never)).rejects.toMatchObject({
      code: ErrorCode.AUTH_EXTERNAL_TOKEN_INVALID,
    });
    jose.fail = null;
    jose.payload = { email: 'x@example.com' };
    await expect(provider.authenticate(external as never)).rejects.toMatchObject({
      code: ErrorCode.AUTH_EXTERNAL_TOKEN_INVALID,
    });
  });

  it('reports the provider unavailable when discovery fails', async () => {
    const { provider } = setup(config(), () => Promise.reject(new Error('timeout')));
    await expect(provider.authenticate(external as never)).rejects.toMatchObject({
      code: ErrorCode.AUTH_PROVIDER_UNAVAILABLE,
    });
  });
});
