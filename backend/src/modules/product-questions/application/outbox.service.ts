import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { JOB_SCHEDULER, type JobScheduler } from '#core/application/ports/job-scheduler.port.js';
import { MAILER, type Mailer } from '#core/application/ports/mail.port.js';
import {
  BOT_STATE_STORE,
  OUTBOX_STORE,
  TELEGRAM_BOT_API,
  TelegramPermanentError,
  type BotStateStore,
  type DeliveryRecord,
  type OutboundPayload,
  type OutboxStore,
  type TelegramBotApi,
} from './messaging.ports.js';

/** Attempts before a message is marked failed (≈ 2 days with the back-off below). */
export const MAX_ATTEMPTS = 10;
/** 30 s, 1 min, 2 min … capped at 6 h. */
export const backoffMs = (attempt: number) => Math.min(30_000 * 2 ** (attempt - 1), 6 * 3_600_000);
/** A message stuck in "sending" this long (crashed worker) is retried. */
const STUCK_MS = 10 * 60_000;
/** How long the bot remembers which question a Telegram message belongs to. */
export const REPLY_MAP_TTL_SECONDS = 60 * 86_400;

/**
 * Transactional outbox for developer notifications (Telegram) and customer
 * e-mails. A message is written in the same transaction as the change that
 * causes it; a background job delivers it, retries failures with back-off and
 * records every error. The unique dedupe key means each logical message is
 * sent at most once, even if a request or a job runs twice.
 */
@Injectable()
export class OutboxService implements OnModuleInit {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    @Inject(OUTBOX_STORE) private readonly store: OutboxStore,
    @Inject(TELEGRAM_BOT_API) private readonly telegram: TelegramBotApi,
    @Inject(BOT_STATE_STORE) private readonly botState: BotStateStore,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(JOB_SCHEDULER) private readonly scheduler: JobScheduler,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.jobs.enabled) return;
    this.scheduler.register({
      name: 'marketplace-outbox',
      everyMs: 15_000,
      initialDelayMs: 10_000,
      run: () => this.dispatchDue(),
    });
  }

  /** Queues a message (joins the caller's transaction); null when this dedupe key was queued before. */
  enqueue(
    dedupeKey: string,
    payload: OutboundPayload,
    resource?: { type: string; id: string },
  ): Promise<string | null> {
    return this.store.insertIfAbsent(dedupeKey, payload, resource);
  }

  /** Tries to deliver right away (call after the transaction committed); the job retries failures. */
  kick(ids: (string | null)[]): void {
    for (const id of ids) {
      if (id)
        void this.deliver(id).catch((err: unknown) =>
          this.logger.warn({ err: String(err), id }, 'Outbox delivery attempt failed'),
        );
    }
  }

  /** The job: delivers every due message (and recovers ones stuck in "sending"). */
  async dispatchDue(limit = 25): Promise<{ sent: number; failed: number }> {
    await this.store.recoverStuck(new Date(Date.now() - STUCK_MS));
    let sent = 0;
    let failed = 0;
    for (const id of await this.store.due(limit)) {
      const outcome = await this.deliver(id);
      if (outcome === 'sent') sent++;
      else if (outcome !== 'skipped') failed++;
    }
    return { sent, failed };
  }

  /** Claims one message and sends it. Exactly one worker can claim a message. */
  async deliver(id: string): Promise<'sent' | 'retry' | 'failed' | 'skipped'> {
    const message = await this.store.claim(id);
    if (!message) return 'skipped';
    try {
      const { payload } = message;
      if (payload.channel === 'telegram') {
        if (!this.telegram.enabled) throw new TelegramPermanentError('Telegram is switched off');
        const messageId = await this.telegram.sendMessage(payload.message);
        if (payload.message.questionId)
          await this.botState.mapMessage(
            payload.message.chatId,
            messageId,
            payload.message.questionId,
            REPLY_MAP_TTL_SECONDS,
          );
      } else {
        await this.mailer.send(payload.draft);
      }
      await this.store.markSent(id);
      return 'sent';
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      const permanent = error instanceof TelegramPermanentError || message.attempts >= MAX_ATTEMPTS;
      if (permanent) await this.store.markFailed(id, text);
      else await this.store.markRetry(id, text, new Date(Date.now() + backoffMs(message.attempts)));
      this.logger.warn(
        { id, channel: message.channel, attempt: message.attempts, permanent, error: text },
        permanent ? 'Outbound message failed permanently' : 'Outbound message failed; will retry',
      );
      return permanent ? 'failed' : 'retry';
    }
  }

  /** Delivery state of the messages about one record (shown to staff). */
  deliveries(resourceType: string, resourceId: string): Promise<DeliveryRecord[]> {
    return this.store.deliveries(resourceType, resourceId);
  }
}
