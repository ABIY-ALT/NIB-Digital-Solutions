/**
 * Enrolment of an authenticator app (TOTP). Implemented in infrastructure
 * because it needs secret generation, encryption and short-lived storage.
 */
export interface TotpEnrollment {
  secret: string;
  otpauthUri: string;
  expiresAt: Date;
}

export interface MfaEnrollmentService {
  /** Starts an enrolment: generates a secret held server-side until confirmed. */
  begin(userId: string, accountLabel: string): Promise<TotpEnrollment>;
  /**
   * Verifies a code against the pending secret. Returns the ENCRYPTED secret to
   * store on the user, or null when the code is wrong / enrolment expired.
   */
  confirm(userId: string, code: string): Promise<string | null>;
}

export const MFA_ENROLLMENT = Symbol('MfaEnrollmentService');
