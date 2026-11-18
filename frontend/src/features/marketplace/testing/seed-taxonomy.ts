import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Taxonomy, TaxonomyEntry } from '../types';

/**
 * A file of the backend (tests only): found from this folder in Node tests, or
 * from the frontend root in jsdom tests, where import.meta.url is not a file URL.
 */
export function readBackendFile(path: string): string {
  let file: string | URL = resolve(process.cwd(), '../backend', path);
  try {
    const here = new URL(import.meta.url);
    if (here.protocol === 'file:') file = new URL(`../../../../../backend/${path}`, here);
  } catch {
    // Not a URL: keep the path from the frontend root.
  }
  return readFileSync(file, 'utf8');
}

/**
 * The taxonomy the product ships with, read from the backend migration that
 * creates it (tests only), shaped like the catalog API serves it in English.
 */
export function seedTaxonomy(): Taxonomy {
  const sql = readBackendFile(
    'prisma/migrations/20261104120000_marketplace_taxonomy/migration.sql',
  );
  const str = `'((?:[^']|'')*)'`;
  // One VALUES row: ('CODE', 'label', 'labels json', 'description', sort, 'attributes json')
  const row = new RegExp(`^ {2}[(]${str}, ${str}, ${str}, ${str}, ([0-9]+), ${str}[)]`, 'gm');
  const unquote = (s: string) => s.replace(/''/g, "'");
  const section = (list: string): TaxonomyEntry[] => {
    const end = sql.indexOf(`WHERE t."code" = '${list}'`);
    const start = sql.lastIndexOf('CROSS JOIN (VALUES', end);
    return [...sql.slice(start, end).matchAll(row)].map((m) => {
      const attrs = JSON.parse(unquote(m[6]!)) as Record<string, string>;
      const name = unquote(m[2]!);
      return {
        id: m[1]!.toLowerCase(),
        name,
        short: attrs['shortName'] ?? name,
        description: unquote(m[4]!),
        icon: attrs['icon'] ?? '',
        keywords: (attrs['keywords'] ?? '')
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
      };
    });
  };
  return { industries: section('marketplace-industries'), needs: section('marketplace-needs') };
}
