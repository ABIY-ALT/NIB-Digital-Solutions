import { z } from 'zod';
import { apiRoute } from '@/features/auth/api/api-route';
import { ApiClientError } from '@/shared/errors/api-client-error';
import { resourceRoutes } from '@/features/auth/api/resource-routes';
import { resourceExportRoute } from '@/features/auth/api/resource-transfer';
import { productDevelopersResource } from '../resource';
import type { DeveloperOption, ProductDeveloper, TelegramLinkCode } from '../types';

/**
 * Product developers BFF routes → NestJS /product-developers. Bodies are bounded here; the
 * backend validates business rules and applies the maker–checker policy.
 */
const createBody = z.object({
  name: z.string().trim().max(160),
  email: z.string().trim().max(160),
  telegramUsername: z.string().trim().max(64).nullish(),
  active: z.boolean(),
});
const updateBody = z.object({
  version: z.number().int().min(1),
  name: z.string().trim().max(160).nullish(),
  email: z.string().trim().max(160).nullish(),
  telegramUsername: z.string().trim().max(64).nullish(),
  active: z.boolean().nullish(),
});

export const { list, get, create, update, remove } = resourceRoutes<ProductDeveloper>(
  productDevelopersResource,
  {
    access: {
      read: 'product-developers:read',
      create: 'product-developers:create',
      update: 'product-developers:update',
      delete: 'product-developers:delete',
    },
    schemas: { create: createBody, update: updateBody },
  },
);

export const exportRoute = resourceExportRoute<ProductDeveloper>(productDevelopersResource, {
  access: 'product-developers:read',
  fileName: 'product-developers',
  columns: [
    { id: 'name', header: 'productDevelopers.fields.name', value: (e) => e.name },
    { id: 'email', header: 'productDevelopers.fields.email', value: (e) => e.email },
    {
      id: 'telegramLinked',
      header: 'productDevelopers.fields.telegram',
      value: (e) => e.telegramLinked,
    },
    {
      id: 'telegramUsername',
      header: 'productDevelopers.fields.telegramUsername',
      value: (e) => e.telegramUsername,
    },
    { id: 'active', header: 'productDevelopers.fields.active', value: (e) => e.active },
    { id: 'updatedAt', header: 'productDevelopers.columns.updated', value: (e) => e.updatedAt },
  ],
});

// ── Hand-written: the product editor's choices and Telegram linking ─────────

const uuid = z.uuid();
const idOf = (params: { id: string }) => {
  const id = uuid.safeParse(params.id);
  if (!id.success)
    throw new ApiClientError({ code: 'NOT_FOUND', message: 'Record not found.', status: 404 });
  return id.data;
};

/** Active developers (id, name) for the product editor. */
export const options = apiRoute<DeveloperOption[]>(
  {
    requires: {
      anyOf: ['product-developers:read', 'digital-products:create', 'digital-products:update'],
    },
  },
  async ({ api }) => ({
    data: (await api.get<DeveloperOption[]>('/product-developers/options')).data,
  }),
);

/** Issues a one-time code the developer sends to the bot. */
export const issueTelegramLink = apiRoute<TelegramLinkCode, { id: string }>(
  { requires: { permission: 'product-developers:update' } },
  async ({ api, params }) => {
    const res = await api.post<TelegramLinkCode>(
      `/product-developers/${idOf(params)}/telegram-link`,
      {},
    );
    return { data: res.data, status: 201 };
  },
);

export const unlinkTelegram = apiRoute<ProductDeveloper, { id: string }>(
  { requires: { permission: 'product-developers:update' } },
  async ({ api, params }) => {
    const res = await api.delete<ProductDeveloper>(
      `/product-developers/${idOf(params)}/telegram-link`,
    );
    return { data: res.data, message: res.message };
  },
);
