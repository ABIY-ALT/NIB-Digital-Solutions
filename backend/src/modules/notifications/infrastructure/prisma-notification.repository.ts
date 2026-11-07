import { Injectable } from '@nestjs/common';
import type { Notification, Prisma } from '#generated/prisma/client.js';
import type { NotificationDraft } from '#core/application/ports/notifier.port.js';
import { createPage, type Page } from '#core/domain/pagination.js';
import { PrismaService } from '#core/infrastructure/prisma/prisma.service.js';
import type {
  NotificationCounts,
  NotificationQuery,
  NotificationRepository,
  NotificationTarget,
} from '../application/notification.ports.js';
import type {
  ChannelChoice,
  NotificationAction,
  NotificationFolder,
  NotificationRecord,
} from '../domain/notification.js';

const toRecord = (n: Notification): NotificationRecord => ({
  id: n.id,
  createdAt: n.createdAt,
  recipientId: n.recipientId,
  category: n.category,
  severity: n.severity,
  template: n.template,
  params: (n.params as Record<string, string | number | null> | null) ?? null,
  title: n.title,
  body: n.body,
  link: n.link,
  senderName: n.senderName,
  threadKey: n.threadKey,
  readAt: n.readAt,
  starredAt: n.starredAt,
  archivedAt: n.archivedAt,
  deletedAt: n.deletedAt,
});

function folderWhere(folder: NotificationFolder): Prisma.NotificationWhereInput {
  switch (folder) {
    case 'inbox':
      return { deletedAt: null, archivedAt: null };
    case 'unread':
      return { deletedAt: null, archivedAt: null, readAt: null };
    case 'starred':
      return { deletedAt: null, starredAt: { not: null } };
    case 'archived':
      return { deletedAt: null, archivedAt: { not: null } };
    case 'trash':
      return { deletedAt: { not: null } };
    default:
      return { deletedAt: null };
  }
}

/** Every query is scoped to the recipient: users only ever see their own messages. */
@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.db;
  }

  async createMany(recipientIds: readonly string[], draft: NotificationDraft): Promise<number> {
    if (recipientIds.length === 0) return 0;
    const result = await this.db.notification.createMany({
      data: recipientIds.map((recipientId) => ({
        recipientId,
        category: draft.category,
        severity: draft.severity ?? 'INFO',
        template: draft.template,
        params: draft.params ?? undefined,
        title: draft.title.slice(0, 200),
        body: draft.body.slice(0, 2000),
        link: draft.link ?? null,
        senderName: draft.senderName ?? null,
        threadKey: draft.threadKey ?? null,
      })),
    });
    return result.count;
  }

  private where(recipientId: string, query: Omit<NotificationQuery, 'page' | 'pageSize'>) {
    const and: Prisma.NotificationWhereInput[] = [{ recipientId }, folderWhere(query.folder)];
    if (query.category) and.push({ category: query.category });
    if (query.search) {
      and.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { body: { contains: query.search, mode: 'insensitive' } },
          { senderName: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    return { AND: and } satisfies Prisma.NotificationWhereInput;
  }

  async findPage(recipientId: string, query: NotificationQuery): Promise<Page<NotificationRecord>> {
    const where = this.where(recipientId, query);
    const [rows, total] = await Promise.all([
      this.db.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.notification.count({ where }),
    ]);
    return createPage(rows.map(toRecord), total, query);
  }

  async findOne(recipientId: string, id: string): Promise<NotificationRecord | null> {
    const row = await this.db.notification.findFirst({ where: { id, recipientId } });
    return row ? toRecord(row) : null;
  }

  async counts(recipientId: string): Promise<NotificationCounts> {
    const count = (folder: NotificationFolder) =>
      this.db.notification.count({ where: { recipientId, ...folderWhere(folder) } });
    const [inbox, unread, starred, archived, trash, grouped, groupedUnread] = await Promise.all([
      count('inbox'),
      count('unread'),
      count('starred'),
      count('archived'),
      count('trash'),
      this.db.notification.groupBy({
        by: ['category'],
        where: { recipientId, ...folderWhere('inbox') },
        _count: { _all: true },
      }),
      this.db.notification.groupBy({
        by: ['category'],
        where: { recipientId, ...folderWhere('unread') },
        _count: { _all: true },
      }),
    ]);
    const categories: NotificationCounts['categories'] = {};
    for (const g of grouped) categories[g.category] = { total: g._count._all, unread: 0 };
    for (const g of groupedUnread) {
      categories[g.category] = { total: categories[g.category]?.total ?? 0, unread: g._count._all };
    }
    return { inbox, unread, starred, archived, trash, categories };
  }

  async latest(recipientId: string, limit: number): Promise<NotificationRecord[]> {
    const rows = await this.db.notification.findMany({
      where: { recipientId, ...folderWhere('inbox') },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map(toRecord);
  }

  async apply(
    recipientId: string,
    target: NotificationTarget,
    action: NotificationAction,
  ): Promise<number> {
    const where: Prisma.NotificationWhereInput =
      'ids' in target
        ? { recipientId, id: { in: target.ids } }
        : this.where(recipientId, { folder: target.folder, category: target.category });
    const now = new Date();
    if (action === 'delete') {
      // Permanent deletion only from the trash (Gmail semantics).
      const r = await this.db.notification.deleteMany({
        where: { AND: [where, { deletedAt: { not: null } }] },
      });
      return r.count;
    }
    const data: Prisma.NotificationUpdateManyMutationInput = {
      read: { readAt: now },
      unread: { readAt: null },
      star: { starredAt: now },
      unstar: { starredAt: null },
      archive: { archivedAt: now },
      unarchive: { archivedAt: null },
      trash: { deletedAt: now },
      restore: { deletedAt: null },
    }[action];
    // Only touch rows whose state actually changes (keeps original timestamps).
    const guard: Prisma.NotificationWhereInput = {
      read: { readAt: null },
      unread: { readAt: { not: null } },
      star: { starredAt: null },
      unstar: { starredAt: { not: null } },
      archive: { archivedAt: null },
      unarchive: { archivedAt: { not: null } },
      trash: { deletedAt: null },
      restore: { deletedAt: { not: null } },
    }[action];
    const r = await this.db.notification.updateMany({ where: { AND: [where, guard] }, data });
    return r.count;
  }

  async preferences(userId: string): Promise<Array<{ category: string } & ChannelChoice>> {
    return this.db.notificationPreference.findMany({
      where: { userId },
      select: { category: true, inApp: true, email: true },
    });
  }

  async savePreferences(
    userId: string,
    prefs: Array<{ category: string } & ChannelChoice>,
  ): Promise<void> {
    await this.prisma.transaction(async () => {
      for (const p of prefs) {
        await this.db.notificationPreference.upsert({
          where: { userId_category: { userId, category: p.category } },
          create: { userId, category: p.category, inApp: p.inApp, email: p.email },
          update: { inApp: p.inApp, email: p.email },
        });
      }
    });
  }

  async choicesFor(
    userIds: readonly string[],
    category: string,
  ): Promise<Map<string, ChannelChoice>> {
    const rows = await this.db.notificationPreference.findMany({
      where: { userId: { in: [...userIds] }, category },
      select: { userId: true, inApp: true, email: true },
    });
    return new Map(rows.map((r) => [r.userId, { inApp: r.inApp, email: r.email }]));
  }

  private expiredWhere(cutoff: Date, trashCutoff: Date): Prisma.NotificationWhereInput {
    return {
      OR: [{ deletedAt: { lt: trashCutoff } }, { createdAt: { lt: cutoff }, starredAt: null }],
    };
  }

  countExpired(cutoff: Date, trashCutoff: Date): Promise<number> {
    return this.db.notification.count({ where: this.expiredWhere(cutoff, trashCutoff) });
  }

  async deleteExpired(cutoff: Date, trashCutoff: Date, batchSize: number): Promise<number> {
    let total = 0;
    for (;;) {
      const batch = await this.db.notification.findMany({
        where: this.expiredWhere(cutoff, trashCutoff),
        select: { id: true },
        take: batchSize,
      });
      if (batch.length === 0) break;
      const r = await this.db.notification.deleteMany({
        where: { id: { in: batch.map((b) => b.id) } },
      });
      total += r.count;
      if (batch.length < batchSize) break;
    }
    return total;
  }
}
