import type { ApiSchemas } from '@/shared/api';

/** Product inquiry as returned by the API (shared contract, generated from the backend). */
export type ProductInquiry = ApiSchemas['ProductInquiry'];

/** Create / update body (dates as ISO strings). */
export interface ProductInquiryInput {
  reference?: string;
  customerName?: string;
  company?: string | null;
  email?: string;
  phone?: string | null;
  productSlug?: string | null;
  inquiryType?: string;
  message?: string;
  requirements?: string | null;
  contactMethod?: string;
  source?: string | null;
  status?: string;
  assignedTo?: string | null;
  respondedAt?: string | null;
  version?: number;
}
