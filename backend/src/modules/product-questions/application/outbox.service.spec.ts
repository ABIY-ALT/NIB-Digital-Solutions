import { describe, expect, it } from 'vitest';
import type { AppConfig } from '#config/app-config.js';
import type { JobScheduler } from '#core/application/ports/job-scheduler.port.js';
import type { Mailer } from '#core/application/ports/mail.port.js';
import {
  TelegramPermanentError,
  type BotStateStore,
  type ClaimedMessage,
  type OutboxStore,
  type TelegramBotApi,
} from './messaging.ports.js';
import { backoffMs, MAX_ATTEMPTS, OutboxService } from './outbox.service.js';

function setup(opts: { attempts?: number; telegramError?: Error; mailError?: Error } = {}) {
  const events: string[] = [];
  const message: ClaimedMessage = {
    id: 'o1',
    channel: 'telegram',
    attempts: opts.attempts ?? 1,
    payload: { channel: 'telegram', message: { chatId: '111', text: 'hi', questionId: 'q1' } },
  };
  let claimed = false;
  const store = {
    claim: () => {
      if (claimed) return Promise.resolve(null);
      claimed = true;
      return Promise.resolve(message);
    },
    markSent: () => (events.push('sent'), Promise.resolve()),
    markRetry: (_id: string, error: string, next: Date) => (
      events.push(`retry:${error}:${next > new Date()}`),
      Promise.resolve()
    ),
    markFailed: (_id: string, error: string) => (events.push(`failed:${error}`), Promise.resolve()),
  } as unknown as OutboxStore;
  const telegram = {
    enabled: true,
    sendMessage: () =>
      opts.telegramError ? Promise.reject(opts.telegramError) : Promise.resolve(42),
  } as unknown as TelegramBotApi;
  const state = {
    mapMessage: (_c: string, messageId: number, questionId: string) => (
      events.push(`map:${messageId}:${questionId}`),
      Promise.resolve()
    ),
  } as unknown as BotStateStore;
  const mailer = {
    send: () => (opts.mailError ? Promise.reject(opts.mailError) : Promise.resolve()),
  } as Mailer;
  const service = new OutboxService(
    store,
    telegram,
    state,
    mailer,
    {} as JobScheduler,
    { jobs: { enabled: false } } as AppConfig,
  );
  return { service, events };
}

describe('OutboxService', () => {
  it('sends once and remembers which question the Telegram message is about', async () => {
    const { service, events } = setup();
    expect(await service.deliver('o1')).toBe('sent');
    expect(events).toEqual(['map:42:q1', 'sent']);
    expect(await service.deliver('o1')).toBe('skipped'); // already claimed: never sent twice
  });

  it('retries temporary failures with back-off', async () => {
    const { service, events } = setup({
      telegramError: new Error('Telegram sendMessage: Too Many Requests'),
    });
    expect(await service.deliver('o1')).toBe('retry');
    expect(events[0]).toMatch(/^retry:Telegram sendMessage: Too Many Requests:true$/);
  });

  it('gives up on permanent Telegram errors and after the last attempt', async () => {
    expect(
      await setup({ telegramError: new TelegramPermanentError('chat not found') }).service.deliver(
        'o1',
      ),
    ).toBe('failed');
    expect(
      await setup({ attempts: MAX_ATTEMPTS, telegramError: new Error('timeout') }).service.deliver(
        'o1',
      ),
    ).toBe('failed');
  });

  it('backs off exponentially, capped at six hours', () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(20)).toBe(6 * 3_600_000);
  });
});
