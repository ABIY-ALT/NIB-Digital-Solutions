import type { LeadStatus, MarketplaceEventType } from '../domain/marketplace.constants.js';

/** Ports of the marketplace application layer (implemented in infrastructure/). */

export interface RankedProduct {
  slug: string;
  count: number;
}

/** Reporting periods offered by the analytics screen (days). */
export const ANALYTICS_PERIODS = [7, 30, 90, 365] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export interface MarketplaceAnalytics {
  /** Length of the reporting period in days (counts, rankings and the daily series). */
  days: number;
  totalProducts: number;
  publishedProducts: number;
  productViews: number;
  demoPlays: number;
  assistantQueries: number;
  demoRequests: number;
  inquiries: number;
  daily: { date: string; views: number; leads: number }[];
  topViewed: RankedProduct[];
  topWatched: RankedProduct[];
  topRequested: RankedProduct[];
  /** All open leads by status (current pipeline, not limited to the period). */
  leadsByStatus: Record<LeadStatus, number>;
  /** New leads in the period by where on the website they started ("unknown" when not recorded). */
  leadsBySource: { source: string; count: number }[];
  /** New leads in the period by the industries of the product they are about. */
  leadsByIndustry: { industry: string; count: number }[];
  /** Open leads (not won or lost) per owner; `ownerId` null = unassigned. */
  openByOwner: { ownerId: string | null; count: number }[];
}

/** Engagement events and the analytics read model. */
export interface MarketplaceInsights {
  record(type: MarketplaceEventType, productSlug: string | null): Promise<void>;
  summary(days: number): Promise<MarketplaceAnalytics>;
}
export const MARKETPLACE_INSIGHTS = Symbol('MarketplaceInsights');

export interface MediaRecord {
  id: string;
  contentType: string;
  size: number;
  checksum: string;
  data: Uint8Array;
}

/** Binary storage for uploaded product images. */
export interface MediaStore {
  findByChecksum(checksum: string, size: number): Promise<{ id: string } | null>;
  create(media: Omit<MediaRecord, 'id'>, actorId: string): Promise<{ id: string }>;
  get(id: string): Promise<MediaRecord | null>;
}
export const MEDIA_STORE = Symbol('MediaStore');

/** Counts sends per key in a time window (e.g. confirmation e-mails per address and day). */
export interface SendQuota {
  /** Records one send; false when `limit` sends were already recorded in the current window. */
  take(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}
export const SEND_QUOTA = Symbol('SendQuota');
