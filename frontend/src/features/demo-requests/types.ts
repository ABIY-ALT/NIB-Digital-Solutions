import type { ApiSchemas } from '@/shared/api';

/** Demo request as returned by the API (shared contract, generated from the backend). */
export type DemoRequest = ApiSchemas['DemoRequest'];

/** Create / update body (dates as ISO strings). */
export interface DemoRequestInput {
  reference?: string;
  fullName?: string;
  organization?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  productSlug?: string;
  demoType?: string;
  preferredDate?: string | null;
  preferredTime?: string | null;
  requirements?: string | null;
  source?: string | null;
  status?: string;
  assignedTo?: string | null;
  followUpDate?: string | null;
  version?: number;
}
