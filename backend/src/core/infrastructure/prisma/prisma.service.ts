import { AsyncLocalStorage } from 'node:async_hooks';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '#generated/prisma/client.js';
import type { TransactionOptions } from '#core/application/ports/transaction.port.js';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';

export type DbClient = Prisma.TransactionClient;

/**
 * Owns the PrismaClient (pg driver adapter, Prisma 7+) and provides an ambient
 * transaction mechanism: code running inside `transaction()` automatically gets
 * the transactional client from `db`, so repositories never pass a handle around.
 *
 * Composition, not inheritance: Prisma 7 returns a Proxy from its constructor,
 * so subclass accessors would not see the model delegates.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly txStorage = new AsyncLocalStorage<DbClient>();
  /** Root client — bypasses any ambient transaction (e.g. for audit writes). */
  readonly client: PrismaClient;
  private readonly transactionTimeoutMs: number;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.transactionTimeoutMs = config.database.transactionTimeoutMs;
    this.client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: config.database.url,
        max: config.database.poolMax,
      }),
    });
  }

  /** Active transactional client if inside a transaction, otherwise the root client. */
  get db(): DbClient {
    return this.txStorage.getStore() ?? this.client;
  }

  get inTransaction(): boolean {
    return this.txStorage.getStore() !== undefined;
  }

  async transaction<T>(work: () => Promise<T>, options: TransactionOptions = {}): Promise<T> {
    // Nested calls join the outer transaction.
    if (this.inTransaction) return work();
    return this.client.$transaction((tx) => this.txStorage.run(tx, work), {
      isolationLevel: options.isolationLevel
        ? Prisma.TransactionIsolationLevel[options.isolationLevel]
        : undefined,
      timeout: options.timeoutMs ?? this.transactionTimeoutMs,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
