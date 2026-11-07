import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiRoute, parseWith, readJson } from '@/features/auth/api/api-route';
import type { ApiData, ApiSchemas } from '@/shared/api';

/**
 * Records as PDF documents (Next.js API → NestJS /documents). The backend
 * checks the permissions of the record type; these routes only need a session.
 *
 *   GET  /api/documents/{source}/{id}/pdf    the PDF file (download)
 *   POST /api/documents/{source}/{id}/send   e-mails it as an attachment
 */
interface Params {
  source: string;
  id: string;
}

const path = ({ source, id }: Params, action: string): string =>
  `/documents/${encodeURIComponent(source)}/${encodeURIComponent(id)}/${action}`;

export const downloadPdf = apiRoute<never, Params>({}, async ({ api, params, correlationId }) => {
  const file = (await api.get<ApiSchemas['DocumentFile']>(path(params, 'pdf'))).data;
  return new NextResponse(Buffer.from(file.content, 'base64'), {
    headers: {
      'content-type': file.contentType,
      'content-disposition': `attachment; filename="${file.filename.replace(/[^\w.-]/g, '_')}"`,
      // Documents carry business data: never cached by the browser or a proxy.
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-correlation-id': correlationId,
    },
  });
});

const sendBody = z.object({
  to: z.email().max(254),
  toName: z.string().trim().max(120).optional(),
  subject: z.string().trim().max(160).optional(),
  message: z.string().trim().max(2000).optional(),
});

export const sendDocument = apiRoute<ApiData<'POST /documents/{source}/{id}/send'>, Params>(
  { requires: { permission: 'documents:send' } },
  async ({ req, api, params }) => {
    const body = await readJson(req, parseWith(sendBody));
    const res = await api.post<ApiData<'POST /documents/{source}/{id}/send'>>(
      path(params, 'send'),
      body,
      // Rendering plus the SMTP hand-off can take longer than a normal call.
      { timeoutMs: 60_000 },
    );
    return { data: res.data, message: res.message };
  },
);
