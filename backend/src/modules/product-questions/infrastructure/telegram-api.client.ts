import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import {
  TelegramPermanentError,
  type TelegramBotApi,
  type TelegramSend,
  type TelegramUpdate,
} from '../application/messaging.ports.js';

/**
 * Minimal Telegram Bot API client (fetch, no extra dependency). The token
 * lives only here, on the server; it never appears in logs or errors.
 */
@Injectable()
export class TelegramApiClient implements TelegramBotApi {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get enabled(): boolean {
    return this.config.telegram.mode !== 'off' && !!this.config.telegram.botToken;
  }

  private async call<T>(
    method: string,
    body: Record<string, unknown>,
    timeoutMs = 15_000,
  ): Promise<T> {
    const token = this.config.telegram.botToken;
    if (!token) throw new TelegramPermanentError('Telegram is not configured');
    let res: Response;
    try {
      res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // Network failure or timeout: retryable. The original error is deliberately not attached
      // as `cause`: it can carry the request URL, which contains the bot token.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(
        `Telegram ${method} unreachable: ${error instanceof Error ? error.name : 'error'}`,
      );
    }
    const payload = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: T;
      description?: string;
    } | null;
    if (res.ok && payload?.ok) return payload.result as T;
    const description = (payload?.description ?? `HTTP ${res.status}`).replace(token, '***');
    // 429 and 5xx are worth retrying; other 4xx (blocked bot, bad chat) are not.
    if (res.status === 429 || res.status >= 500)
      throw new Error(`Telegram ${method}: ${description}`);
    throw new TelegramPermanentError(`Telegram ${method}: ${description}`);
  }

  /** Sends a message; returns its message id (used to recognise replies to it). */
  async sendMessage(message: TelegramSend): Promise<number> {
    const replyMarkup = message.forceReply
      ? { force_reply: true, input_field_placeholder: message.forceReply.placeholder.slice(0, 64) }
      : message.buttons?.length
        ? {
            inline_keyboard: message.buttons.map((row) =>
              row.map((b) =>
                'url' in b
                  ? { text: b.text, url: b.url }
                  : { text: b.text, callback_data: b.callbackData },
              ),
            ),
          }
        : undefined;
    const result = await this.call<{ message_id: number }>('sendMessage', {
      chat_id: message.chatId,
      text: message.text.slice(0, 4096),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    return result.message_id;
  }

  answerCallback(callbackQueryId: string, text?: string): Promise<boolean> {
    return this.call<boolean>('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...(text ? { text: text.slice(0, 200) } : {}),
    });
  }

  /** Long polling (development): updates after `offset`. */
  getUpdates(offset: number, timeoutSeconds = 0): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>(
      'getUpdates',
      { offset, timeout: timeoutSeconds, allowed_updates: ['message', 'callback_query'] },
      (timeoutSeconds + 10) * 1000,
    );
  }

  setWebhook(url: string, secret: string): Promise<boolean> {
    return this.call<boolean>('setWebhook', {
      url,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    });
  }

  deleteWebhook(): Promise<boolean> {
    return this.call<boolean>('deleteWebhook', { drop_pending_updates: false });
  }
}
