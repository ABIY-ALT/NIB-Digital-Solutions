import { describe, expect, it } from 'vitest';
import {
  activeWindow,
  changeRecords,
  changedFields,
  humanize,
  isPrivateIp,
  parseAction,
  parseUserAgent,
  windowBounds,
  windowFilter,
} from './audit-display';

describe('audit display helpers', () => {
  it('humanizes action codes and recognises maker–checker requests', () => {
    expect(humanize('ROLE_UPDATE')).toBe('Role update');
    expect(humanize('loan-products.create')).toBe('Loan products create');
    expect(parseAction('ROLE_DELETE_REQUESTED')).toEqual({ base: 'ROLE_DELETE', requested: true });
    expect(parseAction('AUTH_LOGIN')).toEqual({ base: 'AUTH_LOGIN', requested: false });
  });

  it('detects private and loopback addresses', () => {
    expect(
      ['10.1.2.3', '127.0.0.1', '::1', '192.168.0.9', '172.20.1.1', '::ffff:10.0.0.1'].every(
        isPrivateIp,
      ),
    ).toBe(true);
    expect(isPrivateIp('196.188.10.4')).toBe(false);
    expect(isPrivateIp(null)).toBe(false);
  });

  it('summarises user agents', () => {
    expect(
      parseUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.2739.42',
      ),
    ).toEqual({ kind: 'desktop', browser: 'Edge 128', os: 'Windows' });
    expect(
      parseUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
      ),
    ).toMatchObject({ kind: 'mobile', browser: 'Safari 17', os: 'iOS' });
    expect(parseUserAgent('node')).toMatchObject({ kind: 'api', browser: 'API client' });
    expect(parseUserAgent(null).kind).toBe('unknown');
  });

  it('maps time windows to stable date filters and back', () => {
    const now = new Date(2026, 8, 29, 15, 30);
    const last7 = windowFilter('last7', now);
    expect(last7).toMatch(/^between:/);
    expect(activeWindow(last7, now)).toBe('last7');
    expect(activeWindow(windowFilter('last90', now), now)).toBe('last90');
    expect(activeWindow(undefined, now)).toBe('all');
    expect(activeWindow('between:2020-01-01T00:00:00.000Z,', now)).toBe('custom');
    expect(windowBounds('between:a,')).toEqual({ from: 'a', to: undefined });
    expect(windowFilter('all', now)).toBeUndefined();
  });

  it('turns recorded changes into before/after records with secrets masked', () => {
    const change = {
      resourceType: 'User',
      resourceId: 'u1',
      operation: 'update' as const,
      fields: [
        { field: 'email', before: 'a@x', after: 'b@x' },
        { field: 'passwordHash', before: '[REDACTED]', after: '[REDACTED]', redacted: true },
      ],
    };
    expect(changeRecords(change, 'hidden')).toEqual({
      before: { email: 'a@x', passwordHash: 'hidden' },
      after: { email: 'b@x', passwordHash: 'hidden' },
    });
    expect(changeRecords({ ...change, operation: 'create' }, 'h').before).toBeNull();
    expect(changedFields([change, change])).toEqual(['email', 'passwordHash']);
  });
});
