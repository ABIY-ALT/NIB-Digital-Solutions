import type { MarketplaceProduct } from '../types';

/** A complete public product for tests; override what the test is about. */
export function testProduct(
  slug: string,
  overrides: Partial<MarketplaceProduct> = {},
): MarketplaceProduct {
  return {
    id: `id-${slug}`,
    slug,
    name: `Product ${slug}`,
    tagline: `Tagline of ${slug}`,
    summary: `Summary of ${slug}, long enough to read.`,
    overview: '',
    problem: '',
    categoryCode: 'business-management',
    availability: 'available',
    releaseDate: null,
    featured: false,
    customizable: true,
    icon: 'Package',
    accent: '#8A4D1F',
    industries: [],
    needs: [],
    deployment: ['cloud'],
    platforms: ['web'],
    keyFeatures: ['One', 'Two', 'Three'],
    askDeveloper: false,
    rating: null,
    featuredReview: null,
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
    content: {
      benefits: [],
      modules: [],
      screenshots: [{ id: 's1', title: 'Dashboard', caption: '', variant: 'dashboard' }],
      demo: null,
      targetCustomers: [],
      integrations: [],
      integrationNotes: '',
      faqs: [],
      screenLabels: {
        kpis: [
          { label: 'A', value: '1' },
          { label: 'B', value: '2' },
          { label: 'C', value: '3' },
        ],
        rows: ['Row 1', 'Row 2', 'Row 3'],
        mobileTitle: 'Home',
      },
    },
    ...overrides,
  } as MarketplaceProduct;
}

export const testCategories = [
  {
    code: 'business-management',
    name: 'Business Management',
    description: '',
    icon: 'Briefcase',
    sortOrder: 1,
  },
];
