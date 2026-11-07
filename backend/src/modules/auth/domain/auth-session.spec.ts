import { AuthSession } from './auth-session.js';

const now = new Date('2026-01-01T00:00:00Z');
const make = () =>
  AuthSession.start(
    {
      id: 's1',
      userId: 'u1',
      username: 'u1',
      refreshTokenHash: 'h1',
      expiresAt: new Date(now.getTime() + 3_600_000),
      ipAddress: null,
      userAgent: null,
      mfaVerified: false,
      authMethod: 'password',
      provider: 'local',
    },
    now,
  );

describe('AuthSession', () => {
  it('rotates refresh tokens and detects reuse outside the grace window', () => {
    const s = make();
    expect(s.matchRefreshToken('h1', now, 15)).toBe('current');
    s.rotate('h2', now);
    expect(s.matchRefreshToken('h2', now, 15)).toBe('current');
    expect(s.matchRefreshToken('h1', new Date(now.getTime() + 5_000), 15)).toBe(
      'previous_within_grace',
    );
    expect(s.matchRefreshToken('h1', new Date(now.getTime() + 60_000), 15)).toBe('reused');
    expect(s.matchRefreshToken('zzz', now, 15)).toBe('reused');
  });

  it('tracks idle timeout and absolute expiry', () => {
    const s = make();
    expect(s.isIdle(new Date(now.getTime() + 10_000), 60)).toBe(false);
    expect(s.isIdle(new Date(now.getTime() + 61_000), 60)).toBe(true);
    expect(s.isExpired(new Date(now.getTime() + 3_600_000))).toBe(true);
  });
});
