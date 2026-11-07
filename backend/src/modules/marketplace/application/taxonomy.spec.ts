import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError, ValidationError } from '#core/domain/errors/app-error.js';
import type {
  LookupOption,
  ReferenceDataUseCases,
} from '#modules/reference-data/application/reference-data.use-cases.js';
import { assertKnownTaxonomy, loadTaxonomy, TAXONOMY_LISTS } from './taxonomy.js';

const option = (code: string, extra: Partial<LookupOption> = {}): LookupOption => ({
  code,
  label: code,
  description: null,
  parentCode: null,
  attributes: {},
  active: true,
  ...extra,
});

function refdata(lists: Record<string, LookupOption[]>) {
  const lookup = vi.fn((type: string, options: { includeInactive?: boolean } = {}) => {
    const items = lists[type];
    if (!items) return Promise.reject(new NotFoundError('ReferenceDataType', type));
    return Promise.resolve(options.includeInactive ? items : items.filter((i) => i.active));
  });
  return { refdata: { lookup } as unknown as ReferenceDataUseCases, lookup };
}

describe('marketplace taxonomy', () => {
  it('maps reference-data items to website entries (lower-case ids, attributes)', async () => {
    const { refdata: rd, lookup } = refdata({
      [TAXONOMY_LISTS.industries]: [
        option('EDUCATION', {
          label: 'ትምህርት',
          description: 'Schools',
          attributes: { shortName: 'Edu', icon: 'GraduationCap', keywords: 'School, College ,' },
        }),
        option('RETIRED', { active: false }),
      ],
      [TAXONOMY_LISTS.needs]: [option('GROW-SALES')],
    });
    const t = await loadTaxonomy(rd, 'am');
    expect(t.industries).toEqual([
      {
        id: 'education',
        name: 'ትምህርት',
        short: 'Edu',
        description: 'Schools',
        icon: 'GraduationCap',
        keywords: ['school', 'college'],
      },
    ]);
    expect(t.needs[0]).toMatchObject({ id: 'grow-sales', short: 'GROW-SALES', icon: 'Target' });
    expect(lookup).toHaveBeenCalledWith(TAXONOMY_LISTS.industries, { locale: 'am' });
  });

  it('serves an empty taxonomy when a list does not exist yet', async () => {
    await expect(loadTaxonomy(refdata({}).refdata)).resolves.toEqual({ industries: [], needs: [] });
  });

  it('accepts known codes in any case, including inactive ones, and rejects unknown codes', async () => {
    const { refdata: rd } = refdata({
      [TAXONOMY_LISTS.industries]: [option('EDUCATION'), option('RETIRED', { active: false })],
      [TAXONOMY_LISTS.needs]: [option('GROW-SALES')],
    });
    await expect(
      assertKnownTaxonomy(rd, { industries: ['education', 'retired'], needs: ['GROW-SALES'] }),
    ).resolves.toBeUndefined();
    const error = await assertKnownTaxonomy(rd, { industries: ['space'], needs: ['fly'] }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect(JSON.stringify(error)).toContain('space');
  });

  it('ships every industry and need the seed catalog uses (migration)', () => {
    const sql = readFileSync(
      new URL(
        '../../../../prisma/migrations/20261104120000_marketplace_taxonomy/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const seed = JSON.parse(
      readFileSync(new URL('../../../../prisma/seed-marketplace.json', import.meta.url), 'utf8'),
    ) as { products: { slug: string; industries: string[]; needs: string[] }[] };
    const shipped = new Set(
      [...sql.matchAll(/^ {2}\('([A-Z0-9_.-]+)'/gm)].map((m) => m[1]!.toLowerCase()),
    );
    expect(shipped.size).toBe(15);
    for (const p of seed.products) {
      for (const code of [...p.industries, ...p.needs]) {
        expect(shipped.has(code), `${p.slug}: ${code}`).toBe(true);
      }
    }
  });
});
