import type { ApiSchemas } from '@/shared/api';

/** Product review as returned by the API (shared contract, generated from the backend). */
export type ProductReview = ApiSchemas['ProductReview'];

/** Create / update body (dates as ISO strings). */
export interface ProductReviewInput {
  reference?: string;
  productSlug?: string;
  rating?: number;
  title?: string | null;
  body?: string | null;
  reviewerName?: string | null;
  reviewerRole?: string | null;
  reviewerEmail?: string | null;
  status?: string;
  reply?: string | null;
  version?: number;
}
