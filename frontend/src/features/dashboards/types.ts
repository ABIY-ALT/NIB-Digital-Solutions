/**
 * Dashboard catalogue contracts. Each dashboard has ONE screen-shaped payload
 * (built by its provider on the server, rendered by its view on the client);
 * `DashboardDataMap` ties the two together, so a provider that returns the
 * wrong shape — or a view that reads a missing field — is a compile error.
 */

// ── Periods ─────────────────────────────────────────────────────────────────
export const DASHBOARD_RANGES = ['7d', '30d', '90d', '12m'] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

/** Bucket size of a time series: 7d/30d → day, 90d → week, 12m → month. */
export type Granularity = 'day' | 'week' | 'month';

/** A figure for the selected period and the one before it (deltas are derived). */
export interface Metric {
  value: number;
  previous: number;
  /** Recent values for a sparkline (oldest first). */
  trend?: number[];
}

/** One bucket of a time series: `date` is the bucket start (YYYY-MM-DD). */
export type TimePoint<K extends string> = { date: string } & Record<K, number>;

/** Share of a whole by key (keys are translated by the view). */
export interface Share<K extends string = string> {
  key: K;
  value: number;
}

// ── CRM ─────────────────────────────────────────────────────────────────────
export type DealStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won';
export type CrmActivityKind = 'call' | 'meeting' | 'email' | 'demo' | 'contract';

export interface CrmDashboard {
  granularity: Granularity;
  highlight: { name: string; revenue: number; target: number; dealsWon: number };
  totals: { revenue: Metric; customers: Metric; dealsWon: Metric; pipeline: Metric };
  kpis: { newLeads: Metric; conversion: Metric; avgDeal: Metric; churn: Metric };
  revenue: TimePoint<'won' | 'target'>[];
  funnel: Array<{ stage: DealStage; count: number; value: number }>;
  sources: Share<'referral' | 'website' | 'events' | 'outbound' | 'partners' | 'social'>[];
  reps: Array<{
    id: string;
    name: string;
    team: string;
    deals: number;
    revenue: number;
    quota: number;
  }>;
  regions: Array<{ code: string; name: string; revenue: number; change: number }>;
  performance: {
    axes: Array<'prospecting' | 'meetings' | 'proposals' | 'closing' | 'retention' | 'upsell'>;
    team: number[];
    target: number[];
  };
  deals: Array<{
    id: string;
    company: string;
    owner: string;
    stage: DealStage;
    amount: number;
    probability: number;
    closeDate: string;
  }>;
  agenda: Array<{ id: string; kind: CrmActivityKind; company: string; owner: string; at: string }>;
}

// ── Analytics ───────────────────────────────────────────────────────────────
export interface AnalyticsDashboard {
  granularity: Granularity;
  kpis: {
    visitors: Metric;
    sessions: Metric;
    bounceRate: Metric;
    /** Seconds. */
    avgDuration: Metric;
  };
  traffic: TimePoint<'visitors' | 'pageViews'>[];
  sources: Share<'organic' | 'direct' | 'social' | 'referral' | 'email' | 'paid'>[];
  devices: Share<'desktop' | 'mobile' | 'tablet'>[];
  browsers: Array<{ name: string; value: number; change: number }>;
  /** ISO 3166 alpha-2 country codes (names come from Intl.DisplayNames). */
  countries: Array<{ code: string; value: number; change: number }>;
  pages: Array<{ path: string; views: number; avgTime: number; bounce: number }>;
  /** heat[weekday 0=Mon][hour 0–23] = sessions. */
  heat: number[][];
  goal: { completed: number; target: number };
  campaign: Share<'sent' | 'delivered' | 'opened' | 'clicked' | 'converted'>[];
}

// ── eCommerce ───────────────────────────────────────────────────────────────
export type OrderStatus =
  'delivered' | 'shipped' | 'processing' | 'pending' | 'cancelled' | 'returned';
export type PaymentMethod = 'card' | 'wallet' | 'transfer' | 'cash';

export interface EcommerceDashboard {
  granularity: Granularity;
  highlight: { sales: number; target: number; product: string };
  kpis: { revenue: Metric; orders: Metric; aov: Metric; refundRate: Metric };
  totals: { orders: Metric; customers: Metric; units: Metric; revenue: Metric };
  revenue: TimePoint<'revenue' | 'expenses'>[];
  statuses: Share<OrderStatus>[];
  categories: Share<'electronics' | 'fashion' | 'home' | 'beauty' | 'sports' | 'books'>[];
  topProducts: Array<{
    id: string;
    name: string;
    category: string;
    units: number;
    revenue: number;
    change: number;
  }>;
  orders: Array<{
    id: string;
    customer: string;
    items: number;
    total: number;
    status: OrderStatus;
    payment: PaymentMethod;
    placedAt: string;
  }>;
  inventory: Array<{ sku: string; name: string; stock: number; capacity: number }>;
  funnel: Share<'visits' | 'productViews' | 'cart' | 'checkout' | 'purchase'>[];
}

// ── Academy ─────────────────────────────────────────────────────────────────
export type Topic = 'design' | 'development' | 'business' | 'data' | 'marketing' | 'language';

export interface AcademyDashboard {
  granularity: Granularity;
  learner: { hours: number; goalHours: number; streakDays: number; completion: number };
  kpis: { learners: Metric; completions: Metric; avgScore: Metric; hours: Metric };
  activity: TimePoint<'learners' | 'completions'>[];
  /** Learning hours per weekday (Monday first). */
  weekHours: number[];
  topics: Share<Topic>[];
  instructors: Array<{
    id: string;
    name: string;
    topic: Topic;
    courses: number;
    students: number;
    rating: number;
  }>;
  courses: Array<{
    id: string;
    title: string;
    topic: Topic;
    lessons: number;
    learners: number;
    progress: number;
    rating: number;
  }>;
  assignments: Array<{ id: string; title: string; topic: Topic; progress: number; dueAt: string }>;
  webinars: Array<{
    id: string;
    title: string;
    host: string;
    at: string;
    seats: number;
    booked: number;
  }>;
}

// ── Logistics ───────────────────────────────────────────────────────────────
export type ShipmentStep = 'ordered' | 'packed' | 'dispatched' | 'inTransit' | 'delivered';
export type VehicleStatus = 'onTime' | 'delayed' | 'issue';

export interface LogisticsDashboard {
  granularity: Granularity;
  kpis: { onRoute: Metric; withErrors: Metric; deviated: Metric; late: Metric };
  fleet: Array<{
    key: 'onTheWay' | 'unloading' | 'loading' | 'waiting';
    vehicles: number;
    hours: number;
  }>;
  shipments: TimePoint<'shipped' | 'delivered'>[];
  performance: Array<{
    key:
      'inTransit' | 'outForDelivery' | 'delivered' | 'successRate' | 'avgDeliveryHours' | 'rating';
    value: number;
    change: number;
  }>;
  exceptions: Share<'address' | 'weather' | 'holiday' | 'damaged' | 'customs' | 'other'>[];
  /** Share of deliveries on time (0–1). */
  onTime: number;
  tracked: {
    id: string;
    from: string;
    to: string;
    current: ShipmentStep;
    steps: Array<{ step: ShipmentStep; at: string | null }>;
  };
  vehicles: Array<{
    id: string;
    driver: string;
    from: string;
    to: string;
    status: VehicleStatus;
    progress: number;
    eta: string;
  }>;
}

// ── Finance ─────────────────────────────────────────────────────────────────
export type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'draft';

export interface FinanceDashboard {
  granularity: Granularity;
  kpis: { revenue: Metric; expenses: Metric; netProfit: Metric; cash: Metric };
  cashflow: TimePoint<'inflow' | 'outflow'>[];
  /** Revenue → net profit bridge for the period. */
  bridge: Array<{
    key: 'revenue' | 'cogs' | 'opex' | 'payroll' | 'tax' | 'net';
    value: number;
    total?: boolean;
  }>;
  expenses: Share<'payroll' | 'rent' | 'marketing' | 'technology' | 'travel' | 'other'>[];
  budget: Array<{
    key: 'sales' | 'marketing' | 'operations' | 'technology' | 'people';
    actual: number;
    budget: number;
  }>;
  aging: Share<'current' | 'd30' | 'd60' | 'd90' | 'd90plus'>[];
  ratios: { current: number; quick: number; grossMargin: number; dso: number };
  invoices: Array<{
    id: string;
    customer: string;
    amount: number;
    dueDate: string;
    status: InvoiceStatus;
  }>;
}

// ── Support ─────────────────────────────────────────────────────────────────
export type TicketPriority = 'urgent' | 'high' | 'normal' | 'low';
export type TicketStatus = 'new' | 'open' | 'pending' | 'solved';

export interface SupportDashboard {
  granularity: Granularity;
  kpis: {
    created: Metric;
    resolved: Metric;
    /** Minutes. */
    firstResponse: Metric;
    /** Ratio 0–1. */
    csat: Metric;
  };
  volume: TimePoint<'created' | 'resolved'>[];
  channels: Share<'email' | 'chat' | 'phone' | 'portal' | 'social'>[];
  backlog: Share<'new' | 'open' | 'pending' | 'onHold' | 'escalated'>[];
  /** Share of tickets answered within SLA (0–1) and the target. */
  sla: { met: number; target: number };
  satisfaction: Share<'great' | 'good' | 'okay' | 'poor'>[];
  agents: Array<{
    id: string;
    name: string;
    team: string;
    resolved: number;
    csat: number;
    online: boolean;
  }>;
  /** heat[weekday 0=Mon][hour 0–23] = tickets created. */
  heat: number[][];
  tickets: Array<{
    id: string;
    subject: string;
    customer: string;
    priority: TicketPriority;
    status: TicketStatus;
    agent: string | null;
    createdAt: string;
  }>;
}

// ── HR ──────────────────────────────────────────────────────────────────────
export type Department = 'engineering' | 'sales' | 'operations' | 'finance' | 'people' | 'support';

export interface HrDashboard {
  granularity: Granularity;
  kpis: {
    headcount: Metric;
    hires: Metric;
    /** Annualised attrition, ratio 0–1. */
    attrition: Metric;
    openRoles: Metric;
  };
  movement: TimePoint<'hires' | 'exits'>[];
  departments: Array<{ key: Department; employees: number; change: number }>;
  contracts: Share<'permanent' | 'contract' | 'intern' | 'temporary'>[];
  tenure: Share<'lt1' | 'y1to3' | 'y3to5' | 'y5to10' | 'gt10'>[];
  recruitment: Share<'applied' | 'screened' | 'interviewed' | 'offered' | 'hired'>[];
  engagement: {
    axes: Array<'growth' | 'recognition' | 'wellbeing' | 'management' | 'teamwork' | 'pay'>;
    current: number[];
    previous: number[];
  };
  roles: Array<{
    id: string;
    title: string;
    department: Department;
    applicants: number;
    postedAt: string;
  }>;
  calendar: Array<{
    id: string;
    name: string;
    kind: 'birthday' | 'anniversary' | 'leave' | 'onboarding';
    at: string;
  }>;
}

// ── Catalogue wiring ────────────────────────────────────────────────────────
/** Every dashboard id and the payload its view renders. Add a dashboard here first. */
export interface DashboardDataMap {
  crm: CrmDashboard;
  analytics: AnalyticsDashboard;
  ecommerce: EcommerceDashboard;
  academy: AcademyDashboard;
  logistics: LogisticsDashboard;
  finance: FinanceDashboard;
  support: SupportDashboard;
  hr: HrDashboard;
}

export type DashboardId = keyof DashboardDataMap;

/** BFF response: the payload plus where it came from. */
export interface DashboardPayload<K extends DashboardId = DashboardId> {
  id: K;
  range: DashboardRange;
  /** "sample": generated demo data — the UI labels it; "live": a real provider. */
  source: 'sample' | 'live';
  generatedAt: string;
  data: DashboardDataMap[K];
}

/** Query keys shared by the client hook and the server prefetch. */
export const dashboardsKeys = {
  all: ['dashboards'] as const,
  detail: (id: DashboardId, range: DashboardRange) => ['dashboards', id, range] as const,
};
