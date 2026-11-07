import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { JOB_SCHEDULER, type JobScheduler } from '#core/application/ports/job-scheduler.port.js';
import { AppError } from '#core/domain/errors/app-error.js';
import type { ProductDeveloper } from '#modules/product-developers/domain/product-developer.entity.js';
import {
  PRODUCT_DEVELOPER_REPOSITORY,
  type ProductDeveloperRepository,
} from '#modules/product-developers/domain/product-developer.repository.js';
import { linkCodeHash } from '#modules/product-developers/application/product-developer.use-cases.js';
import {
  BOT_STATE_STORE,
  TELEGRAM_BOT_API,
  type BotStateStore,
  type TelegramBotApi,
  type TelegramMessage,
  type TelegramUpdate,
} from './messaging.ports.js';
import { conversationText, escapeHtml } from './question-messages.js';
import { QuestionWorkflow } from './question-workflow.js';

const PROMPT_TTL_SECONDS = 7 * 86_400;
/** How long a developer has to type their e-mail after tapping Start. */
const PENDING_LINK_SECONDS = 15 * 60;
/** Link attempts (codes or e-mails) per chat per hour. */
const MAX_LINK_ATTEMPTS = 5;
const NOT_REGISTERED =
  'Welcome to NIB Digital Solutions. This bot is for our product developers. If you are one, ask your administrator to add your Telegram username (or to send you a link code), then tap Start again.';
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * The Telegram bot. Identity rules:
 *  - Updates are trusted only from Telegram itself: the webhook carries the
 *    secret token (checked by the website before forwarding), polling uses the
 *    bot token. Each update is processed once.
 *  - A chat becomes a developer's chat only through (a) a one-time link
 *    code issued in the staff portal, or (b) tapping Start from the Telegram
 *    username staff registered for the developer AND then typing the work
 *    e-mail on file. A username alone is never enough.
 *  - Every action (reply, view, in progress) is re-checked against the
 *    product's assigned developers before anything is read or saved.
 */
@Injectable()
export class TelegramBotService implements OnModuleInit {
  private readonly logger = new Logger(TelegramBotService.name);

  constructor(
    @Inject(TELEGRAM_BOT_API) private readonly telegram: TelegramBotApi,
    private readonly workflow: QuestionWorkflow,
    @Inject(PRODUCT_DEVELOPER_REPOSITORY) private readonly developers: ProductDeveloperRepository,
    @Inject(BOT_STATE_STORE) private readonly state: BotStateStore,
    @Inject(JOB_SCHEDULER) private readonly scheduler: JobScheduler,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    const { mode, webhookSecret } = this.config.telegram;
    if (mode === 'off' || !this.config.jobs.enabled) return;
    if (mode === 'webhook') {
      if (!webhookSecret) {
        this.logger.error(
          'TELEGRAM_MODE=webhook needs TELEGRAM_WEBHOOK_SECRET; the bot stays off.',
        );
        return;
      }
      const url = `${this.config.app.publicUrl}/api/telegram/webhook`;
      void this.telegram
        .setWebhook(url, webhookSecret)
        .then(() => this.logger.log({ url }, 'Telegram webhook registered'))
        .catch((err: unknown) =>
          this.logger.error({ err: String(err) }, 'Telegram webhook registration failed'),
        );
    } else {
      void this.telegram.deleteWebhook().catch(() => undefined);
      this.scheduler.register({
        name: 'telegram-poll',
        everyMs: 3_000,
        initialDelayMs: 5_000,
        run: () => this.poll(),
      });
    }
  }

  /** Development mode: fetch and process new updates. */
  async poll(): Promise<number> {
    const offset = await this.state.pollOffset();
    const updates = await this.telegram.getUpdates(offset);
    for (const update of updates) {
      await this.handle(update);
      await this.state.setPollOffset(update.update_id + 1);
    }
    return updates.length;
  }

  /** Processes one update (webhook or polling); duplicates are ignored. */
  async handle(update: TelegramUpdate): Promise<void> {
    if (!(await this.state.firstSeen(update.update_id))) return;
    try {
      if (update.callback_query) await this.onCallback(update.callback_query);
      else if (update.message) await this.onMessage(update.message);
    } catch (error) {
      this.logger.error(
        { err: error instanceof Error ? error.message : String(error), updateId: update.update_id },
        'Telegram update failed',
      );
    }
  }

  private say(chatId: number | string, text: string) {
    return this.telegram.sendMessage({ chatId: String(chatId), text }).catch((err: unknown) => {
      this.logger.warn({ err: String(err) }, 'Telegram reply failed');
      return 0;
    });
  }

  /** Bots are only used in private chats with the developer. */
  private async developerFor(chatId: number): Promise<ProductDeveloper | null> {
    return this.developers.findByChatId(String(chatId));
  }

  private async onMessage(message: TelegramMessage): Promise<void> {
    if (message.chat.type !== 'private' || message.from?.is_bot) return;
    const chatId = message.chat.id;
    const text = (message.text ?? '').trim();

    const start = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{4,64}))?$/.exec(text);
    if (start) return this.onStart(message, start[1]);

    const developer = await this.developerFor(chatId);
    if (!developer || !developer.active) {
      // Signing in by username: the next message is the work e-mail.
      const pending = await this.state.pendingLink(chatId);
      if (pending) return this.confirmEmail(message, pending, text);
      await this.say(chatId, NOT_REGISTERED);
      return;
    }

    const repliedTo = message.reply_to_message?.message_id;
    const questionId = repliedTo ? await this.state.questionFor(chatId, repliedTo) : null;
    if (!questionId) {
      await this.say(
        chatId,
        'To answer a customer, tap <b>✍️ Reply to Customer</b> under their question, then send your answer as a reply.',
      );
      return;
    }
    if (!text) {
      await this.say(chatId, 'Please send your answer as text.');
      return;
    }
    try {
      await this.workflow.authoriseDeveloper(developer, questionId);
      const { question } = await this.workflow.answer(questionId, text, {
        kind: 'developer',
        name: developer.name,
        developerId: developer.id,
        channel: 'telegram',
        actorId: null,
      });
      await this.say(
        chatId,
        `✅ Your answer to <b>${escapeHtml(question.reference)}</b> was saved and e-mailed to the customer.`,
      );
    } catch (error) {
      await this.say(chatId, `⚠️ ${escapeHtml(this.reason(error))}`);
    }
  }

  private async onStart(message: TelegramMessage, code: string | undefined): Promise<void> {
    const chatId = message.chat.id;
    if (!code) {
      const known = await this.developerFor(chatId);
      if (known?.active) {
        await this.say(
          chatId,
          `Hello ${escapeHtml(known.name)}. You will receive customer questions here.`,
        );
        return;
      }
      return this.startByUsername(message);
    }
    // Brute force protection: a few attempts per chat per hour.
    if ((await this.state.countLinkAttempt(chatId)) > MAX_LINK_ATTEMPTS) {
      await this.say(chatId, 'Too many attempts. Please try again later.');
      return;
    }
    const developer = await this.developers.findByLinkCodeHash(linkCodeHash(code));
    if (
      !developer ||
      !developer.telegramLinkExpiresAt ||
      developer.telegramLinkExpiresAt < new Date()
    ) {
      await this.say(
        chatId,
        'This link code is not valid or has expired. Ask your administrator for a new one.',
      );
      return;
    }
    // A chat belongs to one developer: release it from anyone else first.
    const previous = await this.developerFor(chatId);
    if (previous && previous.id !== developer.id) {
      previous.unlinkTelegram(null);
      await this.developers.update(previous);
    }
    developer.linkTelegram(String(chatId), message.from?.username ?? null);
    await this.developers.update(developer);
    await this.say(
      chatId,
      `✅ Linked. Hello ${escapeHtml(developer.name)}: customer questions about your products will arrive here.`,
    );
  }

  /**
   * Start without a code: if staff registered this Telegram username for an
   * active developer, ask for the work e-mail on file before linking.
   */
  private async startByUsername(message: TelegramMessage): Promise<void> {
    const chatId = message.chat.id;
    const username = message.from?.username;
    if (!username) {
      await this.say(
        chatId,
        'Your Telegram account has no username. Set one in Telegram (Settings → Username), give it to your administrator, then tap Start again.',
      );
      return;
    }
    const developer = await this.developers.findByTelegramUsername(username);
    if (!developer || !developer.active) {
      await this.say(chatId, NOT_REGISTERED);
      return;
    }
    if (developer.telegramChatId && developer.telegramChatId !== String(chatId)) {
      await this.say(
        chatId,
        'This developer account is already connected to another Telegram chat. Ask your administrator to disconnect it first.',
      );
      return;
    }
    await this.state.setPendingLink(chatId, developer.id, PENDING_LINK_SECONDS);
    await this.say(
      chatId,
      `Hello @${escapeHtml(username)}. To connect, please reply with your <b>work e-mail address</b> (the one registered by your administrator).`,
    );
  }

  /** Second step of signing in by username: the e-mail must match the developer record. */
  private async confirmEmail(
    message: TelegramMessage,
    developerId: string,
    text: string,
  ): Promise<void> {
    const chatId = message.chat.id;
    if ((await this.state.countLinkAttempt(chatId)) > MAX_LINK_ATTEMPTS) {
      await this.state.clearPendingLink(chatId);
      await this.say(chatId, 'Too many attempts. Please try again in an hour.');
      return;
    }
    const [developer] = await this.developers.findByIds([developerId]);
    const username = message.from?.username ?? '';
    const sameUser =
      !!developer?.telegramUsername &&
      developer.telegramUsername.toLowerCase() === username.toLowerCase();
    if (!developer || !developer.active || !sameUser) {
      await this.state.clearPendingLink(chatId);
      await this.say(chatId, NOT_REGISTERED);
      return;
    }
    if (text.trim().toLowerCase() !== developer.email) {
      await this.say(
        chatId,
        'That e-mail does not match our records. Please check it and send it again.',
      );
      return;
    }
    // A chat belongs to one developer: release it from anyone else first.
    const previous = await this.developerFor(chatId);
    if (previous && previous.id !== developer.id) {
      previous.unlinkTelegram(null);
      await this.developers.update(previous);
    }
    developer.linkTelegram(String(chatId), username || null);
    await this.developers.update(developer);
    await this.state.clearPendingLink(chatId);
    await this.say(
      chatId,
      `✅ Connected. Hello ${escapeHtml(developer.name)}: customer questions about your products will arrive here, and you can answer them from this chat.`,
    );
  }

  private async onCallback(query: NonNullable<TelegramUpdate['callback_query']>): Promise<void> {
    const chatId = query.message?.chat.id ?? query.from.id;
    const [action, questionId = ''] = (query.data ?? '').split(':');
    const developer = await this.developerFor(chatId);
    if (!developer || !UUID.test(questionId)) {
      await this.telegram.answerCallback(query.id, 'Not available.').catch(() => undefined);
      return;
    }
    try {
      const question = await this.workflow.authoriseDeveloper(developer, questionId);
      if (action === 'r') {
        await this.telegram.answerCallback(query.id);
        if (question.closed) {
          await this.say(chatId, `${escapeHtml(question.reference)} is closed.`);
          return;
        }
        const promptId = await this.telegram.sendMessage({
          chatId: String(chatId),
          text: `✍️ Write your answer to <b>${escapeHtml(question.reference)}</b> and send it as a reply to this message.`,
          forceReply: { placeholder: `Answer to ${question.reference}` },
        });
        await this.state.mapMessage(chatId, promptId, question.id, PROMPT_TTL_SECONDS);
      } else if (action === 'v') {
        await this.telegram.answerCallback(query.id);
        const conv = await this.workflow.conversationForStaff(question.id);
        const promptId = await this.telegram.sendMessage({
          chatId: String(chatId),
          text: conversationText(
            {
              reference: question.reference,
              questionId: question.id,
              productName: conv.productName,
              customerName: question.customerName,
              customerEmail: question.customerEmail,
              status: question.status,
            },
            conv.messages,
          ),
          buttons: [[{ text: '✍️ Reply to Customer', callbackData: `r:${question.id}` }]],
        });
        await this.state.mapMessage(chatId, promptId, question.id, PROMPT_TTL_SECONDS);
      } else if (action === 'p') {
        await this.workflow.setStatus(question.id, 'in_progress', null);
        await this.telegram.answerCallback(query.id, `${question.reference} marked as in progress`);
      } else {
        await this.telegram.answerCallback(query.id);
      }
    } catch (error) {
      await this.telegram.answerCallback(query.id, this.reason(error)).catch(() => undefined);
    }
  }

  private reason(error: unknown): string {
    if (error instanceof AppError) return error.message;
    this.logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      'Telegram action failed',
    );
    return 'Something went wrong. Please try again.';
  }
}
