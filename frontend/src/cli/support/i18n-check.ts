import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface I18nFinding {
  level: 'error' | 'warning';
  catalogue: string;
  locale: string;
  key: string;
  problem:
    | 'missing'
    | 'extra'
    | 'placeholders'
    | 'untranslated'
    | 'not-registered'
    | 'missing-file'
    | 'namespace-clash';
  message: string;
}

export interface Catalogue {
  /** Folder holding `<locale>.json`, relative to src/ (e.g. "features/users/i18n"). */
  folder: string;
  /** locale → flattened `key → text` (null when the file does not exist). */
  messages: Record<string, Map<string, string> | null>;
}

type Json = { [key: string]: Json } | string | number | boolean | null | Json[];

/** `{ a: { b: 'x' } }` → `a.b → 'x'`. */
export function flattenMessages(value: Json, prefix = '', into = new Map<string, string>()) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flattenMessages(child, prefix ? `${prefix}.${key}` : key, into);
    }
  } else into.set(prefix, typeof value === 'string' ? value : JSON.stringify(value));
  return into;
}

/**
 * ICU argument names of a message, including those inside plural / select
 * branches: "{count, plural, one {# row by {user}} other {# rows}}" → count, user.
 * Branch texts themselves ("# row by …") are translations, not arguments.
 */
export function placeholders(message: string): string[] {
  const names = new Set<string>();
  const closing = (from: number): number => {
    let depth = 0;
    for (let i = from; i < message.length; i++) {
      if (message[i] === '{') depth++;
      else if (message[i] === '}' && --depth === 0) return i;
    }
    return message.length;
  };
  const scan = (start: number, end: number): void => {
    let i = start;
    while (i < end) {
      if (message[i] === '{') {
        const close = closing(i);
        const body = message.slice(i + 1, close);
        const [name = '', type = ''] = body.split(',', 2).map((part) => part.trim());
        if (/^\w+$/.test(name)) names.add(name);
        if (/^(plural|select|selectordinal)$/.test(type)) {
          scanBranches(i + 1 + body.indexOf(',', body.indexOf(',') + 1), close);
        }
        i = close;
      }
      i++;
    }
  };
  // Each branch is "key {sub-message}": scan the sub-messages for nested arguments.
  const scanBranches = (start: number, end: number): void => {
    let j = start;
    while (j < end) {
      if (message[j] === '{') {
        const branchEnd = closing(j);
        scan(j + 1, branchEnd);
        j = branchEnd;
      }
      j++;
    }
  };
  scan(0, message.length);
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** `text` without its `{…}` placeholders, each running from a "{" to the next "}". */
function withoutPlaceholders(text: string): string {
  let out = '';
  let from = 0;
  for (;;) {
    const open = text.indexOf('{', from);
    const close = open === -1 ? -1 : text.indexOf('}', open);
    if (close === -1) return out + text.slice(from);
    out += text.slice(from, open);
    from = close + 1;
  }
}

/** Text that is legitimately identical in every language (codes, brand names, symbols). */
const sameInEveryLanguage = (text: string): boolean =>
  text.length <= 3 ||
  !/\p{L}{3,}/u.test(withoutPlaceholders(text)) ||
  /^[A-Z0-9 _./:-]+$/.test(text);

/**
 * Compares every locale of a catalogue with the default locale. Missing keys
 * and placeholder mismatches break the UI at runtime (errors); extra keys and
 * text left in the default language are reported as warnings.
 */
export function compareCatalogue(
  catalogue: Catalogue,
  defaultLocale: string,
  locales: readonly string[],
): I18nFinding[] {
  const findings: I18nFinding[] = [];
  const add = (
    level: I18nFinding['level'],
    locale: string,
    key: string,
    problem: I18nFinding['problem'],
    message: string,
  ): void => {
    findings.push({ level, catalogue: catalogue.folder, locale, key, problem, message });
  };

  const base = catalogue.messages[defaultLocale];
  if (!base) {
    add('error', defaultLocale, '', 'missing-file', `${defaultLocale}.json does not exist`);
    return findings;
  }
  for (const locale of locales) {
    if (locale === defaultLocale) continue;
    const target = catalogue.messages[locale];
    if (!target) {
      add('error', locale, '', 'missing-file', `${locale}.json does not exist`);
      continue;
    }
    compareLocale(base, target, defaultLocale, (level, key, problem, message) =>
      add(level, locale, key, problem, message),
    );
  }
  return findings;
}

type LocaleReport = (
  level: I18nFinding['level'],
  key: string,
  problem: I18nFinding['problem'],
  message: string,
) => void;

/** One locale against the default: missing, extra and untranslated keys, placeholder mismatches. */
function compareLocale(
  base: ReadonlyMap<string, string>,
  target: ReadonlyMap<string, string>,
  defaultLocale: string,
  report: LocaleReport,
): void {
  for (const [key, text] of base) {
    const translated = target.get(key);
    if (translated === undefined) {
      report('error', key, 'missing', 'has no translation');
      continue;
    }
    const expected = placeholders(text).join(', ');
    const actual = placeholders(translated).join(', ');
    if (expected !== actual) {
      report(
        'error',
        key,
        'placeholders',
        `uses {${actual}} but ${defaultLocale} uses {${expected}}`,
      );
    } else if (translated === text && !sameInEveryLanguage(text)) {
      report('warning', key, 'untranslated', `is still the ${defaultLocale} text`);
    }
  }
  for (const key of target.keys()) {
    if (!base.has(key)) report('warning', key, 'extra', `does not exist in ${defaultLocale}`);
  }
}

/** Catalogue folders the application loads (the dynamic imports in messages.ts), per locale. */
export function registeredCatalogues(messagesSource: string): Map<string, Set<string>> {
  const registered = new Map<string, Set<string>>();
  for (const match of messagesSource.matchAll(
    /import\(\s*['"]@\/([^'"]+)\/([\w-]+)\.json['"]\s*\)/g,
  )) {
    const locales = registered.get(match[1]!) ?? new Set<string>();
    locales.add(match[2]!);
    registered.set(match[1]!, locales);
  }
  return registered;
}

function readMessages(file: string): Map<string, string> | null {
  if (!existsSync(file)) return null;
  return flattenMessages(JSON.parse(readFileSync(file, 'utf8')) as Json);
}

/** Every folder under src/ that holds translation files: shared/i18n and features/<x>/i18n. */
export function findCatalogues(root: string, locales: readonly string[]): Catalogue[] {
  const src = join(root, 'src');
  const features = join(src, 'features');
  const folders = [
    'shared/i18n',
    ...(existsSync(features)
      ? readdirSync(features, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && existsSync(join(features, entry.name, 'i18n')))
          .map((entry) => `features/${entry.name}/i18n`)
          .sort()
      : []),
  ];
  return folders.map((folder) => ({
    folder,
    messages: Object.fromEntries(
      locales.map((locale) => [locale, readMessages(join(src, folder, `${locale}.json`))]),
    ),
  }));
}

/**
 * Whole-project check: every catalogue complete in every locale, registered in
 * messages.ts, and no two catalogues claiming the same top-level namespace
 * (the later one would silently replace the earlier).
 */
export function checkTranslations(
  catalogues: readonly Catalogue[],
  registered: ReadonlyMap<string, ReadonlySet<string>>,
  defaultLocale: string,
  locales: readonly string[],
): I18nFinding[] {
  const findings = catalogues.flatMap((c) => compareCatalogue(c, defaultLocale, locales));
  const owners = new Map<string, string>();
  for (const catalogue of catalogues) {
    for (const locale of locales) {
      if (catalogue.messages[locale] && !registered.get(catalogue.folder)?.has(locale)) {
        findings.push({
          level: 'error',
          catalogue: catalogue.folder,
          locale,
          key: '',
          problem: 'not-registered',
          message: 'is not loaded: add it to src/infrastructure/i18n/messages.ts',
        });
      }
    }
    const namespaces = new Set(
      [...(catalogue.messages[defaultLocale]?.keys() ?? [])].map((key) => key.split('.')[0]!),
    );
    for (const namespace of namespaces) {
      const owner = owners.get(namespace);
      if (owner && owner !== catalogue.folder) {
        findings.push({
          level: 'error',
          catalogue: catalogue.folder,
          locale: defaultLocale,
          key: namespace,
          problem: 'namespace-clash',
          message: `namespace is also defined by ${owner}: one replaces the other at runtime`,
        });
      } else owners.set(namespace, catalogue.folder);
    }
  }
  return findings;
}

/** All message keys of a locale across catalogues (to verify keys referenced from configuration). */
export function allKeys(catalogues: readonly Catalogue[], locale: string): Set<string> {
  return new Set(catalogues.flatMap((c) => [...(c.messages[locale]?.keys() ?? [])]));
}
