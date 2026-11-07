import { Module } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { CORE_BANKING } from './application/core-banking.port.js';
import { MockCoreBankingAdapter } from './infrastructure/mock-core-banking.adapter.js';
import { T24CoreBankingAdapter } from './infrastructure/t24-core-banking.adapter.js';

/**
 * Reference implementation of the external-integration adapter pattern.
 * Features import this module and inject CORE_BANKING.
 */
@Module({
  providers: [
    MockCoreBankingAdapter,
    T24CoreBankingAdapter,
    {
      provide: CORE_BANKING,
      inject: [APP_CONFIG, MockCoreBankingAdapter, T24CoreBankingAdapter],
      useFactory: (config: AppConfig, mock: MockCoreBankingAdapter, t24: T24CoreBankingAdapter) =>
        config.integrations.coreBanking.adapter === 't24' ? t24 : mock,
    },
  ],
  exports: [CORE_BANKING],
})
export class CoreBankingModule {}
