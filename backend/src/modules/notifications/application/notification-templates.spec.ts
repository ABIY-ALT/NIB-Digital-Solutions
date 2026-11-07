import { describe, expect, it } from 'vitest';
import type { ApprovalDecidedEvent } from '#core/application/events/app-events.js';
import { describeDevice, templates } from './notification-templates.js';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

describe('describeDevice', () => {
  it('names the browser and the system, first match winning', () => {
    expect(describeDevice(CHROME_WINDOWS)).toBe('Chrome on Windows');
    expect(describeDevice(`${CHROME_WINDOWS} Edg/126.0`)).toBe('Edge on Windows');
    expect(
      describeDevice('Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0'),
    ).toBe('Firefox on Linux');
    expect(
      describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1'),
    ).toBe('Safari on iOS');
    expect(describeDevice('Mozilla/5.0 (Linux; Android 14) Chrome/126.0')).toBe(
      'Chrome on Android',
    );
    expect(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Safari/605.1.15')).toBe(
      'Safari on macOS',
    );
    expect(describeDevice(null)).toBe('a browser on an unknown system');
  });
});

describe('templates', () => {
  it('asks the checkers to decide', () => {
    expect(
      templates.approvalRequested({
        approvalId: 'a1',
        action: 'roles.update',
        summary: 'Update role Teller',
        makerId: 'u1',
        makerName: 'Maker',
        checkerIds: ['u2', 'u3'],
        expiresAt: '2026-01-02T00:00:00Z',
      }),
    ).toMatchObject({
      recipientIds: ['u2', 'u3'],
      template: 'approval.requested',
      category: 'APPROVAL',
    });
  });

  it('tells the maker how their request was decided', () => {
    const event = (
      status: ApprovalDecidedEvent['status'],
      extra: Partial<ApprovalDecidedEvent> = {},
    ) =>
      templates.approvalDecided({
        approvalId: 'a1',
        action: 'roles.update',
        summary: 'Update role Teller',
        status,
        makerId: 'u1',
        checkerId: 'u2',
        checkerName: 'Checker',
        comment: null,
        error: null,
        ...extra,
      });
    expect(event('APPROVED', { comment: 'Looks good' })).toMatchObject({
      severity: 'SUCCESS',
      body: expect.stringContaining('Comment: “Looks good”'),
    });
    expect(event('REJECTED', { checkerName: null })).toMatchObject({
      template: 'approval.rejected',
      body: 'A checker rejected your request.',
    });
    expect(event('FAILED')!.body).toContain('unknown error');
    expect(event('FAILED', { error: 'Version conflict' })!.body).toContain('Version conflict');
    expect(event('EXPIRED')).toMatchObject({
      template: 'approval.expired',
      senderName: 'Approvals',
    });
    expect(event('CANCELLED')).toBeNull();
  });

  it('warns about password expiry, with singular and plural days', () => {
    const draft = (daysLeft: number) =>
      templates.passwordExpiring({ userId: 'u1', expiresAt: '2026-01-02T03:04:00Z', daysLeft });
    expect(draft(1).title).toBe('Your password expires in 1 day');
    expect(draft(5).title).toBe('Your password expires in 5 days');
    expect(draft(5).body).toContain('2026-01-02 03:04 UTC');
  });

  it('says when a locked account unlocks, if it does', () => {
    expect(
      templates.accountLocked({ userId: 'u1', username: 'jdoe', until: '2026-01-02T03:04:00Z' })
        .body,
    ).toContain('automatically at 2026-01-02 03:04 UTC');
    expect(templates.accountLocked({ userId: 'u1', username: 'jdoe', until: null }).body).toContain(
      'automatically, or',
    );
  });

  it('describes a new sign-in with or without an address', () => {
    expect(
      templates.newSignIn({
        userId: 'u1',
        ipAddress: '10.0.0.1',
        userAgent: CHROME_WINDOWS,
        at: '2026-01-02T03:04:00Z',
      }).body,
    ).toContain('Chrome on Windows (10.0.0.1)');
    expect(
      templates.newSignIn({
        userId: 'u1',
        ipAddress: null,
        userAgent: null,
        at: '2026-01-02T03:04:00Z',
      }).body,
    ).toContain('from a browser on an unknown system at');
  });

  it('covers the other security notices', () => {
    for (const via of ['self', 'expired', 'reset', 'recovery'] as const) {
      expect(templates.passwordChanged({ userId: 'u1', via }).recipientIds).toEqual(['u1']);
    }
    expect(templates.passwordReset({ userId: 'u1', byName: 'Admin' }).category).toBe('SECURITY');
    expect(templates.sessionEvicted({ userId: 'u1', ended: 2, limit: 3 }).recipientIds).toEqual([
      'u1',
    ]);
    expect(
      templates.mfaChanged({ userId: 'u1', enabled: true, method: 'totp' }).recipientIds,
    ).toEqual(['u1']);
    expect(
      templates.mfaChanged({ userId: 'u1', enabled: false, method: null }).recipientIds,
    ).toEqual(['u1']);
    expect(templates.mfaRequired({ userId: 'u1', roles: ['ADMIN'] }).recipientIds).toEqual(['u1']);
  });
});
