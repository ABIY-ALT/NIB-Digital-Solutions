import type {
  Availability,
  ContactMethod,
  DemoType,
  DeploymentType,
  InquiryType,
  Platform,
  Taxonomy,
  TaxonomyEntry,
} from './types';

/**
 * Marketplace vocabularies. Display texts live in the i18n catalogue
 * (marketplace.availability.<id>, …). Industries and business needs are not
 * here: they are managed reference data served with the catalog (see
 * `Taxonomy`), so staff can add, rename, translate or retire them.
 */

/** Lookups over the catalog's taxonomy; unknown ids (e.g. a retired industry) return undefined. */
export function taxonomyIndex(taxonomy: Taxonomy) {
  const industries = new Map(taxonomy.industries.map((e) => [e.id, e]));
  const needs = new Map(taxonomy.needs.map((e) => [e.id, e]));
  return {
    industry: (id: string): TaxonomyEntry | undefined => industries.get(id),
    need: (id: string): TaxonomyEntry | undefined => needs.get(id),
  };
}

export const AVAILABILITIES: Availability[] = [
  'available',
  'pilot',
  'coming_soon',
  'in_development',
  'temporarily_unavailable',
];
/** Not launched yet: shown in the "Coming soon" section, apart from the launched catalog. */
export const UPCOMING: Availability[] = ['coming_soon', 'in_development'];
export const isUpcoming = (p: { availability: Availability }) => UPCOMING.includes(p.availability);
export const DEPLOYMENTS: DeploymentType[] = ['cloud', 'on_premise', 'hybrid'];
export const PLATFORMS: Platform[] = ['web', 'android', 'ios', 'ussd'];
export const DEMO_TYPES: DemoType[] = ['online', 'onsite', 'recorded', 'customized'];
export const INQUIRY_TYPES: InquiryType[] = [
  'product_information',
  'pricing',
  'customization',
  'integration',
  'partnership',
  'deployment',
  'technical_consultation',
];
export const CONTACT_METHODS: ContactMethod[] = ['email', 'phone', 'whatsapp', 'telegram'];

/** English labels used inside assistant answers (product content is English too). */
export const EN = {
  availability: {
    available: 'Available now',
    pilot: 'Pilot program',
    coming_soon: 'Coming soon',
    in_development: 'In development',
    temporarily_unavailable: 'Temporarily unavailable',
  } satisfies Record<Availability, string>,
  deployment: {
    cloud: 'NIB Cloud (SaaS)',
    on_premise: 'On-premise',
    hybrid: 'Hybrid',
  } satisfies Record<DeploymentType, string>,
  platform: { web: 'Web', android: 'Android', ios: 'iOS', ussd: 'USSD' } satisfies Record<
    Platform,
    string
  >,
};
