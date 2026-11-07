/**
 * Marketplace vocabularies shared by the digital-products, demo-requests,
 * product-inquiries and marketplace modules (pure domain constants).
 */

export const PRODUCT_STATUSES = ['draft', 'published', 'archived'] as const;
export const AVAILABILITIES = [
  'available',
  'pilot',
  'coming_soon',
  'in_development',
  'temporarily_unavailable',
] as const;
/** Not launched yet: shown in the homepage "Coming soon" section, apart from the launched catalog. */
export const UPCOMING_AVAILABILITIES = ['coming_soon', 'in_development'] as const;
/** Whether customers can ask the product's developer ("Ask the developer"). */
export const SUPPORT_STATUSES = ['active', 'limited', 'paused'] as const;
export const DEPLOYMENTS = ['cloud', 'on_premise', 'hybrid'] as const;
export const PLATFORMS = ['web', 'android', 'ios', 'ussd'] as const;

// Industries and business needs are managed reference data ("marketplace-industries",
// "marketplace-needs"), shipped by migration 20261104120000_marketplace_taxonomy.
// See application/taxonomy.ts.

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'scheduled',
  'completed',
  'qualified',
  'closed_won',
  'closed_lost',
] as const;

export const DEMO_TYPES = ['online', 'onsite', 'recorded', 'customized'] as const;

export const INQUIRY_TYPES = [
  'product_information',
  'pricing',
  'customization',
  'integration',
  'partnership',
  'deployment',
  'technical_consultation',
] as const;

export const CONTACT_METHODS = ['email', 'phone', 'whatsapp', 'telegram'] as const;

export const LEAD_SOURCES = [
  'homepage',
  'product_card',
  'product_page',
  'assistant',
  'catalog',
  'contact_page',
  'navigation',
  'staff',
] as const;

export const SCREEN_VARIANTS = [
  'dashboard',
  'table',
  'mobile',
  'form',
  'analytics',
  'calendar',
  'ticket',
] as const;

export const EVENT_TYPES = [
  'product_view',
  'demo_play',
  'demo_request',
  'inquiry',
  'assistant_query',
] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type MarketplaceEventType = (typeof EVENT_TYPES)[number];

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

/** Internal follow-up note on a lead. */
export interface LeadNote {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export const isOneOf = <T extends readonly string[]>(list: T, value: unknown): value is T[number] =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

/** Application events published by the marketplace (consumed by notifications). */
export const MarketplaceEvents = {
  DemoRequested: 'marketplace.demo-requested',
  InquiryReceived: 'marketplace.inquiry-received',
  LeadAssigned: 'marketplace.lead-assigned',
} as const;

/** A lead was given to a (new) owner: the assignee is told. */
export interface LeadAssignedEvent {
  kind: 'demo' | 'inquiry';
  id: string;
  reference: string;
  name: string;
  organization: string | null;
  productSlug: string | null;
  /** User id of the new owner. */
  assigneeId: string;
  /** User id of whoever assigned it (no notification when people assign themselves). */
  assignedBy: string | null;
}

export interface LeadSubmittedEvent {
  kind: 'demo' | 'inquiry';
  id: string;
  reference: string;
  name: string;
  organization: string | null;
  productSlug: string | null;
  /** Demo type or inquiry type. */
  type: string;
  /** Where the customer confirmation goes (the visitor's own address). */
  email: string;
  /** Demo requests: the slot the customer asked for (YYYY-MM-DD, HH:MM). */
  preferredDate: string | null;
  preferredTime: string | null;
  /** Inquiries: how the customer wants to be contacted. */
  contactMethod: string | null;
}
