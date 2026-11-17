-- Key/value store in PostgreSQL (KV_STORE=postgres), for servers without Redis:
-- sessions, rate-limit counters, idempotency keys, MFA challenges and job locks.
-- Unused (empty) with KV_STORE=redis or memory.
-- CreateTable
CREATE TABLE "kv_entries" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "kv_entries_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "kv_set_members" (
    "key" TEXT NOT NULL,
    "member" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "kv_set_members_pkey" PRIMARY KEY ("key","member")
);

-- CreateIndex
CREATE INDEX "kv_entries_expires_at_idx" ON "kv_entries"("expires_at");

-- CreateIndex
CREATE INDEX "kv_set_members_expires_at_idx" ON "kv_set_members"("expires_at");
