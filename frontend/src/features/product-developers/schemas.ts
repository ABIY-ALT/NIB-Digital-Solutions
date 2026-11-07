import { z } from 'zod';
import type { ProductDeveloper, ProductDeveloperInput } from './types';

type T = (key: string) => string;
const id: T = (k) => k;

/** Form schema (strings for inputs; converted by `toInput`). Translated messages via `t`. */
export const productDeveloperFormSchema = (t: T = id) =>
  z.object({
    name: z.string().trim().min(1, t('validation.required')).max(160),
    email: z.email(t('validation.email')).max(160),
    // Optional; "@name" and t.me links are accepted and normalised.
    telegramUsername: z
      .string()
      .trim()
      .transform((v) => v.replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, ''))
      .refine(
        (v) => v === '' || /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(v),
        t('validation.telegramUsername'),
      ),
    active: z.boolean(),
  });
export type ProductDeveloperFormValues = z.infer<ReturnType<typeof productDeveloperFormSchema>>;

export const productDeveloperFormDefaults = (
  e?: ProductDeveloper | null,
): ProductDeveloperFormValues => ({
  name: e?.name ?? '',
  email: e?.email ?? '',
  telegramUsername: e?.telegramUsername ?? '',
  active: e?.active ?? true,
});

export const toProductDeveloperInput = (v: ProductDeveloperFormValues): ProductDeveloperInput => ({
  name: v.name,
  email: v.email,
  telegramUsername: v.telegramUsername || null,
  active: v.active,
});
