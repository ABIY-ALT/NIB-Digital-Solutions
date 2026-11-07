import { BaseEntity, type EntityMetadata } from '#core/domain/base.entity.js';
import { ValidationError, type FieldIssue } from '#core/domain/errors/app-error.js';
import { checkEmail, cleanLine, cleanText } from '#modules/marketplace/domain/lead-rules.js';

/** Open: waiting for the developer · In progress · Answered · Closed (no more follow-ups). */
export const QUESTION_STATUSES = ['open', 'in_progress', 'answered', 'closed'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const MESSAGE_AUTHORS = ['customer', 'developer', 'staff'] as const;
export type MessageAuthor = (typeof MESSAGE_AUTHORS)[number];
export type MessageChannel = 'web' | 'telegram' | 'portal';

/** Longest single message (question, follow-up or reply). */
export const MAX_MESSAGE_LENGTH = 4000;

export interface QuestionMessage {
  id: string;
  author: MessageAuthor;
  authorName: string;
  developerId: string | null;
  channel: MessageChannel;
  body: string;
  createdAt: Date;
}

export interface ProductQuestionProps {
  reference: string;
  productSlug: string;
  customerName: string;
  customerEmail: string;
  /** The first question (shown in lists); the full thread is in the messages. */
  question: string;
  status: string;
  /** Developer the question was routed to when it was asked. */
  developerId: string | null;
  lastMessageAt: Date | null;
  accessTokenHash: string;
  ipHash: string | null;
}

export interface ProductQuestionInput {
  reference: string;
  productSlug: string;
  customerName: string;
  customerEmail: string;
  question: string;
  status?: string;
  developerId?: string | null;
  lastMessageAt?: Date | null;
  accessTokenHash?: string;
  ipHash?: string | null;
}

/** Sanitises a message body (no markup is stored; paragraphs are kept). */
export function cleanMessage(body: string): string {
  return cleanText(body, MAX_MESSAGE_LENGTH);
}

/**
 * A customer's question about a product ("Ask the developer") and the state of
 * its conversation. Messages are stored separately (product_question_messages).
 */
export class ProductQuestion extends BaseEntity {
  private constructor(
    meta: EntityMetadata,
    private props: ProductQuestionProps,
  ) {
    super(meta);
  }

  static create(input: ProductQuestionInput, actorId: string | null): ProductQuestion {
    const entity = new ProductQuestion(
      BaseEntity.newMetadata(actorId),
      ProductQuestion.validate({ status: 'open', ...input }),
    );
    entity.addEvent('product-question.created', { id: entity.id });
    return entity;
  }

  static reconstitute(meta: EntityMetadata, props: ProductQuestionProps): ProductQuestion {
    return new ProductQuestion(meta, props);
  }

  static validate(input: ProductQuestionInput): ProductQuestionProps {
    const issues: FieldIssue[] = [];
    const reference = cleanLine(input.reference, 40);
    if (!reference) issues.push({ field: 'reference', message: 'Reference is required' });
    const productSlug = cleanLine(input.productSlug, 80);
    if (!productSlug) issues.push({ field: 'productSlug', message: 'Product is required' });
    const customerName = cleanLine(input.customerName, 120);
    if (customerName.length < 2) issues.push({ field: 'customerName', message: 'Enter your name' });
    const customerEmail = cleanLine(input.customerEmail, 160).toLowerCase();
    checkEmail(issues, 'customerEmail', customerEmail);
    const question = cleanMessage(input.question);
    if (question.length < 10)
      issues.push({
        field: 'question',
        message: 'Please describe your question (10 characters or more)',
      });
    const status = input.status ?? 'open';
    if (!(QUESTION_STATUSES as readonly string[]).includes(status))
      issues.push({ field: 'status', message: 'Unknown status' });
    if (issues.length) throw new ValidationError(issues);
    return {
      reference,
      productSlug,
      customerName,
      customerEmail,
      question,
      status,
      developerId: input.developerId ?? null,
      lastMessageAt: input.lastMessageAt ?? null,
      accessTokenHash: input.accessTokenHash ?? '',
      ipHash: input.ipHash ?? null,
    };
  }

  get reference(): string {
    return this.props.reference;
  }
  get productSlug(): string {
    return this.props.productSlug;
  }
  get customerName(): string {
    return this.props.customerName;
  }
  get customerEmail(): string {
    return this.props.customerEmail;
  }
  get question(): string {
    return this.props.question;
  }
  get status(): string {
    return this.props.status;
  }
  get developerId(): string | null {
    return this.props.developerId;
  }
  get lastMessageAt(): Date | null {
    return this.props.lastMessageAt;
  }
  get accessTokenHash(): string {
    return this.props.accessTokenHash;
  }
  get ipHash(): string | null {
    return this.props.ipHash;
  }
  get closed(): boolean {
    return this.props.status === 'closed';
  }

  /** Staff edits: status only (customer text is never rewritten). */
  update(changes: { status?: string }, actorId: string | null): void {
    if (changes.status !== undefined) this.setStatus(changes.status, actorId);
  }

  setStatus(status: string, actorId: string | null): void {
    if (!(QUESTION_STATUSES as readonly string[]).includes(status))
      throw new ValidationError([{ field: 'status', message: 'Unknown status' }]);
    this.props = { ...this.props, status };
    this.touch(actorId);
  }

  /** A new message arrived: the status follows who wrote it. */
  recordMessage(author: MessageAuthor, at: Date, actorId: string | null): void {
    const status = author === 'customer' ? 'open' : 'answered';
    this.props = { ...this.props, status, lastMessageAt: at };
    this.touch(actorId);
  }

  toSnapshot(): Readonly<ProductQuestionProps> {
    return { ...this.props };
  }
}
