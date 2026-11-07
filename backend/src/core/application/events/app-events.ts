/**
 * Application event catalogue: the names and payloads features publish on the
 * EventBus. Producers and subscribers depend on THIS contract, never on each
 * other (e.g. approvals publishes, notifications subscribes). Like error codes,
 * event names are stable: add new events, never repurpose old ones.
 */
export const AppEvents = {
  ApprovalSubmitted: 'approval.submitted',
  ApprovalDecided: 'approval.decided',
  PasswordChanged: 'security.password-changed',
  PasswordReset: 'security.password-reset',
  PasswordExpiring: 'security.password-expiring',
  AccountLocked: 'security.account-locked',
  NewSignIn: 'security.new-sign-in',
  SessionEvicted: 'security.session-evicted',
  MfaChanged: 'security.mfa-changed',
  MfaRequired: 'security.mfa-required',
} as const;

export type AppEventName = (typeof AppEvents)[keyof typeof AppEvents];

export interface ApprovalSubmittedEvent {
  approvalId: string;
  action: string;
  summary: string;
  makerId: string;
  makerName: string;
  /** Users entitled to decide (the maker is never included). */
  checkerIds: string[];
  expiresAt: string;
}

export type ApprovalFinalStatus = 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';

export interface ApprovalDecidedEvent {
  approvalId: string;
  action: string;
  summary: string;
  status: ApprovalFinalStatus;
  makerId: string;
  checkerId: string | null;
  checkerName: string | null;
  comment: string | null;
  /** FAILED: why the approved change could not be applied. */
  error: string | null;
}

export interface PasswordChangedEvent {
  userId: string;
  /** self = profile, expired / reset = forced change during sign-in, recovery = e-mailed reset link. */
  via: 'self' | 'expired' | 'reset' | 'recovery';
}

export interface PasswordResetEvent {
  userId: string;
  byName: string;
}

export interface PasswordExpiringEvent {
  userId: string;
  expiresAt: string;
  daysLeft: number;
}

export interface AccountLockedEvent {
  userId: string;
  username: string;
  until: string | null;
}

export interface NewSignInEvent {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  at: string;
}

export interface SessionEvictedEvent {
  userId: string;
  ended: number;
  limit: number;
}

export interface MfaChangedEvent {
  userId: string;
  enabled: boolean;
  method: string | null;
}

export interface MfaRequiredEvent {
  userId: string;
  roles: string[];
}
