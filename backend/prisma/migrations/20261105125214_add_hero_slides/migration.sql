-- CreateTable
CREATE TABLE "hero_slides" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" VARCHAR(64),
    "updated_by" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" VARCHAR(64),
    "title" VARCHAR(160),
    "description" VARCHAR(2000),
    "cta_label" VARCHAR(160),
    "cta_href" VARCHAR(160),
    "desktop_image_id" UUID NOT NULL,
    "mobile_image_id" UUID,
    "alt_text" VARCHAR(160),
    "sort_order" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "hero_slides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hero_slides_deleted_at_idx" ON "hero_slides"("deleted_at");

-- CreateIndex
CREATE INDEX "hero_slides_active_sort_order_idx" ON "hero_slides"("active", "sort_order");
