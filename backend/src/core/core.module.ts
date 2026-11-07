import { Global, Module } from '@nestjs/common';
import { CACHE_PORT } from '#core/application/ports/cache.port.js';
import { EVENT_BUS } from '#core/application/ports/event-bus.port.js';
import { JOB_SCHEDULER } from '#core/application/ports/job-scheduler.port.js';
import { ARCHIVE_STORAGE, RETENTION_REGISTRY } from '#core/application/ports/retention.port.js';
import { IDEMPOTENCY_STORE } from '#core/application/ports/idempotency.port.js';
import { OPTION_SOURCES } from '#core/application/ports/option-source.port.js';
import { PASSWORD_HASHER } from '#core/application/ports/password-hasher.port.js';
import { REQUEST_CONTEXT } from '#core/application/ports/request-context.port.js';
import { KeyValueCacheAdapter } from '#core/infrastructure/cache/kv-cache.adapter.js';
import { AlsRequestContextAccessor } from '#core/infrastructure/context/request-context.js';
import { PayloadCryptoService } from '#core/infrastructure/crypto/payload-crypto.service.js';
import { ExternalApiClientFactory } from '#core/infrastructure/external-api/external-api.factory.js';
import { InProcessEventBus } from '#core/infrastructure/events/in-process-event-bus.js';
import { KeyValueIdempotencyStore } from '#core/infrastructure/idempotency/kv-idempotency.store.js';
import { KeyValueModule } from '#core/infrastructure/kv/kv.module.js';
import { LoggingModule } from '#core/infrastructure/logging/logging.module.js';
import { InMemoryOptionSourceRegistry } from '#core/infrastructure/options/option-source-registry.js';
import { PrismaModule } from '#core/infrastructure/prisma/prisma.module.js';
import { KeyValueThrottlerStorage } from '#core/infrastructure/rate-limit/kv-throttler.storage.js';
import { FileSystemArchiveStorage } from '#core/infrastructure/retention/file-system-archive.storage.js';
import { InMemoryRetentionRegistry } from '#core/infrastructure/retention/retention-registry.js';
import { KeyValueJobScheduler } from '#core/infrastructure/scheduling/kv-job-scheduler.js';
import { Argon2PasswordHasher } from '#core/infrastructure/security/argon2-password.hasher.js';
import { LoggingMetrics, METRICS } from '#core/infrastructure/telemetry/metrics.js';

/**
 * Framework core: cross-cutting infrastructure every feature can inject through
 * its port token (cache, transactions, idempotency, request context, external
 * API client factory, payload crypto, metrics, application events, jobs,
 * retention policies, record-picker option sources).
 */
@Global()
@Module({
  imports: [LoggingModule, KeyValueModule, PrismaModule],
  providers: [
    { provide: REQUEST_CONTEXT, useClass: AlsRequestContextAccessor },
    { provide: CACHE_PORT, useClass: KeyValueCacheAdapter },
    { provide: IDEMPOTENCY_STORE, useClass: KeyValueIdempotencyStore },
    { provide: METRICS, useClass: LoggingMetrics },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: EVENT_BUS, useClass: InProcessEventBus },
    { provide: JOB_SCHEDULER, useClass: KeyValueJobScheduler },
    { provide: RETENTION_REGISTRY, useClass: InMemoryRetentionRegistry },
    { provide: ARCHIVE_STORAGE, useClass: FileSystemArchiveStorage },
    { provide: OPTION_SOURCES, useClass: InMemoryOptionSourceRegistry },
    PayloadCryptoService,
    ExternalApiClientFactory,
    KeyValueThrottlerStorage,
  ],
  exports: [
    KeyValueModule,
    PrismaModule,
    REQUEST_CONTEXT,
    CACHE_PORT,
    IDEMPOTENCY_STORE,
    METRICS,
    PASSWORD_HASHER,
    EVENT_BUS,
    JOB_SCHEDULER,
    RETENTION_REGISTRY,
    ARCHIVE_STORAGE,
    OPTION_SOURCES,
    PayloadCryptoService,
    ExternalApiClientFactory,
    KeyValueThrottlerStorage,
  ],
})
export class CoreModule {}
