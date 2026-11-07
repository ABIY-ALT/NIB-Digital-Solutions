import { Injectable } from '@nestjs/common';
import type {
  AccountBalance,
  CoreBankingCustomer,
  CoreBankingPort,
} from '../application/core-banking.port.js';

/** Deterministic in-memory core banking for local development and tests. */
@Injectable()
export class MockCoreBankingAdapter implements CoreBankingPort {
  getCustomer(customerId: string): Promise<CoreBankingCustomer | null> {
    return Promise.resolve({
      customerId,
      fullName: 'Demo Customer',
      segment: 'RETAIL',
      branchCode: 'ADD01',
    });
  }

  getAccountBalance(accountNumber: string): Promise<AccountBalance> {
    return Promise.resolve({
      accountNumber,
      currency: 'ETB',
      availableBalance: '125000.00',
      ledgerBalance: '125500.00',
      asOf: new Date().toISOString(),
      stale: false,
    });
  }
}
