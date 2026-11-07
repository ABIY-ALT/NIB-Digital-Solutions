import { NotFoundError, ValidationError } from '#core/domain/errors/app-error.js';
import type {
  LookupOption,
  ReferenceDataUseCases,
} from '#modules/reference-data/application/reference-data.use-cases.js';

/**
 * Marketplace taxonomy: the industries and business needs the website is
 * organised by. Both are managed reference-data lists (Administration ›
 * Reference data), shipped by migration 20261104120000_marketplace_taxonomy.
 *
 * Reference-data item codes are upper case ("EDUCATION"); products, URLs and
 * the website use the lower-case form ("education"). Plain functions (not a
 * Nest provider) so the digital-products module can validate with them
 * without depending on the marketplace module.
 */

export const TAXONOMY_LISTS = {
  industries: 'marketplace-industries',
  needs: 'marketplace-needs',
} as const;

export type TaxonomyKind = keyof typeof TAXONOMY_LISTS;

export interface TaxonomyEntry {
  /** Lower-case code, as stored on products and used in URLs. */
  id: string;
  name: string;
  /** Short form for cards and badges (falls back to the name). */
  short: string;
  description: string;
  /** Lucide icon name. */
  icon: string;
  /** Extra search words (search box, on-device assistant). */
  keywords: string[];
}

export interface Taxonomy {
  industries: TaxonomyEntry[];
  needs: TaxonomyEntry[];
}

const DEFAULT_ICON: Record<TaxonomyKind, string> = { industries: 'Building2', needs: 'Target' };

export const taxonomyId = (code: string): string => code.trim().toLowerCase();

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function toEntry(kind: TaxonomyKind, o: LookupOption): TaxonomyEntry {
  return {
    id: taxonomyId(o.code),
    name: o.label,
    short: text(o.attributes['shortName']) || o.label,
    description: o.description ?? '',
    icon: text(o.attributes['icon']) || DEFAULT_ICON[kind],
    keywords: text(o.attributes['keywords'])
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean),
  };
}

async function lookup(
  refdata: ReferenceDataUseCases,
  kind: TaxonomyKind,
  options: { locale?: string; includeInactive?: boolean },
): Promise<LookupOption[]> {
  try {
    return await refdata.lookup(TAXONOMY_LISTS[kind], options);
  } catch (error) {
    // The list is missing (migration not applied): an empty taxonomy, not a broken website.
    if (error instanceof NotFoundError) return [];
    throw error;
  }
}

/** The effective (active, in validity window) entries, in the list's order and the reader's language. */
export async function loadTaxonomy(
  refdata: ReferenceDataUseCases,
  locale?: string,
): Promise<Taxonomy> {
  const [industries, needs] = await Promise.all([
    lookup(refdata, 'industries', { locale }),
    lookup(refdata, 'needs', { locale }),
  ]);
  return {
    industries: industries.map((o) => toEntry('industries', o)),
    needs: needs.map((o) => toEntry('needs', o)),
  };
}

/**
 * Rejects codes that are not in the lists. Inactive entries are still
 * accepted, so a product that carries a retired industry can be edited
 * without first removing it (the website just stops showing it).
 */
export async function assertKnownTaxonomy(
  refdata: ReferenceDataUseCases,
  values: { industries?: readonly string[]; needs?: readonly string[] },
): Promise<void> {
  const issues: { field: string; message: string }[] = [];
  for (const kind of ['industries', 'needs'] as const) {
    const wanted = values[kind];
    if (!wanted?.length) continue;
    const known = new Set(
      (await lookup(refdata, kind, { includeInactive: true })).map((o) => taxonomyId(o.code)),
    );
    const unknown = wanted.filter((v) => !known.has(taxonomyId(v)));
    if (unknown.length) {
      issues.push({
        field: kind,
        message: `Unknown ${kind === 'industries' ? 'industry' : 'business need'}: ${unknown.join(', ')} (see Reference data › ${TAXONOMY_LISTS[kind]})`,
      });
    }
  }
  if (issues.length) throw new ValidationError(issues);
}
