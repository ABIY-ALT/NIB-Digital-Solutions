/**
 * NIB Digital Solutions marketplace seed: product categories and the initial
 * 14-product catalog (prisma/seed-marketplace.json, validated against the
 * content contract by src/modules/marketplace/presentation/seed-catalog.spec.ts).
 * Idempotent: categories are upserted by code, products by slug.
 */
import { readFileSync } from 'node:fs';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client.js';

interface SeedCategory {
  code: string;
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
}

interface SeedProduct {
  slug: string;
  name: string;
  tagline: string;
  summary: string;
  overview: string;
  problem: string;
  categoryCode: string;
  status: string;
  availability: string;
  featured: boolean;
  customizable: boolean;
  icon: string;
  accent: string;
  industries: string[];
  needs: string[];
  deployment: string[];
  platforms: string[];
  keyFeatures: string[];
  content: Prisma.InputJsonObject;
  documentation: Prisma.InputJsonArray;
  createdAt: string;
}

const SEED = JSON.parse(
  readFileSync(new URL('./seed-marketplace.json', import.meta.url), 'utf8'),
) as {
  categories: SeedCategory[];
  products: SeedProduct[];
};

export async function seedMarketplace(
  prisma: PrismaClient,
  actor: string,
): Promise<{ categories: number; products: number }> {
  for (const c of SEED.categories) {
    const data = {
      name: c.name,
      description: c.description,
      icon: c.icon,
      sortOrder: c.sortOrder,
      updatedBy: actor,
    };
    await prisma.productCategory.upsert({
      where: { code: c.code },
      update: data,
      create: { ...data, code: c.code, createdBy: actor },
    });
  }
  for (const { slug, createdAt, ...p } of SEED.products) {
    await prisma.digitalProduct.upsert({
      where: { slug },
      update: { ...p, updatedBy: actor },
      create: { ...p, slug, createdAt: new Date(createdAt), createdBy: actor, updatedBy: actor },
    });
  }
  return { categories: SEED.categories.length, products: SEED.products.length };
}
