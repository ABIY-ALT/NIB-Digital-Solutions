import type { ApiSchemas } from '@/shared/api';

/** Digital product as returned by the API (shared contract, generated from the backend). */
export type DigitalProduct = ApiSchemas['DigitalProduct'];

/** Create / update body (dates as ISO strings). */
export interface DigitalProductInput {
  slug?: string;
  name?: string;
  tagline?: string | null;
  summary?: string;
  overview?: string | null;
  problem?: string | null;
  categoryCode?: string;
  status?: string;
  availability?: string;
  featured?: boolean;
  customizable?: boolean;
  icon?: string | null;
  accent?: string | null;
  industries?: DigitalProduct['industries'];
  needs?: DigitalProduct['needs'];
  deployment?: DigitalProduct['deployment'];
  platforms?: DigitalProduct['platforms'];
  keyFeatures?: string[];
  content?: DigitalProduct['content'];
  documentation?: DigitalProduct['documentation'];
  version?: number;
}
