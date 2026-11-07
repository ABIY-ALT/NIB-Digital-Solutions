-- Runtime settings: one row per setting that differs from its default.
CREATE TABLE "settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" VARCHAR(64),

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);
