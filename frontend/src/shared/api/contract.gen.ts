/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
// GENERATED FILE — do not edit. Source: contracts/openapi.json (backend).
// Regenerate: npm run api:generate · Verify: npm run api:check
// ─────────────────────────────────────────────────────────────────────────────

/** Hash of the contract this file was generated from. */
export const CONTRACT_HASH = 'a342fac20632da60';

export interface ApprovalPolicyEntry {
  action: string;
  checkerPermissions: string[];
  required: boolean;
  resourceType: string;
}

export interface ApprovalRequest {
  action: string;
  after: Record<string, unknown> | null;
  before: Record<string, unknown> | null;
  canCancel: boolean;
  canDecide: boolean;
  changes: {
    after: unknown;
    before: unknown;
    field: string;
  }[];
  checker: {
    id: string;
    name: string;
  } | null;
  checkerComment: string | null;
  checkerPermissions: string[];
  createdAt: string;
  decidedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  expiresAt: string;
  id: string;
  maker: {
    id: string;
    name: string;
  };
  makerComment: string | null;
  resourceId: string | null;
  resourceType: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED" | "FAILED";
  summary: string;
  version: number;
}

export interface ApprovalSummary {
  inbox: number;
  mine: number;
}

export interface ApprovalTicket {
  action: string;
  approvalId: string;
  expiresAt: string;
  resourceId: string | null;
  resourceType: string;
  status: "PENDING";
  summary: string;
}

export interface AuditActivity {
  byCategory: {
    category: string;
    count: number;
  }[];
  denied: number;
  distinctActors: number;
  failures: number;
  topActions: {
    action: string;
    count: number;
  }[];
  total: number;
}

export interface AuditChange {
  fields: {
    after: unknown;
    before: unknown;
    field: string;
    redacted?: boolean;
  }[];
  operation: "create" | "update" | "delete" | "restore";
  proposed?: boolean;
  resourceId: string | null;
  resourceType: string;
}

export interface AuditCheckpoint {
  archiveRef: string | null;
  createdAt: string;
  createdBy: string | null;
  fromSeq: string | null;
  hash: string;
  id: string;
  kind: "ANCHOR" | "PURGE";
  recordCount: number;
  seq: string;
}

export interface AuditFacets {
  actions: {
    action: string;
    count: number;
  }[];
  resourceTypes: string[];
}

export interface AuditIntegrityReport {
  anchorsChecked: number;
  break: {
    id: string | null;
    reason: "UNSEALED" | "CHAIN_BROKEN" | "HASH_MISMATCH" | "ANCHOR_MISMATCH";
    seq: string;
  } | null;
  checked: number;
  durationMs: number;
  firstSeq: string | null;
  headHash: string | null;
  lastSeq: string | null;
  startsAfterPurge: {
    archiveRef: string | null;
    seq: string;
  } | null;
  status: "INTACT" | "BROKEN" | "EMPTY";
  verifiedAt: string;
}

export interface AuditLog {
  action: string;
  actorId: string | null;
  actorUsername: string | null;
  category: "AUTHENTICATION" | "AUTHORIZATION" | "DATA_ACCESS" | "DATA_CHANGE" | "FINANCIAL" | "SECURITY" | "SYSTEM";
  changes: Array<{
    fields: {
      after: unknown;
      before: unknown;
      field: string;
      redacted?: boolean;
    }[];
    operation: "create" | "update" | "delete" | "restore";
    proposed?: boolean;
    resourceId: string | null;
    resourceType: string;
  }>;
  correlationId: string | null;
  errorCode: string | null;
  hash: string | null;
  id: string;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
  outcome: "SUCCESS" | "FAILURE" | "DENIED";
  prevHash: string | null;
  resourceId: string | null;
  resourceType: string | null;
  seq: string;
  userAgent: string | null;
}

export interface ComplianceOverview {
  audit: {
    firstSeq: string | null;
    headHash: string | null;
    keyConfigured: boolean;
    lastSeq: string | null;
    newest: string | null;
    oldest: string | null;
    total: number;
    unsealed: number;
  };
  jobs: Array<{
    everyMs: number;
    lastError: string | null;
    lastFinishedAt: string | null;
    lastStartedAt: string | null;
    lastStatus: "success" | "failed" | "skipped" | null;
    name: string;
    nextRunAt: string | null;
  }>;
  lockout: {
    lockoutMinutes: number;
    maxFailedAttempts: number;
  };
  mfa: {
    requiredRoles: string[];
  };
  password: {
    changeOnFirstLogin: boolean;
    expiryWarningDays: number;
    historyCount: number;
    maxAgeDays: number;
    minAgeHours: number;
    minLength: number;
    requireDigit: boolean;
    requireLowercase: boolean;
    requireSymbol: boolean;
    requireUppercase: boolean;
  };
  retention: {
    enabled: boolean;
    intervalHours: number;
    policies: Array<{
      archive: boolean;
      basis: string | null;
      dataset: string;
      description: string;
      id: string;
      retentionDays: number;
    }>;
  };
  session: {
    absoluteHours: number;
    idleTimeoutMinutes: number;
    maxConcurrent: number;
    newDeviceAlerts: boolean;
  };
}

export interface DemoRequest {
  assignedTo: string | null;
  createdAt: string;
  demoType: "online" | "onsite" | "recorded" | "customized";
  email: string;
  followUpDate: string | null;
  fullName: string;
  id: string;
  jobTitle: string;
  notes: {
    author: string;
    body: string;
    createdAt: string;
    id: string;
  }[];
  organization: string;
  phone: string;
  preferredDate: string | null;
  preferredTime: string | null;
  productSlug: string;
  reference: string;
  requirements: string | null;
  source: string | null;
  status: "new" | "contacted" | "scheduled" | "completed" | "qualified" | "closed_won" | "closed_lost";
  updatedAt: string;
  version: number;
}

export interface DeveloperOption {
  id: string;
  name: string;
  telegramLinked: boolean;
  telegramUsername: string | null;
}

export interface DigitalProduct {
  accent: string | null;
  availability: "available" | "pilot" | "coming_soon" | "in_development" | "temporarily_unavailable";
  backupDeveloperId: string | null;
  categoryCode: string;
  content: {
    benefits: {
      description: string;
      icon: string;
      title: string;
    }[];
    demo: {
      chapters: Array<{
        caption: string;
        title: string;
        variant: "dashboard" | "table" | "mobile" | "form" | "analytics" | "calendar" | "ticket";
      }>;
      duration: string;
      posterUrl?: string;
      url?: string;
    } | null;
    faqs: {
      answer: string;
      question: string;
    }[];
    integrationNotes: string;
    integrations: string[];
    modules: {
      description: string;
      features: string[];
      name: string;
    }[];
    screenLabels: {
      kpis: {
        label: string;
        value: string;
      }[];
      mobileTitle: string;
      rows: string[];
    };
    screenshots: Array<{
      caption: string;
      id: string;
      imageUrl?: string;
      title: string;
      variant: "dashboard" | "table" | "mobile" | "form" | "analytics" | "calendar" | "ticket";
    }>;
    targetCustomers: {
      description: string;
      title: string;
    }[];
  };
  createdAt: string;
  customizable: boolean;
  deployment: Array<"cloud" | "on_premise" | "hybrid">;
  developerId: string | null;
  documentation: {
    body: string;
    title: string;
  }[];
  featured: boolean;
  icon: string | null;
  id: string;
  industries: string[];
  keyFeatures: string[];
  name: string;
  needs: string[];
  overview: string | null;
  platforms: Array<"web" | "android" | "ios" | "ussd">;
  problem: string | null;
  releaseDate: string | null;
  slug: string;
  status: "draft" | "published" | "archived";
  summary: string;
  supportStatus: "active" | "limited" | "paused";
  tagline: string | null;
  thirdDeveloperId: string | null;
  updatedAt: string;
  version: number;
}

export interface DocumentFile {
  content: string;
  contentType: string;
  filename: string;
  size: number;
}

export interface DocumentSource {
  canSend: boolean;
  key: string;
}

export type ErrorCode = "INTERNAL_ERROR" | "VALIDATION_FAILED" | "BAD_REQUEST" | "NOT_FOUND" | "ROUTE_NOT_FOUND" | "METHOD_NOT_ALLOWED" | "CONFLICT" | "CONCURRENCY_CONFLICT" | "BUSINESS_RULE_VIOLATION" | "PAYLOAD_TOO_LARGE" | "UNSUPPORTED_MEDIA_TYPE" | "RATE_LIMITED" | "SERVICE_UNAVAILABLE" | "UNAUTHENTICATED" | "AUTH_INVALID_CREDENTIALS" | "AUTH_ACCOUNT_LOCKED" | "AUTH_ACCOUNT_DISABLED" | "AUTH_TOKEN_INVALID" | "AUTH_TOKEN_EXPIRED" | "AUTH_SESSION_EXPIRED" | "AUTH_SESSION_REVOKED" | "AUTH_REFRESH_TOKEN_INVALID" | "AUTH_REFRESH_TOKEN_REUSED" | "AUTH_MFA_INVALID_CODE" | "AUTH_MFA_CHALLENGE_INVALID" | "AUTH_MFA_TOO_MANY_ATTEMPTS" | "AUTH_MFA_METHOD_UNSUPPORTED" | "AUTH_EXTERNAL_TOKEN_INVALID" | "AUTH_EXTERNAL_IDENTITY_UNLINKED" | "AUTH_PROVIDER_UNAVAILABLE" | "AUTH_PASSWORD_CHANGE_INVALID" | "AUTH_PASSWORD_RESET_INVALID" | "APPROVAL_NOT_PENDING" | "APPROVAL_SELF_DECISION" | "APPROVAL_ALREADY_PENDING" | "FORBIDDEN" | "SERVICE_AUTH_FAILED" | "PAYLOAD_ENCRYPTION_REQUIRED" | "PAYLOAD_DECRYPTION_FAILED" | "IDEMPOTENCY_KEY_MISSING" | "IDEMPOTENCY_KEY_INVALID" | "IDEMPOTENCY_IN_PROGRESS" | "IDEMPOTENCY_KEY_REUSED" | "EXTERNAL_SERVICE_ERROR" | "EXTERNAL_SERVICE_TIMEOUT" | "EXTERNAL_SERVICE_UNAVAILABLE";

export interface HeroCarouselSettings {
  autoplay: boolean;
  intervalSeconds: number;
  navigation: "arrows-and-dots" | "dots" | "arrows";
  pauseOnHover: boolean;
  transitionMs: number;
}

export interface HeroSlide {
  active: boolean;
  altText: string | null;
  createdAt: string;
  ctaHref: string | null;
  ctaLabel: string | null;
  description: string | null;
  desktopImageId: string;
  id: string;
  mobileImageId: string | null;
  sortOrder: number | null;
  title: string | null;
  updatedAt: string;
  version: number;
}

export interface IdeaSubmitted {
  reference: string;
}

export interface LeadNote {
  author: string;
  body: string;
  createdAt: string;
  id: string;
}

export interface LookupOption {
  active: boolean;
  attributes: Record<string, string | number | boolean | null | null>;
  code: string;
  description: string | null;
  label: string;
  parentCode: string | null;
}

export interface MarketplaceAnalytics {
  assistantQueries: number;
  daily: {
    date: string;
    leads: number;
    views: number;
  }[];
  days: number;
  demoPlays: number;
  demoRequests: number;
  inquiries: number;
  leadsByIndustry: {
    count: number;
    industry: string;
  }[];
  leadsBySource: {
    count: number;
    source: string;
  }[];
  leadsByStatus: {
    closed_lost: number;
    closed_won: number;
    completed: number;
    contacted: number;
    new: number;
    qualified: number;
    scheduled: number;
  };
  openByOwner: Array<{
    count: number;
    ownerId: string | null;
  }>;
  productViews: number;
  publishedProducts: number;
  topRequested: {
    count: number;
    slug: string;
  }[];
  topViewed: {
    count: number;
    slug: string;
  }[];
  topWatched: {
    count: number;
    slug: string;
  }[];
  totalProducts: number;
}

export interface MarketplaceAssistantReply {
  actions: Array<{
    kind: "view" | "demo" | "inquiry" | "catalog";
    label: string;
    slug?: string;
  }>;
  grounded: boolean;
  products: string[];
  sources: string[];
  text: string;
}

export interface MarketplaceCatalog {
  categories: {
    code: string;
    description: string;
    icon: string;
    name: string;
    sortOrder: number;
  }[];
  industries: {
    description: string;
    icon: string;
    id: string;
    keywords: string[];
    name: string;
    short: string;
  }[];
  needs: {
    description: string;
    icon: string;
    id: string;
    keywords: string[];
    name: string;
    short: string;
  }[];
  products: Array<{
    accent: string;
    askDeveloper: boolean;
    availability: "available" | "pilot" | "coming_soon" | "in_development" | "temporarily_unavailable";
    categoryCode: string;
    content: {
      benefits: {
        description: string;
        icon: string;
        title: string;
      }[];
      demo: {
        chapters: Array<{
          caption: string;
          title: string;
          variant: "dashboard" | "table" | "mobile" | "form" | "analytics" | "calendar" | "ticket";
        }>;
        duration: string;
        posterUrl?: string;
        url?: string;
      } | null;
      faqs: {
        answer: string;
        question: string;
      }[];
      integrationNotes: string;
      integrations: string[];
      modules: {
        description: string;
        features: string[];
        name: string;
      }[];
      screenLabels: {
        kpis: {
          label: string;
          value: string;
        }[];
        mobileTitle: string;
        rows: string[];
      };
      screenshots: Array<{
        caption: string;
        id: string;
        imageUrl?: string;
        title: string;
        variant: "dashboard" | "table" | "mobile" | "form" | "analytics" | "calendar" | "ticket";
      }>;
      targetCustomers: {
        description: string;
        title: string;
      }[];
    };
    createdAt: string;
    customizable: boolean;
    deployment: Array<"cloud" | "on_premise" | "hybrid">;
    featured: boolean;
    featuredReview: {
      body: string;
      rating: number;
      reviewerName: string;
      reviewerRole: string | null;
      title: string | null;
    } | null;
    icon: string;
    id: string;
    industries: string[];
    keyFeatures: string[];
    name: string;
    needs: string[];
    overview: string;
    platforms: Array<"web" | "android" | "ios" | "ussd">;
    problem: string;
    rating: {
      average: number;
      count: number;
    } | null;
    releaseDate: string | null;
    slug: string;
    summary: string;
    tagline: string;
    updatedAt: string;
  }>;
}

export interface MarketplaceCategory {
  code: string;
  description: string;
  icon: string;
  name: string;
  sortOrder: number;
}

export interface MarketplaceMedia {
  contentType: string;
  id: string;
  size: number;
  url: string;
}

export interface MarketplaceMediaContent {
  checksum: string;
  contentType: string;
  data: string;
}

export interface MarketplaceProduct {
  accent: string;
  askDeveloper: boolean;
  availability: "available" | "pilot" | "coming_soon" | "in_development" | "temporarily_unavailable";
  categoryCode: string;
  content: {
    benefits: {
      description: string;
      icon: string;
      title: string;
    }[];
    demo: {
      chapters: Array<{
        caption: string;
        title: string;
        variant: "dashboard" | "table" | "mobile" | "form" | "analytics" | "calendar" | "ticket";
      }>;
      duration: string;
      posterUrl?: string;
      url?: string;
    } | null;
    faqs: {
      answer: string;
      question: string;
    }[];
    integrationNotes: string;
    integrations: string[];
    modules: {
      description: string;
      features: string[];
      name: string;
    }[];
    screenLabels: {
      kpis: {
        label: string;
        value: string;
      }[];
      mobileTitle: string;
      rows: string[];
    };
    screenshots: Array<{
      caption: string;
      id: string;
      imageUrl?: string;
      title: string;
      variant: "dashboard" | "table" | "mobile" | "form" | "analytics" | "calendar" | "ticket";
    }>;
    targetCustomers: {
      description: string;
      title: string;
    }[];
  };
  createdAt: string;
  customizable: boolean;
  deployment: Array<"cloud" | "on_premise" | "hybrid">;
  featured: boolean;
  featuredReview: {
    body: string;
    rating: number;
    reviewerName: string;
    reviewerRole: string | null;
    title: string | null;
  } | null;
  icon: string;
  id: string;
  industries: string[];
  keyFeatures: string[];
  name: string;
  needs: string[];
  overview: string;
  platforms: Array<"web" | "android" | "ios" | "ussd">;
  problem: string;
  rating: {
    average: number;
    count: number;
  } | null;
  releaseDate: string | null;
  slug: string;
  summary: string;
  tagline: string;
  updatedAt: string;
}

export interface MarketplaceSubmissionResult {
  reference: string;
}

export interface MarketplaceTaxonomyEntry {
  description: string;
  icon: string;
  id: string;
  keywords: string[];
  name: string;
  short: string;
}

export interface Notification {
  archived: boolean;
  body: string;
  category: string;
  createdAt: string;
  id: string;
  link: string | null;
  params: Record<string, string | number | null | null> | null;
  read: boolean;
  readAt: string | null;
  senderName: string | null;
  severity: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
  starred: boolean;
  template: string;
  threadKey: string | null;
  title: string;
  trashed: boolean;
}

export interface NotificationPreference {
  category: "APPROVAL" | "SECURITY" | "SYSTEM" | "ANNOUNCEMENT" | "MARKETPLACE";
  email: boolean;
  inApp: boolean;
  inAppLocked: boolean;
}

export interface NotificationSummary {
  archived: number;
  categories: Record<string, {
    total: number;
    unread: number;
  }>;
  inbox: number;
  latest: Array<{
    archived: boolean;
    body: string;
    category: string;
    createdAt: string;
    id: string;
    link: string | null;
    params: Record<string, string | number | null | null> | null;
    read: boolean;
    readAt: string | null;
    senderName: string | null;
    severity: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
    starred: boolean;
    template: string;
    threadKey: string | null;
    title: string;
    trashed: boolean;
  }>;
  starred: number;
  trash: number;
  unread: number;
}

export interface OptionSourceInfo {
  key: string;
  requiresVariant: boolean;
}

export interface PasswordPolicy {
  disallowCommon: boolean;
  disallowPersonalInfo: boolean;
  expiryWarningDays: number;
  historyCount: number;
  maxAgeDays: number;
  maxLength: number;
  minAgeHours: number;
  minLength: number;
  requireDigit: boolean;
  requireLowercase: boolean;
  requireSymbol: boolean;
  requireUppercase: boolean;
}

export interface PermissionDefinition {
  code: string;
  description: string | null;
}

export interface PersonalActivityEntry {
  action: string;
  actorUsername: string | null;
  byOther: boolean;
  category: string;
  changedFields: string[];
  errorCode: string | null;
  id: string;
  ipAddress: string | null;
  occurredAt: string;
  outcome: "SUCCESS" | "FAILURE" | "DENIED";
  resourceType: string | null;
  userAgent: string | null;
}

export interface PersonalActivityPage {
  items: Array<{
    action: string;
    actorUsername: string | null;
    byOther: boolean;
    category: string;
    changedFields: string[];
    errorCode: string | null;
    id: string;
    ipAddress: string | null;
    occurredAt: string;
    outcome: "SUCCESS" | "FAILURE" | "DENIED";
    resourceType: string | null;
    userAgent: string | null;
  }>;
  nextCursor: string | null;
}

export interface PersonalActivitySummary {
  changes: number;
  days: number;
  devices: number;
  failedSignIns: number;
  lastFailedSignInAt: string | null;
  signIns: number;
}

export interface ProductAudience {
  description: string;
  title: string;
}

export interface ProductBenefit {
  description: string;
  icon: string;
  title: string;
}

export interface ProductCategory {
  code: string;
  createdAt: string;
  description: string | null;
  icon: string | null;
  id: string;
  name: string;
  sortOrder: number | null;
  updatedAt: string;
  version: number;
}

export interface ProductContent {
  benefits: {
    description: string;
    icon: string;
    title: string;
  }[];
  demo: {
    chapters: Array<{
      caption: string;
      title: string;
      variant: "dashboard" | "table" | "mobile" | "form" | "analytics" | "calendar" | "ticket";
    }>;
    duration: string;
    posterUrl?: string;
    url?: string;
  } | null;
  faqs: {
    answer: string;
    question: string;
  }[];
  integrationNotes: string;
  integrations: string[];
  modules: {
    description: string;
    features: string[];
    name: string;
  }[];
  screenLabels: {
    kpis: {
      label: string;
      value: string;
    }[];
    mobileTitle: string;
    rows: string[];
  };
  screenshots: Array<{
    caption: string;
    id: string;
    imageUrl?: string;
    title: string;
    variant: "dashboard" | "table" | "mobile" | "form" | "analytics" | "calendar" | "ticket";
  }>;
  targetCustomers: {
    description: string;
    title: string;
  }[];
}

export interface ProductDemo {
  chapters: Array<{
    caption: string;
    title: string;
    variant: "dashboard" | "table" | "mobile" | "form" | "analytics" | "calendar" | "ticket";
  }>;
  duration: string;
  posterUrl?: string;
  url?: string;
}

export interface ProductDemoChapter {
  caption: string;
  title: string;
  variant: "dashboard" | "table" | "mobile" | "form" | "analytics" | "calendar" | "ticket";
}

export interface ProductDeveloper {
  active: boolean;
  createdAt: string;
  email: string;
  id: string;
  name: string;
  telegramLinked: boolean;
  telegramLinkedAt: string | null;
  telegramUsername: string | null;
  updatedAt: string;
  version: number;
}

export interface ProductDocSection {
  body: string;
  title: string;
}

export interface ProductFaq {
  answer: string;
  question: string;
}

export interface ProductIdea {
  adminNote: string | null;
  categoryCode: string | null;
  createdAt: string;
  id: string;
  problem: string;
  reference: string;
  status: "submitted" | "under_review" | "approved" | "in_development" | "completed" | "rejected";
  submitterEmail: string;
  submitterName: string | null;
  title: string;
  updatedAt: string;
  version: number;
  voteCount: number;
}

export interface ProductInquiry {
  assignedTo: string | null;
  company: string | null;
  contactMethod: "email" | "phone" | "whatsapp" | "telegram";
  createdAt: string;
  customerName: string;
  email: string;
  id: string;
  inquiryType: "product_information" | "pricing" | "customization" | "integration" | "partnership" | "deployment" | "technical_consultation";
  message: string;
  notes: {
    author: string;
    body: string;
    createdAt: string;
    id: string;
  }[];
  phone: string | null;
  productSlug: string | null;
  reference: string;
  requirements: string | null;
  respondedAt: string | null;
  source: string | null;
  status: "new" | "contacted" | "scheduled" | "completed" | "qualified" | "closed_won" | "closed_lost";
  updatedAt: string;
  version: number;
}

export interface ProductModule {
  description: string;
  features: string[];
  name: string;
}

export interface ProductQuestion {
  createdAt: string;
  customerEmail: string;
  customerName: string;
  developerId: string | null;
  id: string;
  lastMessageAt: string | null;
  productSlug: string;
  question: string;
  reference: string;
  status: "open" | "in_progress" | "answered" | "closed";
  updatedAt: string;
  version: number;
}

export interface ProductQuestionConversation {
  deliveries: Array<{
    attempts: number;
    channel: "telegram" | "email";
    createdAt: string;
    id: string;
    lastError: string | null;
    purpose: string;
    sentAt: string | null;
    status: "pending" | "sending" | "sent" | "failed";
  }>;
  developers: {
    id: string;
    name: string;
    telegramLinked: boolean;
  }[];
  messages: Array<{
    author: "customer" | "developer" | "staff";
    authorName: string;
    body: string;
    channel: "web" | "telegram" | "portal";
    createdAt: string;
    id: string;
  }>;
  productName: string;
  question: {
    createdAt: string;
    customerEmail: string;
    customerName: string;
    developerId: string | null;
    id: string;
    lastMessageAt: string | null;
    productSlug: string;
    question: string;
    reference: string;
    status: "open" | "in_progress" | "answered" | "closed";
    updatedAt: string;
    version: number;
  };
}

export interface ProductQuestionReceived {
  conversationUrl: string;
  reference: string;
}

export interface ProductRatingSummary {
  average: number;
  count: number;
  distribution: number[];
}

export interface ProductReview {
  body: string;
  createdAt: string;
  id: string;
  productSlug: string;
  rating: number;
  reference: string;
  reply: string | null;
  reviewerEmail: string;
  reviewerName: string;
  reviewerRole: string | null;
  status: string;
  title: string | null;
  updatedAt: string;
  version: number;
}

export interface ProductScreenLabels {
  kpis: {
    label: string;
    value: string;
  }[];
  mobileTitle: string;
  rows: string[];
}

export interface ProductScreenshot {
  caption: string;
  id: string;
  imageUrl?: string;
  title: string;
  variant: "dashboard" | "table" | "mobile" | "form" | "analytics" | "calendar" | "ticket";
}

export interface PublicHeroCarousel {
  settings: {
    autoplay: boolean;
    intervalSeconds: number;
    navigation: "arrows-and-dots" | "dots" | "arrows";
    pauseOnHover: boolean;
    transitionMs: number;
  };
  slides: Array<{
    altText: string | null;
    ctaHref: string | null;
    ctaLabel: string | null;
    description: string | null;
    desktopImageUrl: string;
    id: string;
    mobileImageUrl: string | null;
    title: string | null;
  }>;
}

export interface PublicIdea {
  categoryCode: string | null;
  createdAt: string;
  problem: string;
  reference: string;
  status: "submitted" | "under_review" | "approved" | "in_development" | "completed" | "rejected";
  suggestedBy: string | null;
  title: string;
  votable: boolean;
  voteCount: number;
  voted: boolean;
}

export interface PublicProductReview {
  body: string;
  createdAt: string;
  rating: number;
  reference: string;
  reply: string | null;
  reviewerName: string;
  reviewerRole: string | null;
  title: string | null;
}

export interface PublicProductReviews {
  reviews: Array<{
    body: string;
    createdAt: string;
    rating: number;
    reference: string;
    reply: string | null;
    reviewerName: string;
    reviewerRole: string | null;
    title: string | null;
  }>;
  summary: {
    average: number;
    count: number;
    distribution: number[];
  } | null;
}

export interface PublicQuestionConversation {
  createdAt: string;
  customerName: string;
  messages: Array<{
    author: "customer" | "developer" | "staff";
    authorName: string;
    body: string;
    createdAt: string;
  }>;
  productName: string;
  productSlug: string;
  reference: string;
  status: "open" | "in_progress" | "answered" | "closed";
}

export interface PublicSettings {
  values: Record<string, string | number | boolean | null | null>;
}

export interface RecordOption {
  description: string | null;
  disabled: boolean;
  group: string | null;
  hint: string | null;
  label: string;
  value: string;
}

export interface ReferenceDataItem {
  active: boolean;
  attributes: Record<string, string | number | boolean | null | null>;
  code: string;
  createdAt: string;
  description: string | null;
  effective: boolean;
  id: string;
  label: string;
  labels: Record<string, string>;
  parentCode: string | null;
  sortOrder: number;
  typeCode: string;
  updatedAt: string;
  validFrom: string | null;
  validTo: string | null;
  version: number;
}

export interface ReferenceDataType {
  activeCount: number;
  attributes: Array<{
    key: string;
    label: string;
    options?: string[];
    required: boolean;
    type: "text" | "number" | "boolean" | "date" | "select";
  }>;
  code: string;
  createdAt: string;
  description: string | null;
  id: string;
  isSystem: boolean;
  itemCount: number;
  name: string;
  parentTypeCode: string | null;
  updatedAt: string;
  version: number;
}

export interface RetentionRun {
  dryRun: boolean;
  finishedAt: string | null;
  id: string;
  results: Array<{
    archived: number;
    archiveRef: string | null;
    cutoff: string;
    dataset: string;
    error: string | null;
    matched: number;
    notes: string | null;
    policy: string;
    purged: number;
    retentionDays: number;
  }>;
  startedAt: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  trigger: "SCHEDULED" | "MANUAL";
  triggeredBy: string | null;
}

export interface ReviewSubmitted {
  reference: string;
}

export interface Role {
  code: string;
  createdAt: string;
  description: string | null;
  id: string;
  isSystem: boolean;
  name: string;
  permissions: string[];
  updatedAt: string;
  userCount: number;
  version: number;
}

export interface SentDocument {
  filename: string;
  size: number;
  subject: string;
  to: string;
}

export interface SettingDefinition {
  default: string | number | boolean | null | null;
  description: string | null;
  group: string;
  key: string;
  label: string;
  max: number | null;
  min: number | null;
  options: string[] | null;
  required: boolean;
  type: "string" | "text" | "number" | "boolean" | "select" | "email" | "url" | "color" | "image";
}

export interface Settings {
  definitions: Array<{
    default: string | number | boolean | null | null;
    description: string | null;
    group: string;
    key: string;
    label: string;
    max: number | null;
    min: number | null;
    options: string[] | null;
    required: boolean;
    type: "string" | "text" | "number" | "boolean" | "select" | "email" | "url" | "color" | "image";
  }>;
  groups: string[];
  values: Record<string, string | number | boolean | null | null>;
}

export interface TelegramLinkCode {
  code: string;
  deepLink: string | null;
  expiresAt: string;
}

export interface User {
  branchCode: string | null;
  createdAt: string;
  deletedAt: string | null;
  email: string;
  fullName: string;
  id: string;
  lastLoginAt: string | null;
  mfaEnabled: boolean;
  phoneNumber: string | null;
  roles: string[];
  status: "ACTIVE" | "LOCKED" | "DISABLED" | "PENDING_ACTIVATION";
  updatedAt: string;
  username: string;
  version: number;
}

export interface UserProfile {
  branchCode: string | null;
  createdAt: string;
  deletedAt: string | null;
  email: string;
  fullName: string;
  id: string;
  lastLoginAt: string | null;
  mfaEnabled: boolean;
  mfaMethod: string | null;
  mfaRequired: boolean;
  passwordChangedAt: string | null;
  passwordExpiresAt: string | null;
  permissions: string[];
  phoneNumber: string | null;
  roles: string[];
  status: "ACTIVE" | "LOCKED" | "DISABLED" | "PENDING_ACTIVATION";
  updatedAt: string;
  username: string;
  version: number;
}

/** Named DTO schemas by name: ApiSchemas['Role']. */
export interface ApiSchemas {
  ApprovalPolicyEntry: ApprovalPolicyEntry;
  ApprovalRequest: ApprovalRequest;
  ApprovalSummary: ApprovalSummary;
  ApprovalTicket: ApprovalTicket;
  AuditActivity: AuditActivity;
  AuditChange: AuditChange;
  AuditCheckpoint: AuditCheckpoint;
  AuditFacets: AuditFacets;
  AuditIntegrityReport: AuditIntegrityReport;
  AuditLog: AuditLog;
  ComplianceOverview: ComplianceOverview;
  DemoRequest: DemoRequest;
  DeveloperOption: DeveloperOption;
  DigitalProduct: DigitalProduct;
  DocumentFile: DocumentFile;
  DocumentSource: DocumentSource;
  ErrorCode: ErrorCode;
  HeroCarouselSettings: HeroCarouselSettings;
  HeroSlide: HeroSlide;
  IdeaSubmitted: IdeaSubmitted;
  LeadNote: LeadNote;
  LookupOption: LookupOption;
  MarketplaceAnalytics: MarketplaceAnalytics;
  MarketplaceAssistantReply: MarketplaceAssistantReply;
  MarketplaceCatalog: MarketplaceCatalog;
  MarketplaceCategory: MarketplaceCategory;
  MarketplaceMedia: MarketplaceMedia;
  MarketplaceMediaContent: MarketplaceMediaContent;
  MarketplaceProduct: MarketplaceProduct;
  MarketplaceSubmissionResult: MarketplaceSubmissionResult;
  MarketplaceTaxonomyEntry: MarketplaceTaxonomyEntry;
  Notification: Notification;
  NotificationPreference: NotificationPreference;
  NotificationSummary: NotificationSummary;
  OptionSourceInfo: OptionSourceInfo;
  PasswordPolicy: PasswordPolicy;
  PermissionDefinition: PermissionDefinition;
  PersonalActivityEntry: PersonalActivityEntry;
  PersonalActivityPage: PersonalActivityPage;
  PersonalActivitySummary: PersonalActivitySummary;
  ProductAudience: ProductAudience;
  ProductBenefit: ProductBenefit;
  ProductCategory: ProductCategory;
  ProductContent: ProductContent;
  ProductDemo: ProductDemo;
  ProductDemoChapter: ProductDemoChapter;
  ProductDeveloper: ProductDeveloper;
  ProductDocSection: ProductDocSection;
  ProductFaq: ProductFaq;
  ProductIdea: ProductIdea;
  ProductInquiry: ProductInquiry;
  ProductModule: ProductModule;
  ProductQuestion: ProductQuestion;
  ProductQuestionConversation: ProductQuestionConversation;
  ProductQuestionReceived: ProductQuestionReceived;
  ProductRatingSummary: ProductRatingSummary;
  ProductReview: ProductReview;
  ProductScreenLabels: ProductScreenLabels;
  ProductScreenshot: ProductScreenshot;
  PublicHeroCarousel: PublicHeroCarousel;
  PublicIdea: PublicIdea;
  PublicProductReview: PublicProductReview;
  PublicProductReviews: PublicProductReviews;
  PublicQuestionConversation: PublicQuestionConversation;
  PublicSettings: PublicSettings;
  RecordOption: RecordOption;
  ReferenceDataItem: ReferenceDataItem;
  ReferenceDataType: ReferenceDataType;
  RetentionRun: RetentionRun;
  ReviewSubmitted: ReviewSubmitted;
  Role: Role;
  SentDocument: SentDocument;
  SettingDefinition: SettingDefinition;
  Settings: Settings;
  TelegramLinkCode: TelegramLinkCode;
  User: User;
  UserProfile: UserProfile;
}

/** Every backend endpoint: "<METHOD> <path>" → params, query, body and response data. */
export interface ApiOperations {
  "GET /account/activity": {
    /** My recent activity: sign-ins, changes, security events */
    params: never;
    query: never;
    body: never;
    data: PersonalActivityPage;
    paginated: false;
  };
  "GET /account/activity/summary": {
    /** My activity figures for the last 30 days */
    params: never;
    query: never;
    body: never;
    data: PersonalActivitySummary;
    paginated: false;
  };
  "POST /account/mfa/disable": {
    /** Disable two-step verification (requires password) */
    params: never;
    query: never;
    body: {
      password: string;
    };
    data: Record<string, unknown>;
    paginated: false;
  };
  "POST /account/mfa/totp/confirm": {
    /** Confirm authenticator-app enrolment with a code */
    params: never;
    query: never;
    body: {
      code: string;
    };
    data: Record<string, unknown>;
    paginated: false;
  };
  "POST /account/mfa/totp/setup": {
    /** Start authenticator-app enrolment (returns secret + otpauth URI) */
    params: never;
    query: never;
    body: never;
    data: Record<string, unknown>;
    paginated: false;
  };
  "POST /account/password": {
    /** Change my password (ends my other sessions) */
    params: never;
    query: never;
    body: {
      currentPassword: string;
      newPassword: string;
    };
    data: Record<string, unknown>;
    paginated: false;
  };
  "GET /account/sessions": {
    /** My active sessions (devices) */
    params: never;
    query: never;
    body: never;
    data: Record<string, unknown>;
    paginated: false;
  };
  "DELETE /account/sessions/{id}": {
    /** Sign out one of my other sessions */
    params: { id: string };
    query: never;
    body: never;
    data: Record<string, unknown>;
    paginated: false;
  };
  "POST /account/sessions/revoke-others": {
    /** Sign out everywhere else */
    params: never;
    query: never;
    body: never;
    data: Record<string, unknown>;
    paginated: false;
  };
  "GET /approvals": {
    /** Approval requests: inbox (to decide), mine (submitted), history (decided by me), all */
    params: never;
    query: never;
    body: never;
    data: ApprovalRequest[];
    paginated: true;
  };
  "GET /approvals/{id}": {
    /** An approval request with its before/after diff */
    params: { id: string };
    query: never;
    body: never;
    data: ApprovalRequest;
    paginated: false;
  };
  "POST /approvals/{id}/approve": {
    /** Approve (checker ≠ maker); the change is applied immediately */
    params: { id: string };
    query: never;
    body: {
      comment?: string | null;
    };
    data: ApprovalRequest;
    paginated: false;
  };
  "POST /approvals/{id}/cancel": {
    /** Withdraw my pending request */
    params: { id: string };
    query: never;
    body: never;
    data: ApprovalRequest;
    paginated: false;
  };
  "POST /approvals/{id}/reject": {
    /** Reject with a reason (checker ≠ maker) */
    params: { id: string };
    query: never;
    body: {
      comment: string;
    };
    data: ApprovalRequest;
    paginated: false;
  };
  "GET /approvals/pending": {
    /** Pending requests for the given records (resource id → approval id) */
    params: never;
    query: never;
    body: never;
    data: Record<string, unknown>;
    paginated: false;
  };
  "GET /approvals/policy": {
    /** Which actions require a checker (and who may decide them) */
    params: never;
    query: never;
    body: never;
    data: ApprovalPolicyEntry[];
    paginated: false;
  };
  "GET /approvals/summary": {
    /** Counters: waiting for me, and my own pending requests */
    params: never;
    query: never;
    body: never;
    data: ApprovalSummary;
    paginated: false;
  };
  "GET /audit-logs": {
    /** List audit records (paginated, filterable, searchable) */
    params: never;
    query: { page?: string; pageSize?: string; sort?: string; search?: string; "filter[id]"?: string; "filter[seq]"?: string; "filter[action]"?: string; "filter[actorUsername]"?: string; "filter[ipAddress]"?: string; "filter[category]"?: string; "filter[outcome]"?: string; "filter[actorId]"?: string; "filter[resourceType]"?: string; "filter[resourceId]"?: string; "filter[correlationId]"?: string; "filter[occurredAt]"?: string };
    body: never;
    data: AuditLog[];
    paginated: true;
  };
  "GET /audit-logs/{id}": {
    /** Get one audit record with its changes and chain link */
    params: { id: string };
    query: never;
    body: never;
    data: AuditLog;
    paginated: false;
  };
  "GET /audit-logs/activity": {
    /** Activity summary for a time window (totals, failures, top actions) */
    params: never;
    query: never;
    body: never;
    data: AuditActivity;
    paginated: false;
  };
  "GET /audit-logs/facets": {
    /** Recorded actions and resource types (for filter pickers) */
    params: never;
    query: never;
    body: never;
    data: AuditFacets;
    paginated: false;
  };
  "POST /auth/login": {
    /** Credential login → tokens or MFA challenge */
    params: never;
    query: never;
    body: {
      password: string;
      username: string;
    };
    data: Record<string, unknown>;
    paginated: false;
  };
  "POST /auth/logout": {
    /** End the current session (or all sessions) */
    params: never;
    query: never;
    body: {
      allSessions?: boolean;
    };
    data: Record<string, unknown>;
    paginated: false;
  };
  "GET /auth/me": {
    /** Current user with roles and effective permissions */
    params: never;
    query: never;
    body: never;
    data: UserProfile;
    paginated: false;
  };
  "POST /auth/mfa/verify": {
    /** Complete an MFA challenge (TOTP / SMS) */
    params: never;
    query: never;
    body: {
      challengeId: string;
      code: string;
    };
    data: Record<string, unknown>;
    paginated: false;
  };
  "GET /auth/password-policy": {
    /** Password rules (drives the live checklist in password forms) */
    params: never;
    query: never;
    body: never;
    data: PasswordPolicy;
    paginated: false;
  };
  "POST /auth/password/change": {
    /** Set a new password when sign-in requires it (expired or temporary password) */
    params: never;
    query: never;
    body: {
      changeToken: string;
      newPassword: string;
    };
    data: Record<string, unknown>;
    paginated: false;
  };
  "POST /auth/password/forgot": {
    /** E-mail a password reset link (same answer whether or not the account exists) */
    params: never;
    query: never;
    body: {
      identifier: string;
    };
    data: Record<string, unknown>;
    paginated: false;
  };
  "POST /auth/password/reset": {
    /** Set a new password with an e-mailed reset link */
    params: never;
    query: never;
    body: {
      newPassword: string;
      token: string;
    };
    data: Record<string, unknown>;
    paginated: false;
  };
  "GET /auth/session": {
    /** Validate and describe the current session */
    params: never;
    query: never;
    body: never;
    data: Record<string, unknown>;
    paginated: false;
  };
  "POST /auth/token/exchange": {
    /** Exchange an external OIDC ID token for an AppCore session */
    params: never;
    query: never;
    body: {
      provider: string;
      token: string;
    };
    data: Record<string, unknown>;
    paginated: false;
  };
  "POST /auth/token/refresh": {
    /** Rotate the refresh token and issue a new access token */
    params: never;
    query: never;
    body: {
      refreshToken: string;
    };
    data: Record<string, unknown>;
    paginated: false;
  };
  "POST /compliance/audit/anchor": {
    /** Record the current chain head as an anchor */
    params: never;
    query: never;
    body: never;
    data: AuditCheckpoint;
    paginated: false;
  };
  "GET /compliance/audit/checkpoints": {
    /** Recent chain anchors and purge checkpoints */
    params: never;
    query: never;
    body: never;
    data: AuditCheckpoint[];
    paginated: false;
  };
  "POST /compliance/audit/verify": {
    /** Recompute the audit hash chain and check anchors */
    params: never;
    query: never;
    body: never;
    data: AuditIntegrityReport;
    paginated: false;
  };
  "POST /compliance/jobs/{name}/run": {
    /** Run a background job now */
    params: { name: string };
    query: never;
    body: never;
    data: Record<string, unknown>;
    paginated: false;
  };
  "GET /compliance/overview": {
    /** Effective security, retention and audit-chain status */
    params: never;
    query: never;
    body: never;
    data: ComplianceOverview;
    paginated: false;
  };
  "GET /compliance/retention/preview": {
    /** Records each policy would remove now (no changes) */
    params: never;
    query: never;
    body: never;
    data: Record<string, unknown>;
    paginated: false;
  };
  "POST /compliance/retention/run": {
    /** Run every retention policy now (optionally as a dry run) */
    params: never;
    query: never;
    body: {
      dryRun?: boolean;
    };
    data: RetentionRun;
    paginated: false;
  };
  "GET /compliance/retention/runs": {
    /** Retention run history */
    params: never;
    query: never;
    body: never;
    data: RetentionRun[];
    paginated: true;
  };
  "GET /demo-requests": {
    /** List demo requests (paginated, searchable) */
    params: never;
    query: { page?: string; pageSize?: string; sort?: string; search?: string; "filter[id]"?: string; "filter[reference]"?: string; "filter[productSlug]"?: string; "filter[demoType]"?: string; "filter[source]"?: string; "filter[status]"?: string; "filter[assignedTo]"?: string; "filter[followUpDate]"?: string; "filter[createdAt]"?: string };
    body: never;
    data: DemoRequest[];
    paginated: true;
  };
  "POST /demo-requests": {
    /** Record a demo request on behalf of a customer; 202 when it needs approval */
    params: never;
    query: never;
    body: {
      assignedTo?: string | null;
      demoType: "online" | "onsite" | "recorded" | "customized";
      email: string;
      fullName: string;
      jobTitle: string;
      organization: string;
      phone: string;
      preferredDate?: string | string | null;
      preferredTime?: string | null;
      productSlug: string;
      requirements?: string | null;
      source?: "homepage" | "product_card" | "product_page" | "assistant" | "catalog" | "contact_page" | "navigation" | "staff" | null;
      status?: "new" | "contacted" | "scheduled" | "completed" | "qualified" | "closed_won" | "closed_lost";
    };
    data: DemoRequest;
    paginated: false;
  };
  "GET /demo-requests/{id}": {
    /** Get a demo request */
    params: { id: string };
    query: never;
    body: never;
    data: DemoRequest;
    paginated: false;
  };
  "PATCH /demo-requests/{id}": {
    /** Update status, owner or follow-up date (requires the current version) */
    params: { id: string };
    query: never;
    body: {
      assignedTo?: string | null;
      followUpDate?: string | string | null;
      status?: "new" | "contacted" | "scheduled" | "completed" | "qualified" | "closed_won" | "closed_lost";
      version: number;
    };
    data: DemoRequest;
    paginated: false;
  };
  "DELETE /demo-requests/{id}": {
    /** Delete a demo request; 202 when it needs approval */
    params: { id: string };
    query: never;
    body: never;
    data: DemoRequest;
    paginated: false;
  };
  "POST /demo-requests/{id}/notes": {
    /** Add an internal follow-up note */
    params: { id: string };
    query: never;
    body: {
      body: string;
    };
    data: DemoRequest;
    paginated: false;
  };
  "GET /digital-products": {
    /** List digital products (paginated, searchable) */
    params: never;
    query: { page?: string; pageSize?: string; sort?: string; search?: string; "filter[id]"?: string; "filter[slug]"?: string; "filter[name]"?: string; "filter[categoryCode]"?: string; "filter[status]"?: string; "filter[availability]"?: string; "filter[featured]"?: string; "filter[customizable]"?: string };
    body: never;
    data: DigitalProduct[];
    paginated: true;
  };
  "POST /digital-products": {
    /** Create a digital product; 202 when it needs approval */
    params: never;
    query: never;
    body: {
      accent?: string | null;
      availability: "available" | "pilot" | "coming_soon" | "in_development" | "temporarily_unavailable";
      backupDeveloperId?: string | null;
      categoryCode: string;
      content?: {
        benefits: {
          description: string;
          icon: string;
          title: string;
        }[];
        demo: {
          chapters: Array<{
            caption: string;
            title: string;
            variant: "dashboard" | "table" | "mobile" | "form" | "analytics" | "calendar" | "ticket";
          }>;
          duration: string;
          posterUrl?: string;
          url?: string;
        } | null;
        faqs: {
          answer: string;
          question: string;
        }[];
        integrationNotes: string;
        integrations: string[];
        modules: {
          description: string;
          features: string[];
          name: string;
        }[];
        screenLabels: {
          kpis: {
            label: string;
            value: string;
          }[];
          mobileTitle: string;
          rows: string[];
        };
        screenshots: Array<{
          caption: string;
          id: string;
          imageUrl?: string;
          title: string;
          variant: "dashboard" | "table" | "mobile" | "form" | "analytics" | "calendar" | "ticket";
        }>;
        targetCustomers: {
          description: string;
          title: string;
        }[];
      };
      customizable?: boolean;
      deployment?: Array<"cloud" | "on_premise" | "hybrid">;
      developerId?: string | null;
      documentation?: {
        body: string;
        title: string;
      }[];
      featured?: boolean;
      icon?: string | null;
      industries?: string[];
      keyFeatures?: string[];
      name: string;
      needs?: string[];
      overview?: string | null;
      platforms?: Array<"web" | "android" | "ios" | "ussd">;
      problem?: string | null;
      releaseDate?: string | null;
      slug: string;
      status: "draft" | "published" | "archived";
      summary: string;
      supportStatus?: "active" | "limited" | "paused";
      tagline?: string | null;
      thirdDeveloperId?: string | null;
    };
    data: DigitalProduct;
    paginated: false;
  };
  "GET /digital-products/{id}": {
    /** Get a digital product (including internal documentation) */
    params: { id: string };
    query: never;
    body: never;
    data: DigitalProduct;
    paginated: false;
  };
  "PATCH /digital-products/{id}": {
    /** Update a digital product (requires the current version); 202 when it needs approval */
    params: { id: string };
    query: never;
    body: {
      accent?: string | null;
      availability?: "available" | "pilot" | "coming_soon" | "in_development" | "temporarily_unavailable";
      backupDeveloperId?: string | null;
      categoryCode?: string;
      content?: {
        benefits: {
          description: string;
          icon: string;
          title: string;
        }[];
        demo: {
          chapters: Array<{
            caption: string;
            title: string;
            variant: "dashboard" | "table" | "mobile" | "form" | "analytics" | "calendar" | "ticket";
          }>;
          duration: string;
          posterUrl?: string;
          url?: string;
        } | null;
        faqs: {
          answer: string;
          question: string;
        }[];
        integrationNotes: string;
        integrations: string[];
        modules: {
          description: string;
          features: string[];
          name: string;
        }[];
        screenLabels: {
          kpis: {
            label: string;
            value: string;
          }[];
          mobileTitle: string;
          rows: string[];
        };
        screenshots: Array<{
          caption: string;
          id: string;
          imageUrl?: string;
          title: string;
          variant: "dashboard" | "table" | "mobile" | "form" | "analytics" | "calendar" | "ticket";
        }>;
        targetCustomers: {
          description: string;
          title: string;
        }[];
      };
      customizable?: boolean;
      deployment?: Array<"cloud" | "on_premise" | "hybrid">;
      developerId?: string | null;
      documentation?: {
        body: string;
        title: string;
      }[];
      featured?: boolean;
      icon?: string | null;
      industries?: string[];
      keyFeatures?: string[];
      name?: string;
      needs?: string[];
      overview?: string | null;
      platforms?: Array<"web" | "android" | "ios" | "ussd">;
      problem?: string | null;
      releaseDate?: string | null;
      slug?: string;
      status?: "draft" | "published" | "archived";
      summary?: string;
      supportStatus?: "active" | "limited" | "paused";
      tagline?: string | null;
      thirdDeveloperId?: string | null;
      version: number;
    };
    data: DigitalProduct;
    paginated: false;
  };
  "DELETE /digital-products/{id}": {
    /** Delete a digital product; 202 when it needs approval */
    params: { id: string };
    query: never;
    body: never;
    data: DigitalProduct;
    paginated: false;
  };
  "GET /documents": {
    /** Record types the caller may print */
    params: never;
    query: never;
    body: never;
    data: DocumentSource[];
    paginated: true;
  };
  "GET /documents/{source}/{id}/pdf": {
    /** A record as a PDF document */
    params: { source: string; id: string };
    query: never;
    body: never;
    data: DocumentFile;
    paginated: false;
  };
  "POST /documents/{source}/{id}/send": {
    /** E-mail a record as a PDF attachment (needs documents:send) */
    params: { source: string; id: string };
    query: never;
    body: {
      message?: string;
      subject?: string;
      to: string;
      toName?: string;
    };
    data: SentDocument;
    paginated: false;
  };
  "GET /hero-slides": {
    /** List hero carousel (paginated, searchable) */
    params: never;
    query: { page?: string; pageSize?: string; sort?: string; search?: string; "filter[id]"?: string; "filter[title]"?: string; "filter[ctaLabel]"?: string; "filter[ctaHref]"?: string; "filter[desktopImageId]"?: string; "filter[mobileImageId]"?: string; "filter[altText]"?: string; "filter[sortOrder]"?: string; "filter[active]"?: string };
    body: never;
    data: HeroSlide[];
    paginated: true;
  };
  "POST /hero-slides": {
    /** Create a hero slide; 202 when it needs approval */
    params: never;
    query: never;
    body: {
      active?: boolean;
      altText?: string | null;
      ctaHref?: string | null;
      ctaLabel?: string | null;
      description?: string | null;
      desktopImageId: string;
      mobileImageId?: string | null;
      sortOrder?: number | null;
      title?: string | null;
    };
    data: HeroSlide;
    paginated: false;
  };
  "GET /hero-slides/{id}": {
    /** Get a hero slide */
    params: { id: string };
    query: never;
    body: never;
    data: HeroSlide;
    paginated: false;
  };
  "PATCH /hero-slides/{id}": {
    /** Update a hero slide (requires the current version); 202 when it needs approval */
    params: { id: string };
    query: never;
    body: {
      active?: boolean;
      altText?: string | null;
      ctaHref?: string | null;
      ctaLabel?: string | null;
      description?: string | null;
      desktopImageId?: string;
      mobileImageId?: string | null;
      sortOrder?: number | null;
      title?: string | null;
      version: number;
    };
    data: HeroSlide;
    paginated: false;
  };
  "DELETE /hero-slides/{id}": {
    /** Delete a hero slide; 202 when it needs approval */
    params: { id: string };
    query: never;
    body: never;
    data: HeroSlide;
    paginated: false;
  };
  "GET /hero-slides/ordered": {
    /** Every hero slide in display order (the administration screen) */
    params: never;
    query: never;
    body: never;
    data: HeroSlide[];
    paginated: true;
  };
  "POST /hero-slides/reorder": {
    /** Set the display order: every slide id once, first to last */
    params: never;
    query: never;
    body: {
      ids: string[];
    };
    data: HeroSlide[];
    paginated: true;
  };
  "GET /hero-slides/settings": {
    /** How the homepage carousel rotates and which controls it shows */
    params: never;
    query: never;
    body: never;
    data: HeroCarouselSettings;
    paginated: false;
  };
  "PATCH /hero-slides/settings": {
    /** Change the carousel settings (only the fields sent are touched) */
    params: never;
    query: never;
    body: {
      autoplay?: boolean;
      intervalSeconds?: number;
      navigation?: "arrows-and-dots" | "dots" | "arrows";
      pauseOnHover?: boolean;
      transitionMs?: number;
    };
    data: HeroCarouselSettings;
    paginated: false;
  };
  "GET /marketplace/admin/analytics": {
    /** Catalog engagement and pipeline over a period (days: 7, 30, 90 or 365; default 30) */
    params: never;
    query: never;
    body: never;
    data: MarketplaceAnalytics;
    paginated: false;
  };
  "POST /marketplace/admin/media": {
    /** Upload a product or hero image (PNG, JPEG, WebP or AVIF; base64) */
    params: never;
    query: never;
    body: {
      data: string;
    };
    data: MarketplaceMedia;
    paginated: false;
  };
  "POST /marketplace/assistant": {
    /** Ask the grounded product assistant (503 when it is not configured) */
    params: never;
    query: never;
    body: {
      focusSlug?: string | null;
      history?: Array<{
        role: "user" | "assistant";
        text: string;
      }>;
      question: string;
    };
    data: MarketplaceAssistantReply;
    paginated: false;
  };
  "GET /marketplace/catalog": {
    /** Published products, categories, industries and business needs */
    params: never;
    query: never;
    body: never;
    data: MarketplaceCatalog;
    paginated: false;
  };
  "POST /marketplace/demo-requests": {
    /** Submit a demo request from the website */
    params: never;
    query: never;
    body: {
      consent: true;
      demoType: "online" | "onsite" | "recorded" | "customized";
      email: string;
      fullName: string;
      jobTitle: string;
      meta: {
        elapsedMs: number;
        honeypot: string;
      };
      organization: string;
      phone: string;
      preferredDate?: string | null;
      preferredTime?: string | null;
      productSlug: string;
      requirements?: string | null;
      source?: "homepage" | "product_card" | "product_page" | "assistant" | "catalog" | "contact_page" | "navigation" | "staff" | null;
    };
    data: MarketplaceSubmissionResult;
    paginated: false;
  };
  "POST /marketplace/events": {
    /** Record a product view, demo play or assistant question */
    params: never;
    query: never;
    body: {
      productSlug?: string | null;
      type: "product_view" | "demo_play" | "assistant_query";
    };
    data: Record<string, unknown>;
    paginated: false;
  };
  "GET /marketplace/hero": {
    /** Active homepage carousel slides (in order) and carousel settings */
    params: never;
    query: never;
    body: never;
    data: PublicHeroCarousel;
    paginated: false;
  };
  "GET /marketplace/ideas": {
    /** Approved ideas (popular or newest first), with the visitor's votes marked */
    params: never;
    query: never;
    body: never;
    data: PublicIdea[];
    paginated: true;
  };
  "POST /marketplace/ideas": {
    /** Suggest a product (reviewed by staff before it is published) */
    params: never;
    query: never;
    body: {
      categoryCode?: string | null;
      meta: {
        elapsedMs: number;
        honeypot: string;
      };
      problem: string;
      submitterEmail: string;
      submitterName?: string | null;
      title: string;
    };
    data: IdeaSubmitted;
    paginated: false;
  };
  "POST /marketplace/ideas/{reference}/vote": {
    /** Vote for an idea (once per visitor) */
    params: { reference: string };
    query: never;
    body: {
      voterToken: string;
    };
    data: PublicIdea;
    paginated: false;
  };
  "POST /marketplace/inquiries": {
    /** Submit a product inquiry from the website */
    params: never;
    query: never;
    body: {
      company?: string | null;
      consent: true;
      contactMethod: "email" | "phone" | "whatsapp" | "telegram";
      customerName: string;
      email: string;
      inquiryType: "product_information" | "pricing" | "customization" | "integration" | "partnership" | "deployment" | "technical_consultation";
      message: string;
      meta: {
        elapsedMs: number;
        honeypot: string;
      };
      phone?: string | null;
      productSlug?: string | null;
      requirements?: string | null;
      source?: "homepage" | "product_card" | "product_page" | "assistant" | "catalog" | "contact_page" | "navigation" | "staff" | null;
    };
    data: MarketplaceSubmissionResult;
    paginated: false;
  };
  "GET /marketplace/media/{id}": {
    /** An uploaded product image (base64; the BFF serves the bytes) */
    params: { id: string };
    query: never;
    body: never;
    data: MarketplaceMediaContent;
    paginated: false;
  };
  "GET /marketplace/products/{slug}": {
    /** A published product by slug */
    params: { slug: string };
    query: never;
    body: never;
    data: MarketplaceProduct;
    paginated: false;
  };
  "GET /marketplace/products/{slug}/reviews": {
    /** A product's rating and its approved reviews (newest first) */
    params: { slug: string };
    query: never;
    body: never;
    data: PublicProductReviews;
    paginated: false;
  };
  "POST /marketplace/products/{slug}/reviews": {
    /** Rate a product (shown after staff approval) */
    params: { slug: string };
    query: never;
    body: {
      body: string;
      meta: {
        elapsedMs: number;
        honeypot: string;
      };
      rating: number;
      reviewerEmail: string;
      reviewerName: string;
      reviewerRole?: string | null;
      title?: string | null;
    };
    data: ReviewSubmitted;
    paginated: false;
  };
  "POST /marketplace/questions": {
    /** Ask the developer of a product (routed to them; answer by e-mail) */
    params: never;
    query: never;
    body: {
      customerEmail: string;
      customerName: string;
      meta: {
        elapsedMs: number;
        honeypot: string;
      };
      productSlug: string;
      question: string;
    };
    data: ProductQuestionReceived;
    paginated: false;
  };
  "GET /marketplace/questions/{reference}": {
    /** The customer's conversation (reference + private token from the e-mail) */
    params: { reference: string };
    query: never;
    body: never;
    data: PublicQuestionConversation;
    paginated: false;
  };
  "POST /marketplace/questions/{reference}/messages": {
    /** A follow-up from the customer (the developer is notified) */
    params: { reference: string };
    query: never;
    body: {
      body: string;
      t: string;
    };
    data: PublicQuestionConversation;
    paginated: false;
  };
  "GET /notifications": {
    /** List my notifications (folder, category, search, paging) */
    params: never;
    query: never;
    body: never;
    data: Notification[];
    paginated: true;
  };
  "GET /notifications/{id}": {
    /** One of my notifications */
    params: { id: string };
    query: never;
    body: never;
    data: Notification;
    paginated: false;
  };
  "POST /notifications/actions": {
    /** Bulk action: read, unread, star, unstar, archive, unarchive, trash, restore, delete */
    params: never;
    query: never;
    body: {
      action: "read" | "unread" | "star" | "unstar" | "archive" | "unarchive" | "trash" | "restore" | "delete";
      ids: string[];
    } | {
      action: "read" | "unread" | "star" | "unstar" | "archive" | "unarchive" | "trash" | "restore" | "delete";
      category?: string;
      folder: "inbox" | "unread" | "starred" | "archived" | "trash" | "all";
    };
    data: Record<string, unknown>;
    paginated: false;
  };
  "POST /notifications/broadcast": {
    /** Send an announcement to everyone or to selected roles */
    params: never;
    query: never;
    body: {
      audience: "ALL" | "ROLES";
      body: string;
      link?: string | null;
      roles?: string[];
      severity?: "INFO" | "WARNING" | "CRITICAL";
      title: string;
    };
    data: Record<string, unknown>;
    paginated: false;
  };
  "GET /notifications/preferences": {
    /** My delivery channels per category */
    params: never;
    query: never;
    body: never;
    data: NotificationPreference[];
    paginated: false;
  };
  "PUT /notifications/preferences": {
    /** Save my delivery channels (security alerts stay on in-app) */
    params: never;
    query: never;
    body: {
      preferences: Array<{
        category: "APPROVAL" | "SECURITY" | "SYSTEM" | "ANNOUNCEMENT" | "MARKETPLACE";
        email: boolean;
        inApp: boolean;
      }>;
    };
    data: NotificationPreference[];
    paginated: false;
  };
  "GET /notifications/summary": {
    /** Counters per folder/category and the latest messages (bell menu) */
    params: never;
    query: never;
    body: never;
    data: NotificationSummary;
    paginated: false;
  };
  "GET /options": {
    /** Option sources available to the caller */
    params: never;
    query: never;
    body: never;
    data: OptionSourceInfo[];
    paginated: false;
  };
  "GET /options/{source}": {
    /** Searchable, paginated options of a record source (permission checked per source) */
    params: { source: string };
    query: { locale?: string; parent?: string; values?: string; search?: string; pageSize?: string; page?: string };
    body: never;
    data: RecordOption[];
    paginated: true;
  };
  "GET /permissions": {
    /** Permission catalogue (assignable permission codes) */
    params: never;
    query: never;
    body: never;
    data: PermissionDefinition[];
    paginated: false;
  };
  "GET /product-categories": {
    /** List product categories (paginated, searchable) */
    params: never;
    query: { page?: string; pageSize?: string; sort?: string; search?: string; "filter[id]"?: string; "filter[code]"?: string; "filter[name]"?: string; "filter[icon]"?: string; "filter[sortOrder]"?: string };
    body: never;
    data: ProductCategory[];
    paginated: true;
  };
  "POST /product-categories": {
    /** Create a product category; 202 when it needs approval */
    params: never;
    query: never;
    body: {
      code: string;
      description?: string | null;
      icon?: string | null;
      name: string;
      sortOrder?: number | null;
    };
    data: ProductCategory;
    paginated: false;
  };
  "GET /product-categories/{id}": {
    /** Get a product category */
    params: { id: string };
    query: never;
    body: never;
    data: ProductCategory;
    paginated: false;
  };
  "PATCH /product-categories/{id}": {
    /** Update a product category (requires the current version); 202 when it needs approval */
    params: { id: string };
    query: never;
    body: {
      code?: string;
      description?: string | null;
      icon?: string | null;
      name?: string;
      sortOrder?: number | null;
      version: number;
    };
    data: ProductCategory;
    paginated: false;
  };
  "DELETE /product-categories/{id}": {
    /** Delete a product category; 202 when it needs approval */
    params: { id: string };
    query: never;
    body: never;
    data: ProductCategory;
    paginated: false;
  };
  "GET /product-developers": {
    /** List product developers (paginated, searchable) */
    params: never;
    query: { page?: string; pageSize?: string; sort?: string; search?: string; "filter[id]"?: string; "filter[name]"?: string; "filter[email]"?: string; "filter[active]"?: string };
    body: never;
    data: ProductDeveloper[];
    paginated: true;
  };
  "POST /product-developers": {
    /** Create a product developer; 202 when it needs approval */
    params: never;
    query: never;
    body: {
      active?: boolean;
      email: string;
      name: string;
      telegramUsername?: string | null;
    };
    data: ProductDeveloper;
    paginated: false;
  };
  "GET /product-developers/{id}": {
    /** Get a product developer */
    params: { id: string };
    query: never;
    body: never;
    data: ProductDeveloper;
    paginated: false;
  };
  "PATCH /product-developers/{id}": {
    /** Update a product developer (requires the current version); 202 when it needs approval */
    params: { id: string };
    query: never;
    body: {
      active?: boolean;
      email?: string;
      name?: string;
      telegramUsername?: string | null;
      version: number;
    };
    data: ProductDeveloper;
    paginated: false;
  };
  "DELETE /product-developers/{id}": {
    /** Delete a product developer; 202 when it needs approval */
    params: { id: string };
    query: never;
    body: never;
    data: ProductDeveloper;
    paginated: false;
  };
  "POST /product-developers/{id}/telegram-link": {
    /** Issue a one-time code that links the developer's Telegram (valid 30 minutes) */
    params: { id: string };
    query: never;
    body: never;
    data: TelegramLinkCode;
    paginated: false;
  };
  "DELETE /product-developers/{id}/telegram-link": {
    /** Disconnect the developer's Telegram (they stop receiving questions there) */
    params: { id: string };
    query: never;
    body: never;
    data: ProductDeveloper;
    paginated: false;
  };
  "GET /product-developers/options": {
    /** Active developers (id and name) for the product editor */
    params: never;
    query: never;
    body: never;
    data: DeveloperOption[];
    paginated: true;
  };
  "GET /product-ideas": {
    /** List product ideas (paginated, searchable) */
    params: never;
    query: { page?: string; pageSize?: string; sort?: string; search?: string; "filter[id]"?: string; "filter[reference]"?: string; "filter[title]"?: string; "filter[categoryCode]"?: string; "filter[submitterName]"?: string; "filter[submitterEmail]"?: string; "filter[status]"?: string; "filter[voteCount]"?: string };
    body: never;
    data: ProductIdea[];
    paginated: true;
  };
  "POST /product-ideas": {
    /** Create a product idea; 202 when it needs approval */
    params: never;
    query: never;
    body: {
      adminNote?: string | null;
      categoryCode?: string | null;
      problem: string;
      reference?: string | null;
      status: "submitted" | "under_review" | "approved" | "in_development" | "completed" | "rejected";
      submitterEmail: string;
      submitterName?: string | null;
      title: string;
    };
    data: ProductIdea;
    paginated: false;
  };
  "GET /product-ideas/{id}": {
    /** Get a product idea */
    params: { id: string };
    query: never;
    body: never;
    data: ProductIdea;
    paginated: false;
  };
  "PATCH /product-ideas/{id}": {
    /** Update a product idea (requires the current version); 202 when it needs approval */
    params: { id: string };
    query: never;
    body: {
      adminNote?: string | null;
      categoryCode?: string | null;
      problem?: string;
      status?: "submitted" | "under_review" | "approved" | "in_development" | "completed" | "rejected";
      submitterEmail?: string;
      submitterName?: string | null;
      title?: string;
      version: number;
    };
    data: ProductIdea;
    paginated: false;
  };
  "DELETE /product-ideas/{id}": {
    /** Delete a product idea; 202 when it needs approval */
    params: { id: string };
    query: never;
    body: never;
    data: ProductIdea;
    paginated: false;
  };
  "GET /product-inquiries": {
    /** List product inquiries (paginated, searchable) */
    params: never;
    query: { page?: string; pageSize?: string; sort?: string; search?: string; "filter[id]"?: string; "filter[reference]"?: string; "filter[productSlug]"?: string; "filter[inquiryType]"?: string; "filter[contactMethod]"?: string; "filter[source]"?: string; "filter[status]"?: string; "filter[assignedTo]"?: string; "filter[createdAt]"?: string };
    body: never;
    data: ProductInquiry[];
    paginated: true;
  };
  "POST /product-inquiries": {
    /** Record an inquiry on behalf of a customer; 202 when it needs approval */
    params: never;
    query: never;
    body: {
      assignedTo?: string | null;
      company?: string | null;
      contactMethod: "email" | "phone" | "whatsapp" | "telegram";
      customerName: string;
      email: string;
      inquiryType: "product_information" | "pricing" | "customization" | "integration" | "partnership" | "deployment" | "technical_consultation";
      message: string;
      phone?: string | null;
      productSlug?: string | null;
      requirements?: string | null;
      source?: "homepage" | "product_card" | "product_page" | "assistant" | "catalog" | "contact_page" | "navigation" | "staff" | null;
      status?: "new" | "contacted" | "scheduled" | "completed" | "qualified" | "closed_won" | "closed_lost";
    };
    data: ProductInquiry;
    paginated: false;
  };
  "GET /product-inquiries/{id}": {
    /** Get a product inquiry */
    params: { id: string };
    query: never;
    body: never;
    data: ProductInquiry;
    paginated: false;
  };
  "PATCH /product-inquiries/{id}": {
    /** Update status, owner or response time (requires the current version) */
    params: { id: string };
    query: never;
    body: {
      assignedTo?: string | null;
      respondedAt?: string | string | null;
      status?: "new" | "contacted" | "scheduled" | "completed" | "qualified" | "closed_won" | "closed_lost";
      version: number;
    };
    data: ProductInquiry;
    paginated: false;
  };
  "DELETE /product-inquiries/{id}": {
    /** Delete an inquiry; 202 when it needs approval */
    params: { id: string };
    query: never;
    body: never;
    data: ProductInquiry;
    paginated: false;
  };
  "POST /product-inquiries/{id}/notes": {
    /** Add an internal follow-up note */
    params: { id: string };
    query: never;
    body: {
      body: string;
    };
    data: ProductInquiry;
    paginated: false;
  };
  "GET /product-questions": {
    /** List product questions (paginated, searchable) */
    params: never;
    query: { page?: string; pageSize?: string; sort?: string; search?: string; "filter[id]"?: string; "filter[reference]"?: string; "filter[productSlug]"?: string; "filter[customerEmail]"?: string; "filter[status]"?: string; "filter[developerId]"?: string };
    body: never;
    data: ProductQuestion[];
    paginated: true;
  };
  "GET /product-questions/{id}": {
    /** Get a product question */
    params: { id: string };
    query: never;
    body: never;
    data: ProductQuestion;
    paginated: false;
  };
  "PATCH /product-questions/{id}": {
    /** Change the status (requires the current version); 202 when it needs approval */
    params: { id: string };
    query: never;
    body: {
      status: "open" | "in_progress" | "answered" | "closed";
      version: number;
    };
    data: ProductQuestion;
    paginated: false;
  };
  "DELETE /product-questions/{id}": {
    /** Delete a product question; 202 when it needs approval */
    params: { id: string };
    query: never;
    body: never;
    data: ProductQuestion;
    paginated: false;
  };
  "GET /product-questions/{id}/conversation": {
    /** The conversation, assigned developers and delivery state of every notification and e-mail */
    params: { id: string };
    query: never;
    body: never;
    data: ProductQuestionConversation;
    paginated: false;
  };
  "POST /product-questions/{id}/replies": {
    /** Answer from the staff portal (saved and e-mailed to the customer) */
    params: { id: string };
    query: never;
    body: {
      body: string;
    };
    data: ProductQuestion;
    paginated: false;
  };
  "GET /product-reviews": {
    /** List product reviews (paginated, searchable) */
    params: never;
    query: { page?: string; pageSize?: string; sort?: string; search?: string; "filter[id]"?: string; "filter[reference]"?: string; "filter[productSlug]"?: string; "filter[rating]"?: string; "filter[title]"?: string; "filter[reviewerName]"?: string; "filter[reviewerRole]"?: string; "filter[reviewerEmail]"?: string; "filter[status]"?: string };
    body: never;
    data: ProductReview[];
    paginated: true;
  };
  "POST /product-reviews": {
    /** Create a product review; 202 when it needs approval */
    params: never;
    query: never;
    body: {
      body: string;
      productSlug: string;
      rating: number;
      reference?: string;
      reply?: string | null;
      reviewerEmail: string;
      reviewerName: string;
      reviewerRole?: string | null;
      status: "pending" | "approved" | "rejected";
      title?: string | null;
    };
    data: ProductReview;
    paginated: false;
  };
  "GET /product-reviews/{id}": {
    /** Get a product review */
    params: { id: string };
    query: never;
    body: never;
    data: ProductReview;
    paginated: false;
  };
  "PATCH /product-reviews/{id}": {
    /** Update a product review (requires the current version); 202 when it needs approval */
    params: { id: string };
    query: never;
    body: {
      body?: string;
      productSlug?: string;
      rating?: number;
      reference?: string;
      reply?: string | null;
      reviewerEmail?: string;
      reviewerName?: string;
      reviewerRole?: string | null;
      status?: "pending" | "approved" | "rejected";
      title?: string | null;
      version: number;
    };
    data: ProductReview;
    paginated: false;
  };
  "DELETE /product-reviews/{id}": {
    /** Delete a product review; 202 when it needs approval */
    params: { id: string };
    query: never;
    body: never;
    data: ProductReview;
    paginated: false;
  };
  "PATCH /reference-data/items/{id}": {
    /** Update an item (codes are permanent); 202 when it needs approval */
    params: { id: string };
    query: never;
    body: {
      active?: boolean;
      attributes?: Record<string, string | number | boolean | null | null>;
      description?: string | null;
      label?: string;
      labels?: Record<string, string>;
      parentCode?: string | null;
      sortOrder?: number;
      validFrom?: string | string | null;
      validTo?: string | string | null;
      version: number;
    };
    data: ReferenceDataItem;
    paginated: false;
  };
  "DELETE /reference-data/items/{id}": {
    /** Delete an item (its code is never reused); 202 when it needs approval */
    params: { id: string };
    query: never;
    body: never;
    data: ReferenceDataItem;
    paginated: false;
  };
  "GET /reference-data/lookups/{type}": {
    /** Options of a list for dropdowns (translated, effective items) */
    params: { type: string };
    query: never;
    body: never;
    data: LookupOption[];
    paginated: false;
  };
  "GET /reference-data/types": {
    /** Reference data lists */
    params: never;
    query: { page?: string; pageSize?: string; sort?: string; search?: string; "filter[isSystem]"?: string };
    body: never;
    data: ReferenceDataType[];
    paginated: true;
  };
  "POST /reference-data/types": {
    /** Create a list (with custom item attributes) */
    params: never;
    query: never;
    body: {
      attributes?: Array<{
        key: string;
        label: string;
        options?: string[];
        required?: boolean;
        type: "text" | "number" | "boolean" | "date" | "select";
      }>;
      code: string;
      description?: string | null;
      name: string;
      parentTypeCode?: string | null;
    };
    data: ReferenceDataType;
    paginated: false;
  };
  "GET /reference-data/types/{type}": {
    /** One list with its attribute definitions */
    params: { type: string };
    query: never;
    body: never;
    data: ReferenceDataType;
    paginated: false;
  };
  "PATCH /reference-data/types/{type}": {
    /** Update a list (requires the current version) */
    params: { type: string };
    query: never;
    body: {
      attributes?: Array<{
        key: string;
        label: string;
        options?: string[];
        required?: boolean;
        type: "text" | "number" | "boolean" | "date" | "select";
      }>;
      description?: string | null;
      name?: string;
      parentTypeCode?: string | null;
      version: number;
    };
    data: ReferenceDataType;
    paginated: false;
  };
  "DELETE /reference-data/types/{type}": {
    /** Delete an empty, non-system list */
    params: { type: string };
    query: never;
    body: never;
    data: ReferenceDataType;
    paginated: false;
  };
  "GET /reference-data/types/{type}/items": {
    /** Items of a list (paginated, searchable) */
    params: { type: string };
    query: { page?: string; pageSize?: string; sort?: string; search?: string; "filter[active]"?: string; "filter[parentCode]"?: string; "filter[code]"?: string };
    body: never;
    data: ReferenceDataItem[];
    paginated: true;
  };
  "POST /reference-data/types/{type}/items": {
    /** Add an item; 202 when it needs approval */
    params: { type: string };
    query: never;
    body: {
      active?: boolean;
      attributes?: Record<string, string | number | boolean | null | null>;
      code: string;
      description?: string | null;
      label: string;
      labels?: Record<string, string>;
      parentCode?: string | null;
      sortOrder?: number;
      validFrom?: string | string | null;
      validTo?: string | string | null;
    };
    data: ReferenceDataItem;
    paginated: false;
  };
  "GET /roles": {
    /** List roles (paginated, searchable) */
    params: never;
    query: { page?: string; pageSize?: string; sort?: string; search?: string; "filter[id]"?: string; "filter[isSystem]"?: string };
    body: never;
    data: Role[];
    paginated: true;
  };
  "POST /roles": {
    /** Create a role (only with permissions you hold); 202 when it needs approval */
    params: never;
    query: never;
    body: {
      code: string;
      description?: string | null;
      name: string;
      permissions: string[];
    };
    data: Role;
    paginated: false;
  };
  "GET /roles/{id}": {
    /** Get a role */
    params: { id: string };
    query: never;
    body: never;
    data: Role;
    paginated: false;
  };
  "PATCH /roles/{id}": {
    /** Update a role (requires the current version); 202 when it needs approval */
    params: { id: string };
    query: never;
    body: {
      description?: string | null;
      name?: string;
      permissions?: string[];
      version: number;
    };
    data: Role;
    paginated: false;
  };
  "DELETE /roles/{id}": {
    /** Delete a role (not system roles, not roles in use); 202 when it needs approval */
    params: { id: string };
    query: never;
    body: never;
    data: Role;
    paginated: false;
  };
  "GET /settings": {
    /** Every setting with its definition and effective value */
    params: never;
    query: never;
    body: never;
    data: Settings;
    paginated: false;
  };
  "PATCH /settings": {
    /** Change settings (only the keys sent are touched) */
    params: never;
    query: never;
    body: {
      values: Record<string, string | number | boolean | null | null>;
    };
    data: Settings;
    paginated: false;
  };
  "GET /settings/public": {
    /** Settings every signed-in user may read (branding, formats) */
    params: never;
    query: never;
    body: never;
    data: PublicSettings;
    paginated: false;
  };
  "POST /telegram/updates": {
    /** A Telegram update (webhook mode) */
    params: never;
    query: never;
    body: never;
    data: Record<string, unknown>;
    paginated: false;
  };
  "GET /users": {
    /** List users (scoped by the caller’s grant: all / branch / own) */
    params: never;
    query: { page?: string; pageSize?: string; sort?: string; search?: string; "filter[id]"?: string; "filter[status]"?: string; "filter[branchCode]"?: string; "filter[mfaEnabled]"?: string; "filter[createdAt]"?: string };
    body: never;
    data: User[];
    paginated: true;
  };
  "POST /users": {
    /** Create a user (transactional, idempotent, audited) */
    params: never;
    query: never;
    body: {
      branchCode?: string | null;
      email: string;
      fullName: string;
      password: string;
      phoneNumber?: string | null;
      roles: string[];
      username: string;
    };
    data: User;
    paginated: false;
  };
  "GET /users/{id}": {
    /** Get a user by id (ABAC: own / branch / any) */
    params: { id: string };
    query: never;
    body: never;
    data: User;
    paginated: false;
  };
  "PATCH /users/{id}": {
    /** Update a user (requires the current `version`, optimistic concurrency) */
    params: { id: string };
    query: never;
    body: {
      branchCode?: string | null;
      email?: string;
      fullName?: string;
      phoneNumber?: string | null;
      roles?: string[];
      status?: "ACTIVE" | "LOCKED" | "DISABLED";
      version: number;
    };
    data: User;
    paginated: false;
  };
  "DELETE /users/{id}": {
    /** Soft-delete a user and end their sessions; 202 when it needs approval */
    params: { id: string };
    query: never;
    body: never;
    data: User;
    paginated: false;
  };
  "POST /users/{id}/reset-password": {
    /** Set a temporary password and end the user's sessions */
    params: { id: string };
    query: never;
    body: {
      newPassword: string;
    };
    data: User;
    paginated: false;
  };
  "POST /users/{id}/restore": {
    /** Restore a soft-deleted user */
    params: { id: string };
    query: never;
    body: never;
    data: User;
    paginated: false;
  };
  "POST /users/{id}/sessions/terminate": {
    /** Sign the user out of every device */
    params: { id: string };
    query: never;
    body: never;
    data: Record<string, unknown>;
    paginated: false;
  };
  "POST /users/{id}/unlock": {
    /** Unlock an account locked after failed sign-ins */
    params: { id: string };
    query: never;
    body: never;
    data: User;
    paginated: false;
  };
  "GET /users/me": {
    /** Current user profile (roles and effective permissions) */
    params: never;
    query: never;
    body: never;
    data: UserProfile;
    paginated: false;
  };
  "PATCH /users/me": {
    /** Update my display name and phone number (self-service) */
    params: never;
    query: never;
    body: {
      fullName?: string;
      phoneNumber?: string | null;
      version: number;
    };
    data: UserProfile;
    paginated: false;
  };
  "GET /health/live": {
    /** Liveness probe */
    params: never;
    query: never;
    body: never;
    data: unknown;
    paginated: false;
  };
  "GET /health/ready": {
    /** Readiness probe (database, key/value store, circuit breakers) */
    params: never;
    query: never;
    body: never;
    data: unknown;
    paginated: false;
  };
}

export type ApiOperation = keyof ApiOperations;
/** Response `data` of an endpoint, e.g. ApiData<'GET /roles/{id}'>. */
export type ApiData<K extends ApiOperation> = ApiOperations[K]['data'];
/** Request body of an endpoint, e.g. ApiBody<'POST /roles'>. */
export type ApiBody<K extends ApiOperation> = ApiOperations[K]['body'];
export type ApiQuery<K extends ApiOperation> = ApiOperations[K]['query'];

/** Backend error-code catalogue (stable product contract). */
export const API_ERROR_CODES = [
  "INTERNAL_ERROR",
  "VALIDATION_FAILED",
  "BAD_REQUEST",
  "NOT_FOUND",
  "ROUTE_NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "CONFLICT",
  "CONCURRENCY_CONFLICT",
  "BUSINESS_RULE_VIOLATION",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "UNAUTHENTICATED",
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_ACCOUNT_LOCKED",
  "AUTH_ACCOUNT_DISABLED",
  "AUTH_TOKEN_INVALID",
  "AUTH_TOKEN_EXPIRED",
  "AUTH_SESSION_EXPIRED",
  "AUTH_SESSION_REVOKED",
  "AUTH_REFRESH_TOKEN_INVALID",
  "AUTH_REFRESH_TOKEN_REUSED",
  "AUTH_MFA_INVALID_CODE",
  "AUTH_MFA_CHALLENGE_INVALID",
  "AUTH_MFA_TOO_MANY_ATTEMPTS",
  "AUTH_MFA_METHOD_UNSUPPORTED",
  "AUTH_EXTERNAL_TOKEN_INVALID",
  "AUTH_EXTERNAL_IDENTITY_UNLINKED",
  "AUTH_PROVIDER_UNAVAILABLE",
  "AUTH_PASSWORD_CHANGE_INVALID",
  "AUTH_PASSWORD_RESET_INVALID",
  "APPROVAL_NOT_PENDING",
  "APPROVAL_SELF_DECISION",
  "APPROVAL_ALREADY_PENDING",
  "FORBIDDEN",
  "SERVICE_AUTH_FAILED",
  "PAYLOAD_ENCRYPTION_REQUIRED",
  "PAYLOAD_DECRYPTION_FAILED",
  "IDEMPOTENCY_KEY_MISSING",
  "IDEMPOTENCY_KEY_INVALID",
  "IDEMPOTENCY_IN_PROGRESS",
  "IDEMPOTENCY_KEY_REUSED",
  "EXTERNAL_SERVICE_ERROR",
  "EXTERNAL_SERVICE_TIMEOUT",
  "EXTERNAL_SERVICE_UNAVAILABLE"
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
