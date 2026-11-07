import { Inject, Injectable } from '@nestjs/common';
import { KEY_VALUE_STORE, type KeyValueStore } from '#core/infrastructure/kv/key-value-store.js';
import type { BotStateStore } from '../application/messaging.ports.js';

const SEEN_TTL_SECONDS = 2 * 86_400;

/** Telegram bot state in the key/value store (Redis in production; shared by all instances). */
@Injectable()
export class KvBotStateStore implements BotStateStore {
  constructor(@Inject(KEY_VALUE_STORE) private readonly kv: KeyValueStore) {}

  async mapMessage(
    chatId: string | number,
    messageId: number,
    questionId: string,
    ttlSeconds: number,
  ) {
    await this.kv.set(`tgq:${chatId}:${messageId}`, questionId, { ttlSeconds });
  }

  questionFor(chatId: string | number, messageId: number): Promise<string | null> {
    return this.kv.get(`tgq:${chatId}:${messageId}`);
  }

  firstSeen(updateId: number): Promise<boolean> {
    return this.kv.set(`tg:seen:${updateId}`, '1', {
      ttlSeconds: SEEN_TTL_SECONDS,
      onlyIfAbsent: true,
    });
  }

  async pollOffset(): Promise<number> {
    return Number((await this.kv.get('tg:poll-offset')) ?? 0);
  }

  async setPollOffset(offset: number): Promise<void> {
    await this.kv.set('tg:poll-offset', String(offset));
  }

  async countLinkAttempt(chatId: number): Promise<number> {
    return (await this.kv.increment(`tg:link-attempts:${chatId}`, 3600)).value;
  }

  async setPendingLink(chatId: number, developerId: string, ttlSeconds: number): Promise<void> {
    await this.kv.set(`tg:pending-link:${chatId}`, developerId, { ttlSeconds });
  }

  pendingLink(chatId: number): Promise<string | null> {
    return this.kv.get(`tg:pending-link:${chatId}`);
  }

  async clearPendingLink(chatId: number): Promise<void> {
    await this.kv.delete(`tg:pending-link:${chatId}`);
  }
}
