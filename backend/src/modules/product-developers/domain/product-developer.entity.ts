import { BaseEntity, type EntityMetadata } from '#core/domain/base.entity.js';
import { ValidationError, type FieldIssue } from '#core/domain/errors/app-error.js';
import { checkEmail, cleanLine } from '#modules/marketplace/domain/lead-rules.js';

export interface ProductDeveloperProps {
  name: string;
  email: string;
  telegramChatId: string | null;
  telegramUsername: string | null;
  active: boolean;
  telegramLinkCodeHash: string | null;
  telegramLinkExpiresAt: Date | null;
  telegramLinkedAt: Date | null;
}

/**
 * What staff edit. The Telegram username tells the bot who may sign in by
 * tapping Start; the chat itself is linked only by the bot (see `linkTelegram`).
 */
export interface ProductDeveloperInput {
  name: string;
  email: string;
  telegramUsername?: string | null;
  active?: boolean;
}

/** Telegram's username rules: 5–32 letters, digits or underscores (stored without "@"). */
const TELEGRAM_USERNAME = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
export const normaliseTelegramUsername = (value: string | null | undefined): string | null => {
  const v = (value ?? '')
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/t\.me\//i, '');
  return v || null;
};

/**
 * A developer who answers customer questions about the products assigned to
 * them. Their Telegram chat is linked by the bot, never typed in by hand:
 * either with a one-time code issued in the staff portal, or by tapping Start
 * from the Telegram username staff entered AND confirming the work e-mail on
 * file (a username alone is never trusted).
 */
export class ProductDeveloper extends BaseEntity {
  private constructor(
    meta: EntityMetadata,
    private props: ProductDeveloperProps,
  ) {
    super(meta);
  }

  static create(input: ProductDeveloperInput, actorId: string | null): ProductDeveloper {
    const entity = new ProductDeveloper(BaseEntity.newMetadata(actorId), {
      ...ProductDeveloper.validate(input),
      telegramChatId: null,
      telegramLinkCodeHash: null,
      telegramLinkExpiresAt: null,
      telegramLinkedAt: null,
    });
    entity.addEvent('product-developer.created', { id: entity.id });
    return entity;
  }

  static reconstitute(meta: EntityMetadata, props: ProductDeveloperProps): ProductDeveloper {
    return new ProductDeveloper(meta, props);
  }

  static validate(
    input: ProductDeveloperInput,
  ): Pick<ProductDeveloperProps, 'name' | 'email' | 'active' | 'telegramUsername'> {
    const issues: FieldIssue[] = [];
    const name = cleanLine(input.name, 120);
    if (!name) issues.push({ field: 'name', message: 'Name is required' });
    const email = cleanLine(input.email, 160).toLowerCase();
    checkEmail(issues, 'email', email);
    const telegramUsername = normaliseTelegramUsername(input.telegramUsername);
    if (telegramUsername && !TELEGRAM_USERNAME.test(telegramUsername))
      issues.push({
        field: 'telegramUsername',
        message: 'Use the Telegram username: 5–32 letters, digits or _, e.g. abebe_dev',
      });
    if (issues.length) throw new ValidationError(issues);
    return { name, email, telegramUsername, active: input.active ?? true };
  }

  get name(): string {
    return this.props.name;
  }
  get email(): string {
    return this.props.email;
  }
  get active(): boolean {
    return this.props.active;
  }
  get telegramChatId(): string | null {
    return this.props.telegramChatId;
  }
  get telegramUsername(): string | null {
    return this.props.telegramUsername;
  }
  get telegramLinkedAt(): Date | null {
    return this.props.telegramLinkedAt;
  }
  get telegramLinkCodeHash(): string | null {
    return this.props.telegramLinkCodeHash;
  }
  get telegramLinkExpiresAt(): Date | null {
    return this.props.telegramLinkExpiresAt;
  }
  /** Notifications can reach this developer on Telegram. */
  get reachableOnTelegram(): boolean {
    return this.props.active && !!this.props.telegramChatId;
  }

  update(changes: Partial<ProductDeveloperInput>, actorId: string | null): void {
    const defined = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
    this.props = {
      ...this.props,
      ...ProductDeveloper.validate({ ...this.props, ...defined }),
    };
    this.touch(actorId);
  }

  /** Starts linking: the hash of a one-time code the developer will send to the bot. */
  issueLinkCode(codeHash: string, expiresAt: Date, actorId: string | null): void {
    this.props = {
      ...this.props,
      telegramLinkCodeHash: codeHash,
      telegramLinkExpiresAt: expiresAt,
    };
    this.touch(actorId);
  }

  /** Completes linking (called by the bot with the chat Telegram itself reported). */
  linkTelegram(chatId: string, username: string | null, now = new Date()): void {
    this.props = {
      ...this.props,
      telegramChatId: chatId,
      telegramUsername: username ?? this.props.telegramUsername,
      telegramLinkedAt: now,
      telegramLinkCodeHash: null,
      telegramLinkExpiresAt: null,
    };
    this.touch(null);
  }

  /** Disconnects the chat; the staff-entered username stays, so the developer can sign in again. */
  unlinkTelegram(actorId: string | null): void {
    this.props = {
      ...this.props,
      telegramChatId: null,
      telegramLinkedAt: null,
      telegramLinkCodeHash: null,
      telegramLinkExpiresAt: null,
    };
    this.touch(actorId);
  }

  toSnapshot(): Readonly<ProductDeveloperProps> {
    return { ...this.props };
  }
}
