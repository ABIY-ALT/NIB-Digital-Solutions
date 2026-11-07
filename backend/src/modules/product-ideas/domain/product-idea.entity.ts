import { BaseEntity, type EntityMetadata } from '#core/domain/base.entity.js';
import { ValidationError, type FieldIssue } from '#core/domain/errors/app-error.js';
import {
  checkEmail,
  cleanLine,
  cleanText,
  normaliseTitle,
} from '#modules/marketplace/domain/lead-rules.js';

/** Moderation workflow of a suggested product. */
export const IDEA_STATUSES = [
  'submitted',
  'under_review',
  'approved',
  'in_development',
  'completed',
  'rejected',
] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

/** Statuses shown on the public idea board (everything else is internal). */
export const PUBLIC_IDEA_STATUSES = ['approved', 'in_development', 'completed'] as const;
/** Ideas visitors can still vote for. */
export const VOTABLE_IDEA_STATUSES = ['approved', 'in_development'] as const;

export interface ProductIdeaProps {
  reference: string;
  title: string;
  problem: string;
  categoryCode: string | null;
  submitterName: string | null;
  submitterEmail: string;
  status: string;
  voteCount: number | null;
  adminNote: string | null;
  titleKey: string;
  ipHash: string | null;
}

export interface ProductIdeaInput {
  /** Generated (IDEA-yymmdd-XXXXX) when empty. */
  reference?: string | null;
  title: string;
  problem: string;
  categoryCode?: string | null;
  submitterName?: string | null;
  submitterEmail: string;
  status: string;
  voteCount?: number | null;
  adminNote?: string | null;
  ipHash?: string | null;
}

const CATEGORY_CODE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * A product or solution suggested by a website visitor ("What should we build
 * next?"). Text is sanitised here (no markup reaches the database); visitors
 * only see an idea once staff move it to an approved status.
 */
export class ProductIdea extends BaseEntity {
  private constructor(
    meta: EntityMetadata,
    private props: ProductIdeaProps,
  ) {
    super(meta);
  }

  static create(input: ProductIdeaInput, actorId: string | null): ProductIdea {
    const entity = new ProductIdea(BaseEntity.newMetadata(actorId), ProductIdea.validate(input));
    entity.addEvent('product-idea.created', { id: entity.id });
    return entity;
  }

  static reconstitute(meta: EntityMetadata, props: ProductIdeaProps): ProductIdea {
    return new ProductIdea(meta, props);
  }

  /** Normalises input and enforces field rules; throws VALIDATION_FAILED. */
  static validate(input: ProductIdeaInput): ProductIdeaProps {
    const issues: FieldIssue[] = [];
    const reference = cleanLine(input.reference, 40);
    if (!reference) issues.push({ field: 'reference', message: 'Reference is required' });
    const title = cleanLine(input.title, 160);
    if (title.length < 4)
      issues.push({ field: 'title', message: 'Give your idea a name (4 characters or more)' });
    const problem = cleanText(input.problem, 2000);
    if (problem.length < 20)
      issues.push({ field: 'problem', message: 'Describe the problem in a sentence or two' });
    const categoryCode = cleanLine(input.categoryCode, 60).toLowerCase();
    if (categoryCode && !CATEGORY_CODE.test(categoryCode))
      issues.push({ field: 'categoryCode', message: 'Unknown business area' });
    const submitterName = cleanLine(input.submitterName, 120);
    const submitterEmail = cleanLine(input.submitterEmail, 160).toLowerCase();
    checkEmail(issues, 'submitterEmail', submitterEmail);
    const status = cleanLine(input.status, 20);
    if (!(IDEA_STATUSES as readonly string[]).includes(status))
      issues.push({ field: 'status', message: 'Unknown status' });
    const voteCount = input.voteCount ?? 0;
    if (!Number.isInteger(voteCount) || voteCount < 0)
      issues.push({ field: 'voteCount', message: 'Must be zero or more' });
    const adminNote = cleanText(input.adminNote, 2000);
    if (issues.length) throw new ValidationError(issues);
    return {
      reference,
      title,
      problem,
      categoryCode: categoryCode || null,
      submitterName: submitterName || null,
      submitterEmail,
      status,
      voteCount,
      adminNote: adminNote || null,
      titleKey: normaliseTitle(title),
      ipHash: input.ipHash ?? null,
    };
  }

  get reference(): string {
    return this.props.reference;
  }
  get title(): string {
    return this.props.title;
  }
  get problem(): string {
    return this.props.problem;
  }
  get categoryCode(): string | null {
    return this.props.categoryCode;
  }
  get submitterName(): string | null {
    return this.props.submitterName;
  }
  get submitterEmail(): string {
    return this.props.submitterEmail;
  }
  get status(): string {
    return this.props.status;
  }
  get voteCount(): number {
    return this.props.voteCount ?? 0;
  }
  get adminNote(): string | null {
    return this.props.adminNote;
  }
  get titleKey(): string {
    return this.props.titleKey;
  }
  get ipHash(): string | null {
    return this.props.ipHash;
  }
  /** Shown on the public idea board. */
  get isPublic(): boolean {
    return (PUBLIC_IDEA_STATUSES as readonly string[]).includes(this.props.status);
  }
  get isVotable(): boolean {
    return (VOTABLE_IDEA_STATUSES as readonly string[]).includes(this.props.status);
  }

  /** Staff edits (status, category, note, wording). The vote count is never edited by hand. */
  update(changes: Partial<ProductIdeaInput>, actorId: string | null): void {
    const defined = Object.fromEntries(
      Object.entries(changes).filter(([k, v]) => v !== undefined && k !== 'voteCount'),
    );
    this.props = ProductIdea.validate({ ...this.props, ...defined });
    this.touch(actorId);
  }

  toSnapshot(): Readonly<ProductIdeaProps> {
    return { ...this.props };
  }
}
