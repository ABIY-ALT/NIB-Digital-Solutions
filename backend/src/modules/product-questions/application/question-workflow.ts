import { createHmac } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import {
  SETTINGS,
  type SettingDefinition,
  type Settings,
} from '#core/application/ports/settings.port.js';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#core/application/ports/transaction.port.js';
import type { Principal } from '#core/application/security/principal.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '#core/domain/errors/app-error.js';
import type { DigitalProduct } from '#modules/digital-products/domain/digital-product.entity.js';
import {
  DIGITAL_PRODUCT_REPOSITORY,
  type DigitalProductRepository,
} from '#modules/digital-products/domain/digital-product.repository.js';
import { makeReference } from '#modules/marketplace/domain/lead-rules.js';
import { tokenHash, tokenMatches } from '#modules/marketplace/application/visitor-privacy.js';
import type { ProductDeveloper } from '#modules/product-developers/domain/product-developer.entity.js';
import {
  PRODUCT_DEVELOPER_REPOSITORY,
  type ProductDeveloperRepository,
} from '#modules/product-developers/domain/product-developer.repository.js';
import {
  cleanMessage,
  ProductQuestion,
  type MessageAuthor,
  type QuestionMessage,
} from '../domain/product-question.entity.js';
import {
  PRODUCT_QUESTION_REPOSITORY,
  type ProductQuestionRepository,
} from '../domain/product-question.repository.js';
import { OutboxService } from './outbox.service.js';
import {
  customerAcknowledgement,
  customerReply,
  developerEmail,
  developerNotification,
  type MessageContext,
} from './question-messages.js';

/** Defaults of the limits below (Settings → Ask the developer). */
export const MAX_QUESTIONS_PER_EMAIL_PER_DAY = 5;
export const MAX_QUESTIONS_PER_NETWORK_PER_DAY = 15;
export const MAX_QUESTIONS_PER_WINDOW = 5;
export const QUESTION_WINDOW_MINUTES = 10;
const DAY = 86_400_000;

/**
 * How many questions a visitor may ask, changed by administrators in
 * Settings → Ask the developer. A "network" is one IP address: people in the
 * same office share it.
 */
export const QUESTION_LIMIT_SETTINGS: readonly SettingDefinition[] = [
  {
    key: 'questions.windowLimit',
    group: 'questions',
    type: 'number',
    label: 'Questions per time window',
    description: 'How many questions one network may ask within the time window below.',
    default: MAX_QUESTIONS_PER_WINDOW,
    required: true,
    min: 1,
    max: 1000,
  },
  {
    key: 'questions.windowMinutes',
    group: 'questions',
    type: 'number',
    label: 'Time window (minutes)',
    description: 'Length of the time window for the limit above.',
    default: QUESTION_WINDOW_MINUTES,
    required: true,
    min: 1,
    max: 1440,
  },
  {
    key: 'questions.dailyLimitPerEmail',
    group: 'questions',
    type: 'number',
    label: 'Questions per e-mail address per day',
    default: MAX_QUESTIONS_PER_EMAIL_PER_DAY,
    required: true,
    min: 1,
    max: 1000,
  },
  {
    key: 'questions.dailyLimitPerNetwork',
    group: 'questions',
    type: 'number',
    label: 'Questions per network per day',
    description: 'Everyone on one office network shares this limit.',
    default: MAX_QUESTIONS_PER_NETWORK_PER_DAY,
    required: true,
    min: 1,
    max: 10000,
  },
];

interface QuestionLimits {
  windowLimit: number;
  windowMinutes: number;
  dailyPerEmail: number;
  dailyPerNetwork: number;
}

export interface Conversation {
  question: ProductQuestion;
  productName: string;
  messages: QuestionMessage[];
}

/**
 * The "Ask the developer" workflow: questions, follow-ups and answers, who is
 * notified and how. Every notification and e-mail goes through the outbox in
 * the same transaction as the change, so nothing is lost or sent twice.
 */
@Injectable()
export class QuestionWorkflow implements OnModuleInit {
  private readonly logger = new Logger(QuestionWorkflow.name);

  constructor(
    @Inject(PRODUCT_QUESTION_REPOSITORY) private readonly questions: ProductQuestionRepository,
    @Inject(DIGITAL_PRODUCT_REPOSITORY) private readonly products: DigitalProductRepository,
    @Inject(PRODUCT_DEVELOPER_REPOSITORY) private readonly developers: ProductDeveloperRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly outbox: OutboxService,
    @Inject(SETTINGS) private readonly settings: Settings,
  ) {}

  onModuleInit(): void {
    this.settings.define(QUESTION_LIMIT_SETTINGS);
  }

  /** The current limits (Settings → Ask the developer); a missing value keeps its default. */
  private async limits(): Promise<QuestionLimits> {
    const values = await this.settings.all();
    const limit = (key: string, fallback: number): number => {
      const value = values[key];
      return typeof value === 'number' && value >= 1 ? value : fallback;
    };
    return {
      windowLimit: limit('questions.windowLimit', MAX_QUESTIONS_PER_WINDOW),
      windowMinutes: limit('questions.windowMinutes', QUESTION_WINDOW_MINUTES),
      dailyPerEmail: limit('questions.dailyLimitPerEmail', MAX_QUESTIONS_PER_EMAIL_PER_DAY),
      dailyPerNetwork: limit('questions.dailyLimitPerNetwork', MAX_QUESTIONS_PER_NETWORK_PER_DAY),
    };
  }

  /** Refuses a new question once the visitor has reached a limit. */
  private async assertWithinLimits(email: string, ipHash: string): Promise<void> {
    const limits = await this.limits();
    const now = Date.now();
    const windowMs = limits.windowMinutes * 60_000;
    if (
      (await this.questions.countRecentFromIp(ipHash, new Date(now - windowMs))) >=
      limits.windowLimit
    ) {
      const questions = `${limits.windowLimit} question${limits.windowLimit === 1 ? '' : 's'}`;
      const minutes = limits.windowMinutes === 1 ? 'minute' : `${limits.windowMinutes} minutes`;
      throw new RateLimitError(
        windowMs / 1000,
        `You can ask up to ${questions} every ${minutes}. Please try again later.`,
      );
    }
    const today = new Date(now - DAY);
    if (
      (await this.questions.countRecentByEmail(email, today)) >= limits.dailyPerEmail ||
      (await this.questions.countRecentFromIp(ipHash, today)) >= limits.dailyPerNetwork
    ) {
      throw new RateLimitError(
        DAY / 1000,
        "You have reached today's limit of questions. Please try again tomorrow.",
      );
    }
  }

  // ── Access to a conversation (customers) ──────────────────────────────────

  /**
   * The private token in the customer's conversation link. Derived from the
   * question id with the server secret, so it can be put in every e-mail
   * without being stored; only its hash is kept for verification.
   */
  accessToken(questionId: string): string {
    return createHmac('sha256', this.config.marketplace.privacySalt)
      .update(`question:${questionId}`)
      .digest('base64url')
      .slice(0, 32);
  }

  conversationUrl(question: ProductQuestion): string {
    return `${this.config.app.publicUrl}/questions/${question.reference}?t=${this.accessToken(question.id)}`;
  }

  /** The reference and token must both match; otherwise the conversation "does not exist". */
  private async authorisedByToken(reference: string, token: string): Promise<ProductQuestion> {
    const question = await this.questions.findByReference(reference);
    if (!question || !tokenMatches(token, question.accessTokenHash))
      throw new NotFoundError('ProductQuestion', reference);
    return question;
  }

  private async product(slug: string): Promise<DigitalProduct | null> {
    return this.products.findByUnique('slug', slug);
  }

  private context(question: ProductQuestion, productName: string, body: string): MessageContext {
    return {
      reference: question.reference,
      questionId: question.id,
      productName,
      customerName: question.customerName,
      customerEmail: question.customerEmail,
      body,
      siteUrl: this.config.app.publicUrl,
    };
  }

  /** The developers responsible for a product (up to three), active ones only. */
  private async responsible(product: DigitalProduct | null, question?: ProductQuestion) {
    const ids = [...(product?.developerIds ?? []), question?.developerId].filter(
      (id): id is string => !!id,
    );
    const list = await this.developers.findByIds([...new Set(ids)]);
    return list.filter((d) => d.active);
  }

  /** Queues the developer notifications for a customer message (Telegram, else e-mail). */
  private async notifyDevelopers(
    question: ProductQuestion,
    product: DigitalProduct | null,
    message: QuestionMessage,
    kind: 'new' | 'followup',
  ): Promise<(string | null)[]> {
    const developers = await this.responsible(product, question);
    if (!developers.length)
      this.logger.warn(
        { reference: question.reference },
        'No active developer for this product question',
      );
    const ctx = this.context(question, product?.name ?? question.productSlug, message.body);
    const resource = { type: 'ProductQuestion', id: question.id };
    const ids: (string | null)[] = [];
    for (const developer of developers) {
      ids.push(
        developer.reachableOnTelegram
          ? await this.outbox.enqueue(
              `tg:${message.id}:${developer.id}`,
              {
                channel: 'telegram',
                message: developerNotification(ctx, developer.telegramChatId!, kind),
              },
              resource,
            )
          : await this.outbox.enqueue(
              `mail-dev:${message.id}:${developer.id}`,
              { channel: 'email', draft: developerEmail(ctx, developer, kind) },
              resource,
            ),
      );
    }
    return ids;
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  /** A visitor asks the developer of a published product. */
  async submit(input: {
    productSlug: string;
    customerName: string;
    customerEmail: string;
    question: string;
    ipHash: string;
  }): Promise<{ question: ProductQuestion; conversationUrl: string }> {
    const product = await this.products.findPublishedBySlug(input.productSlug);
    if (!product) throw new NotFoundError('Product', input.productSlug);
    if (!product.developerId || product.supportStatus === 'paused')
      throw new ConflictError('Questions are not available for this product right now.', {
        reason: 'support_unavailable',
      });

    const email = input.customerEmail.trim().toLowerCase();
    await this.assertWithinLimits(email, input.ipHash);

    const draft = ProductQuestion.create(
      {
        reference: makeReference('QST'),
        productSlug: product.slug,
        customerName: input.customerName,
        customerEmail: email,
        question: input.question,
        developerId: product.developerId,
        lastMessageAt: new Date(),
        ipHash: input.ipHash,
      },
      null,
    );

    const { saved, kicks } = await this.tx.run(async () => {
      // The access token hash needs the id, which the entity already has.
      const withToken = ProductQuestion.reconstitute(draft.metadata, {
        ...draft.toSnapshot(),
        accessTokenHash: tokenHash(this.accessToken(draft.id)),
      });
      const saved = await this.questions.save(withToken);
      const message = await this.questions.addMessage(saved.id, {
        author: 'customer',
        authorName: saved.customerName,
        developerId: null,
        channel: 'web',
        body: saved.question,
      });
      const kicks = await this.notifyDevelopers(saved, product, message, 'new');
      kicks.push(
        await this.outbox.enqueue(
          `mail-ack:${saved.id}`,
          {
            channel: 'email',
            draft: customerAcknowledgement(
              this.context(saved, product.name, saved.question),
              this.conversationUrl(saved),
            ),
          },
          { type: 'ProductQuestion', id: saved.id },
        ),
      );
      return { saved, kicks };
    });
    this.outbox.kick(kicks);
    return { question: saved, conversationUrl: this.conversationUrl(saved) };
  }

  /** The customer's view of their conversation (reference + private token). */
  async conversationForCustomer(reference: string, token: string): Promise<Conversation> {
    const question = await this.authorisedByToken(reference, token);
    const product = await this.product(question.productSlug);
    return {
      question,
      productName: product?.name ?? question.productSlug,
      messages: await this.questions.messages(question.id),
    };
  }

  /** The customer adds a message to their conversation. */
  async followUp(reference: string, token: string, body: string): Promise<Conversation> {
    const question = await this.authorisedByToken(reference, token);
    if (question.closed)
      throw new ConflictError('This conversation is closed. Please ask a new question.', {
        reason: 'closed',
      });
    const text = cleanMessage(body);
    if (text.length < 2)
      throw new ValidationError([{ field: 'body', message: 'Write your message' }]);
    const product = await this.product(question.productSlug);
    const kicks = await this.tx.run(async () => {
      const message = await this.questions.addMessage(question.id, {
        author: 'customer',
        authorName: question.customerName,
        developerId: null,
        channel: 'web',
        body: text,
      });
      question.recordMessage('customer', message.createdAt, null);
      await this.questions.update(question);
      return this.notifyDevelopers(question, product, message, 'followup');
    });
    this.outbox.kick(kicks);
    return this.conversationForCustomer(reference, token);
  }

  // ── Developers (Telegram) and staff (portal) ───────────────────────────────

  /**
   * Whether this developer may act on this question: they must be active and be
   * one of the product's developers (or the one the question was routed to).
   */
  async authoriseDeveloper(
    developer: ProductDeveloper,
    questionId: string,
  ): Promise<ProductQuestion> {
    const question = await this.questions.findById(questionId);
    if (!question) throw new NotFoundError('ProductQuestion', questionId);
    const product = await this.product(question.productSlug);
    const allowed = (await this.responsible(product, question)).some((d) => d.id === developer.id);
    if (!developer.active || !allowed)
      throw new ForbiddenError('You are not assigned to this product.');
    return question;
  }

  /** An answer from a developer (Telegram) or a staff member (portal): saved and e-mailed. */
  async answer(
    questionId: string,
    body: string,
    author: {
      kind: Exclude<MessageAuthor, 'customer'>;
      name: string;
      developerId: string | null;
      channel: 'telegram' | 'portal';
      actorId: string | null;
    },
  ): Promise<{ question: ProductQuestion; message: QuestionMessage }> {
    const text = cleanMessage(body);
    if (text.length < 2)
      throw new ValidationError([{ field: 'body', message: 'Write your answer' }]);
    const result = await this.tx.run(async () => {
      const question = await this.questions.getById(questionId);
      if (question.closed)
        throw new ConflictError('This conversation is closed.', { reason: 'closed' });
      const product = await this.product(question.productSlug);
      const history = await this.questions.messages(question.id);
      const lastCustomer = [...history].reverse().find((m) => m.author === 'customer');
      const message = await this.questions.addMessage(question.id, {
        author: author.kind,
        authorName: author.name,
        developerId: author.developerId,
        channel: author.channel,
        body: text,
      });
      question.recordMessage(author.kind, message.createdAt, author.actorId);
      const saved = await this.questions.update(question);
      const kick = await this.outbox.enqueue(
        `mail-reply:${message.id}`,
        {
          channel: 'email',
          draft: customerReply(
            this.context(saved, product?.name ?? saved.productSlug, text),
            lastCustomer?.body ?? saved.question,
            this.conversationUrl(saved),
          ),
        },
        { type: 'ProductQuestion', id: saved.id },
      );
      return { question: saved, message, kick };
    });
    this.outbox.kick([result.kick]);
    return { question: result.question, message: result.message };
  }

  async setStatus(
    questionId: string,
    status: string,
    actorId: string | null,
  ): Promise<ProductQuestion> {
    return this.tx.run(async () => {
      const question = await this.questions.getById(questionId);
      question.setStatus(status, actorId);
      return this.questions.update(question);
    });
  }

  /** Staff view: the conversation and the delivery state of every notification and e-mail. */
  async conversationForStaff(questionId: string) {
    const question = await this.questions.getById(questionId);
    const product = await this.product(question.productSlug);
    const [messages, deliveries, developers] = await Promise.all([
      this.questions.messages(question.id),
      this.outbox.deliveries('ProductQuestion', question.id),
      this.responsible(product, question),
    ]);
    return {
      question,
      productName: product?.name ?? question.productSlug,
      messages,
      deliveries,
      developers: developers.map((d) => ({
        id: d.id,
        name: d.name,
        telegramLinked: d.reachableOnTelegram,
      })),
    };
  }

  /** Staff answer from the portal (name of the signed-in user). */
  staffAnswer(principal: Principal, questionId: string, body: string) {
    return this.answer(questionId, body, {
      kind: 'staff',
      name: principal.username,
      developerId: null,
      channel: 'portal',
      actorId: principal.userId,
    });
  }
}
