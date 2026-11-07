import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AppConfig } from '@/infrastructure/config/app-config.schema';
import { serverEnvSchema } from '@/infrastructure/config/env';
import type { NavItem } from '@/infrastructure/config/navigation';
import {
  compareWithBackend,
  loadEnvironment,
  readEnvFile,
  reviewEnvironment,
  type EnvFinding,
} from './env-check';
import {
  allKeys,
  checkTranslations,
  findCatalogues,
  registeredCatalogues,
  type I18nFinding,
} from './i18n-check';
import { scanApiRoutes, scanPages, type ApiRoute, type PageRoute } from './routes-scan';

export interface Finding {
  level: 'error' | 'warning';
  /** What the finding is about: a variable, a navigation item, a route. */
  subject: string;
  message: string;
}

export const countOf = (findings: readonly { level: string }[], level: 'error' | 'warning') =>
  findings.filter((f) => f.level === level).length;

// ── Environment ──────────────────────────────────────────────────────────────

export interface EnvCheck {
  environment: string;
  sources: string[];
  /** Backend env file the shared secrets were compared with, if any. */
  comparedWith: string | null;
  findings: EnvFinding[];
}

const KNOWN_VARIABLES = Object.keys(serverEnvSchema.in.shape);

export function checkEnvironment(
  root: string,
  options: { envFile?: string; backendEnv?: string; production?: boolean } = {},
): EnvCheck {
  const loaded = loadEnvironment({ root, envFile: options.envFile });
  const raw = { ...loaded.raw, ...(options.production ? { NODE_ENV: 'production' } : {}) };
  const findings: EnvFinding[] = [];

  try {
    const parsed = serverEnvSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        findings.push({
          level: 'error',
          variable: issue.path.join('.') || '(environment)',
          message: issue.message,
        });
      }
    }
  } catch (error) {
    // The key ring is parsed in a transform, which throws instead of reporting an issue.
    findings.push({
      level: 'error',
      variable: 'PAYLOAD_ENCRYPTION_KEYS',
      message: error instanceof Error ? error.message : String(error),
    });
  }
  findings.push(...reviewEnvironment(raw, KNOWN_VARIABLES, loaded.fileKeys));

  // Shared secrets: compare with the backend's file when it is on this machine.
  const explicit = options.backendEnv !== undefined;
  const backendPath = resolve(root, options.backendEnv ?? '../backend/.env');
  let comparedWith: string | null = null;
  if (existsSync(backendPath)) {
    comparedWith = backendPath;
    findings.push(...compareWithBackend(raw, readEnvFile(backendPath)));
  } else if (explicit) {
    findings.push({
      level: 'error',
      variable: '--backend-env',
      message: `file not found: ${backendPath}`,
    });
  }
  return {
    environment: raw.NODE_ENV ?? 'development',
    sources: loaded.sources,
    comparedWith,
    findings,
  };
}

// ── Application configuration ────────────────────────────────────────────────

export interface NavRow {
  section: string;
  id: string;
  href: string | null;
  permissions: string[];
  feature: string | null;
}

export interface ConfigCheck {
  findings: Finding[];
  navigation: NavRow[];
  locales: string[];
  features: Record<string, boolean>;
}

/** Icon names the navigation can render (the ICONS map in shared/layouts/navigation.tsx). */
export function navigationIcons(root: string): string[] | null {
  const file = join(root, 'src/shared/layouts/navigation.tsx');
  if (!existsSync(file)) return null;
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf('const ICONS');
  if (start === -1) return null;
  const block = source.slice(start, source.indexOf('};', start));
  return [...block.matchAll(/^[ \t]+(\w+),?$/gm)].map((m) => m[1]!);
}

/** A config path matches a page when it is the page itself or a dynamic route covers it. */
const pageExists = (pages: readonly PageRoute[], href: string): boolean => {
  const path = href.split(/[?#]/)[0]!.replace(/\/$/, '') || '/';
  return pages.some((page) => {
    if (page.url === path) return true;
    // [...slug] → .+ and [id] → [^/]+ (a bracket never contains another one).
    const pattern = page.url
      .replaceAll(/\[\.\.\.[^[\]]+\]/g, '.+')
      .replaceAll(/\[[^[\]]+\]/g, '[^/]+');
    return pattern !== page.url && new RegExp(`^${pattern}$`).test(path);
  });
};

export async function loadAppConfig(): Promise<AppConfig> {
  return (await import('@/infrastructure/config/app.config')).appConfig;
}

/**
 * Cross-checks app.config.ts with the rest of the project: the schema proves
 * the object is well-formed; this proves it points at things that exist.
 */
export function checkAppConfig(root: string, config: AppConfig): ConfigCheck {
  const findings: Finding[] = [];
  const add = (level: Finding['level'], subject: string, message: string): void => {
    findings.push({ level, subject, message });
  };
  const pages = scanPages(root);
  const catalogues = findCatalogues(root, config.i18n.locales);
  const icons = navigationIcons(root);
  const features = config.features as Record<string, boolean>;

  if (!config.i18n.locales.includes(config.i18n.defaultLocale)) {
    add('error', 'i18n.defaultLocale', `"${config.i18n.defaultLocale}" is not in i18n.locales`);
  }
  for (const [name, path] of [
    ['app.homePath', config.app.homePath],
    ['app.loginPath', config.app.loginPath],
  ] as const) {
    if (!pageExists(pages, path)) add('error', name, `no page exists for "${path}"`);
  }

  const navigation: NavRow[] = [];
  const ids = new Set<string>();
  const requireKey = (subject: string, key: string | undefined): void => {
    if (!key) return;
    for (const locale of config.i18n.locales) {
      if (!allKeys(catalogues, locale).has(key)) {
        add('error', subject, `label "${key}" has no ${locale} translation`);
      }
    }
  };
  const visit = (section: string, item: NavItem): void => {
    const subject = `navigation.${item.id}`;
    if (ids.has(item.id)) add('error', subject, 'the id is used by more than one item');
    ids.add(item.id);
    requireKey(subject, item.labelKey);
    requireKey(subject, item.descriptionKey);
    if (item.href?.startsWith('/') && !pageExists(pages, item.href)) {
      add('error', subject, `no page exists for "${item.href}"`);
    }
    if (!item.href && !item.children?.length)
      add('error', subject, 'has neither a link nor children');
    if (item.icon && icons && !icons.includes(item.icon)) {
      add(
        'warning',
        subject,
        `icon "${item.icon}" is not in the navigation icon map: a dot is shown instead`,
      );
    }
    if (item.feature && !(item.feature in features)) {
      add('error', subject, `feature flag "${item.feature}" is not defined: the item never shows`);
    }
    if (item.href && !item.permissions?.length && !item.roles?.length) {
      const page = pages.find((p) => p.url === item.href);
      if (page?.access.kind === 'restricted') {
        add(
          'warning',
          subject,
          `is shown to everyone but its page requires ${page.access.requirement}`,
        );
      }
    }
    navigation.push({
      section,
      id: item.id,
      href: item.href ?? null,
      permissions: item.permissions ?? [],
      feature: item.feature ?? null,
    });
    for (const child of item.children ?? []) visit(section, child);
  };
  for (const section of config.navigation) {
    requireKey(`navigation.${section.id}`, section.labelKey);
    for (const item of section.items) visit(section.id, item);
  }
  return { findings, navigation, locales: [...config.i18n.locales], features };
}

// ── Translations ─────────────────────────────────────────────────────────────

export function checkI18n(
  root: string,
  i18n: { locales: readonly string[]; defaultLocale: string },
): { findings: I18nFinding[]; catalogues: number; keys: number } {
  const catalogues = findCatalogues(root, i18n.locales);
  const registry = join(root, 'src/infrastructure/i18n/messages.ts');
  const registered = registeredCatalogues(
    existsSync(registry) ? readFileSync(registry, 'utf8') : '',
  );
  return {
    findings: checkTranslations(catalogues, registered, i18n.defaultLocale, i18n.locales),
    catalogues: catalogues.length,
    keys: allKeys(catalogues, i18n.defaultLocale).size,
  };
}

// ── Routes ───────────────────────────────────────────────────────────────────

export interface RoutesCheck {
  pages: PageRoute[];
  api: ApiRoute[];
  findings: Finding[];
}

export function checkRoutes(root: string): RoutesCheck {
  const pages = scanPages(root);
  const api = scanApiRoutes(root);
  const findings: Finding[] = api
    .filter((route) => route.access.kind === 'unknown')
    .map((route) => ({
      level: 'error' as const,
      subject: `${route.method} ${route.url}`,
      message: `the handler (${route.handler ?? route.file}) could not be resolved — is the export missing?`,
    }));
  return { pages, api, findings };
}
