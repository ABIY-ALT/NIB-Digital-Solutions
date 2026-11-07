import { Injectable } from '@nestjs/common';
import type { SettingValue } from '#core/application/ports/settings.port.js';
import { PrismaService } from '#core/infrastructure/prisma/prisma.service.js';
import type { SettingStore, StoredSetting } from '../application/settings.service.js';

@Injectable()
export class PrismaSettingStore implements SettingStore {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<StoredSetting[]> {
    const rows = await this.prisma.db.setting.findMany();
    return rows.map((row) => ({
      key: row.key,
      value: row.value as SettingValue,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    }));
  }

  async save(
    values: Record<string, SettingValue>,
    remove: readonly string[],
    actorId: string | null,
  ): Promise<void> {
    await this.prisma.transaction(async () => {
      for (const [key, value] of Object.entries(values)) {
        // null is never stored: it means "back to the default" (the row is removed).
        if (value === null) continue;
        await this.prisma.db.setting.upsert({
          where: { key },
          create: { key, value, updatedBy: actorId },
          update: { value, updatedBy: actorId },
        });
      }
      if (remove.length) {
        await this.prisma.db.setting.deleteMany({ where: { key: { in: [...remove] } } });
      }
    });
  }
}
