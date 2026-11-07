import { Controller, Get, Inject, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  type HealthCheckResult,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { ExternalApiClientFactory } from '#core/infrastructure/external-api/external-api.factory.js';
import { KEY_VALUE_STORE, type KeyValueStore } from '#core/infrastructure/kv/key-value-store.js';
import { PrismaService } from '#core/infrastructure/prisma/prisma.service.js';
import { Public, RawResponse } from '#core/presentation/decorators/metadata.decorators.js';

/**
 * Kubernetes-style probes (exempt from service auth, rate limiting and envelope):
 *   GET /health/live   → process is up
 *   GET /health/ready  → database + key/value store reachable
 */
@ApiTags('Health')
@Public()
@RawResponse()
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @Inject(KEY_VALUE_STORE) private readonly kv: KeyValueStore,
    private readonly externalClients: ExternalApiClientFactory,
  ) {}

  @Get('live')
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe' })
  live(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.indicators.check('process').up({ uptimeSeconds: Math.round(process.uptime()) }),
    ]);
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe (database, key/value store, circuit breakers)' })
  ready(): Promise<HealthCheckResult> {
    return this.health.check([
      async () => {
        const session = this.indicators.check('database');
        return (await this.prisma.ping()) ? session.up() : session.down('Database unreachable');
      },
      async () => {
        const session = this.indicators.check('kvStore');
        return (await this.kv.ping())
          ? session.up({ driver: this.kv.driver })
          : session.down('Key/value store unreachable');
      },
      () => {
        const states = this.externalClients.circuitStates();
        const open = Object.entries(states)
          .filter(([, s]) => s === 'OPEN')
          .map(([n]) => n);
        const session = this.indicators.check('integrations');
        return open.length
          ? session.degraded({ openCircuits: open })
          : session.up({ circuits: states });
      },
    ]);
  }
}
