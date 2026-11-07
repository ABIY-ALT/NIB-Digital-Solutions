import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  DARK_SURFACE,
  ensureContrast,
  themeSchema,
  themeToCss,
  themeToDarkCssVariables,
} from '@/infrastructure/config/theme';
import {
  colorModeCookie,
  effectiveColorMode,
  parseColorMode,
  resolveColorMode,
} from './color-mode';

describe('colour modes', () => {
  it('honours the user choice only when switching is allowed', () => {
    expect(effectiveColorMode('dark', 'light', true)).toBe('dark');
    expect(effectiveColorMode('dark', 'light', false)).toBe('light');
    expect(effectiveColorMode('purple', 'system', true)).toBe('system');
    expect(parseColorMode(undefined)).toBeNull();
  });

  it('resolves system against the device preference', () => {
    expect(resolveColorMode('system', true)).toBe('dark');
    expect(resolveColorMode('system', false)).toBe('light');
    expect(resolveColorMode('light', true)).toBe('light');
  });

  it('writes a year-long, lax cookie (secure over https)', () => {
    expect(colorModeCookie('dark', true)).toBe(
      'appcore.color-mode=dark; Path=/; Max-Age=31536000; SameSite=Lax; Secure',
    );
  });
});

describe('dark palette generation', () => {
  it('keeps brand text readable on dark surfaces (WCAG AA)', () => {
    const vars = themeToDarkCssVariables(themeSchema.parse({}));
    expect(contrastRatio(vars['--brand-primary-text']!, DARK_SURFACE)).toBeGreaterThanOrEqual(4.5);
    // NIB brown is too dark on dark surfaces: it is lightened automatically.
    expect(vars['--brand-secondary']).not.toBe('#8B4E20');
    expect(contrastRatio(vars['--brand-secondary']!, DARK_SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast('#000000', '#ffffff')).toBe('#000000');
  });

  it('emits light and dark blocks with per-mode token overrides', () => {
    const css = themeToCss(
      themeSchema.parse({
        darkColors: { primary: '#FFC940' },
        tokens: { light: { background: '#ffffff' }, dark: { surface: 'oklch(0.25 0 0)' } },
      }),
    );
    expect(css).toContain(':root{');
    expect(css).toContain('--background:#ffffff');
    expect(css).toMatch(/:root\.dark\{[^}]*--brand-primary:#FFC940/);
    expect(css).toMatch(/:root\.dark\{[^}]*--surface:oklch\(0\.25 0 0\)/);
    expect(() => themeSchema.parse({ tokens: { dark: { surface: 'url(x)' } } })).toThrow();
  });
});
