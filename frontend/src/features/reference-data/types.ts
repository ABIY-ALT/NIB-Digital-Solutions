import type { ApiSchemas } from '@/shared/api';

/** Reference data (shared contract). */
export type ReferenceDataType = ApiSchemas['ReferenceDataType'];
export type ReferenceDataItem = ApiSchemas['ReferenceDataItem'];
export type LookupOption = ApiSchemas['LookupOption'];
export type AttributeDefinition = ReferenceDataType['attributes'][number];
export type AttributeType = AttributeDefinition['type'];
export type AttributeValue = ReferenceDataItem['attributes'][string];

export const ATTRIBUTE_TYPES: AttributeType[] = ['text', 'number', 'boolean', 'date', 'select'];

export interface TypeInput {
  code?: string;
  name: string;
  description?: string | null;
  attributes: AttributeDefinition[];
  parentTypeCode?: string | null;
  version?: number;
}

export interface ItemInput {
  code?: string;
  label: string;
  labels?: Record<string, string>;
  description?: string | null;
  sortOrder?: number;
  active?: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  parentCode?: string | null;
  attributes?: Record<string, AttributeValue>;
  version?: number;
}
