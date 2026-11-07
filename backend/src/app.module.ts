import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG, AppConfigModule } from '#config/config.module.js';
import { CoreModule } from '#core/core.module.js';
import { MailModule } from '#core/infrastructure/mail/mail.module.js';
import { KeyValueThrottlerStorage } from '#core/infrastructure/rate-limit/kv-throttler.storage.js';
import { isAuthRateLimited } from '#core/presentation/decorators/rate-limit.decorators.js';
import { GlobalExceptionFilter } from '#core/presentation/filters/global-exception.filter.js';
import { AppThrottlerGuard } from '#core/presentation/guards/app-throttler.guard.js';
import { AuditInterceptor } from '#core/presentation/interceptors/audit.interceptor.js';
import { HttpMetricsInterceptor } from '#core/presentation/interceptors/http-metrics.interceptor.js';
import { IdempotencyInterceptor } from '#core/presentation/interceptors/idempotency.interceptor.js';
import { ResponseEnvelopeInterceptor } from '#core/presentation/interceptors/response-envelope.interceptor.js';
import { CorrelationIdMiddleware } from '#core/presentation/middleware/correlation-id.middleware.js';
import { PayloadDecryptionMiddleware } from '#core/presentation/middleware/payload-decryption.middleware.js';
import { ServiceAuthMiddleware } from '#core/presentation/middleware/service-auth.middleware.js';
import { ApprovalsModule } from '#modules/approvals/approvals.module.js';
import { AuditModule } from '#modules/audit/audit.module.js';
import { AuthModule } from '#modules/auth/auth.module.js';
import { JwtAuthGuard } from '#modules/auth/presentation/jwt-auth.guard.js';
import { SessionModule } from '#modules/auth/session.module.js';
import { AuthorizationModule } from '#modules/authorization/authorization.module.js';
import { ComplianceModule } from '#modules/compliance/compliance.module.js';
import { PermissionsGuard } from '#modules/authorization/presentation/permissions.guard.js';
import { HealthModule } from '#modules/health/health.module.js';
import { CoreBankingModule } from '#modules/integrations/core-banking/core-banking.module.js';
import { NotificationsModule } from '#modules/notifications/notifications.module.js';
import { OptionsModule } from '#modules/options/options.module.js';
import { ReferenceDataModule } from '#modules/reference-data/reference-data.module.js';
import { RolesModule } from '#modules/roles/roles.module.js';
import { SettingsModule } from '#modules/settings/settings.module.js';
import { DocumentsModule } from '#modules/documents/documents.module.js';
import { UsersModule } from '#modules/users/users.module.js';

import { DigitalProductsModule } from './modules/digital-products/digital-products.module.js';
import { ProductCategoriesModule } from './modules/product-categories/product-categories.module.js';
import { DemoRequestsModule } from './modules/demo-requests/demo-requests.module.js';
import { ProductInquiriesModule } from './modules/product-inquiries/product-inquiries.module.js';
import { MarketplaceModule } from './modules/marketplace/marketplace.module.js';
import { HeroSlidesModule } from './modules/hero-slides/hero-slides.module.js';
import { ProductIdeasModule } from './modules/product-ideas/product-ideas.module.js';
import { ProductDevelopersModule } from './modules/product-developers/product-developers.module.js';
import { ProductQuestionsModule } from './modules/product-questions/product-questions.module.js';
import { ProductReviewsModule } from './modules/product-reviews/product-reviews.module.js';
/**
 * Request pipeline (in order):
 *   middleware   CorrelationId → ServiceAuth (BFF HMAC) → PayloadDecryption
 *   guards       RateLimit → JwtAuth → Permissions (RBAC/ABAC, default-deny)
 *   interceptors Metrics → ResponseEnvelope (+encryption) → Audit → Idempotency
 *   pipes        Zod validation on body / params / query
 *   filter       GlobalExceptionFilter (standard error envelope, +encryption)
 */
@Module({
  imports: [
    AppConfigModule,
    CoreModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG, KeyValueThrottlerStorage],
      useFactory: (config: AppConfig, storage: KeyValueThrottlerStorage) => ({
        storage,
        throttlers: [
          {
            name: 'default',
            ttl: config.security.rateLimit.ttlSeconds * 1000,
            limit: config.security.rateLimit.max,
          },
          {
            name: 'auth',
            ttl: config.security.authRateLimit.ttlSeconds * 1000,
            limit: config.security.authRateLimit.max,
            blockDuration: config.security.authRateLimit.ttlSeconds * 1000,
            skipIf: (context) => !isAuthRateLimited(context),
          },
        ],
      }),
    }),
    SettingsModule,
    MailModule,
    AuditModule,
    AuthorizationModule,
    SessionModule,
    NotificationsModule,
    ApprovalsModule,
    UsersModule,
    RolesModule,
    AuthModule,
    ReferenceDataModule,
    OptionsModule,
    ComplianceModule,
    DocumentsModule,
    CoreBankingModule,
    HealthModule,
    DigitalProductsModule,
    ProductCategoriesModule,
    DemoRequestsModule,
    ProductInquiriesModule,
    MarketplaceModule,
    HeroSlidesModule,
    ProductIdeasModule,
    ProductDevelopersModule,
    ProductQuestionsModule,
    ProductReviewsModule,
    // appcore:modules (feature generator inserts new modules above this line)
  ],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationIdMiddleware, ServiceAuthMiddleware, PayloadDecryptionMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
