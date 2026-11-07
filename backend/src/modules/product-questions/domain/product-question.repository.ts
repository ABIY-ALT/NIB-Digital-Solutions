import type { Repository } from '#core/domain/repository.js';
import type {
  MessageAuthor,
  MessageChannel,
  ProductQuestion,
  QuestionMessage,
} from './product-question.entity.js';

export interface NewMessage {
  author: MessageAuthor;
  authorName: string;
  developerId: string | null;
  channel: MessageChannel;
  body: string;
}

export interface ProductQuestionRepository extends Repository<ProductQuestion> {
  findByUnique(field: 'reference', value: string | number): Promise<ProductQuestion | null>;
  findByReference(reference: string): Promise<ProductQuestion | null>;
  /** Appends a message to the conversation (inside the caller's transaction). */
  addMessage(questionId: string, message: NewMessage): Promise<QuestionMessage>;
  /** The whole conversation, oldest first. */
  messages(questionId: string): Promise<QuestionMessage[]>;
  /** Questions from one e-mail address since a moment (per-customer limit). */
  countRecentByEmail(email: string, since: Date): Promise<number>;
  /** Questions from one (hashed) IP since a moment (per-network limit). */
  countRecentFromIp(ipHash: string, since: Date): Promise<number>;
}

export const PRODUCT_QUESTION_REPOSITORY = Symbol('ProductQuestionRepository');
