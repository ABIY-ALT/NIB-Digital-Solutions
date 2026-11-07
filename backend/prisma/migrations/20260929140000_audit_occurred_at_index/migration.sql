-- Audit listing is time-ordered (newest first) and time-windowed.
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs"("occurred_at");
