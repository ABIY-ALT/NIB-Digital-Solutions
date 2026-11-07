import { describe, expect, it } from 'vitest';
import { safeRedirect } from '@/shared/lib/safe-redirect';

describe('safeRedirect', () => {
  it('allows same-origin paths', () => {
    expect(safeRedirect('/users?page=2#top')).toBe('/users?page=2#top');
    expect(safeRedirect('%2Fdashboard')).toBe('/dashboard');
  });

  it.each([
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    'javascript:alert(1)',
    '/%0d%0aSet-Cookie:x',
    '',
    null,
    undefined,
    '%E0%A4%A',
  ])('rejects %s', (value) => {
    expect(safeRedirect(value, '/home')).toBe('/home');
  });
});
