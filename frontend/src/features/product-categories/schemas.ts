import { z } from 'zod';
import type { ProductCategory, ProductCategoryInput } from './types';

type T = (key: string) => string;
const id: T = (k) => k;

/** Form schema (strings for inputs; converted by `toInput`). Translated messages via `t`. */
export const productCategoryFormSchema = (t: T = id) =>
  z.object({
    code: z.string().trim().min(1, t('validation.required')).max(160),
    name: z.string().trim().min(1, t('validation.required')).max(160),
    description: z.string().trim().max(2000),
    icon: z.string().trim().max(160),
    sortOrder: z
      .string()
      .trim()
      .refine((v) => v === '' || /^-?\d+$/.test(v), t('validation.number')),
  });
export type ProductCategoryFormValues = z.infer<ReturnType<typeof productCategoryFormSchema>>;

export const productCategoryFormDefaults = (
  e?: ProductCategory | null,
): ProductCategoryFormValues => ({
  code: e?.code ?? '',
  name: e?.name ?? '',
  description: e?.description ?? '',
  icon: e?.icon ?? '',
  sortOrder: e?.sortOrder === null || e?.sortOrder === undefined ? '' : String(e.sortOrder),
});

export const toProductCategoryInput = (v: ProductCategoryFormValues): ProductCategoryInput => ({
  code: v.code,
  name: v.name,
  description: v.description || null,
  icon: v.icon || null,
  sortOrder: v.sortOrder === '' ? null : Number(v.sortOrder),
});
