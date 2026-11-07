import type { NotificationDraft } from '#core/application/ports/notifier.port.js';
import type { Page } from '#core/domain/pagination.js';
import type {
  ChannelChoice,
  NotificationAction,
  NotificationFolder,
  NotificationRecord,
} from '../domain/notification.js';

export interface NotificationQuery {
  folder: NotificationFolder;
  category?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export interface NotificationCounts {
  inbox: number;
  unread: number;
  starred: number;
  archived: number;
  trash: number;
  /** Per category, inbox only. */
  categories: Record<string, { total: number; unread: number }>;
}

/** Which messages a bulk action targets: explicit ids, or everything in a folder view. */
export type NotificationTarget =
  { ids: string[] } | { folder: NotificationFolder; category?: string };

export interface NotificationRepository {
  createMany(recipientIds: readonly string[], draft: NotificationDraft): Promise<number>;
  findPage(recipientId: string, query: NotificationQuery): Promise<Page<NotificationRecord>>;
  findOne(recipientId: string, id: string): Promise<NotificationRecord | null>;
  counts(recipientId: string): Promise<NotificationCounts>;
  latest(recipientId: string, limit: number): Promise<NotificationRecord[]>;
  apply(
    recipientId: string,
    target: NotificationTarget,
    action: NotificationAction,
  ): Promise<number>;

  preferences(userId: string): Promise<Array<{ category: string } & ChannelChoice>>;
  savePreferences(
    userId: string,
    prefs: Array<{ category: string } & ChannelChoice>,
  ): Promise<void>;
  /** Stored choices of many users for one category (absent = defaults). */
  choicesFor(userIds: readonly string[], category: string): Promise<Map<string, ChannelChoice>>;

  /** Retention: trash older than `trashCutoff`, and unstarred messages older than `cutoff`. */
  countExpired(cutoff: Date, trashCutoff: Date): Promise<number>;
  deleteExpired(cutoff: Date, trashCutoff: Date, batchSize: number): Promise<number>;
}

export const NOTIFICATION_REPOSITORY = Symbol('NotificationRepository');

// ── E-mail channel ───────────────────────────────────────────────────────────
// The transport is shared by every feature: see core/application/ports/mail.port.ts.
export {
  MAIL_TRANSPORT,
  type MailMessage,
  type MailTransport,
} from '#core/application/ports/mail.port.js';
