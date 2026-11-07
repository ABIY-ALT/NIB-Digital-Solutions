'use client';

import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { downloadFromApi } from '@/infrastructure/api/download';
import type { ApiSchemas } from '@/shared/api';

/** Document hooks: component → hook → /api/documents → NestJS. */
export interface DocumentRef {
  /** Document source registered by the backend module, e.g. "roles". */
  source: string;
  id: string;
}

export interface SendDocumentInput extends DocumentRef {
  to: string;
  toName?: string;
  subject?: string;
  message?: string;
}

const base = ({ source, id }: DocumentRef): string =>
  `/api/documents/${encodeURIComponent(source)}/${encodeURIComponent(id)}`;

export function useDownloadDocument() {
  return useMutation({
    mutationFn: (ref: DocumentRef) =>
      downloadFromApi(`${base(ref)}/pdf`, new URLSearchParams(), `${ref.source}-${ref.id}.pdf`),
    meta: { notify: { error: true } },
  });
}

export function useSendDocument() {
  return useMutation({
    mutationFn: async ({ source, id, ...body }: SendDocumentInput) =>
      (
        await apiFetch<ApiSchemas['SentDocument']>(`${base({ source, id })}/send`, {
          method: 'POST',
          body,
          timeoutMs: 60_000,
        })
      ).data,
  });
}
