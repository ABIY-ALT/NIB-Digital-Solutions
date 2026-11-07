import { describe, expect, it } from 'vitest';
import type { ResolvedNavSection } from './navigation';
import { buildTopNav, menuItems, type TopNavMenu } from './top-nav-model';

const page = (id: string) => ({ id, label: id, href: `/${id}` });
const sections: ResolvedNavSection[] = [
  { id: 'main', items: [page('dashboard'), page('approvals')] },
  {
    id: 'admin',
    label: 'Administration',
    icon: 'Building2',
    items: [page('users'), page('roles')],
  },
  { id: 'gov', label: 'Governance', items: [page('audit')] },
  {
    id: 'ops',
    label: 'Operations',
    items: [
      page('payments'),
      { id: 'loans', label: 'Loans', children: [page('products'), page('applications')] },
      page('reports'),
    ],
  },
];
const sectionsMode = { grouping: 'sections', inlineSingleItem: true } as const;

describe('buildTopNav', () => {
  it('keeps unlabelled sections in the bar and turns labelled ones into dropdowns', () => {
    const entries = buildTopNav(sections, sectionsMode);
    expect(entries.map((e) => (e.kind === 'link' ? e.item.id : `▾${e.id}`))).toEqual([
      'dashboard',
      'approvals',
      '▾admin',
      'audit', // single-page section → plain link
      '▾ops',
    ]);
    const admin = entries[2] as TopNavMenu;
    expect(admin).toMatchObject({ label: 'Administration', icon: 'Building2' });
    expect(menuItems(admin).map((i) => i.id)).toEqual(['users', 'roles']);
  });

  it('groups parent items under their own heading, preserving order', () => {
    const ops = buildTopNav(sections, sectionsMode).at(-1) as TopNavMenu;
    expect(ops.groups.map((g) => [g.label ?? null, g.items.map((i) => i.id)])).toEqual([
      [null, ['payments']],
      ['Loans', ['products', 'applications']],
      [null, ['reports']],
    ]);
  });

  it('keeps single-page sections as dropdowns when inlineSingleItem is off', () => {
    const entries = buildTopNav(sections, { ...sectionsMode, inlineSingleItem: false });
    expect(entries.some((e) => e.kind === 'menu' && e.id === 'gov')).toBe(true);
  });

  it('honours per-section overrides', () => {
    const entries = buildTopNav(
      [
        { id: 'admin', label: 'Administration', topNav: 'inline', items: [page('users')] },
        {
          id: 'main',
          topNav: 'inline',
          items: [{ id: 'more', label: 'More', children: [page('a'), page('b')] }],
        },
      ],
      { ...sectionsMode, inlineSingleItem: false },
    );
    expect(entries[0]).toMatchObject({ kind: 'link', item: { id: 'users' } });
    expect(entries[1]).toMatchObject({ kind: 'menu', id: 'more', label: 'More' });
  });

  it('lists every page in the bar in flat mode', () => {
    const entries = buildTopNav(sections, { grouping: 'flat', inlineSingleItem: true });
    expect(entries.every((e) => e.kind === 'link')).toBe(true);
    expect(entries).toHaveLength(9);
  });
});
