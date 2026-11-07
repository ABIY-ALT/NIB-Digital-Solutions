import type { Repository } from '#core/domain/repository.js';
import type { ProductInquiry } from './product-inquiry.entity.js';

export interface ProductInquiryRepository extends Repository<ProductInquiry> {
  /** Unique fields (deleted records included: values are never reused). */
  findByUnique(field: 'reference', value: string | number): Promise<ProductInquiry | null>;
}

export const PRODUCT_INQUIRY_REPOSITORY = Symbol('ProductInquiryRepository');
