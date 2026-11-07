/** A record found by the federated server search (GET /api/search). */
export interface QuickSearchRecord {
  id: string;
  source: 'users' | 'roles' | 'reference-data' | 'approvals' | 'audit';
  title: string;
  subtitle?: string;
  /** Status shown as a small tag (ACTIVE, PENDING, FAILURE…). */
  badge?: string;
  href: string;
}

export interface QuickSearchResponse {
  query: string;
  records: QuickSearchRecord[];
  /** Sources that timed out or failed (their results are missing). */
  failed: string[];
}
