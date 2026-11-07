import type { ApiSchemas } from '@/shared/api';

/**
 * Maker–checker awareness for the data layer. When an action needs a second
 * person's approval the backend answers 202 with an ApprovalTicket instead of
 * the record; mutations then resolve to the ticket, and the UI tells the maker
 * the change is waiting for a checker.
 */
export type ApprovalTicket = ApiSchemas['ApprovalTicket'];

export function isApprovalTicket(value: unknown): value is ApprovalTicket {
  return (
    typeof value === 'object' &&
    value !== null &&
    'approvalId' in value &&
    (value as { status?: unknown }).status === 'PENDING'
  );
}

/** Header carrying the maker's justification (shown to the checker). */
export const CHANGE_REASON_HEADER = 'x-change-reason';

export function changeReasonHeaders(reason?: string | null): Record<string, string> {
  const value = reason?.trim();
  return value ? { [CHANGE_REASON_HEADER]: encodeURIComponent(value.slice(0, 1000)) } : {};
}
