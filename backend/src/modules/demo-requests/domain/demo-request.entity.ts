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
  DEMO_TYPES,
  isOneOf,
  LEAD_SOURCES,
  LEAD_STATUSES,
  type LeadNote,
} from '#modules/marketplace/domain/marketplace.constants.js';

export interface DemoRequestProps {
  reference: string;
  fullName: string;
  organization: string;
  jobTitle: string;
  email: string;
  phone: string;
  productSlug: string;
  demoType: string;
  preferredDate: Date | null;
  preferredTime: string | null;
  requirements: string | null;
  source: string | null;
  status: string;
  assignedTo: string | null;
  followUpDate: Date | null;
  notes: LeadNote[];
}

export interface DemoRequestInput {
  reference: string;
  fullName: string;
  organization: string;
  jobTitle: string;
  email: string;
  phone: string;
  productSlug: string;
  demoType: string;
  preferredDate?: Date | null;
  preferredTime?: string | null;
  requirements?: string | null;
  source?: string | null;
  status: string;
  assignedTo?: string | null;
  followUpDate?: Date | null;
  notes?: LeadNote[];
}

/**
 * A customer's request for a product demonstration. Contact details are fixed
 * once submitted; staff move it through the pipeline (status, owner, follow-up)
 * and add internal notes.
 */
export class DemoRequest extends BaseEntity {
  private constructor(
    meta: EntityMetadata,
    private props: DemoRequestProps,
  ) {
    super(meta);
  }

  static create(input: DemoRequestInput, actorId: string | null): DemoRequest {
    const entity = new DemoRequest(BaseEntity.newMetadata(actorId), DemoRequest.validate(input));
    entity.addEvent('demo-request.created', { id: entity.id });
    return entity;
  }

  static reconstitute(meta: EntityMetadata, props: DemoRequestProps): DemoRequest {
    return new DemoRequest(meta, props);
  }

  /** Normalises and sanitises input and enforces field rules; throws VALIDATION_FAILED. */
  static validate(input: DemoRequestInput): DemoRequestProps {
    const issues: FieldIssue[] = [];
    const required = (field: string, value: string, label: string) => {
      if (value.length < 2) issues.push({ field, message: `${label} is required` });
      return value;
    };
    const reference = cleanLine(input.reference, 40);
    if (!reference) issues.push({ field: 'reference', message: 'Reference is required' });
    const fullName = required('fullName', cleanLine(input.fullName, 120), 'Full name');
    const organization = required(
      'organization',
      cleanLine(input.organization, 160),
      'Organization',
    );
    const jobTitle = required('jobTitle', cleanLine(input.jobTitle, 120), 'Job title');
    const email = cleanLine(input.email, 160).toLowerCase();
    checkEmail(issues, 'email', email);
    const phone = normalisePhone(input.phone);
    checkPhone(issues, 'phone', phone, true);
    const productSlug = cleanLine(input.productSlug, 80);
    if (!productSlug) issues.push({ field: 'productSlug', message: 'Choose a product' });
    if (!isOneOf(DEMO_TYPES, input.demoType))
      issues.push({ field: 'demoType', message: 'Choose a demo type' });
    const preferredTime = cleanLine(input.preferredTime, 5);
    if (preferredTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(preferredTime))
      issues.push({ field: 'preferredTime', message: 'Choose a valid time' });
    const source = cleanLine(input.source, 40) || null;
    if (source && !isOneOf(LEAD_SOURCES, source))
      issues.push({ field: 'source', message: 'Unknown source' });
    if (!isOneOf(LEAD_STATUSES, input.status))
      issues.push({ field: 'status', message: 'Unknown status' });
    if (issues.length) throw new ValidationError(issues);
    return {
      reference,
      fullName,
      organization,
      jobTitle,
      email,
      phone,
      productSlug,
      demoType: input.demoType,
      preferredDate: input.preferredDate ?? null,
      preferredTime: preferredTime || null,
      requirements: cleanText(input.requirements, 2000) || null,
      source,
      status: input.status,
      assignedTo: input.assignedTo || null,
      followUpDate: input.followUpDate ?? null,
      notes: input.notes ?? [],
    };
  }

  get reference(): string {
    return this.props.reference;
  }
  get fullName(): string {
    return this.props.fullName;
  }
  get organization(): string {
    return this.props.organization;
  }
  get jobTitle(): string {
    return this.props.jobTitle;
  }
  get email(): string {
    return this.props.email;
  }
  get phone(): string {
    return this.props.phone;
  }
  get productSlug(): string {
    return this.props.productSlug;
  }
  get demoType(): string {
    return this.props.demoType;
  }
  get preferredDate(): Date | null {
    return this.props.preferredDate;
  }
  get preferredTime(): string | null {
    return this.props.preferredTime;
  }
  get requirements(): string | null {
    return this.props.requirements;
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
  get followUpDate(): Date | null {
    return this.props.followUpDate;
  }
  get notes(): LeadNote[] {
    return this.props.notes.map((n) => ({ ...n }));
  }

  update(changes: Partial<DemoRequestInput>, actorId: string | null): void {
    const defined = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
    this.props = DemoRequest.validate({ ...this.props, ...defined });
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

  toSnapshot(): Readonly<DemoRequestProps> {
    return { ...this.props };
  }
}
