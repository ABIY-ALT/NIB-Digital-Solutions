import type { ApiSchemas } from '@/shared/api';

/** Public catalog types (shared contract, generated from the backend). */
export type MarketplaceProduct = ApiSchemas['MarketplaceProduct'];
export type MarketplaceCategory = ApiSchemas['MarketplaceCategory'];
export type MarketplaceCatalog = ApiSchemas['MarketplaceCatalog'];
export type ProductContent = ApiSchemas['ProductContent'];
export type ProductScreenshot = ApiSchemas['ProductScreenshot'];
export type ProductDemo = ApiSchemas['ProductDemo'];
export type ScreenVariant = ProductScreenshot['variant'];
export type AssistantReply = ApiSchemas['MarketplaceAssistantReply'];
export type AssistantAction = AssistantReply['actions'][number];
export type MarketplaceAnalytics = ApiSchemas['MarketplaceAnalytics'];
/** A product's customer rating and approved reviews (GET /api/marketplace/products/:slug/reviews). */
export type PublicProductReviews = ApiSchemas['PublicProductReviews'];
export type PublicProductReview = ApiSchemas['PublicProductReview'];
/** An industry or business need (managed reference data, in the reader's language). */
export type TaxonomyEntry = ApiSchemas['MarketplaceTaxonomyEntry'];

export interface Taxonomy {
  industries: TaxonomyEntry[];
  needs: TaxonomyEntry[];
}

export type IndustryId = MarketplaceProduct['industries'][number];
export type NeedId = MarketplaceProduct['needs'][number];
export type Availability = MarketplaceProduct['availability'];
export type DeploymentType = MarketplaceProduct['deployment'][number];
export type Platform = MarketplaceProduct['platforms'][number];

export type DemoType = 'online' | 'onsite' | 'recorded' | 'customized';
export type InquiryType =
  | 'product_information'
  | 'pricing'
  | 'customization'
  | 'integration'
  | 'partnership'
  | 'deployment'
  | 'technical_consultation';
export type ContactMethod = 'email' | 'phone' | 'whatsapp' | 'telegram';
export type LeadSource =
  | 'homepage'
  | 'product_card'
  | 'product_page'
  | 'assistant'
  | 'catalog'
  | 'contact_page'
  | 'navigation';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface CatalogQuery {
  search?: string;
  industries?: IndustryId[];
  /** Business needs (the former Solutions page). */
  needs?: NeedId[];
  categories?: string[];
  availability?: Availability[];
  hasDemo?: boolean;
  deployment?: DeploymentType[];
  sort?: 'featured' | 'rating' | 'newest' | 'alphabetical';
}

/**
 * An approved idea on the public "What should we build next?" board.
 * Mirrors the backend's `PublicIdea` DTO (GET /marketplace/ideas). Kept here
 * until `npm run contract` regenerates contract.gen.ts, which currently
 * predates the public ideas endpoints; switch to `ApiSchemas['PublicIdea']` then.
 */
export interface PublicIdea {
  reference: string;
  title: string;
  problem: string;
  categoryCode: string | null;
  /** First name the visitor chose to give, if any (never the e-mail). */
  suggestedBy: string | null;
  status: 'approved' | 'in_development' | 'completed';
  voteCount: number;
  /** Whether this visitor already voted for it. */
  voted: boolean;
  votable: boolean;
  createdAt: string;
}
export type IdeaSort = 'popular' | 'newest';
export type IdeaStatus = PublicIdea['status'];

/** Active homepage carousel slides (in order) and the carousel settings. */
export type PublicHeroCarousel = ApiSchemas['PublicHeroCarousel'];
export type PublicHeroSlide = PublicHeroCarousel['slides'][number];

/** A customer's conversation with a product developer (opened with the private link). */
export type PublicConversation = ApiSchemas['PublicQuestionConversation'];
