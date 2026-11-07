import { Injectable } from '@nestjs/common';
import type {
  TransactionManager,
  TransactionOptions,
} from '#core/application/ports/transaction.port.js';
import { translatePrismaError } from './prisma-errors.js';
import { PrismaService } from './prisma.service.js';

/** TransactionManager backed by Prisma interactive transactions. */
@Injectable()
export class PrismaTransactionManager implements TransactionManager {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(work: () => Promise<T>, options?: TransactionOptions): Promise<T> {
    try {
      return await this.prisma.transaction(work, options);
    } catch (error) {
      throw translatePrismaError(error);
    }
  }
}
