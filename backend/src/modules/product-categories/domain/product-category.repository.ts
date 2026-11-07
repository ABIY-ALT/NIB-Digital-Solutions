import type { Repository } from '#core/domain/repository.js';
import type { ProductCategory } from './product-category.entity.js';

export interface ProductCategoryRepository extends Repository<ProductCategory> {
  /** Unique fields (deleted records included: values are never reused). */
  findByUnique(field: 'code', value: string | number): Promise<ProductCategory | null>;
  /** Every non-deleted category, in display order (public catalog). */
  findAllOrdered(): Promise<ProductCategory[]>;
}

export const PRODUCT_CATEGORY_REPOSITORY = Symbol('ProductCategoryRepository');
