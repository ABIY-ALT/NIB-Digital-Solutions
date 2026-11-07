import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#core/application/ports/transaction.port.js';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import { ConcurrencyError, ConflictError } from '#core/domain/errors/app-error.js';
import type { Page, PageRequest } from '#core/domain/pagination.js';
import {
  ProductDeveloper,
  type ProductDeveloperInput,
} from '../domain/product-developer.entity.js';
import {
  PRODUCT_DEVELOPER_REPOSITORY,
  type ProductDeveloperRepository,
} from '../domain/product-developer.repository.js';

/** A Telegram username identifies one developer (the bot signs them in by it). */
async function assertUsernameFree(
  repo: ProductDeveloperRepository,
  entity: ProductDeveloper,
): Promise<void> {
  if (!entity.telegramUsername) return;
  const other = await repo.findByTelegramUsername(entity.telegramUsername);
  if (other && other.id !== entity.id)
    throw new ConflictError(
      `@${entity.telegramUsername} is already registered for ${other.name}.`,
      { field: 'telegramUsername' },
    );
}

/** Product developers: one use case per operation (generated). */

@Injectable()
export class ListProductDevelopersUseCase implements UseCase<PageRequest, Page<ProductDeveloper>> {
  constructor(
    @Inject(PRODUCT_DEVELOPER_REPOSITORY) private readonly repo: ProductDeveloperRepository,
  ) {}

  execute(request: PageRequest): Promise<Page<ProductDeveloper>> {
    return this.repo.findPage(request);
  }
}

@Injectable()
export class GetProductDeveloperUseCase implements UseCase<string, ProductDeveloper> {
  constructor(
    @Inject(PRODUCT_DEVELOPER_REPOSITORY) private readonly repo: ProductDeveloperRepository,
  ) {}

  execute(id: string): Promise<ProductDeveloper> {
    return this.repo.getById(id);
  }
}

export interface CreateProductDeveloperCommand extends ProductDeveloperInput {
  principal: Principal;
}

@Injectable()
export class CreateProductDeveloperUseCase implements UseCase<
  CreateProductDeveloperCommand,
  ProductDeveloper
> {
  constructor(
    @Inject(PRODUCT_DEVELOPER_REPOSITORY) private readonly repo: ProductDeveloperRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  /** Validates without saving (used by the maker–checker preview). */
  async draft({ principal, ...input }: CreateProductDeveloperCommand): Promise<ProductDeveloper> {
    const entity = ProductDeveloper.create(input, principal.userId);
    await assertUsernameFree(this.repo, entity);
    return entity;
  }

  execute(command: CreateProductDeveloperCommand): Promise<ProductDeveloper> {
    return this.tx.run(async () => this.repo.save(await this.draft(command)));
  }
}

export interface UpdateProductDeveloperCommand extends Partial<ProductDeveloperInput> {
  principal: Principal;
  id: string;
  version: number;
}

@Injectable()
export class UpdateProductDeveloperUseCase implements UseCase<
  UpdateProductDeveloperCommand,
  ProductDeveloper
> {
  constructor(
    @Inject(PRODUCT_DEVELOPER_REPOSITORY) private readonly repo: ProductDeveloperRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  /** Loads the record and applies the change in memory (validation only). */
  async apply({
    principal,
    id,
    version,
    ...input
  }: UpdateProductDeveloperCommand): Promise<ProductDeveloper> {
    const entity = await this.repo.getById(id);
    if (!entity.assertVersion(version)) throw new ConcurrencyError('ProductDeveloper', id, version);

    entity.update(input, principal.userId);
    await assertUsernameFree(this.repo, entity);
    return entity;
  }

  execute(command: UpdateProductDeveloperCommand): Promise<ProductDeveloper> {
    return this.tx.run(async () => this.repo.update(await this.apply(command)));
  }
}

@Injectable()
export class DeleteProductDeveloperUseCase implements UseCase<
  { principal: Principal; id: string },
  ProductDeveloper
> {
  constructor(
    @Inject(PRODUCT_DEVELOPER_REPOSITORY) private readonly repo: ProductDeveloperRepository,
  ) {}

  async execute({
    principal,
    id,
  }: {
    principal: Principal;
    id: string;
  }): Promise<ProductDeveloper> {
    return this.repo.softDelete(await this.repo.getById(id), principal.userId);
  }
}

// ── Telegram linking and the product editor's choices (hand-written) ──────────

/** How long a one-time Telegram link code stays valid. */
export const LINK_CODE_TTL_MS = 30 * 60_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface TelegramLinkCode {
  /** Shown once to the staff member; only its hash is stored. */
  code: string;
  /** https://t.me/<bot>?start=<code> when the bot username is configured. */
  deepLink: string | null;
  expiresAt: Date;
}

/**
 * Issues a one-time code the developer sends to the bot ("/start CODE", or by
 * opening the deep link). The bot then links the chat Telegram reports, so the
 * chat id is never typed in and a username is never trusted on its own.
 */
@Injectable()
export class IssueTelegramLinkCodeUseCase {
  constructor(
    @Inject(PRODUCT_DEVELOPER_REPOSITORY) private readonly repo: ProductDeveloperRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async execute({
    principal,
    id,
  }: {
    principal: Principal;
    id: string;
  }): Promise<TelegramLinkCode> {
    const developer = await this.repo.getById(id);
    const bytes = randomBytes(10);
    const code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
    developer.issueLinkCode(linkCodeHash(code), expiresAt, principal.userId);
    await this.repo.update(developer);
    const bot = this.config.telegram.botUsername;
    return { code, deepLink: bot ? `https://t.me/${bot}?start=${code}` : null, expiresAt };
  }
}

export const linkCodeHash = (code: string) =>
  createHash('sha256').update(`telegram-link:${code.trim().toUpperCase()}`).digest('hex');

@Injectable()
export class UnlinkTelegramUseCase {
  constructor(
    @Inject(PRODUCT_DEVELOPER_REPOSITORY) private readonly repo: ProductDeveloperRepository,
  ) {}

  async execute({
    principal,
    id,
  }: {
    principal: Principal;
    id: string;
  }): Promise<ProductDeveloper> {
    const developer = await this.repo.getById(id);
    developer.unlinkTelegram(principal.userId);
    return this.repo.update(developer);
  }
}

/** Active developers for the product editor (id and name only). */
@Injectable()
export class ListDeveloperOptionsUseCase {
  constructor(
    @Inject(PRODUCT_DEVELOPER_REPOSITORY) private readonly repo: ProductDeveloperRepository,
  ) {}

  execute(): Promise<ProductDeveloper[]> {
    return this.repo.findAllActive();
  }
}
