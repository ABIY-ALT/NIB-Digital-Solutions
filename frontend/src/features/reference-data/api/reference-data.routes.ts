import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { apiRoute, listParamsOf, parseWith, readJson } from '@/features/auth/api/api-route';
import { resourceRoutes } from '@/features/auth/api/resource-routes';
import type { ApiData } from '@/shared/api';
import { toListQuery } from '@/shared/types';
import { referenceTypesResource } from '../resource';
import type { ReferenceDataType } from '../types';

/**
 * Reference data BFF routes → NestJS /reference-data.
 *   lists (types):  standard resource routes (the list code is the id)
 *   items:          /types/{code}/items, /items/{id} (maker–checker aware)
 *   lookups:        /lookups/{code} in the reader's locale (dropdowns)
 */
const seg = encodeURIComponent;
const CHANGE_REASON = 'x-change-reason';
const reasonHeader = (req: Request) => {
  const value = req.headers.get(CHANGE_REASON);
  return value ? { [CHANGE_REASON]: value.slice(0, 3000) } : undefined;
};

const attribute = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  type: z.enum(['text', 'number', 'boolean', 'date', 'select']),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
});
const typeCreate = z.object({
  code: z.string().trim().min(2).max(64),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullish(),
  attributes: z.array(attribute).max(30),
  parentTypeCode: z.string().trim().max(64).nullish(),
});
const typeUpdate = typeCreate
  .omit({ code: true })
  .partial()
  .extend({ version: z.number().int().min(1) });

export const {
  list: listTypes,
  get: getType,
  create: createType,
  update: updateType,
  remove: deleteType,
} = resourceRoutes<ReferenceDataType>(referenceTypesResource, {
  access: {
    read: 'reference-data:read',
    create: 'reference-data:manage',
    update: 'reference-data:manage',
    delete: 'reference-data:manage',
  },
  schemas: { create: typeCreate, update: typeUpdate },
  messages: { created: 'List created.', updated: 'List updated.', deleted: 'List deleted.' },
});

const value = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);
const itemFields = {
  label: z.string().trim().min(1).max(160),
  labels: z.record(z.string(), z.string().max(160)).optional(),
  description: z.string().trim().max(500).nullish(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  active: z.boolean().optional(),
  validFrom: z.string().max(40).nullish(),
  validTo: z.string().max(40).nullish(),
  parentCode: z.string().trim().max(64).nullish(),
  attributes: z.record(z.string(), value).optional(),
};
const itemCreate = z.object({ code: z.string().trim().min(1).max(64), ...itemFields });
const itemUpdate = z.object({
  version: z.number().int().min(1),
  ...itemFields,
  label: itemFields.label.optional(),
});

export const listItems = apiRoute<
  ApiData<'GET /reference-data/types/{type}/items'>,
  { id: string }
>({ requires: { permission: 'reference-data:read' } }, async ({ req, api, params }) => {
  const res = await api.get<ApiData<'GET /reference-data/types/{type}/items'>>(
    `/reference-data/types/${seg(params.id)}/items`,
    { query: toListQuery(listParamsOf(req, { maxPageSize: 200 })) },
  );
  return { data: res.data, meta: res.meta };
});

const passThrough = <T>(res: { data: T; status: number; message: string | null }) =>
  res.status === 202
    ? { data: res.data, status: 202, message: res.message }
    : { data: res.data, message: res.message };

export const createItem = apiRoute<unknown, { id: string }>(
  { requires: { permission: 'reference-data:manage' } },
  async ({ req, api, params }) => {
    const body = await readJson(req, parseWith(itemCreate));
    const res = await api.post(`/reference-data/types/${seg(params.id)}/items`, body, {
      headers: reasonHeader(req),
    });
    return res.status === 202 ? passThrough(res) : { ...passThrough(res), status: 201 };
  },
);

export const updateItem = apiRoute<unknown, { id: string }>(
  { requires: { permission: 'reference-data:manage' } },
  async ({ req, api, params }) => {
    const body = await readJson(req, parseWith(itemUpdate));
    return passThrough(
      await api.patch(`/reference-data/items/${seg(params.id)}`, body, {
        headers: reasonHeader(req),
      }),
    );
  },
);

export const deleteItem = apiRoute<unknown, { id: string }>(
  { requires: { permission: 'reference-data:manage' } },
  async ({ req, api, params }) =>
    passThrough(
      await api.delete(`/reference-data/items/${seg(params.id)}`, { headers: reasonHeader(req) }),
    ),
);

/** Dropdown options in the reader's language (any signed-in user). */
export const lookup = apiRoute<ApiData<'GET /reference-data/lookups/{type}'>, { type: string }>(
  {},
  async ({ req, api, params }) => {
    const url = new URL(req.url);
    const query: Record<string, string> = { locale: await getLocale() };
    const parent = url.searchParams.get('parent');
    if (parent) query.parent = parent.slice(0, 64);
    if (url.searchParams.get('includeInactive') === 'true') query.includeInactive = 'true';
    const res = await api.get<ApiData<'GET /reference-data/lookups/{type}'>>(
      `/reference-data/lookups/${seg(params.type)}`,
      { query },
    );
    return { data: res.data };
  },
);
