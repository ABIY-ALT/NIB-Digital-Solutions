import type { ApiSchemas } from '@/shared/api';

/** Notification centre types (shared contract with the backend). */
export type AppNotification = ApiSchemas['Notification'];
export type NotificationSummary = ApiSchemas['NotificationSummary'];
export type NotificationPreference = ApiSchemas['NotificationPreference'];
export type NotificationCategory = NotificationPreference['category'];
export type NotificationSeverity = AppNotification['severity'];

export const NOTIFICATION_FOLDERS = [
  'inbox',
  'unread',
  'starred',
  'archived',
  'trash',
  'all',
] as const;
export type NotificationFolder = (typeof NOTIFICATION_FOLDERS)[number];

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  'APPROVAL',
  'SECURITY',
  'SYSTEM',
  'ANNOUNCEMENT',
];

export type NotificationAction =
  'read' | 'unread' | 'star' | 'unstar' | 'archive' | 'unarchive' | 'trash' | 'restore' | 'delete';

export interface NotificationListParams {
  folder: NotificationFolder;
  category?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export type NotificationTarget =
  { ids: string[] } | { folder: NotificationFolder; category?: string };

export interface BroadcastInput {
  audience: 'ALL' | 'ROLES';
  roles?: string[];
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  body: string;
  link?: string | null;
}
