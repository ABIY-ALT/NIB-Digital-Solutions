import type { ApiSchemas } from '@/shared/api';

/** Product review as returned by the API (shared contract, generated from the backend). */
export type ProductReview = ApiSchemas['ProductReview'];

/** Create / update body (dates as ISO strings). */
export interface ProductReviewInput {
  reference?: string;
  productSlug?: string;
  rating?: number;
  title?: string | null;
  body?: string;
  reviewerName?: string;
  reviewerRole?: string | null;
  reviewerEmail?: string;
  status?: string;
  reply?: string | null;
  version?: number;
}
