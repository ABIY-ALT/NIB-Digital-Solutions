-- CreateEnum
CREATE TYPE "AuditCheckpointKind" AS ENUM ('ANCHOR', 'PURGE');

-- CreateEnum
CREATE TYPE "RetentionRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'CRITICAL');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "hash" CHAR(64),
ADD COLUMN     "prev_hash" CHAR(64),
ADD COLUMN     "seq" BIGSERIAL NOT NULL;

-- Existing audit records get chain positions in chronological order; the
-- application seals them into the hash chain on first start (AuditChainService).
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY occurred_at, id) AS rn FROM "audit_logs"
)
UPDATE "audit_logs" a SET "seq" = o.rn FROM ordered o WHERE a.id = o.id;
SELECT setval(
  pg_get_serial_sequence('"audit_logs"', 'seq'),
  COALESCE((SELECT max("seq") FROM "audit_logs"), 0) + 1,
  false
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_must_change" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "audit_checkpoints" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "AuditCheckpointKind" NOT NULL,
    "seq" BIGINT NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "from_seq" BIGINT,
    "record_count" INTEGER NOT NULL,
    "archive_ref" VARCHAR(512),
    "created_by" VARCHAR(64),

    CONSTRAINT "audit_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_runs" (
    "id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "trigger" VARCHAR(16) NOT NULL,
    "dry_run" BOOLEAN NOT NULL,
    "status" "RetentionRunStatus" NOT NULL DEFAULT 'RUNNING',
    "triggered_by" VARCHAR(64),
    "results" JSONB,
    "error" VARCHAR(1000),

    CONSTRAINT "retention_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "action" VARCHAR(96) NOT NULL,
    "resource_type" VARCHAR(64) NOT NULL,
    "resource_id" VARCHAR(128),
    "summary" VARCHAR(300) NOT NULL,
    "payload" JSONB NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "maker_id" VARCHAR(64) NOT NULL,
    "maker_name" VARCHAR(160) NOT NULL,
    "maker_comment" VARCHAR(1000),
    "checker_id" VARCHAR(64),
    "checker_name" VARCHAR(160),
    "checker_comment" VARCHAR(1000),
    "checker_permissions" TEXT[],
    "decided_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "result" JSONB,
    "error_code" VARCHAR(64),
    "correlation_id" VARCHAR(64),

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipient_id" UUID NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "template" VARCHAR(96) NOT NULL,
    "params" JSONB,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "link" VARCHAR(512),
    "sender_name" VARCHAR(160),
    "thread_key" VARCHAR(128),
    "read_at" TIMESTAMPTZ(3),
    "starred_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "in_app" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id","category")
);

-- CreateTable
CREATE TABLE "reference_data_types" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" VARCHAR(64),
    "updated_by" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" VARCHAR(64),
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB NOT NULL DEFAULT '[]',
    "parent_type_code" VARCHAR(64),

    CONSTRAINT "reference_data_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_data_items" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" VARCHAR(64),
    "updated_by" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" VARCHAR(64),
    "type_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "labels" JSONB NOT NULL DEFAULT '{}',
    "description" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMPTZ(3),
    "valid_to" TIMESTAMPTZ(3),
    "parent_code" VARCHAR(64),
    "attributes" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "reference_data_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_checkpoints_kind_seq_idx" ON "audit_checkpoints"("kind", "seq");

-- CreateIndex
CREATE INDEX "retention_runs_started_at_idx" ON "retention_runs"("started_at");

-- CreateIndex
CREATE INDEX "password_history_user_id_created_at_idx" ON "password_history"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "approval_requests_status_created_at_idx" ON "approval_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "approval_requests_maker_id_created_at_idx" ON "approval_requests"("maker_id", "created_at");

-- CreateIndex
CREATE INDEX "approval_requests_resource_type_resource_id_status_idx" ON "approval_requests"("resource_type", "resource_id", "status");

-- CreateIndex
CREATE INDEX "approval_requests_expires_at_idx" ON "approval_requests"("expires_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_deleted_at_archived_at_created_a_idx" ON "notifications"("recipient_id", "deleted_at", "archived_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_idx" ON "notifications"("recipient_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reference_data_types_code_key" ON "reference_data_types"("code");

-- CreateIndex
CREATE INDEX "reference_data_items_type_id_active_sort_order_idx" ON "reference_data_items"("type_id", "active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "reference_data_items_type_id_code_key" ON "reference_data_items"("type_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_seq_key" ON "audit_logs"("seq");

-- AddForeignKey
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_data_items" ADD CONSTRAINT "reference_data_items_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "reference_data_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tamper resistance for the audit trail (defence in depth next to the hash chain)
--   • UPDATE is allowed only to SEAL a row once (hash/prev_hash from NULL to a
--     value) without touching any other column.
--   • DELETE is allowed only inside a retention purge transaction that sets
--     `SET LOCAL appcore.audit_purge = 'on'` (AuditRetentionPolicy).
-- A database owner can still drop the trigger — the HMAC chain detects that.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION appcore_audit_logs_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('appcore.audit_purge', true) = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'audit_logs is append-only (DELETE rejected)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.hash IS NULL AND NEW.hash IS NOT NULL
     AND (to_jsonb(OLD) - 'hash' - 'prev_hash') = (to_jsonb(NEW) - 'hash' - 'prev_hash') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only (UPDATE rejected)'
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION appcore_audit_logs_guard();

-- TRUNCATE bypasses row triggers: block it with a statement trigger.
CREATE OR REPLACE FUNCTION appcore_audit_logs_no_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (TRUNCATE rejected)'
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION appcore_audit_logs_no_truncate();
