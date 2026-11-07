import { z } from 'zod';
import type { NavSection } from '@/infrastructure/config/navigation';
import { themeSchema } from '@/infrastructure/config/theme';

/**
 * Where create / edit forms open (<FormSurface id="…">). Precedence: the
 * form's own `surface` prop › `overrides[id]` › the user's preference (when
 * `userChoice`) › `surface`.
 */
const formsSchema = z.object({
  /** "dialog": centred modal · "drawer": side panel. */
  surface: z.enum(['dialog', 'drawer']).default('dialog'),
  /** Edge the side panel slides in from ("end" = right in LTR, left in RTL). */
  drawerSide: z.enum(['start', 'end']).default('end'),
  /** Per-form surface by form id, e.g. { roles: 'drawer', 'reference-data.items': 'dialog' }. */
  overrides: z.record(z.string(), z.enum(['dialog', 'drawer'])).default({}),
  /** Let each user choose modal or side panel in Profile › Preferences. */
  userChoice: z.boolean().default(true),
  /** Close a form on a click outside it (discarding unsaved input). */
  closeOnOutsideClick: z.boolean().default(false),
  /** Most fields per row in a form surface (FormGrid is capped to it). */
  maxColumns: z.literal([1, 2, 3, 4]).default(2),
});

/** List search boxes (<TableSearch>): when a query reaches the backend. */
const searchSchema = z.object({
  /** "submit": on the search button (or Enter) · "live": while typing, debounced. */
  mode: z.enum(['submit', 'live']).default('submit'),
  /** In submit mode, Enter also runs the search. */
  submitOnEnter: z.boolean().default(true),
  /** Debounce for live mode. */
  liveDelayMs: z.number().int().min(100).max(3000).default(350),
  /** Shortest query sent (clearing the box always searches). */
  minLength: z.number().int().min(0).max(20).default(0),
});

/** Loading indicators (<Spinner>, <LoadingOverlay>, <PageLoader>). */
const loadingSchema = z.object({
  /** Default spinner style. */
  variant: z.enum(['ring', 'comet', 'dots', 'bars', 'orbit', 'pulse']).default('ring'),
  /** "brand": primary → secondary gradient · "primary" · "current": text colour · "muted". */
  tone: z.enum(['brand', 'primary', 'current', 'muted']).default('brand'),
  /** Wait this long before showing a loader, so fast responses never flash one. */
  delayMs: z.number().int().min(0).max(2000).default(150),
  /** Once shown, keep a loader at least this long so it never flickers. */
  minDurationMs: z.number().int().min(0).max(3000).default(400),
  /** Thin progress bar at the top of the page while a route loads. */
  routeProgress: z.boolean().default(true),
});

/**
 * Look of buttons and text fields (<Button>, <Input>, <Textarea>, <Select>,
 * <RecordPicker>). One value restyles every control of the product; a single
 * control can still pin its own with the `appearance` prop.
 */
const controlsSchema = z.object({
  /**
   * Coloured buttons (primary, secondary, danger). "solid": filled · "soft":
   * tinted · "outline": coloured border · "elevated": filled with a shadow.
   */
  button: z.enum(['solid', 'soft', 'outline', 'elevated']).default('solid'),
  /** "outline": bordered box · "filled": tinted box, no border · "underline": bottom line only. */
  field: z.enum(['outline', 'filled', 'underline']).default('outline'),
});

/**
 * Lists are paginated by the server; these are the product defaults every list
 * starts from (a resource's `listDefaults` or a <Pagination> prop overrides them).
 */
const paginationSchema = z.object({
  /** Rows per page when neither the URL nor the resource says otherwise. */
  pageSize: z.number().int().min(1).max(500).default(20),
  /** Choices in the rows-per-page select. */
  pageSizeOptions: z.array(z.number().int().min(1).max(500)).min(1).default([10, 20, 50, 100]),
  /** Largest page a URL may ask for (keep at or below the backend's limit). */
  maxPageSize: z.number().int().min(1).max(500).default(100),
  /** Show the rows-per-page select. */
  showPageSize: z.boolean().default(true),
  /** Show the jump-to-first / jump-to-last buttons. */
  showFirstLast: z.boolean().default(true),
  /** Page numbers shown on each side of the current page. */
  siblings: z.number().int().min(0).max(3).default(1),
});

/** Master–detail rows of <DataTable expansion>. A table overrides any of these in its `expansion` prop. */
const tableExpansionSchema = z.object({
  /** "multiple": any number of rows open · "single": opening one closes the others. */
  mode: z.enum(['multiple', 'single']).default('multiple'),
  /** Header button that expands / collapses every row of the page (multiple mode). */
  expandAll: z.boolean().default(true),
  /** Clicking anywhere on a row toggles it (tables with their own row click keep that). */
  expandOnRowClick: z.boolean().default(false),
});

/** Data tables. */
const tablesSchema = z.object({
  expansion: tableExpansionSchema.default(tableExpansionSchema.parse({})),
});

/** Interaction patterns shared by every feature (one section per concern). */
const uiSchema = z.object({
  forms: formsSchema.default(formsSchema.parse({})),
  search: searchSchema.default(searchSchema.parse({})),
  loading: loadingSchema.default(loadingSchema.parse({})),
  controls: controlsSchema.default(controlsSchema.parse({})),
  pagination: paginationSchema.default(paginationSchema.parse({})),
  tables: tablesSchema.default(tablesSchema.parse({})),
});

/**
 * The ONE typed, validated configuration object per product. Everything the
 * framework needs that is not a secret lives here (secrets stay in env vars).
 */
export const appConfigSchema = z.object({
  app: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    shortName: z.string().min(1).max(12),
    description: z.string().default(''),
    /** Logo shown in the sidebar and on the sign-in card (public path). */
    logo: z.string().optional(),
    /** Line shown under the product name (e.g. "Corporate Internet Banking"). */
    tagline: z.string().optional(),
    homePath: z.string().startsWith('/').default('/dashboard'),
    loginPath: z.string().startsWith('/').default('/login'),
    /** Public links shown on the sign-in card (all optional). */
    links: z
      .object({
        privacyPolicy: z.url().optional(),
        /** Self-service reset page (URL or path). Without it, "Forgot password?" explains whom to contact. */
        forgotPassword: z.string().optional(),
        social: z
          .array(
            z.object({
              network: z.enum(['facebook', 'x', 'linkedin', 'instagram', 'telegram', 'youtube']),
              url: z.url(),
            }),
          )
          .default([]),
      })
      .default({ social: [] }),
  }),
  environment: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  api: z
    .object({
      /** Browser → BFF base path for feature route handlers. */
      apiBasePath: z.string().startsWith('/').default('/api'),
      /** Backend API version segment. */
      backendVersion: z.string().default('v1'),
      timeoutMs: z.number().int().min(1000).max(120_000).default(15_000),
      retries: z.number().int().min(0).max(5).default(2),
    })
    .default({ apiBasePath: '/api', backendVersion: 'v1', timeoutMs: 15_000, retries: 2 }),
  auth: z
    .object({
      /** Client idle timeout before automatic sign-out. */
      idleTimeoutMinutes: z.number().int().min(1).max(240).default(15),
      /** Warning shown this many seconds before the idle sign-out. */
      idleWarningSeconds: z.number().int().min(10).max(600).default(60),
      /** Absolute maximum session lifetime (hours). */
      sessionMaxAgeHours: z.number().int().min(1).max(24).default(8),
      /** Refresh the backend access token this many seconds before it expires. */
      refreshLeewaySeconds: z.number().int().min(10).max(300).default(60),
      /** Show the "Sign in with SSO" button when an OIDC provider is configured. */
      showSsoButton: z.boolean().default(true),
      /**
       * Banking policy: browsers and password managers must not store or autofill
       * credentials. "block" masks the password without type="password", disables
       * autofill hints and copy/cut, and wipes the value after every attempt.
       */
      credentialStorage: z.enum(['block', 'allow']).default('block'),
      mfa: z
        .object({
          enabled: z.boolean().default(true),
          methods: z.array(z.enum(['TOTP', 'SMS'])).default(['TOTP', 'SMS']),
        })
        .default({ enabled: true, methods: ['TOTP', 'SMS'] }),
    })
    .default({
      idleTimeoutMinutes: 15,
      idleWarningSeconds: 60,
      sessionMaxAgeHours: 8,
      refreshLeewaySeconds: 60,
      showSsoButton: true,
      credentialStorage: 'block',
      mfa: { enabled: true, methods: ['TOTP', 'SMS'] },
    }),
  i18n: z
    .object({
      locales: z.array(z.string().min(2)).min(1).default(['en', 'am']),
      defaultLocale: z.string().default('en'),
      /** Locales rendered right-to-left (ready for Arabic etc.). */
      rtlLocales: z.array(z.string()).default(['ar', 'he', 'fa', 'ur']),
      localeLabels: z.record(z.string(), z.string()).default({ en: 'English', am: 'አማርኛ' }),
    })
    .default({
      locales: ['en', 'am'],
      defaultLocale: 'en',
      rtlLocales: ['ar', 'he', 'fa', 'ur'],
      localeLabels: { en: 'English', am: 'አማርኛ' },
    }),
  /** Feature flags: toggle visibility/availability without code changes. */
  features: z.record(z.string(), z.boolean()).default({}),
  /** Breadcrumb trail derived from `navigation` (pages can append/replace/hide crumbs). */
  breadcrumbs: z
    .object({
      enabled: z.boolean().default(true),
      /** "header": in the top bar (a compact trail is shown in the page on phones); "content": above the page title. */
      placement: z.enum(['header', 'content']).default('header'),
      /** First crumb: house icon with label, icon only, or plain text. */
      home: z.enum(['icon-label', 'icon', 'none']).default('icon-label'),
      /** Insert the navigation section label (e.g. "Administration") as a non-link crumb. */
      showSection: z.boolean().default(false),
      /** Show each navigation item's icon on its crumb. */
      showIcons: z.boolean().default(false),
      separator: z.enum(['chevron', 'slash', 'dot']).default('chevron'),
      /** Longer trails collapse to "first … last two". */
      maxItems: z.number().int().min(3).max(10).default(4),
    })
    .default({
      enabled: true,
      placement: 'header',
      home: 'icon-label',
      showSection: false,
      showIcons: false,
      separator: 'chevron',
      maxItems: 4,
    }),
  /** Interaction patterns shared by every feature. */
  ui: uiSchema.default(uiSchema.parse({})),
  theme: themeSchema.default(themeSchema.parse({})),
  observability: z
    .object({
      logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    })
    .default({ logLevel: 'info' }),
});

export type AppConfig = z.infer<typeof appConfigSchema> & { navigation: NavSection[] };
export type BreadcrumbConfig = AppConfig['breadcrumbs'];
export type AppConfigInput = z.input<typeof appConfigSchema> & { navigation: NavSection[] };

/**
 * Validates the product configuration at startup. Invalid configuration throws
 * with a readable list of problems (the app refuses to start).
 */
export function defineAppConfig(input: AppConfigInput): AppConfig {
  const { navigation, ...rest } = input;
  const result = appConfigSchema.safeParse(rest);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid AppCore app configuration:\n${issues}`);
  }
  if (!result.data.i18n.locales.includes(result.data.i18n.defaultLocale)) {
    throw new Error(
      'Invalid AppCore app configuration: i18n.defaultLocale must be one of i18n.locales',
    );
  }
  return Object.freeze({ ...result.data, navigation });
}

export function isFeatureEnabled(config: Pick<AppConfig, 'features'>, flag: string): boolean {
  return config.features[flag] === true;
}

export function isRtl(config: Pick<AppConfig, 'i18n'>, locale: string): boolean {
  return config.i18n.rtlLocales.includes(locale);
}
