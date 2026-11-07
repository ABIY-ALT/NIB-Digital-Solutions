/**
 * Sends a notification to users through their preferred channels (in-app inbox,
 * e-mail, ...). Any feature can inject NOTIFIER; delivery, preferences and
 * templates live in the notifications module.
 *
 *   await notifier.send({
 *     recipientIds: [makerId], category: 'APPROVAL', severity: 'SUCCESS',
 *     template: 'approval.approved', params: { summary },
 *     title: `Approved: ${summary}`, body: '…', link: `/approvals?id=${id}`,
 *   });
 */
export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export interface NotificationDraft {
  recipientIds: readonly string[];
  /** APPROVAL | SECURITY | SYSTEM | ANNOUNCEMENT (or a product-specific category). */
  category: string;
  severity?: NotificationSeverity;
  /** Template id; the UI translates `notifications.templates.<id>` with `params`. */
  template: string;
  params?: Record<string, string | number | null>;
  /** English fallback (also used for e-mail). */
  title: string;
  body: string;
  /** In-app path opened from the message, e.g. "/approvals?id=…". */
  link?: string | null;
  /** Shown as the "From" of the message (a person's name or the system). */
  senderName?: string | null;
  /** Groups related messages into one conversation. */
  threadKey?: string | null;
  /** Deliver in-app even if the user turned the category off (security alerts). */
  mandatory?: boolean;
}

export interface Notifier {
  send(draft: NotificationDraft): Promise<{ inApp: number; email: number }>;
}

export const NOTIFIER = Symbol('Notifier');
