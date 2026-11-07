import type { Repository } from '#core/domain/repository.js';
import type { DigitalProduct } from './digital-product.entity.js';

export interface DigitalProductRepository extends Repository<DigitalProduct> {
  /** Unique fields (deleted records included: values are never reused). */
  findByUnique(field: 'slug', value: string | number): Promise<DigitalProduct | null>;
  /** Published, non-deleted products for the public catalog. */
  findPublished(): Promise<DigitalProduct[]>;
  /** A published, non-deleted product by its slug. */
  findPublishedBySlug(slug: string): Promise<DigitalProduct | null>;
}

export const DIGITAL_PRODUCT_REPOSITORY = Symbol('DigitalProductRepository');
