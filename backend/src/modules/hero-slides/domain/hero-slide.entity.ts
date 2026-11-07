import { BaseEntity, type EntityMetadata } from '#core/domain/base.entity.js';
import { ValidationError, type FieldIssue } from '#core/domain/errors/app-error.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where a slide's button may point: a path on this site ("/products",
 * "/products?category=x", "#contact") or an https:// address. Anything else
 * (javascript:, data:, protocol-relative "//host", plain http) is refused.
 */
export function isSafeHref(href: string): boolean {
  if (/\s/.test(href)) return false;
  if (href.startsWith('#')) return href.length > 1;
  if (href.startsWith('/')) return !href.startsWith('//') && !href.startsWith('/\\');
  try {
    const url = new URL(href);
    return url.protocol === 'https:' && !!url.hostname;
  } catch {
    return false;
  }
}

export interface HeroSlideProps {
  title: string | null;
  description: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  desktopImageId: string;
  mobileImageId: string | null;
  altText: string | null;
  sortOrder: number | null;
  active: boolean;
}

export interface HeroSlideInput {
  title?: string | null;
  description?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  desktopImageId: string;
  mobileImageId?: string | null;
  altText?: string | null;
  sortOrder?: number | null;
  active?: boolean;
}

/**
 * Hero slide aggregate (generated). Pure TypeScript: business rules live
 * here — add invariants to `validate` and behaviour as methods.
 */
export class HeroSlide extends BaseEntity {
  private constructor(
    meta: EntityMetadata,
    private props: HeroSlideProps,
  ) {
    super(meta);
  }

  static create(input: HeroSlideInput, actorId: string | null): HeroSlide {
    const entity = new HeroSlide(BaseEntity.newMetadata(actorId), HeroSlide.validate(input));
    entity.addEvent('hero-slide.created', { id: entity.id });
    return entity;
  }

  static reconstitute(meta: EntityMetadata, props: HeroSlideProps): HeroSlide {
    return new HeroSlide(meta, props);
  }

  /** Normalises input and enforces field rules; throws VALIDATION_FAILED. */
  static validate(input: HeroSlideInput): HeroSlideProps {
    const issues: FieldIssue[] = [];
    const title = (input.title ?? '').trim();
    if (title.length > 160) issues.push({ field: 'title', message: 'At most 160 characters' });
    const description = (input.description ?? '').trim();
    if (description.length > 2000)
      issues.push({ field: 'description', message: 'At most 2000 characters' });
    const ctaLabel = (input.ctaLabel ?? '').trim();
    if (ctaLabel.length > 160)
      issues.push({ field: 'ctaLabel', message: 'At most 160 characters' });
    const ctaHref = (input.ctaHref ?? '').trim();
    if (ctaHref.length > 160) issues.push({ field: 'ctaHref', message: 'At most 160 characters' });
    const desktopImageId = (input.desktopImageId ?? '').trim();
    if (!desktopImageId)
      issues.push({ field: 'desktopImageId', message: 'Desktop image id is required' });
    if (desktopImageId.length > 160)
      issues.push({ field: 'desktopImageId', message: 'At most 160 characters' });
    const mobileImageId = (input.mobileImageId ?? '').trim();
    if (mobileImageId.length > 160)
      issues.push({ field: 'mobileImageId', message: 'At most 160 characters' });
    const altText = (input.altText ?? '').trim();
    if (altText.length > 160) issues.push({ field: 'altText', message: 'At most 160 characters' });
    const sortOrder = input.sortOrder ?? null;
    if (sortOrder !== null && !Number.isInteger(sortOrder))
      issues.push({ field: 'sortOrder', message: 'Must be a whole number' });
    if (sortOrder !== null && sortOrder < 0)
      issues.push({ field: 'sortOrder', message: 'Must be zero or more' });
    const active = input.active ?? false;

    // Images are uploaded media (ids), never free-form URLs.
    if (desktopImageId && !UUID.test(desktopImageId))
      issues.push({ field: 'desktopImageId', message: 'Upload the desktop image again' });
    if (mobileImageId && !UUID.test(mobileImageId))
      issues.push({ field: 'mobileImageId', message: 'Upload the mobile image again' });

    // The call to action is optional, but a label needs a destination and vice versa.
    if (ctaLabel && !ctaHref)
      issues.push({ field: 'ctaHref', message: 'Add the page the button opens' });
    if (ctaHref && !ctaLabel) issues.push({ field: 'ctaLabel', message: 'Add the button text' });
    if (ctaHref && !isSafeHref(ctaHref))
      issues.push({
        field: 'ctaHref',
        message: 'Use a page on this site (e.g. /products) or a full https:// address',
      });
    if (issues.length) throw new ValidationError(issues);
    return {
      title: title || null,
      description: description || null,
      ctaLabel: ctaLabel || null,
      ctaHref: ctaHref || null,
      desktopImageId,
      mobileImageId: mobileImageId || null,
      altText: altText || null,
      sortOrder,
      active,
    };
  }

  get title(): string | null {
    return this.props.title;
  }
  get description(): string | null {
    return this.props.description;
  }
  get ctaLabel(): string | null {
    return this.props.ctaLabel;
  }
  get ctaHref(): string | null {
    return this.props.ctaHref;
  }
  get desktopImageId(): string {
    return this.props.desktopImageId;
  }
  get mobileImageId(): string | null {
    return this.props.mobileImageId;
  }
  get altText(): string | null {
    return this.props.altText;
  }
  get sortOrder(): number | null {
    return this.props.sortOrder;
  }
  get active(): boolean {
    return this.props.active;
  }

  update(changes: Partial<HeroSlideInput>, actorId: string | null): void {
    const defined = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
    this.props = HeroSlide.validate({ ...this.props, ...defined });
    this.touch(actorId);
  }

  toSnapshot(): Readonly<HeroSlideProps> {
    return { ...this.props };
  }
}
