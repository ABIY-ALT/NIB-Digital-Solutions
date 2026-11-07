import { describe, expect, it } from 'vitest';
import { defineAppConfig } from '@/infrastructure/config/app-config.schema';
import {
  breadcrumbsFor,
  filterNavigation,
  type NavSection,
} from '@/infrastructure/config/navigation';
import {
  contrastRatio,
  readableOn,
  themeSchema,
  themeToCssVariables,
} from '@/infrastructure/config/theme';

describe('theme', () => {
  it('uses NIB brand defaults with accessible foregrounds', () => {
    const vars = themeToCssVariables(themeSchema.parse({}));
    expect(vars['--brand-primary']).toBe('#FEB914');
    expect(vars['--brand-secondary']).toBe('#8B4E20');
    // Gold needs dark text, brown needs white text (WCAG AA ≥ 4.5).
    expect(readableOn('#FEB914')).toBe('#1B1A19');
    expect(readableOn('#8B4E20')).toBe('#FFFFFF');
    expect(contrastRatio('#FEB914', '#1B1A19')).toBeGreaterThan(4.5);
    expect(contrastRatio('#8B4E20', '#FFFFFF')).toBeGreaterThan(4.5);
  });

  it('derives all four radius tokens from the preset and applies per-token overrides', () => {
    const slight = themeToCssVariables(themeSchema.parse({ radius: 'slight' }));
    expect([
      slight['--radius-control-value'],
      slight['--radius-surface-value'],
      slight['--radius-item-value'],
      slight['--radius-pill-value'],
    ]).toEqual(['4px', '8px', '4px', '9999px']);
    const tuned = themeToCssVariables(
      themeSchema.parse({ radius: 'rounded', radiusOverrides: { surface: 20, item: 2 } }),
    );
    expect(tuned['--radius-surface-value']).toBe('20px');
    expect(tuned['--radius-item-value']).toBe('2px');
    expect(tuned['--radius-control-value']).toBe('8px'); // untouched tokens keep the preset
  });

  it('maps density, radius and elevation to tokens', () => {
    const vars = themeToCssVariables(
      themeSchema.parse({ density: 'compact', radius: 'sharp', elevation: 'flat' }),
    );
    expect(vars['--control-height']).toBe('28px');
    expect(vars['--radius-control-value']).toBe('0px');
    expect(vars['--shadow-card-value']).toBe('none');
  });
});

describe('navigation', () => {
  const nav: NavSection[] = [
    {
      id: 'main',
      items: [
        { id: 'dash', labelKey: 'nav.dashboard', href: '/dashboard' },
        { id: 'users', labelKey: 'nav.users', href: '/users', permissions: ['users:read'] },
        { id: 'audit', labelKey: 'nav.audit', href: '/audit', permissions: ['audit:read'] },
        { id: 'beta', labelKey: 'nav.beta', href: '/beta', feature: 'beta' },
        {
          id: 'admin',
          labelKey: 'nav.admin',
          children: [
            { id: 'roles', labelKey: 'nav.roles', href: '/admin/roles', roles: ['SUPER_ADMIN'] },
          ],
        },
      ],
    },
  ];

  it('removes items the user cannot access (and empty groups)', () => {
    const filtered = filterNavigation(nav, {
      can: (p) => p === 'users:read',
      hasRole: () => false,
      isFeatureEnabled: () => false,
    });
    expect(filtered[0]!.items.map((i) => i.id)).toEqual(['dash', 'users']);
  });

  it('builds breadcrumbs from the deepest matching item', () => {
    expect(breadcrumbsFor(nav, '/admin/roles/42').map((c) => c.labelKey)).toEqual([
      'nav.admin',
      'nav.roles',
    ]);
  });
});

describe('defineAppConfig', () => {
  it('validates and applies defaults', () => {
    const cfg = defineAppConfig({ app: { id: 'x', name: 'X', shortName: 'X' }, navigation: [] });
    expect(cfg.theme.colors.primary).toBe('#FEB914');
    expect(cfg.i18n.locales).toEqual(['en', 'am']);
    expect(cfg.theme.topNav).toEqual({
      grouping: 'sections',
      inlineSingleItem: true,
      openOnHover: true,
      showIcons: true,
      showDescriptions: true,
    });
    expect(cfg.ui.forms).toEqual({
      surface: 'dialog',
      drawerSide: 'end',
      overrides: {},
      userChoice: true,
      closeOnOutsideClick: false,
      maxColumns: 2,
    });
    expect(cfg.ui.loading).toEqual({
      variant: 'ring',
      tone: 'brand',
      delayMs: 150,
      minDurationMs: 400,
      routeProgress: true,
    });
    expect(cfg.ui.search).toEqual({
      mode: 'submit',
      submitOnEnter: true,
      liveDelayMs: 350,
      minLength: 0,
    });
    expect(cfg.ui.controls).toEqual({ button: 'solid', field: 'outline' });
    expect(cfg.ui.tables.expansion).toEqual({
      mode: 'multiple',
      expandAll: true,
      expandOnRowClick: false,
    });
  });

  it('accepts control appearances and rejects unknown ones', () => {
    const cfg = defineAppConfig({
      app: { id: 'x', name: 'X', shortName: 'X' },
      ui: { controls: { button: 'soft', field: 'underline' } },
      navigation: [],
    });
    expect(cfg.ui.controls).toEqual({ button: 'soft', field: 'underline' });
    expect(() =>
      defineAppConfig({
        app: { id: 'x', name: 'X', shortName: 'X' },
        // @ts-expect-error unknown appearance
        ui: { controls: { field: 'floating' } },
        navigation: [],
      }),
    ).toThrow(/ui\.controls\.field/);
  });

  it('accepts search settings and rejects unknown modes', () => {
    const cfg = defineAppConfig({
      app: { id: 'x', name: 'X', shortName: 'X' },
      ui: { search: { mode: 'live', minLength: 2 } },
      navigation: [],
    });
    expect(cfg.ui.search).toMatchObject({ mode: 'live', minLength: 2, submitOnEnter: true });
    expect(cfg.ui.forms.surface).toBe('dialog');
    expect(() =>
      defineAppConfig({
        app: { id: 'x', name: 'X', shortName: 'X' },
        ui: { search: { mode: 'instant' } },
        navigation: [],
      } as never),
    ).toThrow(/ui\.search\.mode/);
  });

  it('accepts form surface settings and rejects unknown surfaces', () => {
    const cfg = defineAppConfig({
      app: { id: 'x', name: 'X', shortName: 'X' },
      ui: { forms: { surface: 'drawer', overrides: { roles: 'dialog' } } },
      navigation: [],
    });
    expect(cfg.ui.forms).toMatchObject({ surface: 'drawer', overrides: { roles: 'dialog' } });
    expect(() =>
      defineAppConfig({
        app: { id: 'x', name: 'X', shortName: 'X' },
        ui: { forms: { surface: 'popup' } },
        navigation: [],
      } as never),
    ).toThrow(/ui\.forms\.surface/);
    expect(() =>
      defineAppConfig({
        app: { id: 'x', name: 'X', shortName: 'X' },
        ui: { forms: { maxColumns: 5 } },
        navigation: [],
      } as never),
    ).toThrow(/ui\.forms\.maxColumns/);
  });

  it('rejects invalid configuration', () => {
    expect(() =>
      defineAppConfig({
        app: { id: '', name: 'X', shortName: 'X' },
        theme: { colors: { primary: 'gold' } },
        navigation: [],
      } as never),
    ).toThrow(/Invalid AppCore app configuration/);
  });
});
