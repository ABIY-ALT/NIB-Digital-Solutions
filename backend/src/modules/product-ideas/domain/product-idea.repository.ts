import type { Repository } from '#core/domain/repository.js';
import type { ProductIdea } from './product-idea.entity.js';

export interface PublicIdeaQuery {
  sort: 'popular' | 'newest';
  category?: string;
  status?: string;
  search?: string;
  limit: number;
}

/** counted: a new vote; already: this visitor voted before; limited: too many votes from one network. */
export type VoteOutcome = 'counted' | 'already' | 'limited';

export interface ProductIdeaRepository extends Repository<ProductIdea> {
  /** Ideas shown on the public board (approved, in development, completed). */
  findPublic(query: PublicIdeaQuery): Promise<ProductIdea[]>;
  findByUnique(field: 'reference', value: string | number): Promise<ProductIdea | null>;
  findByReference(reference: string): Promise<ProductIdea | null>;
  /** A live (not rejected) idea with the same normalised title: duplicate detection. */
  findByTitleKey(titleKey: string): Promise<ProductIdea | null>;
  /** Ideas submitted from one (hashed) IP since a moment: per-network limit. */
  countRecentFromIp(ipHash: string, since: Date): Promise<number>;
  /** Records a vote at most once per visitor and idea, and caps votes per network. */
  vote(
    ideaId: string,
    voterHash: string,
    ipHash: string,
    maxPerNetwork: { count: number; since: Date },
  ): Promise<VoteOutcome>;
  /** Which of these ideas the visitor already voted for. */
  votedBy(voterHash: string, ideaIds: readonly string[]): Promise<Set<string>>;
}

export const PRODUCT_IDEA_REPOSITORY = Symbol('ProductIdeaRepository');
