import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DigitalProduct,
  type DigitalProductInput,
} from '#modules/digital-products/domain/digital-product.entity.js';
import { ProductContentSchema } from '#modules/digital-products/presentation/product-content.schema.js';

interface SeedFile {
  categories: { code: string }[];
  products: (DigitalProductInput & { createdAt: string })[];
}

const seed = JSON.parse(
  readFileSync(new URL('../../../../prisma/seed-marketplace.json', import.meta.url), 'utf8'),
) as SeedFile;

describe('marketplace seed catalog', () => {
  it('contains the initial 14 products in known categories', () => {
    const codes = new Set(seed.categories.map((c) => c.code));
    expect(seed.products).toHaveLength(14);
    for (const p of seed.products)
      expect(codes.has(p.categoryCode), `${p.slug} category`).toBe(true);
  });

  it.each(seed.products.map((p) => [p.slug, p] as const))(
    '%s satisfies the entity rules and the content contract',
    (_slug, p) => {
      expect(() => DigitalProduct.create(p, 'seed')).not.toThrow();
      const content = ProductContentSchema.zod.safeParse(p.content);
      expect(content.success ? 'ok' : JSON.stringify(content.error.issues.slice(0, 3))).toBe('ok');
    },
  );
});
