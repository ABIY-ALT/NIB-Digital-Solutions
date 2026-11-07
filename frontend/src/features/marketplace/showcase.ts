/**
 * Homepage storytelling configuration (sections below the hero). The hero
 * carousel itself is managed by staff in the administration screen
 * (Digital Solutions → Hero carousel), not here.
 */

/** Products told as long-form stories in "Featured solutions", in order. */
export const FEATURED_STORIES = [
  'school-management-system',
  'micro-lending-platform',
  'nibtera-gebeya-bnpl',
];

/**
 * Verified impact figures. Leave EMPTY until the product owner has confirmed a
 * figure, and always record its source. Nothing here is shown unless filled in;
 * otherwise the Impact section shows only facts computed from the live catalog.
 *
 * Example: { value: '120+', label: 'Schools collecting fees digitally', source: 'SMS product report, Q3 2026' }
 */
export interface VerifiedFigure {
  value: string;
  label: string;
  source: string;
}
export const VERIFIED_IMPACT: VerifiedFigure[] = [];
