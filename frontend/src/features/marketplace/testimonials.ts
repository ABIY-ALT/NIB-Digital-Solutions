/**
 * Customer testimonials for the homepage "What our customers say" marquee.
 *
 * Only publish real quotes, with the customer's permission. Entries marked
 * `sample: true` are placeholders: they are shown (with a "Sample" badge) in
 * development so the section can be previewed, and are never shown in a
 * production build. With no real entries the section is hidden.
 */
export interface Testimonial {
  id: string;
  quote: string;
  name: string;
  /** Job title, e.g. "Finance Manager". */
  role: string;
  organization: string;
  /** 1 to 5; omit to show no stars. */
  rating?: number;
  /** Optional photo (square, at least 96 px); initials are shown otherwise. */
  photoUrl?: string;
  /** Slug of the product the quote is about: shown as a link on the card. */
  productSlug?: string;
  /** Placeholder content: development only. */
  sample?: boolean;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    id: 'sample-school',
    quote:
      'Fee collection used to take our office two weeks every term. Parents now pay from their phones and the reports are ready the same day.',
    name: 'Selamawit Tesfaye',
    role: 'Finance Head',
    organization: 'Private school (sample)',
    rating: 5,
    sample: true,
  },
  {
    id: 'sample-construction',
    quote:
      'Site managers record materials and progress on their phones. For the first time we see costs per project while the work is still going on.',
    name: 'Dawit Bekele',
    role: 'Operations Director',
    organization: 'Construction company (sample)',
    rating: 5,
    sample: true,
  },
  {
    id: 'sample-lending',
    quote:
      'Loan applications, approvals and repayments are in one place. Our officers spend their time with members instead of with paper files.',
    name: 'Hanna Girma',
    role: 'General Manager',
    organization: 'Savings & credit cooperative (sample)',
    rating: 5,
    sample: true,
  },
  {
    id: 'sample-retail',
    quote:
      'Setup was quick and the team in Addis adapted the reports to the way we already work. Payments settle straight into our account.',
    name: 'Yonas Alemu',
    role: 'Owner',
    organization: 'Retail chain (sample)',
    rating: 4,
    sample: true,
  },
  {
    id: 'sample-health',
    quote:
      'Patients book and pay ahead, so the morning queue is gone. The support team answered every question during our first month.',
    name: 'Meron Haile',
    role: 'Clinic Administrator',
    organization: 'Health clinic (sample)',
    rating: 5,
    sample: true,
  },
  {
    id: 'sample-logistics',
    quote:
      'We replaced three spreadsheets and a notebook with one dashboard. Month-end closing went from days to an afternoon.',
    name: 'Abel Tadesse',
    role: 'Finance Manager',
    organization: 'Logistics company (sample)',
    rating: 5,
    sample: true,
  },
];

/** The testimonials to show: placeholders are dropped from production builds. */
export function visibleTestimonials(
  list: readonly Testimonial[],
  production = process.env.NODE_ENV === 'production',
): Testimonial[] {
  return list.filter((item) => !(production && item.sample));
}
