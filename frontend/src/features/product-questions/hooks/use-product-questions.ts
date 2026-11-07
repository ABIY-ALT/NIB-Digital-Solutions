'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { createResourceHooks } from '@/shared/data/resource-hooks';
import { productQuestionsResource } from '../resource';
import type { ProductQuestion, ProductQuestionInput, QuestionConversation } from '../types';

/** Product questions hooks: component → hook → /api/product-questions (Next.js) → NestJS. */
const productQuestions = createResourceHooks<
  ProductQuestion,
  ProductQuestionInput,
  ProductQuestionInput
>(productQuestionsResource);

export const productQuestionKeys = productQuestions.keys;
export const useProductQuestions = productQuestions.useList;
export const useSaveProductQuestion = productQuestions.useSave;
export const useDeleteProductQuestion = productQuestions.useRemove;
export const productQuestionsExportPath = productQuestions.exportPath;

/** The conversation with its delivery log; refreshes while it is open (Telegram replies arrive). */
export function useQuestionConversation(id: string) {
  return useQuery({
    queryKey: [...productQuestionKeys.all, 'conversation', id],
    queryFn: async ({ signal }) =>
      (
        await apiFetch<QuestionConversation>(`/api/product-questions/${id}/conversation`, {
          signal,
        })
      ).data,
    refetchInterval: 20_000,
  });
}

/** A staff answer: saved, e-mailed to the customer, status → answered. */
export function useReplyToQuestion(id: string) {
  return useMutation({
    mutationFn: async (body: string) =>
      (
        await apiFetch<ProductQuestion>(`/api/product-questions/${id}/replies`, {
          method: 'POST',
          body: { body },
        })
      ).data,
    meta: { invalidates: [productQuestionKeys.all] },
  });
}
