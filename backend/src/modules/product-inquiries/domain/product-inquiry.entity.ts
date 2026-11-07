import { BaseEntity, type EntityMetadata } from '#core/domain/base.entity.js';
import { ValidationError, type FieldIssue } from '#core/domain/errors/app-error.js';
import {
  checkEmail,
  checkPhone,
  cleanLine,
  cleanText,
  newNote,
  normalisePhone,
} from '#modules/marketplace/domain/lead-rules.js';
import {
  CONTACT_METHODS,
  INQUIRY_TYPES,
  isOneOf,
  LEAD_SOURCES,
  LEAD_STATUSES,
  type LeadNote,
} from '#modules/marketplace/domain/marketplace.constants.js';

export interface ProductInquiryProps {
  reference: string;
  customerName: string;
  company: string | null;
  email: string;
  phone: string | null;
  productSlug: string | null;
  inquiryType: string;
  message: string;
  requirements: string | null;
  contactMethod: string;
  source: string | null;
  status: string;
  assignedTo: string | null;
  respondedAt: Date | null;
  notes: LeadNote[];
}

export interface ProductInquiryInput {
  reference: string;
  customerName: string;
  company?: string | null;
  email: string;
  phone?: string | null;
  productSlug?: string | null;
  inquiryType: string;
  message: string;
  requirements?: string | null;
  contactMethod: string;
  source?: string | null;
  status: string;
  assignedTo?: string | null;
  respondedAt?: Date | null;
  notes?: LeadNote[];
}

/**
 * A customer's question about a product (pricing, integration, partnership, …).
 * Contact details are fixed once submitted; staff track ownership, response
 * and status, and add internal notes.
 */
export class ProductInquiry extends BaseEntity {
  private constructor(
    meta: EntityMetadata,
    private props: ProductInquiryProps,
  ) {
    super(meta);
  }

  static create(input: ProductInquiryInput, actorId: string | null): ProductInquiry {
    const entity = new ProductInquiry(
      BaseEntity.newMetadata(actorId),
      ProductInquiry.validate(input),
    );
    entity.addEvent('product-inquiry.created', { id: entity.id });
    return entity;
  }

  static reconstitute(meta: EntityMetadata, props: ProductInquiryProps): ProductInquiry {
    return new ProductInquiry(meta, props);
  }

  /** Normalises and sanitises input and enforces field rules; throws VALIDATION_FAILED. */
  static validate(input: ProductInquiryInput): ProductInquiryProps {
    const issues: FieldIssue[] = [];
    const reference = cleanLine(input.reference, 40);
    if (!reference) issues.push({ field: 'reference', message: 'Reference is required' });
    const customerName = cleanLine(input.customerName, 120);
    if (customerName.length < 2)
      issues.push({ field: 'customerName', message: 'Name is required' });
    const email = cleanLine(input.email, 160).toLowerCase();
    checkEmail(issues, 'email', email);
    const phone = normalisePhone(input.phone);
    checkPhone(issues, 'phone', phone, false);
    if (!isOneOf(INQUIRY_TYPES, input.inquiryType))
      issues.push({ field: 'inquiryType', message: 'Choose an inquiry type' });
    const message = cleanText(input.message, 2000);
    if (message.length < 10)
      issues.push({
        field: 'message',
        message: 'Please tell us a little more (at least 10 characters)',
      });
    if (!isOneOf(CONTACT_METHODS, input.contactMethod))
      issues.push({ field: 'contactMethod', message: 'Choose a contact method' });
    const source = cleanLine(input.source, 40) || null;
    if (source && !isOneOf(LEAD_SOURCES, source))
      issues.push({ field: 'source', message: 'Unknown source' });
    if (!isOneOf(LEAD_STATUSES, input.status))
      issues.push({ field: 'status', message: 'Unknown status' });
    if (issues.length) throw new ValidationError(issues);
    return {
      reference,
      customerName,
      company: cleanLine(input.company, 160) || null,
      email,
      phone: phone || null,
      productSlug: cleanLine(input.productSlug, 80) || null,
      inquiryType: input.inquiryType,
      message,
      requirements: cleanText(input.requirements, 2000) || null,
      contactMethod: input.contactMethod,
      source,
      status: input.status,
      assignedTo: input.assignedTo || null,
      respondedAt: input.respondedAt ?? null,
      notes: input.notes ?? [],
    };
  }

  get reference(): string {
    return this.props.reference;
  }
  get customerName(): string {
    return this.props.customerName;
  }
  get company(): string | null {
    return this.props.company;
  }
  get email(): string {
    return this.props.email;
  }
  get phone(): string | null {
    return this.props.phone;
  }
  get productSlug(): string | null {
    return this.props.productSlug;
  }
  get inquiryType(): string {
    return this.props.inquiryType;
  }
  get message(): string {
    return this.props.message;
  }
  get requirements(): string | null {
    return this.props.requirements;
  }
  get contactMethod(): string {
    return this.props.contactMethod;
  }
  get source(): string | null {
    return this.props.source;
  }
  get status(): string {
    return this.props.status;
  }
  get assignedTo(): string | null {
    return this.props.assignedTo;
  }
  get respondedAt(): Date | null {
    return this.props.respondedAt;
  }
  get notes(): LeadNote[] {
    return this.props.notes.map((n) => ({ ...n }));
  }

  update(changes: Partial<ProductInquiryInput>, actorId: string | null): void {
    const defined = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
    this.props = ProductInquiry.validate({ ...this.props, ...defined });
    this.touch(actorId);
  }

  /** Appends an internal follow-up note (notes are never edited or removed). */
  addNote(author: string, body: string, actorId: string | null): LeadNote {
    const note = newNote(author, body);
    if (!note.body) throw new ValidationError([{ field: 'body', message: 'Write a note' }]);
    this.props = { ...this.props, notes: [...this.props.notes, note] };
    this.touch(actorId);
    return note;
  }

  toSnapshot(): Readonly<ProductInquiryProps> {
    return { ...this.props };
  }
}
