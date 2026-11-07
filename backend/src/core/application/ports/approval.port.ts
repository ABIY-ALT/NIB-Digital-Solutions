import type { Principal } from '../security/principal.js';

/**
 * Maker–checker (four-eyes) contract. Any feature can put an operation behind
 * approval WITHOUT depending on the approvals module:
 *
 *   1. Register a handler for the action (what to show the checker, how to apply it).
 *   2. Route the operation through the gate in the controller:
 *
 *        const outcome = await this.approvals.submit({
 *          action: 'roles.update', principal, payload: { id, ...body },
 *          execute: () => this.updateRole.execute({ principal, id, ...body }),
 *        });
 *        return this.gated(outcome, toDto, 'Role updated.');
 *
 * Whether an action needs approval is configuration (APPROVAL_ACTIONS), so the
 * same code runs with or without four-eyes control. When approval is needed the
 * request is validated up front (`describe`) and stored; a checker's approval
 * replays `execute` with the maker's (current) authority.
 */

export interface ApprovalDescription {
  resourceId: string | null;
  /** One-line, human-readable summary ("Update role Branch Teller"). */
  summary: string;
  /** Record before and after the change, for the checker's side-by-side diff. */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export interface ApprovalHandler<TPayload = Record<string, unknown>, TResult = unknown> {
  /** Stable action id: `<resource>.<operation>` (e.g. "roles.update"). */
  readonly action: string;
  /** Resource type shown to reviewers and used for pending-change lookups ("Role"). */
  readonly resourceType: string;
  /** Permissions the CHECKER must hold in addition to `approvals:approve`. */
  readonly checkerPermissions: readonly string[];
  /**
   * Validates the request NOW (fail fast for the maker) and describes it for the
   * checker. Throw an AppError to reject the submission.
   */
  describe(payload: TPayload, maker: Principal): Promise<ApprovalDescription>;
  /** Applies the change on approval, with the maker's current authority. */
  execute(payload: TPayload, maker: Principal): Promise<TResult>;
}

export interface ApprovalTicket {
  approvalId: string;
  status: 'PENDING';
  action: string;
  resourceType: string;
  resourceId: string | null;
  summary: string;
  expiresAt: string;
}

export type GateOutcome<T> =
  { status: 'EXECUTED'; result: T } | { status: 'PENDING'; ticket: ApprovalTicket };

export interface GateRequest<T> {
  action: string;
  principal: Principal;
  /** Validated input needed to apply the change later. Never include secrets. */
  payload: Record<string, unknown>;
  /** Optional justification from the maker. */
  comment?: string | null;
  /** Runs the operation immediately when no approval is required. */
  execute: () => Promise<T>;
}

export interface ApprovalGate {
  submit<T>(request: GateRequest<T>): Promise<GateOutcome<T>>;
  isRequired(action: string): boolean;
  register(handler: ApprovalHandler): void;
}

export const APPROVAL_GATE = Symbol('ApprovalGate');
