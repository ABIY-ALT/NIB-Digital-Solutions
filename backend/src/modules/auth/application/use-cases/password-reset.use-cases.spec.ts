import type { EventBus } from '#core/application/ports/event-bus.port.js';
import type { MailDraft } from '#core/application/ports/mail.port.js';
import type { PasswordHasher } from '#core/application/ports/password-hasher.port.js';
import { AuthenticationError, ValidationError } from '#core/domain/errors/app-error.js';
import type { PasswordPolicyService } from '#modules/users/application/password-policy.service.js';
import type { User } from '#modules/users/domain/user.entity.js';
import type { UserRepository } from '#modules/users/domain/user.repository.js';
import type { AuthSettings, PasswordResetStore } from '../ports/auth.ports.js';
import {
  hashResetToken,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
} from './password-reset.use-cases.js';

interface FakeUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  passwordHash: string | null;
  lockedUntil: Date | null;
  block: 'LOCKED' | 'DISABLED' | null;
  status: string;
}

function setup(overrides: Partial<FakeUser> = {}, enabled = true) {
  const state: FakeUser = {
    id: 'u1',
    username: 'abebe',
    email: 'abebe@nib.et',
    fullName: 'Abebe Kebede',
    passwordHash: 'old-hash',
    lockedUntil: null,
    block: null,
    status: 'ACTIVE',
    ...overrides,
  };
  const user = {
    ...state,
    get passwordHash() {
      return state.passwordHash;
    },
    get lockedUntil() {
      return state.lockedUntil;
    },
    loginBlock: () => state.block,
    replacePasswordHash: (hash: string) => void (state.passwordHash = hash),
    changeStatus: (status: string) => {
      state.status = status;
      state.lockedUntil = null;
      state.block = null;
    },
  } as unknown as User;

  const users = {
    findByEmail: vi.fn((email: string) => Promise.resolve(email === state.email ? user : null)),
    findByUsername: vi.fn((name: string) => Promise.resolve(name === state.username ? user : null)),
    findById: vi.fn((id: string) => Promise.resolve(id === state.id ? user : null)),
    update: vi.fn((u: User) => Promise.resolve(u)),
  } as unknown as UserRepository;

  const tokens = new Map<string, string>();
  const cooldowns = new Set<string>();
  const resets: PasswordResetStore = {
    acquireCooldown: (userId) => {
      if (cooldowns.has(userId)) return Promise.resolve(false);
      cooldowns.add(userId);
      return Promise.resolve(true);
    },
    issue: (userId, hash) => {
      for (const [h, id] of tokens) if (id === userId) tokens.delete(h);
      tokens.set(hash, userId);
      return Promise.resolve();
    },
    find: (hash) => Promise.resolve(tokens.get(hash) ?? null),
    consume: (hash) => Promise.resolve(tokens.delete(hash)),
    revoke: (userId) => {
      for (const [h, id] of tokens) if (id === userId) tokens.delete(h);
      return Promise.resolve();
    },
  };

  const sent: MailDraft[] = [];
  const mailer = { send: vi.fn((draft: MailDraft) => (sent.push(draft), Promise.resolve())) };
  const settings = {
    passwordReset: { enabled, ttlSeconds: 1800, cooldownSeconds: 120, publicUrl: 'https://app' },
  } as AuthSettings;
  const hasher = { hash: (p: string) => Promise.resolve(`hash(${p})`) } as PasswordHasher;
  const sessions = { terminateAllForUser: vi.fn(() => Promise.resolve(2)) };
  const events = { publish: vi.fn(() => Promise.resolve()) } as unknown as EventBus;
  const passwords = {
    assertAcceptable: vi.fn((password: string) =>
      password === 'weak'
        ? Promise.reject(new ValidationError([{ field: 'newPassword', message: 'Too weak' }]))
        : Promise.resolve(),
    ),
    remember: vi.fn(() => Promise.resolve()),
  } as unknown as PasswordPolicyService;

  const request = new RequestPasswordResetUseCase(users, resets, mailer, settings);
  const reset = new ResetPasswordUseCase(
    users,
    resets,
    hasher,
    sessions,
    events,
    settings,
    passwords,
  );
  /** Requests a link and returns the token from the e-mail (null when none was sent). */
  const requestLink = async (identifier: string): Promise<string | null> => {
    const before = sent.length;
    await request.execute({ identifier });
    await new Promise((resolve) => setImmediate(resolve));
    const url = sent.length > before ? sent.at(-1)!.action!.url : null;
    return url ? new URL(url).searchParams.get('token') : null;
  };
  return { state, reset, requestLink, sent, tokens, sessions, events };
}

describe('RequestPasswordResetUseCase', () => {
  it('e-mails a single-use link, by username or e-mail, storing only the token hash', async () => {
    const { requestLink, sent, tokens } = setup();
    const token = await requestLink('abebe');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sent[0]).toMatchObject({ to: 'abebe@nib.et', toName: 'Abebe Kebede' });
    expect(sent[0]!.action!.url).toBe(`https://app/reset-password?token=${token}`);
    expect([...tokens.keys()]).toEqual([hashResetToken(token!)]);
    expect([...tokens.keys()][0]).not.toBe(token);
  });

  it('answers the same way and sends nothing for unknown or unrecoverable accounts', async () => {
    expect(await setup().requestLink('nobody@nib.et')).toBeNull();
    expect(await setup({ block: 'DISABLED' }).requestLink('abebe')).toBeNull();
    expect(await setup({ passwordHash: null }).requestLink('abebe')).toBeNull(); // SSO-only
    expect(await setup({ block: 'LOCKED', lockedUntil: null }).requestLink('abebe')).toBeNull();
    expect(await setup({}, false).requestLink('abebe')).toBeNull(); // feature off
  });

  it('sends one e-mail per cooldown', async () => {
    const { requestLink, sent } = setup();
    expect(await requestLink('abebe@nib.et')).not.toBeNull();
    expect(await requestLink('abebe@nib.et')).toBeNull();
    expect(sent).toHaveLength(1);
  });
});

describe('ResetPasswordUseCase', () => {
  it('sets the password, ends every session and lifts a temporary lock', async () => {
    const until = new Date(Date.now() + 60_000);
    const { requestLink, reset, state, sessions, events } = setup({
      block: 'LOCKED',
      lockedUntil: until,
      status: 'LOCKED',
    });
    const token = (await requestLink('abebe'))!;
    await expect(reset.execute({ token, newPassword: 'N3w-Passw0rd!' })).resolves.toEqual({
      userId: 'u1',
    });
    expect(state.passwordHash).toBe('hash(N3w-Passw0rd!)');
    expect(state.status).toBe('ACTIVE');
    expect(sessions.terminateAllForUser).toHaveBeenCalledWith('u1', 'password_reset');
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { userId: 'u1', via: 'recovery' } }),
    );
  });

  it('accepts a link only once', async () => {
    const { requestLink, reset } = setup();
    const token = (await requestLink('abebe'))!;
    await reset.execute({ token, newPassword: 'N3w-Passw0rd!' });
    await expect(reset.execute({ token, newPassword: 'An0ther-One!' })).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it('keeps the link usable when the password breaks the policy', async () => {
    const { requestLink, reset, state } = setup();
    const token = (await requestLink('abebe'))!;
    await expect(reset.execute({ token, newPassword: 'weak' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(state.passwordHash).toBe('old-hash');
    await expect(reset.execute({ token, newPassword: 'N3w-Passw0rd!' })).resolves.toBeDefined();
  });

  it('rejects unknown tokens and accounts disabled after the link was sent', async () => {
    const { requestLink, reset, state } = setup();
    await expect(
      reset.execute({ token: 'x'.repeat(43), newPassword: 'N3w-Passw0rd!' }),
    ).rejects.toMatchObject({ code: 'AUTH_PASSWORD_RESET_INVALID' });
    const token = (await requestLink('abebe'))!;
    state.block = 'DISABLED';
    await expect(reset.execute({ token, newPassword: 'N3w-Passw0rd!' })).rejects.toMatchObject({
      code: 'AUTH_PASSWORD_RESET_INVALID',
    });
    expect(state.passwordHash).toBe('old-hash');
  });
});
