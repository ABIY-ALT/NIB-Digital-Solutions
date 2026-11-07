import type { MailDraft } from '#core/application/ports/mail.port.js';

// ── Telegram Bot API ─────────────────────────────────────────────────────────

/** A button under a Telegram message: a callback (handled by the bot) or a link. */
export type TelegramButton = { text: string; callbackData: string } | { text: string; url: string };

export interface TelegramSend {
  chatId: string;
  /** HTML (parse mode HTML); escape user text with `escapeHtml`. */
  text: string;
  buttons?: TelegramButton[][];
  /** Ask Telegram to open a reply box for this message (developer answers). */
  forceReply?: { placeholder: string };
}

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
}
export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: TelegramUser;
  text?: string;
  reply_to_message?: { message_id: number };
}
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: { id: string; from: TelegramUser; data?: string; message?: TelegramMessage };
}

/** A Telegram error that must not be retried (bad request, blocked bot, unknown chat). */
export class TelegramPermanentError extends Error {}

export interface TelegramBotApi {
  /** A token is configured and the mode is not "off". */
  readonly enabled: boolean;
  /** Sends a message; returns its message id (to recognise replies to it). */
  sendMessage(message: TelegramSend): Promise<number>;
  answerCallback(callbackQueryId: string, text?: string): Promise<boolean>;
  getUpdates(offset: number, timeoutSeconds?: number): Promise<TelegramUpdate[]>;
  setWebhook(url: string, secret: string): Promise<boolean>;
  deleteWebhook(): Promise<boolean>;
}
export const TELEGRAM_BOT_API = Symbol('TelegramBotApi');

// ── Outbox ───────────────────────────────────────────────────────────────────

/** A Telegram message; `questionId` lets the bot recognise a developer's reply to it. */
export interface TelegramPayload extends TelegramSend {
  questionId?: string;
}

export type OutboundPayload =
  { channel: 'telegram'; message: TelegramPayload } | { channel: 'email'; draft: MailDraft };

export interface ClaimedMessage {
  id: string;
  channel: 'telegram' | 'email';
  payload: OutboundPayload;
  /** Including this attempt. */
  attempts: number;
}

export interface DeliveryRecord {
  id: string;
  channel: string;
  status: string;
  attempts: number;
  lastError: string | null;
  dedupeKey: string;
  createdAt: Date;
  sentAt: Date | null;
}

/** Persistent outbox (joins the caller's transaction on insert). */
export interface OutboxStore {
  /** Inserts unless the dedupe key exists; returns the id, or null for a duplicate. */
  insertIfAbsent(
    dedupeKey: string,
    payload: OutboundPayload,
    resource?: { type: string; id: string },
  ): Promise<string | null>;
  /** Puts messages stuck in "sending" (crashed worker) back in the queue. */
  recoverStuck(olderThan: Date): Promise<void>;
  /** Ids of pending messages that are due. */
  due(limit: number): Promise<string[]>;
  /** Atomically moves a due message to "sending"; null when another worker has it. */
  claim(id: string): Promise<ClaimedMessage | null>;
  markSent(id: string): Promise<void>;
  markRetry(id: string, error: string, nextAttemptAt: Date): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  deliveries(resourceType: string, resourceId: string): Promise<DeliveryRecord[]>;
}
export const OUTBOX_STORE = Symbol('OutboxStore');

// ── Bot state (key/value, with expiry) ───────────────────────────────────────

export interface BotStateStore {
  /** Remembers which question a Telegram message is about (replies to it answer that question). */
  mapMessage(
    chatId: string | number,
    messageId: number,
    questionId: string,
    ttlSeconds: number,
  ): Promise<void>;
  questionFor(chatId: string | number, messageId: number): Promise<string | null>;
  /** True the first time an update id is seen (Telegram may deliver an update twice). */
  firstSeen(updateId: number): Promise<boolean>;
  pollOffset(): Promise<number>;
  setPollOffset(offset: number): Promise<void>;
  /** Counts link attempts of a chat in the last hour (brute-force protection). */
  countLinkAttempt(chatId: number): Promise<number>;
  /** A chat that tapped Start with a registered username and must now confirm the e-mail. */
  setPendingLink(chatId: number, developerId: string, ttlSeconds: number): Promise<void>;
  pendingLink(chatId: number): Promise<string | null>;
  clearPendingLink(chatId: number): Promise<void>;
}
export const BOT_STATE_STORE = Symbol('BotStateStore');
