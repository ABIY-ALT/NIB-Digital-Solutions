import { z } from 'zod';

const hex = z.string().regex(/^#([0-9a-fA-F]{6})$/, 'Use a 6-digit hex colour, e.g. #FEB914');
/** Any CSS colour (hex, rgb(), hsl(), oklch(), var()). */
const cssColor = z
  .string()
  .regex(
    /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color|var)\(.+\))$/,
    'Use a CSS colour',
  );

/** Colour modes a product can offer: fixed light, fixed dark, or follow the device. */
export const COLOR_MODES = ['light', 'dark', 'system'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];
export type ResolvedColorMode = Exclude<ColorMode, 'system'>;

/**
 * Semantic colour tokens (defaults in globals.css). Products may override any
 * of them per mode through `theme.tokens.light` / `theme.tokens.dark`.
 */
export const SEMANTIC_TOKENS = [
  'background',
  'foreground',
  'surface',
  'surface-muted',
  'muted',
  'muted-foreground',
  'subtle-foreground',
  'border',
  'border-strong',
  'input',
  'hover',
  'success',
  'success-soft',
  'warning',
  'warning-soft',
  'danger',
  'danger-soft',
  'info',
  'info-soft',
  'success-foreground',
  'warning-foreground',
  'danger-foreground',
  'info-foreground',
  'chart-3',
  'chart-4',
  'chart-5',
  'chart-6',
] as const;
export type SemanticToken = (typeof SEMANTIC_TOKENS)[number];

const tokenOverrides = z.partialRecord(z.enum(SEMANTIC_TOKENS), cssColor).optional();

/**
 * Visual configuration for one product. Change a value here and it cascades to
 * every component through CSS variables (see themeToCssVariables).
 */
/**
 * Top navigation (horizontal layout). With "sections", every labelled
 * navigation section becomes a dropdown (Administration ▾, Governance ▾) and
 * unlabelled sections stay as links in the bar; a section can override this
 * with `topNav: 'dropdown' | 'inline'` in the navigation config.
 */
export const topNavSchema = z.object({
  /** "sections": one dropdown per section · "flat": every page as a link in the bar. */
  grouping: z.enum(['sections', 'flat']).default('sections'),
  /** A section left with a single page (after permission filtering) shows as a plain link. */
  inlineSingleItem: z.boolean().default(true),
  /** Open dropdowns on hover (click and keyboard always work). */
  openOnHover: z.boolean().default(true),
  /** Icons next to labels in the bar and in dropdowns. */
  showIcons: z.boolean().default(true),
  /** Item descriptions (navigation `descriptionKey`) under labels in dropdowns. */
  showDescriptions: z.boolean().default(true),
});

export type TopNavConfig = z.infer<typeof topNavSchema>;

export const themeSchema = z.object({
  colors: z
    .object({
      /** NIB gold — primary actions, active states, highlights. */
      primary: hex.default('#FEB914'),
      /** NIB brown — secondary actions and accents. */
      secondary: hex.default('#8B4E20'),
    })
    .default({ primary: '#FEB914', secondary: '#8B4E20' }),
  /**
   * Brand colours in dark mode. Omit to derive them from `colors` (lightened
   * where needed to meet WCAG AA contrast on dark surfaces).
   */
  darkColors: z.object({ primary: hex.optional(), secondary: hex.optional() }).optional(),
  /** Per-mode overrides of the semantic tokens (neutrals, status, charts). */
  tokens: z.object({ light: tokenOverrides, dark: tokenOverrides }).optional(),
  /** Corner style for controls and surfaces. */
  radius: z.enum(['sharp', 'slight', 'rounded', 'full']).default('slight'),
  /** Fine-tune individual radius tokens in px (applied on top of the preset). */
  radiusOverrides: z
    .object({
      control: z.number().min(0).max(9999).optional(),
      surface: z.number().min(0).max(64).optional(),
      item: z.number().min(0).max(32).optional(),
      pill: z.number().min(0).max(9999).optional(),
    })
    .optional(),
  /** Spacing / control height density. */
  density: z.enum(['compact', 'default', 'comfortable']).default('default'),
  /** Card and surface elevation. */
  elevation: z.enum(['flat', 'subtle', 'elevated']).default('subtle'),
  font: z
    .object({
      family: z
        .string()
        .default(
          '"Segoe UI", "Segoe UI Web (West European)", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", var(--font-ethiopic), sans-serif',
        ),
      scale: z.enum(['sm', 'md', 'lg']).default('md'),
    })
    .default({
      family:
        '"Segoe UI", "Segoe UI Web (West European)", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", var(--font-ethiopic), sans-serif',
      scale: 'md',
    }),
  /** Navigation orientation: sidebar (vertical) or top bar (horizontal, see `topNav`). */
  layout: z.enum(['vertical', 'horizontal']).default('vertical'),
  /** Page content width: edge to edge ("full") or centred at 1280px ("contained"). */
  contentWidth: z.enum(['full', 'contained']).default('full'),
  sidebar: z
    .object({
      width: z.number().int().min(200).max(360).default(260),
      collapsedWidth: z.number().int().min(48).max(96).default(56),
      collapsible: z.boolean().default(true),
      defaultCollapsed: z.boolean().default(false),
    })
    .default({ width: 260, collapsedWidth: 56, collapsible: true, defaultCollapsed: false }),
  /** Top navigation bar (horizontal layout). */
  topNav: topNavSchema.default(topNavSchema.parse({})),
  /**
   * Default colour mode. Users may change it (header switcher, Preferences)
   * when the `darkMode` feature is enabled; otherwise this mode is enforced.
   */
  mode: z.enum(COLOR_MODES).default('light'),
});

export type ThemeConfig = z.infer<typeof themeSchema>;

// ── Colour utilities ─────────────────────────────────────────────────────────

function hexToRgb(value: string): [number, number, number] {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(Math.max(0, Math.min(255, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Mixes `color` with `target` by `amount` (0–1). */
export function mix(color: string, target: string, amount: number): string {
  const a = hexToRgb(color);
  const b = hexToRgb(target);
  return rgbToHex([
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ]);
}

/** WCAG relative luminance. */
export function luminance(color: string): number {
  const [r, g, b] = hexToRgb(color).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

const DARK_TEXT = '#1B1A19';
const LIGHT_TEXT = '#FFFFFF';

/** Picks the text colour with the higher WCAG contrast on `background`. */
export function readableOn(background: string): string {
  return contrastRatio(background, DARK_TEXT) >= contrastRatio(background, LIGHT_TEXT)
    ? DARK_TEXT
    : LIGHT_TEXT;
}

/**
 * Moves `color` towards white (dark backgrounds) or black (light backgrounds)
 * until it reaches `ratio` contrast with `background` (WCAG AA text = 4.5).
 */
export function ensureContrast(color: string, background: string, ratio = 4.5): string {
  const towards = luminance(background) < 0.5 ? '#FFFFFF' : '#000000';
  for (let step = 0; step <= 20; step++) {
    const candidate = mix(color, towards, step * 0.05);
    if (contrastRatio(candidate, background) >= ratio) return candidate;
  }
  return towards;
}

/** Surface the dark palette is designed on (keep in sync with globals.css `.dark`). */
export const DARK_SURFACE = '#252423';
/** Page background in dark mode (browser chrome colour). */
export const DARK_BACKGROUND = '#1b1a19';

// ── Token generation ─────────────────────────────────────────────────────────

/**
 * Corner radius presets. Every rounded corner in the app uses one of four tokens:
 *   surface — cards, dialogs, popovers, menus, tooltips, the sign-in card
 *   control — buttons, inputs, selects, toolbar controls
 *   item    — rows inside menus/lists, inline chips, small buttons, checkboxes
 *   pill    — badges, count pills, progress bars
 * (Circles — avatars, dots, radio buttons — stay circles by design.)
 */
const px = (n: number | undefined) => (n === undefined ? undefined : `${n}px`);

const RADIUS = {
  sharp: { control: '0px', surface: '0px', item: '0px', pill: '0px' },
  slight: { control: '4px', surface: '8px', item: '4px', pill: '9999px' },
  rounded: { control: '8px', surface: '12px', item: '6px', pill: '9999px' },
  full: { control: '9999px', surface: '16px', item: '8px', pill: '9999px' },
} as const;

const DENSITY = {
  compact: {
    controlHeight: '28px',
    rowPaddingY: '6px',
    cellPaddingX: '12px',
    gap: '0.75rem',
    pagePadding: '16px',
  },
  default: {
    controlHeight: '32px',
    rowPaddingY: '10px',
    cellPaddingX: '16px',
    gap: '1rem',
    pagePadding: '24px',
  },
  comfortable: {
    controlHeight: '40px',
    rowPaddingY: '14px',
    cellPaddingX: '20px',
    gap: '1.25rem',
    pagePadding: '32px',
  },
} as const;

const ELEVATION = {
  flat: {
    card: 'none',
    raised: 'none',
    overlay: '0 6.4px 14.4px rgba(0,0,0,.11), 0 1.2px 3.6px rgba(0,0,0,.07)',
  },
  subtle: {
    card: '0 1px 2px rgba(0,0,0,.06)',
    raised: '0 1.6px 3.6px rgba(0,0,0,.11), 0 .3px .9px rgba(0,0,0,.07)',
    overlay: '0 6.4px 14.4px rgba(0,0,0,.11), 0 1.2px 3.6px rgba(0,0,0,.07)',
  },
  elevated: {
    card: '0 3.2px 7.2px rgba(0,0,0,.11), 0 .6px 1.8px rgba(0,0,0,.07)',
    raised: '0 6.4px 14.4px rgba(0,0,0,.11), 0 1.2px 3.6px rgba(0,0,0,.07)',
    overlay: '0 25.6px 57.6px rgba(0,0,0,.18), 0 4.8px 14.4px rgba(0,0,0,.12)',
  },
} as const;

/** Shadows need more opacity to read on dark surfaces. */
const ELEVATION_DARK = {
  flat: {
    card: 'none',
    raised: 'none',
    overlay: '0 6.4px 14.4px rgba(0,0,0,.5), 0 1.2px 3.6px rgba(0,0,0,.4)',
  },
  subtle: {
    card: '0 1px 2px rgba(0,0,0,.4)',
    raised: '0 1.6px 3.6px rgba(0,0,0,.45), 0 .3px .9px rgba(0,0,0,.35)',
    overlay: '0 6.4px 14.4px rgba(0,0,0,.5), 0 1.2px 3.6px rgba(0,0,0,.4)',
  },
  elevated: {
    card: '0 3.2px 7.2px rgba(0,0,0,.45), 0 .6px 1.8px rgba(0,0,0,.35)',
    raised: '0 6.4px 14.4px rgba(0,0,0,.5), 0 1.2px 3.6px rgba(0,0,0,.4)',
    overlay: '0 25.6px 57.6px rgba(0,0,0,.6), 0 4.8px 14.4px rgba(0,0,0,.45)',
  },
} as const;

const FONT_SCALE = { sm: '0.9375', md: '1', lg: '1.0625' } as const;

/**
 * Converts the theme config into CSS custom properties. Every component reads
 * these variables, so one config change restyles the whole product.
 */
export function themeToCssVariables(theme: ThemeConfig): Record<string, string> {
  const { primary, secondary } = theme.colors;
  const radius = RADIUS[theme.radius];
  const density = DENSITY[theme.density];
  const elevation = ELEVATION[theme.elevation];
  return {
    '--brand-primary': primary,
    '--brand-primary-foreground': readableOn(primary),
    '--brand-primary-hover': mix(primary, '#000000', 0.06),
    '--brand-primary-active': mix(primary, '#000000', 0.14),
    '--brand-primary-soft': mix(primary, '#FFFFFF', 0.82),
    '--brand-primary-softer': mix(primary, '#FFFFFF', 0.92),
    // Accessible text/icon colour for the primary hue on light surfaces.
    '--brand-primary-text':
      contrastRatio(primary, '#FFFFFF') >= 4.5 ? primary : mix(primary, '#000000', 0.45),
    '--brand-secondary': secondary,
    '--brand-secondary-foreground': readableOn(secondary),
    '--brand-secondary-hover': mix(secondary, '#000000', 0.12),
    '--brand-secondary-soft': mix(secondary, '#FFFFFF', 0.86),
    '--radius-control-value': px(theme.radiusOverrides?.control) ?? radius.control,
    '--radius-surface-value': px(theme.radiusOverrides?.surface) ?? radius.surface,
    '--radius-item-value': px(theme.radiusOverrides?.item) ?? radius.item,
    '--radius-pill-value': px(theme.radiusOverrides?.pill) ?? radius.pill,
    '--control-height': density.controlHeight,
    '--row-padding-y': density.rowPaddingY,
    '--cell-padding-x': density.cellPaddingX,
    '--layout-gap': density.gap,
    '--page-padding': density.pagePadding,
    '--shadow-card-value': elevation.card,
    '--shadow-raised-value': elevation.raised,
    '--shadow-overlay-value': elevation.overlay,
    '--app-font-sans': theme.font.family,
    '--font-scale': FONT_SCALE[theme.font.scale],
    '--sidebar-width': `${theme.sidebar.width}px`,
    '--sidebar-collapsed-width': `${theme.sidebar.collapsedWidth}px`,
    '--header-height': '48px',
  };
}

/**
 * Brand-derived tokens for dark mode: the brand hues keep their identity but
 * are lightened where needed so text and icons stay readable (WCAG AA).
 */
export function themeToDarkCssVariables(theme: ThemeConfig): Record<string, string> {
  const primary = theme.darkColors?.primary ?? theme.colors.primary;
  const secondary =
    theme.darkColors?.secondary ?? ensureContrast(theme.colors.secondary, DARK_SURFACE, 4.5);
  const elevation = ELEVATION_DARK[theme.elevation];
  return {
    '--brand-primary': primary,
    '--brand-primary-foreground': readableOn(primary),
    '--brand-primary-hover': mix(primary, '#FFFFFF', 0.1),
    '--brand-primary-active': mix(primary, '#FFFFFF', 0.18),
    '--brand-primary-soft': mix(primary, DARK_SURFACE, 0.78),
    '--brand-primary-softer': mix(primary, DARK_SURFACE, 0.88),
    '--brand-primary-text': ensureContrast(primary, DARK_SURFACE, 4.5),
    '--brand-secondary': secondary,
    '--brand-secondary-foreground': readableOn(secondary),
    '--brand-secondary-hover': mix(secondary, '#FFFFFF', 0.12),
    '--brand-secondary-soft': mix(secondary, DARK_SURFACE, 0.78),
    '--shadow-card-value': elevation.card,
    '--shadow-raised-value': elevation.raised,
    '--shadow-overlay-value': elevation.overlay,
  };
}

const tokenVars = (tokens: Partial<Record<SemanticToken, string>> | undefined) =>
  Object.fromEntries(Object.entries(tokens ?? {}).map(([k, v]) => [`--${k}`, v]));

const block = (selector: string, vars: Record<string, string>) =>
  `${selector}{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}}`;

/**
 * The product theme as CSS: shared + light tokens on `:root`, dark tokens on
 * `:root.dark` (more specific than the `.dark` defaults in globals.css, so the
 * stylesheet order does not matter).
 */
export function themeToCss(theme: ThemeConfig): string {
  return [
    block(':root', { ...themeToCssVariables(theme), ...tokenVars(theme.tokens?.light) }),
    block(':root.dark', { ...themeToDarkCssVariables(theme), ...tokenVars(theme.tokens?.dark) }),
  ].join('\n');
}
