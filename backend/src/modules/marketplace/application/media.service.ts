import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { NotFoundError, ValidationError } from '#core/domain/errors/app-error.js';
import { MEDIA_STORE, type MediaStore } from './marketplace.ports.js';

const SIGNATURES: { type: string; test: (b: Buffer) => boolean }[] = [
  {
    type: 'image/png',
    test: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: 'image/webp',
    test: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  { type: 'image/avif', test: (b) => b.subarray(4, 12).toString('latin1') === 'ftypavif' },
];

/** The content type of an image, from its bytes (never from the client's claim). */
export function sniffImageType(bytes: Buffer): string | null {
  return SIGNATURES.find((s) => s.test(bytes))?.type ?? null;
}

export interface StoredMedia {
  id: string;
  url: string;
  contentType: string;
  size: number;
}

/**
 * Product images uploaded by staff and served publicly. The content type is
 * sniffed from the bytes, so only PNG / JPEG / WebP / AVIF are accepted;
 * identical uploads are de-duplicated by checksum.
 */
@Injectable()
export class MarketplaceMediaService {
  constructor(
    @Inject(MEDIA_STORE) private readonly store: MediaStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async upload(dataBase64: string, actorId: string): Promise<StoredMedia> {
    const bytes = Buffer.from(dataBase64, 'base64');
    const max = this.config.marketplace.mediaMaxBytes;
    if (!bytes.length) throw new ValidationError([{ field: 'data', message: 'The file is empty' }]);
    if (bytes.length > max) {
      throw new ValidationError([
        { field: 'data', message: `Images must be ${Math.floor(max / 1000)} KB or smaller` },
      ]);
    }
    const contentType = sniffImageType(bytes);
    if (!contentType)
      throw new ValidationError([
        { field: 'data', message: 'Upload a PNG, JPEG, WebP or AVIF image' },
      ]);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const record =
      (await this.store.findByChecksum(checksum, bytes.length)) ??
      (await this.store.create(
        { contentType, size: bytes.length, checksum, data: bytes },
        actorId,
      ));
    return {
      id: record.id,
      url: `/api/marketplace/media/${record.id}`,
      contentType,
      size: bytes.length,
    };
  }

  async read(id: string): Promise<{ contentType: string; data: string; checksum: string }> {
    const media = await this.store.get(id);
    if (!media) throw new NotFoundError('Media', id);
    return {
      contentType: media.contentType,
      data: Buffer.from(media.data).toString('base64'),
      checksum: media.checksum,
    };
  }
}
