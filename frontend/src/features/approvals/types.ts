import type { ApiSchemas } from '@/shared/api';

/** Maker–checker types (shared contract with the backend). */
export type ApprovalRequest = ApiSchemas['ApprovalRequest'];
export type ApprovalStatus = ApprovalRequest['status'];
export type ApprovalSummary = ApiSchemas['ApprovalSummary'];
export type ApprovalPolicyEntry = ApiSchemas['ApprovalPolicyEntry'];

/** Inbox views: waiting for me, my requests, decided by me, everything (auditors). */
export const APPROVAL_BOXES = ['inbox', 'mine', 'history', 'all'] as const;
export type ApprovalBox = (typeof APPROVAL_BOXES)[number];

export const APPROVAL_STATUSES: ApprovalStatus[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
];

export interface ApprovalListParams {
  box: ApprovalBox;
  status?: ApprovalStatus[];
  search?: string;
  page: number;
  pageSize: number;
}
