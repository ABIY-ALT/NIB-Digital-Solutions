import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import {
  CACHE_PORT,
  cacheKey,
  type CachePolicy,
  type CachePort,
} from '#core/application/ports/cache.port.js';
import type { ExternalApiClient } from '#core/application/ports/external-api.port.js';
import { ExternalApiClientFactory } from '#core/infrastructure/external-api/external-api.factory.js';
import type {
  AccountBalance,
  CoreBankingCustomer,
  CoreBankingPort,
} from '../application/core-banking.port.js';

/** Last-known balances used as a fallback when T24 is down. */
const BALANCE_FALLBACK: CachePolicy = { namespace: 'core-banking:balance', ttlSeconds: 15 * 60 };

interface T24CustomerResponse {
  customerId: string;
  name: string;
  sector?: string;
  companyCode?: string;
}

interface T24BalanceResponse {
  accountId: string;
  currency: string;
  workingBalance: string;
  onlineActualBalance: string;
}

/**
 * T24 adapter. All calls go through the centralized ExternalApiClient, which
 * provides timeouts, retries, a circuit breaker and correlation propagation.
 * Field names below are placeholders for the bank's T24 API contract.
 */
@Injectable()
export class T24CoreBankingAdapter implements CoreBankingPort {
  private readonly client: ExternalApiClient;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    factory: ExternalApiClientFactory,
    @Inject(CACHE_PORT) private readonly cache: CachePort,
  ) {
    const cb = config.integrations.coreBanking;
    this.client = factory.create({
      name: 't24',
      baseUrl: cb.baseUrl ?? 'http://localhost',
      timeoutMs: cb.timeoutMs,
      defaultHeaders: cb.apiKey ? { 'x-api-key': cb.apiKey } : undefined,
      retry: { maxAttempts: 3 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
    });
  }

  async getCustomer(customerId: string): Promise<CoreBankingCustomer | null> {
    const res = await this.client.request<T24CustomerResponse | null>({
      method: 'GET',
      path: `customers/${encodeURIComponent(customerId)}`,
    });
    if (!res.data) return null;
    return {
      customerId: res.data.customerId,
      fullName: res.data.name,
      segment: res.data.sector ?? null,
      branchCode: res.data.companyCode ?? null,
    };
  }

  getAccountBalance(accountNumber: string): Promise<AccountBalance> {
    const key = cacheKey(BALANCE_FALLBACK, accountNumber);
    return this.client.withFallback(
      async () => {
        const res = await this.client.request<T24BalanceResponse>({
          method: 'GET',
          path: `accounts/${encodeURIComponent(accountNumber)}/balance`,
        });
        const balance: AccountBalance = {
          accountNumber: res.data.accountId,
          currency: res.data.currency,
          availableBalance: res.data.workingBalance,
          ledgerBalance: res.data.onlineActualBalance,
          asOf: new Date().toISOString(),
          stale: false,
        };
        await this.cache.set(key, balance, BALANCE_FALLBACK.ttlSeconds);
        return balance;
      },
      async (error) => {
        const cached = await this.cache.get<AccountBalance>(key);
        if (cached) return { ...cached, stale: true };
        throw error;
      },
    );
  }
}
