-- A product can have up to three developers who receive its customer questions.
ALTER TABLE "digital_products" ADD COLUMN "third_developer_id" UUID;
