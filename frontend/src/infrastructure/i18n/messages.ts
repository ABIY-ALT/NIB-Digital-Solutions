/**
 * Message catalogue. Each feature owns its translations in
 * features/<feature>/i18n/<locale>.json under its own top-level namespace, so
 * teams edit their own files without conflicts. Register new features here.
 */
type Messages = Record<string, unknown>;

const catalogue: Record<string, Array<() => Promise<{ default: Messages }>>> = {
  en: [
    () => import('@/shared/i18n/en.json'),
    () => import('@/features/auth/i18n/en.json'),
    () => import('@/features/dashboard/i18n/en.json'),
    () => import('@/features/dashboards/i18n/en.json'),
    () => import('@/features/users/i18n/en.json'),
    () => import('@/features/roles/i18n/en.json'),
    () => import('@/features/audit/i18n/en.json'),
    () => import('@/features/profile/i18n/en.json'),
    () => import('@/features/approvals/i18n/en.json'),
    () => import('@/features/notifications/i18n/en.json'),
    () => import('@/features/reference-data/i18n/en.json'),
    () => import('@/features/compliance/i18n/en.json'),
    () => import('@/features/quick-search/i18n/en.json'),
    () => import('@/features/component-gallery/i18n/en.json'),
    () => import('@/features/settings/i18n/en.json'),
    () => import('@/features/documents/i18n/en.json'),
    () => import('@/features/digital-products/i18n/en.json'),
    () => import('@/features/product-categories/i18n/en.json'),
    () => import('@/features/demo-requests/i18n/en.json'),
    () => import('@/features/product-inquiries/i18n/en.json'),
    () => import('@/features/marketplace/i18n/en.json'),
    () => import('@/features/marketplace-admin/i18n/en.json'),
    () => import('@/features/hero-slides/i18n/en.json'),
    () => import('@/features/product-ideas/i18n/en.json'),
    () => import('@/features/product-developers/i18n/en.json'),
    () => import('@/features/product-questions/i18n/en.json'),
    () => import('@/features/product-reviews/i18n/en.json'),
    // appcore:messages:en (feature generator inserts new catalogues above this line)
  ],
  am: [
    () => import('@/shared/i18n/am.json'),
    () => import('@/features/auth/i18n/am.json'),
    () => import('@/features/dashboard/i18n/am.json'),
    () => import('@/features/dashboards/i18n/am.json'),
    () => import('@/features/users/i18n/am.json'),
    () => import('@/features/roles/i18n/am.json'),
    () => import('@/features/audit/i18n/am.json'),
    () => import('@/features/profile/i18n/am.json'),
    () => import('@/features/approvals/i18n/am.json'),
    () => import('@/features/notifications/i18n/am.json'),
    () => import('@/features/reference-data/i18n/am.json'),
    () => import('@/features/compliance/i18n/am.json'),
    () => import('@/features/quick-search/i18n/am.json'),
    () => import('@/features/component-gallery/i18n/am.json'),
    () => import('@/features/settings/i18n/am.json'),
    () => import('@/features/documents/i18n/am.json'),
    () => import('@/features/digital-products/i18n/am.json'),
    () => import('@/features/product-categories/i18n/am.json'),
    () => import('@/features/demo-requests/i18n/am.json'),
    () => import('@/features/product-inquiries/i18n/am.json'),
    () => import('@/features/marketplace/i18n/am.json'),
    () => import('@/features/marketplace-admin/i18n/am.json'),
    () => import('@/features/hero-slides/i18n/am.json'),
    () => import('@/features/product-ideas/i18n/am.json'),
    () => import('@/features/product-developers/i18n/am.json'),
    () => import('@/features/product-questions/i18n/am.json'),
    () => import('@/features/product-reviews/i18n/am.json'),
    // appcore:messages:am (feature generator inserts new catalogues above this line)
  ],
};

export async function loadMessages(locale: string): Promise<Messages> {
  const loaders = catalogue[locale] ?? catalogue.en!;
  const modules = await Promise.all(loaders.map((load) => load()));
  return Object.assign({}, ...modules.map((m) => m.default)) as Messages;
}
