-- CreateTable
CREATE TABLE "product_reviews" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" VARCHAR(64),
    "updated_by" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" VARCHAR(64),
    "reference" VARCHAR(160) NOT NULL,
    "product_slug" VARCHAR(160) NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(160),
    "body" VARCHAR(2000) NOT NULL,
    "reviewer_name" VARCHAR(160) NOT NULL,
    "reviewer_role" VARCHAR(160),
    "reviewer_email" VARCHAR(160) NOT NULL,
    "status" VARCHAR(160) NOT NULL,
    "reply" VARCHAR(2000),
    "ip_hash" VARCHAR(64),

    CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_reviews_reference_key" ON "product_reviews"("reference");

-- CreateIndex
CREATE INDEX "product_reviews_deleted_at_idx" ON "product_reviews"("deleted_at");

-- CreateIndex
CREATE INDEX "product_reviews_product_slug_status_idx" ON "product_reviews"("product_slug", "status");

-- CreateIndex
CREATE INDEX "product_reviews_status_created_at_idx" ON "product_reviews"("status", "created_at");
