import { Injectable } from '@nestjs/common';
import { PrismaService } from '#core/infrastructure/prisma/prisma.service.js';
import type {
  MarketplaceAnalytics,
  MarketplaceInsights,
  RankedProduct,
} from '../application/marketplace.ports.js';
import {
  LEAD_STATUSES,
  type LeadStatus,
  type MarketplaceEventType,
} from '../domain/marketplace.constants.js';

type DayCount = { day: Date; n: bigint };

/** Leads that left the pipeline (not counted as open work). */
const CLOSED_STATUSES = ['closed_won', 'closed_lost'];

/** Sums counts per key and sorts them, largest first. */
function ranked(rows: [string, number][]): [string, number][] {
  const totals = new Map<string, number>();
  for (const [key, n] of rows) totals.set(key, (totals.get(key) ?? 0) + n);
  return [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** PostgreSQL read model for marketplace analytics. */
@Injectable()
export class PrismaMarketplaceInsights implements MarketplaceInsights {
  constructor(private readonly prisma: PrismaService) {}

  async record(type: MarketplaceEventType, productSlug: string | null): Promise<void> {
    await this.prisma.client.marketplaceEvent.create({ data: { type, productSlug } });
  }

  async summary(days: number): Promise<MarketplaceAnalytics> {
    const db = this.prisma.client;
    const since = new Date(Date.now() - days * 86_400_000);
    const live = { deletedAt: null };
    const eventCount = (type: MarketplaceEventType) =>
      db.marketplaceEvent.count({ where: { type, occurredAt: { gte: since } } });
    const top = async (type: MarketplaceEventType): Promise<RankedProduct[]> => {
      const rows = await db.marketplaceEvent.groupBy({
        by: ['productSlug'],
        where: { type, occurredAt: { gte: since }, productSlug: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { productSlug: 'desc' } },
        take: 8,
      });
      return rows.map((r) => ({ slug: r.productSlug ?? '', count: r._count._all }));
    };

    const [
      totalProducts,
      publishedProducts,
      productViews,
      demoPlays,
      assistantQueries,
      demoRequests,
      inquiries,
      topViewed,
      topWatched,
    ] = await Promise.all([
      db.digitalProduct.count({ where: { ...live, status: { not: 'archived' } } }),
      db.digitalProduct.count({ where: { ...live, status: 'published' } }),
      eventCount('product_view'),
      eventCount('demo_play'),
      eventCount('assistant_query'),
      db.demoRequest.count({ where: { ...live, createdAt: { gte: since } } }),
      db.productInquiry.count({ where: { ...live, createdAt: { gte: since } } }),
      top('product_view'),
      top('demo_play'),
    ]);

    const open = { ...live, status: { notIn: CLOSED_STATUSES } };
    const [
      demoByProduct,
      inquiryByProduct,
      demoByStatus,
      inquiryByStatus,
      demoBySource,
      inquiryBySource,
      demoByOwner,
      inquiryByOwner,
    ] = await Promise.all([
      db.demoRequest.groupBy({
        by: ['productSlug'],
        where: { ...live, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      db.productInquiry.groupBy({
        by: ['productSlug'],
        where: { ...live, createdAt: { gte: since }, productSlug: { not: null } },
        _count: { _all: true },
      }),
      db.demoRequest.groupBy({ by: ['status'], where: live, _count: { _all: true } }),
      db.productInquiry.groupBy({ by: ['status'], where: live, _count: { _all: true } }),
      db.demoRequest.groupBy({
        by: ['source'],
        where: { ...live, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      db.productInquiry.groupBy({
        by: ['source'],
        where: { ...live, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      db.demoRequest.groupBy({ by: ['assignedTo'], where: open, _count: { _all: true } }),
      db.productInquiry.groupBy({ by: ['assignedTo'], where: open, _count: { _all: true } }),
    ]);
    const requested = new Map<string, number>();
    for (const r of [...demoByProduct, ...inquiryByProduct]) {
      if (r.productSlug)
        requested.set(r.productSlug, (requested.get(r.productSlug) ?? 0) + r._count._all);
    }
    const leadsByStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<
      LeadStatus,
      number
    >;
    for (const r of [...demoByStatus, ...inquiryByStatus]) {
      if (r.status in leadsByStatus) leadsByStatus[r.status as LeadStatus] += r._count._all;
    }

    // Leads per industry: each lead counts once for every industry of its product.
    const leadProducts = [...requested.keys()];
    const industriesOf = new Map(
      (
        await db.digitalProduct.findMany({
          where: { slug: { in: leadProducts } },
          select: { slug: true, industries: true },
        })
      ).map((p) => [p.slug, p.industries]),
    );
    const byIndustry = new Map<string, number>();
    for (const [slug, count] of requested) {
      for (const industry of industriesOf.get(slug) ?? [])
        byIndustry.set(industry, (byIndustry.get(industry) ?? 0) + count);
    }

    return {
      days,
      totalProducts,
      publishedProducts,
      productViews,
      demoPlays,
      assistantQueries,
      demoRequests,
      inquiries,
      daily: await this.daily(since, days),
      topViewed,
      topWatched,
      topRequested: [...requested]
        .map(([slug, count]) => ({ slug, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      leadsByStatus,
      leadsBySource: ranked(
        [...demoBySource, ...inquiryBySource].map((r) => [r.source ?? 'unknown', r._count._all]),
      ).map(([source, count]) => ({ source, count })),
      leadsByIndustry: ranked([...byIndustry]).map(([industry, count]) => ({ industry, count })),
      openByOwner: ranked(
        [...demoByOwner, ...inquiryByOwner].map((r) => [r.assignedTo ?? '', r._count._all]),
      ).map(([owner, count]) => ({ ownerId: owner || null, count })),
    };
  }

  /** Views and new leads per day (UTC), zero-filled. */
  private async daily(since: Date, days: number): Promise<MarketplaceAnalytics['daily']> {
    const db = this.prisma.client;
    const [views, demos, inquiries] = await Promise.all([
      db.$queryRaw<DayCount[]>`
        SELECT date_trunc('day', occurred_at) AS day, count(*) AS n FROM marketplace_events
        WHERE type = 'product_view' AND occurred_at >= ${since} GROUP BY 1`,
      db.$queryRaw<DayCount[]>`
        SELECT date_trunc('day', created_at) AS day, count(*) AS n FROM demo_requests
        WHERE deleted_at IS NULL AND created_at >= ${since} GROUP BY 1`,
      db.$queryRaw<DayCount[]>`
        SELECT date_trunc('day', created_at) AS day, count(*) AS n FROM product_inquiries
        WHERE deleted_at IS NULL AND created_at >= ${since} GROUP BY 1`,
    ]);
    const key = (d: Date) => new Date(d).toISOString().slice(0, 10);
    const sum = (rows: DayCount[]) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(key(r.day), (m.get(key(r.day)) ?? 0) + Number(r.n));
      return m;
    };
    const v = sum(views);
    const l = sum([...demos, ...inquiries]);
    return Array.from({ length: days }, (_, i) => {
      const date = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
      return { date, views: v.get(date) ?? 0, leads: l.get(date) ?? 0 };
    });
  }
}
