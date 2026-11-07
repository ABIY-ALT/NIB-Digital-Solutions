import { z } from 'zod';
import type { ProductIdea, ProductIdeaInput } from './types';

type T = (key: string) => string;
const id: T = (k) => k;

/** Moderation workflow (same list as the backend). */
export const IDEA_STATUSES = [
  'submitted',
  'under_review',
  'approved',
  'in_development',
  'completed',
  'rejected',
] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];
/** Statuses visitors see on the idea board. */
export const PUBLIC_IDEA_STATUSES: readonly IdeaStatus[] = [
  'approved',
  'in_development',
  'completed',
];

/** Form schema. The reference is generated and votes are counted by the website, so neither is edited here. */
export const productIdeaFormSchema = (t: T = id) =>
  z.object({
    title: z.string().trim().min(4, t('validation.required')).max(160),
    problem: z.string().trim().min(20, t('validation.problem')).max(2000),
    categoryCode: z.string().trim().max(60),
    submitterName: z.string().trim().max(120),
    submitterEmail: z.email(t('validation.email')).max(160),
    status: z.enum(IDEA_STATUSES),
    adminNote: z.string().trim().max(2000),
  });
export type ProductIdeaFormValues = z.infer<ReturnType<typeof productIdeaFormSchema>>;

export const productIdeaFormDefaults = (e?: ProductIdea | null): ProductIdeaFormValues => ({
  title: e?.title ?? '',
  problem: e?.problem ?? '',
  categoryCode: e?.categoryCode ?? '',
  submitterName: e?.submitterName ?? '',
  submitterEmail: e?.submitterEmail ?? '',
  status: e?.status ?? 'approved',
  adminNote: e?.adminNote ?? '',
});

export const toProductIdeaInput = (v: ProductIdeaFormValues): ProductIdeaInput => ({
  title: v.title,
  problem: v.problem,
  categoryCode: v.categoryCode || null,
  submitterName: v.submitterName || null,
  submitterEmail: v.submitterEmail,
  status: v.status,
  adminNote: v.adminNote || null,
});
