import { z } from 'zod';
import { apiSchema } from '#core/presentation/openapi/api-schema.js';
import { SCREEN_VARIANTS } from '#modules/marketplace/domain/marketplace.constants.js';
import type { DigitalProduct } from '../domain/digital-product.entity.js';

/**
 * Contract for a digital product's page content (benefits, modules, media,
 * FAQs, …). Shared by the staff API (/digital-products) and the public
 * marketplace API (/marketplace/products), so both validate the same shape.
 */

const line = (max: number) => z.string().trim().max(max);
/** https:// links, or media served by the marketplace itself (/api/marketplace/media/<id>). */
const mediaUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => /^https:\/\//.test(v) || /^\/api\/marketplace\/media\/[0-9a-f-]{36}$/.test(v),
    'Use an https:// link or an uploaded file',
  );

export const BenefitSchema = apiSchema(
  'ProductBenefit',
  z.object({ title: line(120), description: line(400), icon: line(40) }),
);
export const ModuleSchema = apiSchema(
  'ProductModule',
  z.object({ name: line(120), description: line(400), features: z.array(line(160)).max(20) }),
);
export const ScreenshotSchema = apiSchema(
  'ProductScreenshot',
  z.object({
    id: line(40),
    title: line(120),
    caption: line(300),
    variant: z.enum(SCREEN_VARIANTS),
    imageUrl: mediaUrl.optional(),
  }),
);
export const DemoChapterSchema = apiSchema(
  'ProductDemoChapter',
  z.object({ title: line(120), caption: line(300), variant: z.enum(SCREEN_VARIANTS) }),
);
export const DemoSchema = apiSchema(
  'ProductDemo',
  z.object({
    url: mediaUrl.optional(),
    duration: z.string().regex(/^\d{1,2}:\d{2}$/, 'Use m:ss, e.g. 2:14'),
    posterUrl: mediaUrl.optional(),
    chapters: z.array(DemoChapterSchema.zod).max(12),
  }),
);
export const AudienceSchema = apiSchema(
  'ProductAudience',
  z.object({ title: line(120), description: line(400) }),
);
export const FaqSchema = apiSchema(
  'ProductFaq',
  z.object({ question: line(300), answer: line(1500) }),
);
export const ScreenLabelsSchema = apiSchema(
  'ProductScreenLabels',
  z.object({
    kpis: z.array(z.object({ label: line(40), value: line(40) })).max(3),
    rows: z.array(line(80)).max(8),
    mobileTitle: line(40),
  }),
);

export const ProductContentSchema = apiSchema(
  'ProductContent',
  z.object({
    benefits: z.array(BenefitSchema.zod).max(8),
    modules: z.array(ModuleSchema.zod).max(12),
    screenshots: z.array(ScreenshotSchema.zod).max(12),
    demo: DemoSchema.zod.nullable(),
    targetCustomers: z.array(AudienceSchema.zod).max(8),
    integrations: z.array(line(80)).max(20),
    integrationNotes: line(1000),
    faqs: z.array(FaqSchema.zod).max(20),
    screenLabels: ScreenLabelsSchema.zod,
  }),
);
export type ProductContentDto = z.infer<typeof ProductContentSchema.zod>;

export const DocSectionSchema = apiSchema(
  'ProductDocSection',
  z.object({ title: line(120), body: line(4000) }),
);

export const EMPTY_CONTENT: ProductContentDto = {
  benefits: [],
  modules: [],
  screenshots: [],
  demo: null,
  targetCustomers: [],
  integrations: [],
  integrationNotes: '',
  faqs: [],
  screenLabels: { kpis: [], rows: [], mobileTitle: '' },
};

/**
 * Stored content → contract shape. Content is validated on write; this keeps
 * reads safe if older rows are missing newer keys.
 */
export function contentOf(product: DigitalProduct): ProductContentDto {
  const parsed = ProductContentSchema.zod.partial().safeParse(product.content);
  return { ...EMPTY_CONTENT, ...(parsed.success ? parsed.data : {}) };
}
