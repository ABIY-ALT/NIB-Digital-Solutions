import type { ApiSchemas } from '@/shared/api';

/** Product category as returned by the API (shared contract, generated from the backend). */
export type ProductCategory = ApiSchemas['ProductCategory'];

/** Create / update body (dates as ISO strings). */
export interface ProductCategoryInput {
  code?: string;
  name?: string;
  description?: string | null;
  icon?: string | null;
  sortOrder?: number | null;
  version?: number;
}
