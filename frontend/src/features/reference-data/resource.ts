import { defineResource } from '@/shared/data/resource';
import type { ReferenceDataType } from './types';

/** Reference data lists (types). Items are addressed per list: /types/{code}/items. */
export const referenceTypesResource = defineResource<ReferenceDataType>({
  name: 'reference-data-types',
  apiPath: '/api/reference-data/types',
  backendPath: '/reference-data/types',
  listDefaults: { pageSize: 100, sort: [{ field: 'name', direction: 'asc' }] },
});

export const REFERENCE_DATA_API = '/api/reference-data';
