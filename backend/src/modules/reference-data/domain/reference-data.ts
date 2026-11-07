import { BaseEntity, type EntityMetadata } from '#core/domain/base.entity.js';
import {
  BusinessRuleError,
  ValidationError,
  type FieldIssue,
} from '#core/domain/errors/app-error.js';

/**
 * Reference data ("lookups"): the managed code lists every product needs —
 * currencies, countries, regions, branches, ID document types, … A TYPE
 * declares the extra attributes its items carry (e.g. a currency's symbol and
 * decimals), so new lists need no code or schema change.
 */
export type AttributeType = 'text' | 'number' | 'boolean' | 'date' | 'select';

export interface AttributeDefinition {
  /** camelCase key used in `attributes` (e.g. "decimals"). */
  key: string;
  label: string;
  type: AttributeType;
  required: boolean;
  /** Allowed values for `select`. */
  options?: string[];
}

export type AttributeValue = string | number | boolean | null;

const TYPE_CODE = /^[a-z][a-z0-9-]{1,63}$/;
const ITEM_CODE = /^[A-Z0-9][A-Z0-9_.-]{0,63}$/;
const ATTRIBUTE_KEY = /^[a-z][a-zA-Z0-9]{0,39}$/;
const LOCALE = /^[a-z]{2}(-[A-Z]{2})?$/;

export interface ReferenceDataTypeProps {
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  attributes: AttributeDefinition[];
  parentTypeCode: string | null;
  /** Read model. */
  itemCount: number;
  activeCount: number;
}

export class ReferenceDataType extends BaseEntity {
  private constructor(
    meta: EntityMetadata,
    private readonly props: ReferenceDataTypeProps,
  ) {
    super(meta);
  }

  static create(
    input: {
      code: string;
      name: string;
      description?: string | null;
      attributes?: AttributeDefinition[];
      parentTypeCode?: string | null;
    },
    actorId: string | null,
  ): ReferenceDataType {
    const code = input.code.trim().toLowerCase();
    const issues: FieldIssue[] = [];
    if (!TYPE_CODE.test(code)) {
      issues.push({ field: 'code', message: 'Use 2–64 lowercase letters, digits or dashes' });
    }
    if (input.name.trim().length < 2) issues.push({ field: 'name', message: 'Name is required' });
    issues.push(...ReferenceDataType.validateDefinitions(input.attributes ?? []));
    if (input.parentTypeCode === code) {
      issues.push({ field: 'parentTypeCode', message: 'A type cannot be its own parent' });
    }
    if (issues.length) throw new ValidationError(issues);
    return new ReferenceDataType(BaseEntity.newMetadata(actorId), {
      code,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      isSystem: false,
      attributes: input.attributes ?? [],
      parentTypeCode: input.parentTypeCode ?? null,
      itemCount: 0,
      activeCount: 0,
    });
  }

  static reconstitute(meta: EntityMetadata, props: ReferenceDataTypeProps): ReferenceDataType {
    return new ReferenceDataType(meta, props);
  }

  static validateDefinitions(defs: AttributeDefinition[]): FieldIssue[] {
    const issues: FieldIssue[] = [];
    const seen = new Set<string>();
    defs.forEach((d, i) => {
      const field = `attributes.${i}`;
      if (!ATTRIBUTE_KEY.test(d.key)) {
        issues.push({ field: `${field}.key`, message: 'Use a camelCase key (e.g. "symbol")' });
      }
      if (seen.has(d.key)) issues.push({ field: `${field}.key`, message: 'Duplicate key' });
      seen.add(d.key);
      if (!d.label.trim()) issues.push({ field: `${field}.label`, message: 'Label is required' });
      if (d.type === 'select' && !d.options?.length) {
        issues.push({ field: `${field}.options`, message: 'List the allowed values' });
      }
    });
    return issues;
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
  get isSystem(): boolean {
    return this.props.isSystem;
  }
  get attributes(): readonly AttributeDefinition[] {
    return this.props.attributes;
  }
  get parentTypeCode(): string | null {
    return this.props.parentTypeCode;
  }
  get itemCount(): number {
    return this.props.itemCount;
  }
  get activeCount(): number {
    return this.props.activeCount;
  }

  update(
    changes: {
      name?: string;
      description?: string | null;
      attributes?: AttributeDefinition[];
      parentTypeCode?: string | null;
    },
    actorId: string | null,
  ): void {
    if (changes.name !== undefined) {
      if (changes.name.trim().length < 2) {
        throw new ValidationError([{ field: 'name', message: 'Name is required' }]);
      }
      this.props.name = changes.name.trim();
    }
    if (changes.description !== undefined) {
      this.props.description = changes.description?.trim() || null;
    }
    if (changes.attributes !== undefined) {
      const issues = ReferenceDataType.validateDefinitions(changes.attributes);
      if (issues.length) throw new ValidationError(issues);
      this.props.attributes = changes.attributes;
    }
    if (changes.parentTypeCode !== undefined) {
      if (changes.parentTypeCode === this.props.code) {
        throw new ValidationError([
          { field: 'parentTypeCode', message: 'A type cannot be its own parent' },
        ]);
      }
      this.props.parentTypeCode = changes.parentTypeCode;
    }
    this.touch(actorId);
  }

  override softDelete(actorId: string | null): void {
    if (this.props.isSystem) {
      throw new BusinessRuleError('System lists cannot be deleted.', 'SYSTEM_TYPE_IMMUTABLE');
    }
    if (this.props.itemCount > 0) {
      throw new BusinessRuleError('Delete or move the items of this list first.', 'TYPE_IN_USE');
    }
    super.softDelete(actorId);
  }

  /** Validates item attribute values against this type's definitions. */
  validateValues(values: Record<string, AttributeValue>): {
    clean: Record<string, AttributeValue>;
    issues: FieldIssue[];
  } {
    const issues: FieldIssue[] = [];
    const clean: Record<string, AttributeValue> = {};
    for (const def of this.props.attributes) {
      const raw = values[def.key];
      const field = `attributes.${def.key}`;
      if (raw === undefined || raw === null || raw === '') {
        if (def.required) issues.push({ field, message: `${def.label} is required` });
        continue;
      }
      const checked = checkAttributeValue(def, raw);
      if ('problem' in checked) issues.push({ field, message: checked.problem });
      else clean[def.key] = checked.value;
    }
    return { clean, issues };
  }

  toSnapshot(): Readonly<ReferenceDataTypeProps> {
    return { ...this.props, attributes: [...this.props.attributes] };
  }
}

/** A non-empty attribute value converted to the attribute's type, or what is wrong with it. */
function checkAttributeValue(
  def: AttributeDefinition,
  raw: string | number | boolean,
): { value: AttributeValue } | { problem: string } {
  switch (def.type) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) ? { value: n } : { problem: `${def.label} must be a number` };
    }
    case 'boolean':
      return { value: raw === true || raw === 'true' };
    case 'date': {
      const s = String(raw);
      return /^\d{4}-\d{2}-\d{2}$/.test(s)
        ? { value: s }
        : { problem: `${def.label} must be a date (YYYY-MM-DD)` };
    }
    case 'select':
      return def.options?.includes(String(raw))
        ? { value: String(raw) }
        : { problem: `${def.label} must be one of: ${def.options?.join(', ')}` };
    default:
      return { value: String(raw).trim().slice(0, 500) };
  }
}

export interface ReferenceDataItemProps {
  typeId: string;
  typeCode: string;
  code: string;
  label: string;
  labels: Record<string, string>;
  description: string | null;
  sortOrder: number;
  active: boolean;
  validFrom: Date | null;
  validTo: Date | null;
  parentCode: string | null;
  attributes: Record<string, AttributeValue>;
}

export interface ItemInput {
  code?: string;
  label?: string;
  labels?: Record<string, string>;
  description?: string | null;
  sortOrder?: number;
  active?: boolean;
  validFrom?: Date | null;
  validTo?: Date | null;
  parentCode?: string | null;
  attributes?: Record<string, AttributeValue>;
}

export class ReferenceDataItem extends BaseEntity {
  private constructor(
    meta: EntityMetadata,
    private readonly props: ReferenceDataItemProps,
  ) {
    super(meta);
  }

  static create(
    type: ReferenceDataType,
    input: ItemInput & { code: string; label: string },
    actorId: string | null,
  ): ReferenceDataItem {
    const item = new ReferenceDataItem(BaseEntity.newMetadata(actorId), {
      typeId: type.id,
      typeCode: type.code,
      code: '',
      label: '',
      labels: {},
      description: null,
      sortOrder: 0,
      active: true,
      validFrom: null,
      validTo: null,
      parentCode: null,
      attributes: {},
    });
    item.apply(type, input, true);
    return item;
  }

  static reconstitute(meta: EntityMetadata, props: ReferenceDataItemProps): ReferenceDataItem {
    return new ReferenceDataItem(meta, props);
  }

  get typeId(): string {
    return this.props.typeId;
  }
  get typeCode(): string {
    return this.props.typeCode;
  }
  get code(): string {
    return this.props.code;
  }
  get label(): string {
    return this.props.label;
  }
  get labels(): Readonly<Record<string, string>> {
    return this.props.labels;
  }
  get description(): string | null {
    return this.props.description;
  }
  get sortOrder(): number {
    return this.props.sortOrder;
  }
  get active(): boolean {
    return this.props.active;
  }
  get validFrom(): Date | null {
    return this.props.validFrom;
  }
  get validTo(): Date | null {
    return this.props.validTo;
  }
  get parentCode(): string | null {
    return this.props.parentCode;
  }
  get attributes(): Readonly<Record<string, AttributeValue>> {
    return this.props.attributes;
  }

  /** Active and inside its validity window. */
  isEffective(now: Date): boolean {
    return (
      this.props.active &&
      (!this.props.validFrom || this.props.validFrom <= now) &&
      (!this.props.validTo || this.props.validTo > now)
    );
  }

  /** Label in the requested locale (falls back to the default label). */
  labelFor(locale: string | null | undefined): string {
    return (locale && this.props.labels[locale]) || this.props.label;
  }

  update(type: ReferenceDataType, changes: ItemInput, actorId: string | null): void {
    if (changes.code !== undefined && changes.code.trim().toUpperCase() !== this.props.code) {
      throw new BusinessRuleError(
        'Codes are permanent (records refer to them). Deactivate the item and create a new one.',
        'CODE_IMMUTABLE',
      );
    }
    this.apply(type, changes, false);
    this.touch(actorId);
  }

  private apply(type: ReferenceDataType, input: ItemInput, creating: boolean): void {
    const issues: FieldIssue[] = [];
    if (creating) issues.push(...this.applyCode(input.code ?? ''));
    issues.push(...this.applyLabels(input));
    this.applyDetails(input);
    if (this.props.validFrom && this.props.validTo && this.props.validTo <= this.props.validFrom) {
      issues.push({ field: 'validTo', message: 'Must be after the start date' });
    }
    if (input.parentCode !== undefined) issues.push(...this.applyParent(type, input.parentCode));
    if (input.attributes !== undefined || creating) {
      const { clean, issues: attributeIssues } = type.validateValues(input.attributes ?? {});
      issues.push(...attributeIssues);
      this.props.attributes = clean;
    }
    if (issues.length) throw new ValidationError(issues);
  }

  private applyCode(input: string): FieldIssue[] {
    const code = input.trim().toUpperCase();
    this.props.code = code;
    if (ITEM_CODE.test(code)) return [];
    return [{ field: 'code', message: 'Use 1–64 letters, digits, dot, dash or underscore' }];
  }

  /** The default label and its translations. */
  private applyLabels(input: ItemInput): FieldIssue[] {
    const issues: FieldIssue[] = [];
    if (input.label !== undefined) {
      if (!input.label.trim()) issues.push({ field: 'label', message: 'Label is required' });
      this.props.label = input.label.trim();
    }
    if (input.labels !== undefined) {
      const bad = Object.keys(input.labels).filter((l) => !LOCALE.test(l));
      if (bad.length)
        issues.push({ field: 'labels', message: `Unknown locales: ${bad.join(', ')}` });
      const labels: Record<string, string> = {};
      for (const [locale, text] of Object.entries(input.labels)) {
        if (text.trim()) labels[locale] = text.trim();
      }
      this.props.labels = labels;
    }
    return issues;
  }

  /** Fields that need no validation of their own. */
  private applyDetails(input: ItemInput): void {
    if (input.description !== undefined) this.props.description = input.description?.trim() || null;
    if (input.sortOrder !== undefined) this.props.sortOrder = input.sortOrder;
    if (input.active !== undefined) this.props.active = input.active;
    if (input.validFrom !== undefined) this.props.validFrom = input.validFrom;
    if (input.validTo !== undefined) this.props.validTo = input.validTo;
  }

  private applyParent(type: ReferenceDataType, parentCode: string | null): FieldIssue[] {
    this.props.parentCode = parentCode?.trim().toUpperCase() || null;
    if (parentCode && !type.parentTypeCode) {
      return [{ field: 'parentCode', message: 'This list has no parent list' }];
    }
    return [];
  }

  toSnapshot(): Readonly<ReferenceDataItemProps> {
    return {
      ...this.props,
      labels: { ...this.props.labels },
      attributes: { ...this.props.attributes },
    };
  }
}
