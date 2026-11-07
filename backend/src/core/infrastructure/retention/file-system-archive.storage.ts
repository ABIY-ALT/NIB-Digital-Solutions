import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { once } from 'node:events';
import { Inject, Injectable } from '@nestjs/common';
import type { ArchiveStorage } from '#core/application/ports/retention.port.js';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';

/**
 * Archives purged records as JSON Lines on local disk:
 *   <ARCHIVE_DIR>/<dataset>/<yyyy-mm-dd>_<runId>.jsonl
 *   <ARCHIVE_DIR>/<dataset>/<yyyy-mm-dd>_<runId>.jsonl.sha256   (integrity manifest)
 *
 * Production deployments bind ARCHIVE_STORAGE to WORM object storage
 * (e.g. S3 Object Lock) — the retention policies do not change.
 */
@Injectable()
export class FileSystemArchiveStorage implements ArchiveStorage {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async open(dataset: string, runId: string) {
    const root = resolve(this.config.retention.archiveDir);
    const dir = join(root, dataset.replace(/[^a-z0-9-]/gi, '_'));
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${new Date().toISOString().slice(0, 10)}_${runId}.jsonl`);
    const stream = createWriteStream(file, { flags: 'a', encoding: 'utf8' });
    const hash = createHash('sha256');
    let count = 0;

    return {
      async write(records: readonly Record<string, unknown>[]): Promise<void> {
        for (const record of records) {
          const line = `${JSON.stringify(record, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))}\n`;
          hash.update(line);
          count += 1;
          if (!stream.write(line)) await once(stream, 'drain');
        }
      },
      async close(): Promise<string> {
        stream.end();
        await once(stream, 'finish');
        await writeFile(`${file}.sha256`, `${hash.digest('hex')}  ${count} records\n`);
        return relative(process.cwd(), file).replaceAll('\\', '/');
      },
    };
  }
}
