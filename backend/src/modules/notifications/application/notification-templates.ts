import type {
  AccountLockedEvent,
  ApprovalDecidedEvent,
  ApprovalSubmittedEvent,
  MfaChangedEvent,
  MfaRequiredEvent,
  NewSignInEvent,
  PasswordChangedEvent,
  PasswordExpiringEvent,
  PasswordResetEvent,
  SessionEvictedEvent,
} from '#core/application/events/app-events.js';
import type { NotificationDraft } from '#core/application/ports/notifier.port.js';

/**
 * Event → notification templates. `template` + `params` let the UI render the
 * message in the reader's language (notifications.templates.<template>); the
 * English `title` / `body` are the fallback and the e-mail text.
 */

const SYSTEM = 'Security Center';
const date = (iso: string | null) =>
  iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '';

type NameRules = ReadonlyArray<readonly [pattern: RegExp, name: string]>;

/** First match wins: Edge's user agent also names Chrome and Safari, Chrome's names Safari. */
const BROWSERS: NameRules = [
  [/Edg\//, 'Edge'],
  [/Chrome\//, 'Chrome'],
  [/Firefox\//, 'Firefox'],
  [/Safari\//, 'Safari'],
];
const SYSTEMS: NameRules = [
  [/Windows/, 'Windows'],
  [/Android/, 'Android'],
  [/iPhone|iPad/, 'iOS'],
  [/Mac OS/, 'macOS'],
  [/Linux/, 'Linux'],
];

const nameFrom = (userAgent: string | null, rules: NameRules, fallback: string): string =>
  rules.find(([pattern]) => pattern.test(userAgent ?? ''))?.[1] ?? fallback;

/** "Chrome on Windows" from a user-agent string. */
export function describeDevice(userAgent: string | null): string {
  const browser = nameFrom(userAgent, BROWSERS, 'a browser');
  const os = nameFrom(userAgent, SYSTEMS, 'an unknown system');
  return `${browser} on ${os}`;
}

export const templates = {
  approvalRequested(e: ApprovalSubmittedEvent): NotificationDraft {
    return {
      recipientIds: e.checkerIds,
      category: 'APPROVAL',
      severity: 'INFO',
      template: 'approval.requested',
      params: { summary: e.summary, maker: e.makerName, expiresAt: e.expiresAt },
      title: `Approval needed: ${e.summary}`,
      body: `${e.makerName} requested a change that needs a second person's approval. Review it before ${date(e.expiresAt)}.`,
      link: `/approvals?id=${e.approvalId}`,
      senderName: e.makerName,
      threadKey: `approval:${e.approvalId}`,
    };
  },

  approvalDecided(e: ApprovalDecidedEvent): NotificationDraft | null {
    const base = {
      recipientIds: [e.makerId],
      category: 'APPROVAL',
      link: `/approvals?id=${e.approvalId}`,
      threadKey: `approval:${e.approvalId}`,
      params: {
        summary: e.summary,
        checker: e.checkerName,
        comment: e.comment,
        error: e.error,
      },
    };
    const checker = e.checkerName ?? 'A checker';
    const note = e.comment ? ` Comment: “${e.comment}”` : '';
    switch (e.status) {
      case 'APPROVED':
        return {
          ...base,
          severity: 'SUCCESS',
          template: 'approval.approved',
          title: `Approved: ${e.summary}`,
          body: `${checker} approved your request and the change has been applied.${note}`,
          senderName: e.checkerName,
        };
      case 'REJECTED':
        return {
          ...base,
          severity: 'WARNING',
          template: 'approval.rejected',
          title: `Rejected: ${e.summary}`,
          body: `${checker} rejected your request.${note}`,
          senderName: e.checkerName,
        };
      case 'FAILED':
        return {
          ...base,
          severity: 'CRITICAL',
          template: 'approval.failed',
          title: `Could not apply: ${e.summary}`,
          body: `${checker} approved your request, but it could not be applied: ${e.error ?? 'unknown error'}. Submit it again if it is still needed.`,
          senderName: e.checkerName,
        };
      case 'EXPIRED':
        return {
          ...base,
          severity: 'WARNING',
          template: 'approval.expired',
          title: `Expired: ${e.summary}`,
          body: 'No checker decided on your request in time, so it expired. Submit it again if it is still needed.',
          senderName: 'Approvals',
        };
      default:
        return null; // withdrawn by the maker: nothing to tell them
    }
  },

  passwordChanged(e: PasswordChangedEvent): NotificationDraft {
    return {
      recipientIds: [e.userId],
      category: 'SECURITY',
      severity: 'INFO',
      template: 'security.passwordChanged',
      params: { via: e.via },
      title: 'Your password was changed',
      body: "Your password was changed and your other sessions were signed out. If this wasn't you, contact the security team immediately.",
      link: '/profile?tab=security',
      senderName: SYSTEM,
      mandatory: true,
    };
  },

  passwordReset(e: PasswordResetEvent): NotificationDraft {
    return {
      recipientIds: [e.userId],
      category: 'SECURITY',
      severity: 'WARNING',
      template: 'security.passwordReset',
      params: { by: e.byName },
      title: 'Your password was reset by an administrator',
      body: `${e.byName} set a temporary password for your account. You will be asked to choose a new one when you next sign in.`,
      link: '/profile?tab=security',
      senderName: SYSTEM,
      mandatory: true,
    };
  },

  passwordExpiring(e: PasswordExpiringEvent): NotificationDraft {
    return {
      recipientIds: [e.userId],
      category: 'SECURITY',
      severity: 'WARNING',
      template: 'security.passwordExpiring',
      params: { days: e.daysLeft, expiresAt: e.expiresAt },
      title: `Your password expires in ${e.daysLeft} day${e.daysLeft === 1 ? '' : 's'}`,
      body: `Change it before ${date(e.expiresAt)} to avoid being asked at sign-in.`,
      link: '/profile?tab=security',
      senderName: SYSTEM,
      threadKey: `password-expiry:${e.userId}`,
    };
  },

  accountLocked(e: AccountLockedEvent): NotificationDraft {
    const until = e.until ? ` at ${date(e.until)}` : '';
    return {
      recipientIds: [e.userId],
      category: 'SECURITY',
      severity: 'CRITICAL',
      template: 'security.accountLocked',
      params: { until: e.until },
      title: 'Your account was locked',
      body: `Too many failed sign-in attempts. The account unlocks automatically${until}, or an administrator can unlock it. If this wasn't you, change your password.`,
      link: '/profile?tab=security',
      senderName: SYSTEM,
      mandatory: true,
    };
  },

  newSignIn(e: NewSignInEvent): NotificationDraft {
    const device = describeDevice(e.userAgent);
    const ip = e.ipAddress ? ` (${e.ipAddress})` : '';
    return {
      recipientIds: [e.userId],
      category: 'SECURITY',
      severity: 'WARNING',
      template: 'security.newSignIn',
      params: { device, ip: e.ipAddress, at: e.at },
      title: 'New sign-in to your account',
      body: `Signed in from ${device}${ip} at ${date(e.at)}. If this wasn't you, change your password and sign out your other sessions.`,
      link: '/profile?tab=sessions',
      senderName: SYSTEM,
      mandatory: true,
    };
  },

  sessionEvicted(e: SessionEvictedEvent): NotificationDraft {
    return {
      recipientIds: [e.userId],
      category: 'SECURITY',
      severity: 'INFO',
      template: 'security.sessionEvicted',
      params: { limit: e.limit, ended: e.ended },
      title: 'Signed out on another device',
      body: `You can be signed in on up to ${e.limit} devices at once, so your least recently used session was ended.`,
      link: '/profile?tab=sessions',
      senderName: SYSTEM,
    };
  },

  mfaChanged(e: MfaChangedEvent): NotificationDraft {
    return {
      recipientIds: [e.userId],
      category: 'SECURITY',
      severity: e.enabled ? 'SUCCESS' : 'WARNING',
      template: e.enabled ? 'security.mfaEnabled' : 'security.mfaDisabled',
      params: { method: e.method },
      title: e.enabled ? 'Two-step verification is on' : 'Two-step verification was turned off',
      body: e.enabled
        ? 'Your account now asks for a code from your authenticator app at sign-in.'
        : "Your account no longer asks for a second step at sign-in. If this wasn't you, contact the security team.",
      link: '/profile?tab=security',
      senderName: SYSTEM,
      mandatory: true,
    };
  },

  mfaRequired(e: MfaRequiredEvent): NotificationDraft {
    return {
      recipientIds: [e.userId],
      category: 'SECURITY',
      severity: 'WARNING',
      template: 'security.mfaRequired',
      params: { roles: e.roles.join(', ') },
      title: 'Set up two-step verification',
      body: `Your role (${e.roles.join(', ')}) requires two-step verification. Set up an authenticator app to keep your account secure.`,
      link: '/profile?tab=security',
      senderName: SYSTEM,
      threadKey: `mfa-required:${e.userId}`,
    };
  },
};
