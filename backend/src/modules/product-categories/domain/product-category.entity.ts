import { BaseEntity, type EntityMetadata } from '#core/domain/base.entity.js';
import { ValidationError, type FieldIssue } from '#core/domain/errors/app-error.js';

export interface ProductCategoryProps {
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number | null;
}

export interface ProductCategoryInput {
  code: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  sortOrder?: number | null;
}

/**
 * Product category aggregate (generated). Pure TypeScript: business rules live
 * here — add invariants to `validate` and behaviour as methods.
 */
export class ProductCategory extends BaseEntity {
  private constructor(
    meta: EntityMetadata,
    private props: ProductCategoryProps,
  ) {
    super(meta);
  }

  static create(input: ProductCategoryInput, actorId: string | null): ProductCategory {
    const entity = new ProductCategory(
      BaseEntity.newMetadata(actorId),
      ProductCategory.validate(input),
    );
    entity.addEvent('product-category.created', { id: entity.id });
    return entity;
  }

  static reconstitute(meta: EntityMetadata, props: ProductCategoryProps): ProductCategory {
    return new ProductCategory(meta, props);
  }

  /** Normalises input and enforces field rules; throws VALIDATION_FAILED. */
  static validate(input: ProductCategoryInput): ProductCategoryProps {
    const issues: FieldIssue[] = [];
    const code = (input.code ?? '').trim();
    if (!code) issues.push({ field: 'code', message: 'Code is required' });
    if (code.length > 160) issues.push({ field: 'code', message: 'At most 160 characters' });
    const name = (input.name ?? '').trim();
    if (!name) issues.push({ field: 'name', message: 'Name is required' });
    if (name.length > 160) issues.push({ field: 'name', message: 'At most 160 characters' });
    const description = (input.description ?? '').trim();
    if (description.length > 2000)
      issues.push({ field: 'description', message: 'At most 2000 characters' });
    const icon = (input.icon ?? '').trim();
    if (icon.length > 160) issues.push({ field: 'icon', message: 'At most 160 characters' });
    const sortOrder = input.sortOrder ?? null;
    if (sortOrder !== null && !Number.isInteger(sortOrder))
      issues.push({ field: 'sortOrder', message: 'Must be a whole number' });
    if (issues.length) throw new ValidationError(issues);
    return {
      code,
      name,
      description: description || null,
      icon: icon || null,
      sortOrder,
    };
  }

  get code(): string {
    return this.props.code;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | null {
    return this.props.description;
  }
  get icon(): string | null {
    return this.props.icon;
  }
  get sortOrder(): number | null {
    return this.props.sortOrder;
  }

  update(changes: Partial<ProductCategoryInput>, actorId: string | null): void {
    const defined = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
    this.props = ProductCategory.validate({ ...this.props, ...defined });
    this.touch(actorId);
  }

  toSnapshot(): Readonly<ProductCategoryProps> {
    return { ...this.props };
  }
}
