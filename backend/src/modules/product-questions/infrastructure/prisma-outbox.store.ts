import { Injectable } from '@nestjs/common';
import { PrismaService } from '#core/infrastructure/prisma/prisma.service.js';
import type { Prisma } from '#generated/prisma/client.js';
import type {
  ClaimedMessage,
  DeliveryRecord,
  OutboundPayload,
  OutboxStore,
} from '../application/messaging.ports.js';

/** The outbox in PostgreSQL (outbound_messages). */
@Injectable()
export class PrismaOutboxStore implements OutboxStore {
  constructor(private readonly prisma: PrismaService) {}

  async insertIfAbsent(
    dedupeKey: string,
    payload: OutboundPayload,
    resource?: { type: string; id: string },
  ): Promise<string | null> {
    // Inside the caller's transaction (prisma.db), so the message exists only if the change does.
    const existing = await this.prisma.db.outboundMessage.findUnique({
      where: { dedupeKey },
      select: { id: true },
    });
    if (existing) return null;
    const row = await this.prisma.db.outboundMessage.create({
      data: {
        channel: payload.channel,
        dedupeKey,
        payload: payload as unknown as Prisma.InputJsonValue,
        resourceType: resource?.type ?? null,
        resourceId: resource?.id ?? null,
      },
      select: { id: true },
    });
    return row.id;
  }

  async recoverStuck(olderThan: Date): Promise<void> {
    await this.prisma.client.outboundMessage.updateMany({
      where: { status: 'sending', nextAttemptAt: { lt: olderThan } },
      data: { status: 'pending' },
    });
  }

  async due(limit: number): Promise<string[]> {
    const rows = await this.prisma.client.outboundMessage.findMany({
      where: { status: 'pending', nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async claim(id: string): Promise<ClaimedMessage | null> {
    const db = this.prisma.client;
    // Conditional update: only one worker can move a message from pending to sending.
    const claimed = await db.outboundMessage.updateMany({
      where: { id, status: 'pending', nextAttemptAt: { lte: new Date() } },
      data: { status: 'sending', attempts: { increment: 1 }, nextAttemptAt: new Date() },
    });
    if (claimed.count !== 1) return null;
    const row = await db.outboundMessage.findUniqueOrThrow({ where: { id } });
    return {
      id: row.id,
      channel: row.channel as ClaimedMessage['channel'],
      payload: row.payload as unknown as OutboundPayload,
      attempts: row.attempts,
    };
  }

  async markSent(id: string): Promise<void> {
    await this.prisma.client.outboundMessage.update({
      where: { id },
      data: { status: 'sent', sentAt: new Date(), lastError: null },
    });
  }

  async markRetry(id: string, error: string, nextAttemptAt: Date): Promise<void> {
    await this.prisma.client.outboundMessage.update({
      where: { id },
      data: { status: 'pending', lastError: error.slice(0, 1000), nextAttemptAt },
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.prisma.client.outboundMessage.update({
      where: { id },
      data: { status: 'failed', lastError: error.slice(0, 1000) },
    });
  }

  deliveries(resourceType: string, resourceId: string): Promise<DeliveryRecord[]> {
    return this.prisma.client.outboundMessage.findMany({
      where: { resourceType, resourceId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        channel: true,
        status: true,
        attempts: true,
        lastError: true,
        dedupeKey: true,
        createdAt: true,
        sentAt: true,
      },
    });
  }
}
