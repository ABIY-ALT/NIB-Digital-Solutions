import type { ApiSchemas } from '@/shared/api';

/** Product idea as returned by the API (shared contract, generated from the backend). */
export type ProductIdea = ApiSchemas['ProductIdea'];

/** Create / update body (dates as ISO strings). */
export interface ProductIdeaInput {
  title?: string;
  problem?: string;
  categoryCode?: string | null;
  submitterName?: string | null;
  submitterEmail?: string;
  status?: string;
  adminNote?: string | null;
  version?: number;
}
