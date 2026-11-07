import type { AuditLogEntry } from '@/features/audit/types';

/** A new lead counts as "waiting" once it is older than this. */
export const WAITING_AFTER_MS = 24 * 60 * 60 * 1000;

/** A demo request or inquiry as listed on the home page ("Latest demo requests and inquiries"). */
export interface WorkspaceLead {
  kind: 'demo' | 'inquiry';
  id: string;
  reference: string;
  name: string;
  organization: string | null;
  productSlug: string | null;
  /** Demo type (online, onsite, …) or inquiry type (pricing, integration, …). */
  type: string | null;
  status: string;
  /** User id of the owner; null when unassigned. */
  assignedTo: string | null;
  createdAt: string;
}

/**
 * The NIB Digital Solutions part of the staff home page. Every section is null
 * when the user may not read what it is built from.
 */
export interface DigitalSolutionsWorkspace {
  /** New demo requests; `waiting`: of those, received more than 24 hours ago. */
  demoRequests: { new: number; waiting: number } | null;
  /** New product inquiries; `waiting`: of those, received more than 24 hours ago. */
  inquiries: { new: number; waiting: number } | null;
  /** Ideas waiting for a decision. */
  ideas: { submitted: number; underReview: number } | null;
  /** Customer questions waiting for an answer. */
  questions: { open: number; inProgress: number } | null;
  /** Customer reviews waiting for approval (null without product-reviews:read; absent from older payloads). */
  reviews?: { pending: number } | null;
  /** Most recent demo requests and inquiries together, newest first. */
  latestLeads: WorkspaceLead[] | null;
  /** What visitors can see on the website. */
  catalogue: {
    published: number;
    total: number;
    comingSoon: number;
    pilot: number;
    /** null when the user may not read the hero carousel. */
    heroSlides: number | null;
  } | null;
}

/** Screen-shaped dashboard payload aggregated by the BFF. */
export interface DashboardSummary {
  /** null when the user may not read users (only loaded without a workspace). */
  userStats: { total: number; active: number; locked: number; disabled: number } | null;
  /** null when the user may not read the audit trail (only loaded without a workspace). */
  recentActivity: AuditLogEntry[] | null;
  sessionEndsAt: string;
  /**
   * NIB Digital Solutions sections; null (or absent) when the user has none of
   * the marketplace permissions — the page then shows the general overview.
   */
  workspace?: DigitalSolutionsWorkspace | null;
}

/** Query key shared by the client hook and server prefetch. */
export const dashboardQueryKey = ['dashboard'] as const;
