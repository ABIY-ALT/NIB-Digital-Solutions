-- NIB Digital Solutions marketplace: catalog, categories, demo requests, inquiries,
-- engagement events and product media. Additive only (no existing table changes).

-- CreateTable
CREATE TABLE "digital_products" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" VARCHAR(64),
    "updated_by" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" VARCHAR(64),
    "slug" VARCHAR(160) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "tagline" VARCHAR(160),
    "summary" VARCHAR(2000) NOT NULL,
    "overview" VARCHAR(2000),
    "problem" VARCHAR(2000),
    "category_code" VARCHAR(160) NOT NULL,
    "status" VARCHAR(160) NOT NULL,
    "availability" VARCHAR(160) NOT NULL,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "customizable" BOOLEAN NOT NULL DEFAULT false,
    "icon" VARCHAR(160),
    "accent" VARCHAR(160),
    "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "needs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deployment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "key_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "content" JSONB NOT NULL DEFAULT '{}',
    "documentation" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "digital_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" VARCHAR(64),
    "updated_by" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" VARCHAR(64),
    "code" VARCHAR(160) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "icon" VARCHAR(160),
    "sort_order" INTEGER,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_requests" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" VARCHAR(64),
    "updated_by" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" VARCHAR(64),
    "reference" VARCHAR(160) NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "organization" VARCHAR(160) NOT NULL,
    "job_title" VARCHAR(160) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(160) NOT NULL,
    "product_slug" VARCHAR(160) NOT NULL,
    "demo_type" VARCHAR(160) NOT NULL,
    "preferred_date" TIMESTAMPTZ(3),
    "preferred_time" VARCHAR(160),
    "requirements" VARCHAR(2000),
    "source" VARCHAR(160),
    "status" VARCHAR(160) NOT NULL,
    "assigned_to" VARCHAR(160),
    "follow_up_date" TIMESTAMPTZ(3),
    "notes" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "demo_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_inquiries" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" VARCHAR(64),
    "updated_by" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" VARCHAR(64),
    "reference" VARCHAR(160) NOT NULL,
    "customer_name" VARCHAR(160) NOT NULL,
    "company" VARCHAR(160),
    "email" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(160),
    "product_slug" VARCHAR(160),
    "inquiry_type" VARCHAR(160) NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "requirements" VARCHAR(2000),
    "contact_method" VARCHAR(160) NOT NULL,
    "source" VARCHAR(160),
    "status" VARCHAR(160) NOT NULL,
    "assigned_to" VARCHAR(160),
    "responded_at" TIMESTAMPTZ(3),
    "notes" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "product_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_events" (
    "id" BIGSERIAL NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "product_slug" VARCHAR(160),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_media" (
    "id" UUID NOT NULL,
    "content_type" VARCHAR(40) NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64),

    CONSTRAINT "marketplace_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "digital_products_slug_key" ON "digital_products"("slug");

-- CreateIndex
CREATE INDEX "digital_products_deleted_at_idx" ON "digital_products"("deleted_at");

-- CreateIndex
CREATE INDEX "digital_products_status_idx" ON "digital_products"("status");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_code_key" ON "product_categories"("code");

-- CreateIndex
CREATE INDEX "product_categories_deleted_at_idx" ON "product_categories"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "demo_requests_reference_key" ON "demo_requests"("reference");

-- CreateIndex
CREATE INDEX "demo_requests_deleted_at_idx" ON "demo_requests"("deleted_at");

-- CreateIndex
CREATE INDEX "demo_requests_created_at_idx" ON "demo_requests"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_inquiries_reference_key" ON "product_inquiries"("reference");

-- CreateIndex
CREATE INDEX "product_inquiries_deleted_at_idx" ON "product_inquiries"("deleted_at");

-- CreateIndex
CREATE INDEX "product_inquiries_created_at_idx" ON "product_inquiries"("created_at");

-- CreateIndex
CREATE INDEX "marketplace_events_occurred_at_type_idx" ON "marketplace_events"("occurred_at", "type");

-- CreateIndex
CREATE INDEX "marketplace_media_checksum_idx" ON "marketplace_media"("checksum");
