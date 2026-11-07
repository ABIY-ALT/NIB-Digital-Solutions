import { describe, expect, it } from 'vitest';
import { isInternalNavigation } from '@/shared/layouts/route-progress';
import { spinnerPx, spinnerStroke } from './spinner';

describe('spinner sizing', () => {
  it('maps named sizes and passes pixel sizes through', () => {
    expect([
      spinnerPx('xs'),
      spinnerPx('sm'),
      spinnerPx('md'),
      spinnerPx('lg'),
      spinnerPx('xl'),
    ]).toEqual([12, 16, 24, 40, 64]);
    expect(spinnerPx(20)).toBe(20);
  });

  it('keeps the stroke proportionate within 1.5–6px', () => {
    expect(spinnerStroke(12)).toBe(1.5);
    expect(spinnerStroke(24)).toBe(2.5);
    expect(spinnerStroke(40)).toBe(4.5);
    expect(spinnerStroke(200)).toBe(6);
  });
});

describe('isInternalNavigation', () => {
  const here = {
    href: 'https://app.nib.et/users?page=1',
    origin: 'https://app.nib.et',
    pathname: '/users',
    search: '?page=1',
  };
  const click = (attrs: Record<string, string>, extra: Partial<MouseEvent> = {}) => {
    const anchor = {
      getAttribute: (k: string) => attrs[k] ?? null,
      hasAttribute: (k: string) => k in attrs,
    };
    const target = { closest: () => anchor } as unknown as EventTarget;
    return {
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      target,
      ...extra,
    } as MouseEvent;
  };

  it('tracks same-origin links to another page', () => {
    expect(isInternalNavigation(click({ href: '/roles' }), here)).toBe(true);
    expect(isInternalNavigation(click({ href: '/users?page=2' }), here)).toBe(true);
  });

  it('ignores the current page, other sites, new tabs, downloads and modified clicks', () => {
    expect(isInternalNavigation(click({ href: '/users?page=1' }), here)).toBe(false);
    expect(isInternalNavigation(click({ href: 'https://example.com/x' }), here)).toBe(false);
    expect(isInternalNavigation(click({ href: '/roles', target: '_blank' }), here)).toBe(false);
    expect(isInternalNavigation(click({ href: '/file.csv', download: '' }), here)).toBe(false);
    expect(isInternalNavigation(click({ href: '/roles' }, { ctrlKey: true }), here)).toBe(false);
    expect(isInternalNavigation(click({ href: '/roles' }, { button: 1 }), here)).toBe(false);
  });
});
