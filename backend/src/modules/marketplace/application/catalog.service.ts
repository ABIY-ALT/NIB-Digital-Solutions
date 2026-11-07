import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '#core/domain/errors/app-error.js';
import type { DigitalProduct } from '#modules/digital-products/domain/digital-product.entity.js';
import {
  DIGITAL_PRODUCT_REPOSITORY,
  type DigitalProductRepository,
} from '#modules/digital-products/domain/digital-product.repository.js';
import type { ProductCategory } from '#modules/product-categories/domain/product-category.entity.js';
import {
  PRODUCT_CATEGORY_REPOSITORY,
  type ProductCategoryRepository,
} from '#modules/product-categories/domain/product-category.repository.js';
import { ProductRatingsService } from '#modules/product-reviews/application/product-review.use-cases.js';
import type { ProductReview } from '#modules/product-reviews/domain/product-review.entity.js';
import type { RatingSummary } from '#modules/product-reviews/domain/product-review.repository.js';
import { ReferenceDataUseCases } from '#modules/reference-data/application/reference-data.use-cases.js';
import { loadTaxonomy, type Taxonomy } from './taxonomy.js';

/** Customer ratings (approved reviews), by product slug. */
export interface Ratings {
  summaries: Map<string, RatingSummary>;
  featured: Map<string, ProductReview>;
}

/** Read side of the public catalog: published products only, documentation never leaves here. */
@Injectable()
export class CatalogService {
  constructor(
    @Inject(DIGITAL_PRODUCT_REPOSITORY) private readonly products: DigitalProductRepository,
    @Inject(PRODUCT_CATEGORY_REPOSITORY) private readonly categories: ProductCategoryRepository,
    private readonly refdata: ReferenceDataUseCases,
    private readonly ratings: ProductRatingsService,
  ) {}

  /**
   * Published products, categories, the taxonomy (industries, needs) in the
   * reader's language and the customer ratings.
   */
  async catalog(
    locale?: string,
  ): Promise<
    { products: DigitalProduct[]; categories: ProductCategory[]; ratings: Ratings } & Taxonomy
  > {
    const [products, categories, taxonomy, ratings] = await Promise.all([
      this.products.findPublished(),
      this.categories.findAllOrdered(),
      loadTaxonomy(this.refdata, locale),
      this.ratings.all(),
    ]);
    return { products, categories, ratings, ...taxonomy };
  }

  async product(slug: string): Promise<DigitalProduct> {
    const product = await this.products.findPublishedBySlug(slug);
    if (!product) throw new NotFoundError('Product', slug);
    return product;
  }

  /** A published product with the customer ratings (for its public page). */
  async productWithRatings(slug: string): Promise<{ product: DigitalProduct; ratings: Ratings }> {
    const [product, ratings] = await Promise.all([this.product(slug), this.ratings.all()]);
    return { product, ratings };
  }

  /** Published product slugs (to validate submissions and analytics events). */
  async isPublished(slug: string): Promise<boolean> {
    return !!(await this.products.findPublishedBySlug(slug));
  }
}
