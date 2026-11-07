import { z } from 'zod';
import { apiRoute, parseWith, readJson } from '@/features/auth/api/api-route';
import { resourceRoutes } from '@/features/auth/api/resource-routes';
import { resourceExportRoute } from '@/features/auth/api/resource-transfer';
import { ApiClientError } from '@/shared/errors/api-client-error';
import { productQuestionsResource } from '../resource';
import type { ProductQuestion, QuestionConversation } from '../types';

/**
 * Product questions BFF routes → NestJS /product-questions. Questions are
 * created by customers on the website only, so there is no staff "create".
 */
const updateBody = z.object({
  version: z.number().int().min(1),
  status: z.enum(['open', 'in_progress', 'answered', 'closed']),
});

export const { list, get, update, remove } = resourceRoutes<ProductQuestion>(
  productQuestionsResource,
  {
    access: {
      read: 'product-questions:read',
      update: 'product-questions:update',
      delete: 'product-questions:delete',
    },
    schemas: { update: updateBody },
  },
);

export const exportRoute = resourceExportRoute<ProductQuestion>(productQuestionsResource, {
  access: 'product-questions:read',
  fileName: 'product-questions',
  columns: [
    { id: 'reference', header: 'productQuestions.fields.reference', value: (e) => e.reference },
    {
      id: 'productSlug',
      header: 'productQuestions.fields.productSlug',
      value: (e) => e.productSlug,
    },
    {
      id: 'customerName',
      header: 'productQuestions.fields.customerName',
      value: (e) => e.customerName,
    },
    {
      id: 'customerEmail',
      header: 'productQuestions.fields.customerEmail',
      value: (e) => e.customerEmail,
    },
    { id: 'status', header: 'productQuestions.fields.status', value: (e) => e.status },
    {
      id: 'lastMessageAt',
      header: 'productQuestions.fields.lastMessageAt',
      value: (e) => e.lastMessageAt,
    },
    { id: 'createdAt', header: 'productQuestions.fields.createdAt', value: (e) => e.createdAt },
  ],
});

const idOf = (params: { id: string }) => {
  const id = z.uuid().safeParse(params.id);
  if (!id.success)
    throw new ApiClientError({ code: 'NOT_FOUND', message: 'Record not found.', status: 404 });
  return id.data;
};

/** The conversation, assigned developers and delivery state of every notification and e-mail. */
export const conversation = apiRoute<QuestionConversation, { id: string }>(
  { requires: { permission: 'product-questions:read' } },
  async ({ api, params }) => ({
    data: (await api.get<QuestionConversation>(`/product-questions/${idOf(params)}/conversation`))
      .data,
  }),
);

const replyBody = z.object({ body: z.string().trim().min(2).max(4000) });

/** A staff answer (saved and e-mailed to the customer). */
export const reply = apiRoute<ProductQuestion, { id: string }>(
  { requires: { permission: 'product-questions:update' } },
  async ({ req, api, params }) => {
    const body = await readJson(req, parseWith(replyBody));
    const res = await api.post<ProductQuestion>(`/product-questions/${idOf(params)}/replies`, body);
    return { data: res.data, message: res.message, status: 201 };
  },
);
