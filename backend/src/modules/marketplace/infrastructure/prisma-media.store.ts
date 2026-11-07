import { Injectable } from '@nestjs/common';
import { PrismaService } from '#core/infrastructure/prisma/prisma.service.js';
import type { MediaRecord, MediaStore } from '../application/marketplace.ports.js';

/** Product images in PostgreSQL (backed up with the data, works with any number of instances). */
@Injectable()
export class PrismaMediaStore implements MediaStore {
  constructor(private readonly prisma: PrismaService) {}

  findByChecksum(checksum: string, size: number): Promise<{ id: string } | null> {
    return this.prisma.client.marketplaceMedia.findFirst({
      where: { checksum, size },
      select: { id: true },
    });
  }

  create(media: Omit<MediaRecord, 'id'>, actorId: string): Promise<{ id: string }> {
    return this.prisma.client.marketplaceMedia.create({
      data: {
        contentType: media.contentType,
        size: media.size,
        checksum: media.checksum,
        data: Buffer.from(media.data),
        createdBy: actorId,
      },
      select: { id: true },
    });
  }

  get(id: string): Promise<MediaRecord | null> {
    return this.prisma.client.marketplaceMedia.findUnique({
      where: { id },
      select: { id: true, contentType: true, size: true, checksum: true, data: true },
    });
  }
}
