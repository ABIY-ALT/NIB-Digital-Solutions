import type { ApiSchemas } from '@/shared/api';

/** Product developer as returned by the API (shared contract, generated from the backend). */
export type ProductDeveloper = ApiSchemas['ProductDeveloper'];

/** Create / update body (dates as ISO strings). */
export interface ProductDeveloperInput {
  name?: string;
  email?: string;
  /** Without "@"; the developer signs in to the bot from this Telegram account. */
  telegramUsername?: string | null;
  active?: boolean;
  version?: number;
}

/** Active developer for the product editor. */
export type DeveloperOption = ApiSchemas['DeveloperOption'];
/** One-time code (and deep link) that links a developer's Telegram. */
export type TelegramLinkCode = ApiSchemas['TelegramLinkCode'];
