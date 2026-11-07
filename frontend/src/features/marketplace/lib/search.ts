import { taxonomyIndex } from '../taxonomy';
import type { CatalogQuery, MarketplaceProduct, Taxonomy, TaxonomyEntry } from '../types';

const NO_TAXONOMY: Taxonomy = { industries: [], needs: [] };
const words = (e: TaxonomyEntry | undefined) => (e ? `${e.name} ${e.keywords.join(' ')}` : '');

/** Relevance-ranked search across names, descriptions, features, modules, industries and business needs. */
export function searchProducts(
  products: MarketplaceProduct[],
  term: string,
  taxonomy: Taxonomy = NO_TAXONOMY,
): MarketplaceProduct[] {
  const index = taxonomyIndex(taxonomy);
  const terms = term
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (!terms.length) return products;
  const scored = products.map((p) => {
    const fields: [string, number][] = [
      [p.name, 8],
      [p.tagline, 3],
      [p.summary, 3],
      [p.keyFeatures.join(' '), 3],
      [p.content.modules.map((m) => `${m.name} ${m.features.join(' ')}`).join(' '), 2],
      [p.problem, 1],
      [p.industries.map((i) => words(index.industry(i))).join(' '), 2],
      [p.needs.map((n) => words(index.need(n))).join(' '), 2],
    ];
    let score = 0;
    for (const w of terms) {
      let hit = 0;
      for (const [text, weight] of fields) if (text.toLowerCase().includes(w)) hit += weight;
      if (!hit) return { p, score: 0 };
      score += hit;
    }
    return { p, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.p);
}

export function filterProducts(
  products: MarketplaceProduct[],
  q: CatalogQuery,
  taxonomy: Taxonomy = NO_TAXONOMY,
): MarketplaceProduct[] {
  const searching = !!q.search?.trim();
  let list = searching ? searchProducts(products, q.search!, taxonomy) : [...products];
  if (q.industries?.length)
    list = list.filter((p) => p.industries.some((i) => q.industries!.includes(i)));
  if (q.needs?.length) list = list.filter((p) => p.needs.some((n) => q.needs!.includes(n)));
  if (q.categories?.length) list = list.filter((p) => q.categories!.includes(p.categoryCode));
  if (q.availability?.length) list = list.filter((p) => q.availability!.includes(p.availability));
  if (q.deployment?.length)
    list = list.filter((p) => p.deployment.some((d) => q.deployment!.includes(d)));
  if (q.hasDemo) list = list.filter((p) => !!p.content.demo);
  const sort = q.sort ?? 'featured';
  // While searching, "featured" keeps the relevance order.
  if (sort === 'alphabetical') list.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'rating')
    // Best rated first; products without approved reviews last.
    list.sort(
      (a, b) =>
        (b.rating?.average ?? 0) - (a.rating?.average ?? 0) ||
        (b.rating?.count ?? 0) - (a.rating?.count ?? 0) ||
        a.name.localeCompare(b.name),
    );
  else if (sort === 'newest') list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  else if (!searching)
    list.sort(
      (a, b) =>
        Number(b.featured) - Number(a.featured) ||
        Number(!!b.content.demo) - Number(!!a.content.demo) ||
        a.name.localeCompare(b.name),
    );
  return list;
}
