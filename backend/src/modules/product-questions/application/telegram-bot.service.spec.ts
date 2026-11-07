import { describe, expect, it } from 'vitest';
import type { AppConfig } from '#config/app-config.js';
import type { JobScheduler } from '#core/application/ports/job-scheduler.port.js';
import { ProductDeveloper } from '#modules/product-developers/domain/product-developer.entity.js';
import type { ProductDeveloperRepository } from '#modules/product-developers/domain/product-developer.repository.js';
import type { BotStateStore, TelegramBotApi } from './messaging.ports.js';
import type { QuestionWorkflow } from './question-workflow.js';
import { TelegramBotService } from './telegram-bot.service.js';

/** The bot with in-memory Telegram, developer store and bot state. */
function setup() {
  const hana = ProductDeveloper.create(
    { name: 'Hana', email: 'hana@nib.example', telegramUsername: '@Hana_Dev' },
    null,
  );
  const dawit = ProductDeveloper.create({ name: 'Dawit', email: 'dawit@nib.example' }, null);
  const devs = [hana, dawit];

  const sent: { chatId: string; text: string }[] = [];
  const telegram = {
    sendMessage: (m: { chatId: string; text: string }) => {
      sent.push({ chatId: m.chatId, text: m.text });
      return Promise.resolve(sent.length);
    },
    answerCallback: () => Promise.resolve(),
  } as unknown as TelegramBotApi;

  const developers = {
    findByChatId: (chatId: string) =>
      Promise.resolve(devs.find((d) => d.telegramChatId === chatId) ?? null),
    findByLinkCodeHash: () => Promise.resolve(null),
    findByIds: (ids: string[]) => Promise.resolve(devs.filter((d) => ids.includes(d.id))),
    findByTelegramUsername: (u: string) =>
      Promise.resolve(
        devs.find((d) => d.telegramUsername?.toLowerCase() === u.toLowerCase()) ?? null,
      ),
    update: (d: ProductDeveloper) => Promise.resolve(d),
  } as unknown as ProductDeveloperRepository;

  const kv = new Map<string, string>();
  const attempts = new Map<number, number>();
  const state = {
    firstSeen: (id: number) =>
      Promise.resolve(!kv.has(`seen:${id}`) && !!kv.set(`seen:${id}`, '1')),
    countLinkAttempt: (chatId: number) => {
      attempts.set(chatId, (attempts.get(chatId) ?? 0) + 1);
      return Promise.resolve(attempts.get(chatId)!);
    },
    setPendingLink: (chatId: number, id: string) => (kv.set(`p:${chatId}`, id), Promise.resolve()),
    pendingLink: (chatId: number) => Promise.resolve(kv.get(`p:${chatId}`) ?? null),
    clearPendingLink: (chatId: number) => (kv.delete(`p:${chatId}`), Promise.resolve()),
    questionFor: () => Promise.resolve(null),
  } as unknown as BotStateStore;

  const bot = new TelegramBotService(
    telegram,
    {} as QuestionWorkflow,
    developers,
    state,
    {} as JobScheduler,
    { telegram: { mode: 'off' }, jobs: { enabled: false } } as unknown as AppConfig,
  );

  let updateId = 0;
  const say = (chatId: number, username: string | undefined, text: string) =>
    bot.handle({
      update_id: ++updateId,
      message: {
        message_id: updateId,
        chat: { id: chatId, type: 'private' },
        from: { id: chatId, is_bot: false, first_name: 'Dev', username },
        text,
      },
    });
  const lastTo = (chatId: number) => sent.filter((m) => m.chatId === String(chatId)).at(-1)?.text;
  return { bot, say, lastTo, hana, dawit };
}

describe('TelegramBotService: signing in by username', () => {
  it('links a developer who taps Start from the registered username and confirms the e-mail', async () => {
    const { say, lastTo, hana } = setup();
    await say(5001, 'hana_dev', '/start'); // usernames are case-insensitive
    expect(lastTo(5001)).toMatch(/work e-mail address/);
    expect(hana.telegramChatId).toBeNull();

    await say(5001, 'hana_dev', 'wrong@nib.example');
    expect(lastTo(5001)).toMatch(/does not match/);
    expect(hana.telegramChatId).toBeNull();

    await say(5001, 'hana_dev', '  Hana@NIB.example ');
    expect(lastTo(5001)).toMatch(/Connected\. Hello Hana/);
    expect(hana.telegramChatId).toBe('5001');
    expect(hana.reachableOnTelegram).toBe(true);

    await say(5001, 'hana_dev', '/start');
    expect(lastTo(5001)).toMatch(/Hello Hana\. You will receive customer questions here/);
  });

  it('never links an unregistered username, and does not ask it for an e-mail', async () => {
    const { say, lastTo, hana, dawit } = setup();
    await say(6001, 'someone_else', '/start');
    expect(lastTo(6001)).toMatch(/ask your administrator to add your Telegram username/);
    await say(6001, 'someone_else', 'hana@nib.example');
    expect(hana.telegramChatId).toBeNull();
    expect(dawit.telegramChatId).toBeNull();
  });

  it('asks for a username when the Telegram account has none', async () => {
    const { say, lastTo } = setup();
    await say(7001, undefined, '/start');
    expect(lastTo(7001)).toMatch(/has no username/);
  });

  it('does not take over a developer already connected to another chat', async () => {
    const { say, lastTo, hana } = setup();
    hana.linkTelegram('9999', 'Hana_Dev');
    await say(8001, 'Hana_Dev', '/start');
    expect(lastTo(8001)).toMatch(/already connected to another Telegram chat/);
    expect(hana.telegramChatId).toBe('9999');
  });

  it('stops after too many wrong e-mails', async () => {
    const { say, lastTo, hana } = setup();
    await say(5002, 'Hana_Dev', '/start');
    for (let i = 0; i < 5; i++) await say(5002, 'Hana_Dev', `guess${i}@nib.example`);
    await say(5002, 'Hana_Dev', 'hana@nib.example');
    expect(lastTo(5002)).toMatch(/Too many attempts/);
    expect(hana.telegramChatId).toBeNull();
  });
});
