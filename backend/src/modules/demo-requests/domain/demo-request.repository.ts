import type { Repository } from '#core/domain/repository.js';
import type { DemoRequest } from './demo-request.entity.js';

export interface DemoRequestRepository extends Repository<DemoRequest> {
  /** Unique fields (deleted records included: values are never reused). */
  findByUnique(field: 'reference', value: string | number): Promise<DemoRequest | null>;
}

export const DEMO_REQUEST_REPOSITORY = Symbol('DemoRequestRepository');
