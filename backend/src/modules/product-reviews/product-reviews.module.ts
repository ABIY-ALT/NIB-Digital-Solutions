import { Module } from '@nestjs/common';
import { DigitalProductsModule } from '#modules/digital-products/digital-products.module.js';
import { ProductReviewApprovalHandlers } from './application/product-review-approval.handlers.js';
import {
  CreateProductReviewUseCase,
  DeleteProductReviewUseCase,
  GetProductReviewUseCase,
  ListProductReviewsUseCase,
  ProductRatingsService,
  PublicProductReviewsUseCase,
  SubmitProductReviewUseCase,
  UpdateProductReviewUseCase,
} from './application/product-review.use-cases.js';
import { PRODUCT_REVIEW_REPOSITORY } from './domain/product-review.repository.js';
import { PrismaProductReviewRepository } from './infrastructure/prisma-product-review.repository.js';
import {
  ProductReviewsController,
  PublicProductReviewsController,
} from './presentation/product-reviews.controller.js';

/**
 * Customer ratings and reviews of digital products. Visitors rate on the
 * website (moderated); staff approve, reject and reply in the portal. The
 * marketplace catalog shows each product's rating through ProductRatingsService.
 */
@Module({
  imports: [DigitalProductsModule],
  controllers: [ProductReviewsController, PublicProductReviewsController],
  providers: [
    { provide: PRODUCT_REVIEW_REPOSITORY, useClass: PrismaProductReviewRepository },
    ListProductReviewsUseCase,
    GetProductReviewUseCase,
    CreateProductReviewUseCase,
    UpdateProductReviewUseCase,
    DeleteProductReviewUseCase,
    SubmitProductReviewUseCase,
    PublicProductReviewsUseCase,
    ProductRatingsService,
    ProductReviewApprovalHandlers,
  ],
  exports: [ProductRatingsService],
})
export class ProductReviewsModule {}
