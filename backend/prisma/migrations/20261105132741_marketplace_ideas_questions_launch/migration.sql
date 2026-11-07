-- AlterTable
ALTER TABLE "digital_products" ADD COLUMN     "backup_developer_id" UUID,
ADD COLUMN     "developer_id" UUID,
ADD COLUMN     "release_date" DATE,
ADD COLUMN     "support_status" VARCHAR(20) NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE "product_ideas" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" VARCHAR(64),
    "updated_by" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" VARCHAR(64),
    "reference" VARCHAR(160) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "problem" VARCHAR(2000) NOT NULL,
    "category_code" VARCHAR(160),
    "submitter_name" VARCHAR(160),
    "submitter_email" VARCHAR(160) NOT NULL,
    "status" VARCHAR(160) NOT NULL,
    "vote_count" INTEGER DEFAULT 0,
    "admin_note" VARCHAR(2000),
    "title_key" VARCHAR(160) NOT NULL DEFAULT '',
    "ip_hash" VARCHAR(64),

    CONSTRAINT "product_ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_idea_votes" (
    "id" BIGSERIAL NOT NULL,
    "idea_id" UUID NOT NULL,
    "voter_hash" VARCHAR(64) NOT NULL,
    "ip_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_idea_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_developers" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" VARCHAR(64),
    "updated_by" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" VARCHAR(64),
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "telegram_chat_id" VARCHAR(160),
    "telegram_username" VARCHAR(160),
    "active" BOOLEAN NOT NULL DEFAULT false,
    "telegram_link_code_hash" VARCHAR(64),
    "telegram_link_expires_at" TIMESTAMPTZ(3),
    "telegram_linked_at" TIMESTAMPTZ(3),

    CONSTRAINT "product_developers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_questions" (
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
    "customer_name" VARCHAR(160) NOT NULL,
    "customer_email" VARCHAR(160) NOT NULL,
    "question" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(160) NOT NULL,
    "developer_id" UUID,
    "last_message_at" TIMESTAMPTZ(3),
    "access_token_hash" VARCHAR(64) NOT NULL DEFAULT '',
    "ip_hash" VARCHAR(64),

    CONSTRAINT "product_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_question_messages" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "author" VARCHAR(20) NOT NULL,
    "author_name" VARCHAR(160) NOT NULL,
    "developer_id" UUID,
    "channel" VARCHAR(20) NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_question_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_messages" (
    "id" UUID NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "dedupe_key" VARCHAR(200) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" VARCHAR(1000),
    "resource_type" VARCHAR(60),
    "resource_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),

    CONSTRAINT "outbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_ideas_reference_key" ON "product_ideas"("reference");

-- CreateIndex
CREATE INDEX "product_ideas_deleted_at_idx" ON "product_ideas"("deleted_at");

-- CreateIndex
CREATE INDEX "product_ideas_status_vote_count_idx" ON "product_ideas"("status", "vote_count");

-- CreateIndex
CREATE INDEX "product_ideas_title_key_idx" ON "product_ideas"("title_key");

-- CreateIndex
CREATE INDEX "product_idea_votes_idea_id_ip_hash_created_at_idx" ON "product_idea_votes"("idea_id", "ip_hash", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_idea_votes_idea_id_voter_hash_key" ON "product_idea_votes"("idea_id", "voter_hash");

-- CreateIndex
CREATE UNIQUE INDEX "product_developers_telegram_chat_id_key" ON "product_developers"("telegram_chat_id");

-- CreateIndex
CREATE INDEX "product_developers_deleted_at_idx" ON "product_developers"("deleted_at");

-- CreateIndex
CREATE INDEX "product_developers_telegram_link_code_hash_idx" ON "product_developers"("telegram_link_code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "product_questions_reference_key" ON "product_questions"("reference");

-- CreateIndex
CREATE INDEX "product_questions_deleted_at_idx" ON "product_questions"("deleted_at");

-- CreateIndex
CREATE INDEX "product_questions_status_last_message_at_idx" ON "product_questions"("status", "last_message_at");

-- CreateIndex
CREATE INDEX "product_questions_customer_email_idx" ON "product_questions"("customer_email");

-- CreateIndex
CREATE INDEX "product_question_messages_question_id_created_at_idx" ON "product_question_messages"("question_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_messages_dedupe_key_key" ON "outbound_messages"("dedupe_key");

-- CreateIndex
CREATE INDEX "outbound_messages_status_next_attempt_at_idx" ON "outbound_messages"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "outbound_messages_resource_type_resource_id_idx" ON "outbound_messages"("resource_type", "resource_id");

-- AddForeignKey
ALTER TABLE "product_idea_votes" ADD CONSTRAINT "product_idea_votes_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "product_ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_question_messages" ADD CONSTRAINT "product_question_messages_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "product_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
