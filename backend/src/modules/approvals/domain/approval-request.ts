import { AppError, BusinessRuleError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';

export type ApprovalStatus =
  'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';

export interface ApprovalActor {
  id: string;
  name: string;
}

export interface ApprovalRequestProps {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  action: string;
  resourceType: string;
  resourceId: string | null;
  summary: string;
  payload: Record<string, unknown>;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  status: ApprovalStatus;
  maker: ApprovalActor;
  makerComment: string | null;
  checker: ApprovalActor | null;
  checkerComment: string | null;
  checkerPermissions: string[];
  decidedAt: Date | null;
  expiresAt: Date;
  /** Applied result (DTO) or { message } of the failure. */
  result: Record<string, unknown> | null;
  errorCode: string | null;
  correlationId: string | null;
}

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

/**
 * Maker–checker request (four-eyes principle). A pure state machine:
 *
 *   PENDING ─approve→ APPROVED ─(apply fails)→ FAILED
 *           ─reject──→ REJECTED
 *           ─cancel──→ CANCELLED   (maker withdraws)
 *           ─expire──→ EXPIRED     (nobody decided in time)
 *
 * The maker can never decide their own request.
 */
export class ApprovalRequest {
  private constructor(private readonly props: ApprovalRequestProps) {}

  static submit(input: {
    action: string;
    resourceType: string;
    resourceId: string | null;
    summary: string;
    payload: Record<string, unknown>;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    maker: ApprovalActor;
    makerComment: string | null;
    checkerPermissions: string[];
    expiresAt: Date;
    correlationId: string | null;
  }): ApprovalRequest {
    const now = new Date();
    return new ApprovalRequest({
      ...input,
      id: globalThis.crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      version: 1,
      summary: input.summary.slice(0, 300),
      status: 'PENDING',
      checker: null,
      checkerComment: null,
      decidedAt: null,
      result: null,
      errorCode: null,
    });
  }

  static reconstitute(props: ApprovalRequestProps): ApprovalRequest {
    return new ApprovalRequest({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get version(): number {
    return this.props.version;
  }
  get status(): ApprovalStatus {
    return this.props.status;
  }
  get action(): string {
    return this.props.action;
  }
  get resourceId(): string | null {
    return this.props.resourceId;
  }
  get maker(): ApprovalActor {
    return this.props.maker;
  }
  get checker(): ApprovalActor | null {
    return this.props.checker;
  }
  get payload(): Record<string, unknown> {
    return this.props.payload;
  }
  get summary(): string {
    return this.props.summary;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }
  get checkerPermissions(): readonly string[] {
    return this.props.checkerPermissions;
  }

  isExpired(now: Date): boolean {
    return this.props.status === 'PENDING' && this.props.expiresAt <= now;
  }

  private assertPending(): void {
    if (this.props.status !== 'PENDING') throw new AppError(ErrorCode.APPROVAL_NOT_PENDING);
  }

  private assertNotMaker(actor: ApprovalActor): void {
    if (actor.id === this.props.maker.id) throw new AppError(ErrorCode.APPROVAL_SELF_DECISION);
  }

  approve(checker: ApprovalActor, comment: string | null, now = new Date()): void {
    this.assertPending();
    this.assertNotMaker(checker);
    if (this.isExpired(now)) throw new AppError(ErrorCode.APPROVAL_NOT_PENDING);
    this.decide('APPROVED', checker, comment, now);
  }

  reject(checker: ApprovalActor, comment: string, now = new Date()): void {
    this.assertPending();
    this.assertNotMaker(checker);
    if (comment.trim().length < 3) {
      throw new BusinessRuleError(
        'Give the requester a reason for the rejection.',
        'REASON_REQUIRED',
      );
    }
    this.decide('REJECTED', checker, comment.trim(), now);
  }

  cancel(actor: ApprovalActor, now = new Date()): void {
    this.assertPending();
    if (actor.id !== this.props.maker.id) {
      throw new BusinessRuleError('Only the requester can withdraw a request.', 'NOT_REQUESTER');
    }
    this.props.status = 'CANCELLED';
    this.props.decidedAt = now;
    this.props.updatedAt = now;
  }

  expire(now = new Date()): void {
    this.assertPending();
    this.props.status = 'EXPIRED';
    this.props.decidedAt = now;
    this.props.updatedAt = now;
  }

  /** The approved change was applied. */
  markApplied(result: Record<string, unknown> | null): void {
    if (this.props.status !== 'APPROVED') throw new AppError(ErrorCode.APPROVAL_NOT_PENDING);
    this.props.result = result;
    this.props.updatedAt = new Date();
  }

  /** The approved change could not be applied (e.g. the record changed meanwhile). */
  markFailed(errorCode: string, message: string): void {
    if (this.props.status !== 'APPROVED') throw new AppError(ErrorCode.APPROVAL_NOT_PENDING);
    this.props.status = 'FAILED';
    this.props.errorCode = errorCode;
    this.props.result = { message };
    this.props.updatedAt = new Date();
  }

  private decide(
    status: 'APPROVED' | 'REJECTED',
    checker: ApprovalActor,
    comment: string | null,
    now: Date,
  ): void {
    this.props.status = status;
    this.props.checker = checker;
    this.props.checkerComment = comment?.trim() || null;
    this.props.decidedAt = now;
    this.props.updatedAt = now;
  }

  /** Field-level differences between `before` and `after` (the reviewer's diff). */
  changes(): FieldChange[] {
    const before = this.props.before ?? {};
    const after = this.props.after ?? {};
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return fields
      .filter((f) => JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null))
      .map((field) => ({ field, before: before[field] ?? null, after: after[field] ?? null }));
  }

  toSnapshot(): Readonly<ApprovalRequestProps> {
    return { ...this.props };
  }

  /** Called by the repository after a successful write. */
  syncVersion(version: number): void {
    this.props.version = version;
  }
}
