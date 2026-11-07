import type { Page } from '#core/domain/pagination.js';
import type { ApprovalRequest, ApprovalStatus } from '../domain/approval-request.js';

export type ApprovalBox = 'inbox' | 'mine' | 'history' | 'all';

export interface ApprovalQuery {
  box: ApprovalBox;
  /** Current user (maker for "mine", checker for "history"/"inbox"). */
  userId: string;
  /** "inbox": actions the user is entitled to decide. */
  eligibleActions?: string[];
  status?: ApprovalStatus[];
  action?: string;
  resourceType?: string;
  resourceId?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export interface ApprovalRepository {
  create(request: ApprovalRequest): Promise<void>;
  findById(id: string): Promise<ApprovalRequest | null>;
  /** Optimistic: fails with CONCURRENCY_CONFLICT if someone decided meanwhile. */
  update(request: ApprovalRequest): Promise<void>;
  findPage(query: ApprovalQuery): Promise<Page<ApprovalRequest>>;
  countInbox(userId: string, eligibleActions: string[]): Promise<number>;
  countPendingByMaker(userId: string): Promise<number>;
  findPendingFor(resourceType: string, resourceId: string): Promise<ApprovalRequest | null>;
  /** Pending requests per resource id (for "pending change" badges in lists). */
  pendingResourceIds(resourceType: string, resourceIds: string[]): Promise<Map<string, string>>;
  findExpired(now: Date, limit: number): Promise<ApprovalRequest[]>;

  // Retention
  countDecidedBefore(cutoff: Date): Promise<number>;
  takeDecidedBefore(cutoff: Date, limit: number): Promise<ApprovalRequest[]>;
  deleteByIds(ids: string[]): Promise<number>;
}

export const APPROVAL_REPOSITORY = Symbol('ApprovalRepository');
