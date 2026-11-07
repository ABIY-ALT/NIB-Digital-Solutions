import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MarketplaceEventType } from '../domain/marketplace.constants.js';
import {
  MARKETPLACE_INSIGHTS,
  type AnalyticsPeriod,
  type MarketplaceAnalytics,
  type MarketplaceInsights,
} from './marketplace.ports.js';

export type { MarketplaceAnalytics } from './marketplace.ports.js';

/** Marketplace engagement events and the analytics dashboard (7, 30, 90 or 365 days). */
@Injectable()
export class MarketplaceAnalyticsService {
  private readonly logger = new Logger(MarketplaceAnalyticsService.name);

  constructor(@Inject(MARKETPLACE_INSIGHTS) private readonly insights: MarketplaceInsights) {}

  /** Never throws: analytics must not break a visitor's page. */
  async record(type: MarketplaceEventType, productSlug: string | null): Promise<void> {
    try {
      await this.insights.record(type, productSlug);
    } catch (error) {
      this.logger.warn(
        { err: error instanceof Error ? error.message : error, type },
        'Marketplace event not recorded',
      );
    }
  }

  summary(days: AnalyticsPeriod = 30): Promise<MarketplaceAnalytics> {
    return this.insights.summary(days);
  }
}
