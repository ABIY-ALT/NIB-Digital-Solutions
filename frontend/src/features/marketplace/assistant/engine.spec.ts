import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { seedTaxonomy } from '../testing/seed-taxonomy';
import type { MarketplaceProduct } from '../types';
import { answer } from './engine';

// The backend seed is the catalog the website ships with.
const seed = JSON.parse(
  readFileSync(
    new URL('../../../../../backend/prisma/seed-marketplace.json', import.meta.url),
    'utf8',
  ),
) as {
  products: Omit<MarketplaceProduct, 'id' | 'updatedAt'>[];
};
const products: MarketplaceProduct[] = seed.products.map(
  (p, i) => ({ ...p, id: `p${i}`, updatedAt: p.createdAt }) as MarketplaceProduct,
);
const taxonomy = seedTaxonomy();
const ask = (q: string, focusSlug?: string) => answer(q, { products, taxonomy, focusSlug });

describe('on-device grounded assistant', () => {
  it('knows the shipped industries and business needs', () => {
    expect(taxonomy.industries).toHaveLength(8);
    expect(taxonomy.needs).toHaveLength(7);
    expect(taxonomy.industries[0]).toMatchObject({ id: 'education', icon: 'GraduationCap' });
    expect(taxonomy.industries[0]!.keywords).toContain('school');
  });

  it('recommends the school product for schools', () => {
    expect(ask('What products do you have for schools?').products[0]).toBe(
      'school-management-system',
    );
  });

  it('finds building management', () => {
    expect(ask('Which product can automate building management?').products[0]).toBe(
      'building-management-system',
    );
  });

  it('lists lending solutions', () => {
    expect(ask('Do you have a digital lending solution?').products).toEqual(
      expect.arrayContaining([
        'micro-lending-platform',
        'sme-lending-solution',
        'loan-origination-system',
      ]),
    );
  });

  it('lists only products with mobile apps or USSD', () => {
    const r = ask('Which products support mobile applications?');
    expect(r.products.length).toBeGreaterThan(3);
    for (const slug of r.products)
      expect(products.find((p) => p.slug === slug)!.platforms.some((x) => x !== 'web')).toBe(true);
  });

  it('answers customization and integration questions without inventing scope', () => {
    expect(ask('Can your products be customized?').actions.some((a) => a.kind === 'inquiry')).toBe(
      true,
    );
    expect(ask('Can your products integrate with existing systems?').text).toMatch(/integrat/i);
  });

  it('refuses to confirm undocumented capabilities', () => {
    const r = ask('Does the bus ticket platform support GPS tracking with drones?');
    expect(r.grounded).toBe(false);
  });

  it('uses product FAQs on product pages and never quotes a price', () => {
    expect(ask('Is there a mobile app for parents?', 'school-management-system').text).toMatch(
      /Android and iOS/,
    );
    const pricing = ask('How much does the SACCOS system cost?');
    expect(pricing.text).not.toMatch(/ETB\s?\d/);
    expect(pricing.actions[0]!.kind).toBe('inquiry');
  });

  it('admits when nothing matches', () => {
    expect(ask('What is the weather on Mars?').grounded).toBe(false);
  });
});
