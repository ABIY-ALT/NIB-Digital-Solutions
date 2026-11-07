import { Module } from '@nestjs/common';
import { DemoRequestsModule } from '../demo-requests/demo-requests.module.js';
import { DigitalProductsModule } from '../digital-products/digital-products.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProductCategoriesModule } from '../product-categories/product-categories.module.js';
import { ProductInquiriesModule } from '../product-inquiries/product-inquiries.module.js';
import { ProductReviewsModule } from '../product-reviews/product-reviews.module.js';
import { ReferenceDataModule } from '../reference-data/reference-data.module.js';
import { UsersModule } from '../users/users.module.js';
import { MarketplaceAnalyticsService } from './application/analytics.service.js';
import { MarketplaceAssistantService } from './application/assistant.service.js';
import { CatalogService } from './application/catalog.service.js';
import { LeadConfirmationSubscriber } from './application/lead-confirmation.js';
import { LeadAssigneeOptionSource } from './application/lead-assignee-option.source.js';
import { LeadNotificationsSubscriber } from './application/lead-notifications.subscriber.js';
import { MARKETPLACE_INSIGHTS, MEDIA_STORE, SEND_QUOTA } from './application/marketplace.ports.js';
import { MarketplaceMediaService } from './application/media.service.js';
import { PrismaMarketplaceInsights } from './infrastructure/prisma-marketplace-insights.js';
import { KvSendQuota } from './infrastructure/kv-send-quota.js';
import { PrismaMediaStore } from './infrastructure/prisma-media.store.js';
import {
  MarketplaceAdminController,
  MarketplaceController,
} from './presentation/marketplace.controller.js';

/**
 * NIB Digital Solutions marketplace: the public catalog, website submissions
 * (demo requests, inquiries), engagement analytics, product media and the
 * grounded product assistant. Staff manage the catalog and leads through the
 * generated digital-products, product-categories, demo-requests and
 * product-inquiries modules.
 */
@Module({
  imports: [
    DigitalProductsModule,
    ProductCategoriesModule,
    DemoRequestsModule,
    ProductInquiriesModule,
    ProductReviewsModule,
    NotificationsModule,
    UsersModule,
    ReferenceDataModule,
  ],
  controllers: [MarketplaceController, MarketplaceAdminController],
  providers: [
    { provide: MARKETPLACE_INSIGHTS, useClass: PrismaMarketplaceInsights },
    { provide: MEDIA_STORE, useClass: PrismaMediaStore },
    { provide: SEND_QUOTA, useClass: KvSendQuota },
    CatalogService,
    MarketplaceAnalyticsService,
    MarketplaceAssistantService,
    MarketplaceMediaService,
    LeadNotificationsSubscriber,
    LeadAssigneeOptionSource,
    LeadConfirmationSubscriber,
  ],
})
export class MarketplaceModule {}
