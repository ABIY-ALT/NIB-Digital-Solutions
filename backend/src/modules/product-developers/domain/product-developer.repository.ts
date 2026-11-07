import type { Repository } from '#core/domain/repository.js';
import type { ProductDeveloper } from './product-developer.entity.js';

export interface ProductDeveloperRepository extends Repository<ProductDeveloper> {
  /** The developer whose Telegram chat this is (linked through the bot). */
  findByChatId(chatId: string): Promise<ProductDeveloper | null>;
  /** The developer a pending one-time link code belongs to. */
  findByLinkCodeHash(codeHash: string): Promise<ProductDeveloper | null>;
  findByIds(ids: readonly string[]): Promise<ProductDeveloper[]>;
  /** The developer staff registered with this Telegram username (case-insensitive). */
  findByTelegramUsername(username: string): Promise<ProductDeveloper | null>;
  /** Active developers (the product editor's choices). */
  findAllActive(): Promise<ProductDeveloper[]>;
}

export const PRODUCT_DEVELOPER_REPOSITORY = Symbol('ProductDeveloperRepository');
