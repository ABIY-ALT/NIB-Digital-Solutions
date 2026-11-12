-- A website review may be just a star rating: the written review, the reviewer's
-- name and e-mail become optional.
-- AlterTable
ALTER TABLE "product_reviews" ALTER COLUMN "body" DROP NOT NULL,
ALTER COLUMN "reviewer_name" DROP NOT NULL,
ALTER COLUMN "reviewer_email" DROP NOT NULL;

