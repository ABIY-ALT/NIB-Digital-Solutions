/**
 * Business-facing contract for the core banking system (T24).
 *
 * Use cases depend on THIS interface only (principle 4 & 9). The infrastructure
 * layer provides adapters — T24 over the centralized ExternalApiClient, or a mock
 * for local development — selected by CORE_BANKING_ADAPTER.
 */
export interface CoreBankingCustomer {
  customerId: string;
  fullName: string;
  segment: string | null;
  branchCode: string | null;
}

export interface AccountBalance {
  accountNumber: string;
  currency: string;
  availableBalance: string; // decimal as string — never floats for money
  ledgerBalance: string;
  asOf: string;
  /** True when served from the fallback cache because T24 was unavailable. */
  stale: boolean;
}

export interface CoreBankingPort {
  getCustomer(customerId: string): Promise<CoreBankingCustomer | null>;
  getAccountBalance(accountNumber: string): Promise<AccountBalance>;
}

export const CORE_BANKING = Symbol('CoreBankingPort');
