import { describe, expect, it } from 'vitest';
import { appConfigSchema } from '@/infrastructure/config/app-config.schema';
import { breadcrumbKey, collapseBreadcrumbs } from './breadcrumbs';

const trail = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);

describe('collapseBreadcrumbs', () => {
  it('keeps short trails intact', () => {
    expect(collapseBreadcrumbs(trail(4), 4)).toEqual({ collapsed: false, items: trail(4) });
  });

  it('collapses the middle of long trails to head … tail', () => {
    expect(collapseBreadcrumbs(trail(6), 4)).toEqual({
      collapsed: true,
      head: ['c0'],
      hidden: ['c1', 'c2', 'c3'],
      tail: ['c4', 'c5'],
    });
  });

  it('never hides a single crumb behind the ellipsis', () => {
    // 4 items with 1 + 2 kept would hide only one crumb: show them all instead.
    expect(collapseBreadcrumbs(trail(4), 3).collapsed).toBe(false);
    expect(collapseBreadcrumbs(trail(5), 3)).toMatchObject({
      collapsed: true,
      hidden: ['c1', 'c2'],
    });
  });

  it('honours custom head/tail sizes', () => {
    expect(collapseBreadcrumbs(trail(7), 4, 2, 1)).toEqual({
      collapsed: true,
      head: ['c0', 'c1'],
      hidden: ['c2', 'c3', 'c4', 'c5'],
      tail: ['c6'],
    });
  });
});

describe('breadcrumbKey', () => {
  it('is stable for equal trails and changes with content', () => {
    const a = [
      { label: 'Users', href: '/users' },
      {
        label: 'Security',
        siblings: [{ label: 'Security', href: '/p?tab=security', active: true }],
      },
    ];
    const b = structuredClone(a);
    expect(breadcrumbKey(a)).toBe(breadcrumbKey(b));
    b[1]!.siblings![0]!.active = false;
    expect(breadcrumbKey(a)).not.toBe(breadcrumbKey(b));
  });
});

describe('breadcrumb config', () => {
  it('has safe defaults', () => {
    const cfg = appConfigSchema.parse({ app: { id: 'x', name: 'X', shortName: 'X' } }).breadcrumbs;
    expect(cfg).toEqual({
      enabled: true,
      placement: 'header',
      home: 'icon-label',
      showSection: false,
      showIcons: false,
      separator: 'chevron',
      maxItems: 4,
    });
  });
});
