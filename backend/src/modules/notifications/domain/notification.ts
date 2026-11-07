export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

/**
 * Notification categories. Products add their own (e.g. "PAYMENT") by
 * extending this list and CATEGORY_DEFAULTS.
 */
export const NOTIFICATION_CATEGORIES = [
  'APPROVAL',
  'SECURITY',
  'SYSTEM',
  'ANNOUNCEMENT',
  // NIB Digital Solutions: new demo requests and inquiries for the sales team.
  'MARKETPLACE',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface ChannelChoice {
  inApp: boolean;
  email: boolean;
}

/** Defaults when a user has not chosen (security alerts are e-mailed by default). */
export const CATEGORY_DEFAULTS: Record<NotificationCategory, ChannelChoice> = {
  APPROVAL: { inApp: true, email: true },
  SECURITY: { inApp: true, email: true },
  SYSTEM: { inApp: true, email: false },
  ANNOUNCEMENT: { inApp: true, email: false },
  MARKETPLACE: { inApp: true, email: true },
};

/** Categories that can never be muted in-app (the user must see security alerts). */
export const MANDATORY_IN_APP: readonly NotificationCategory[] = ['SECURITY'];

export const isCategory = (value: string): value is NotificationCategory =>
  (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);

export function defaultsFor(category: string): ChannelChoice {
  return isCategory(category) ? CATEGORY_DEFAULTS[category] : { inApp: true, email: false };
}

/** Mailbox folders (Gmail-style). */
export const NOTIFICATION_FOLDERS = [
  'inbox',
  'unread',
  'starred',
  'archived',
  'trash',
  'all',
] as const;
export type NotificationFolder = (typeof NOTIFICATION_FOLDERS)[number];

/** Bulk actions a user can apply to their own messages. */
export const NOTIFICATION_ACTIONS = [
  'read',
  'unread',
  'star',
  'unstar',
  'archive',
  'unarchive',
  'trash',
  'restore',
  'delete',
] as const;
export type NotificationAction = (typeof NOTIFICATION_ACTIONS)[number];

export interface NotificationRecord {
  id: string;
  createdAt: Date;
  recipientId: string;
  category: string;
  severity: NotificationSeverity;
  template: string;
  params: Record<string, string | number | null> | null;
  title: string;
  body: string;
  link: string | null;
  senderName: string | null;
  threadKey: string | null;
  readAt: Date | null;
  starredAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
}
