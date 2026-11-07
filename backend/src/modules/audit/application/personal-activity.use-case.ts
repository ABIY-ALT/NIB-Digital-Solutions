import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '#core/application/security/principal.js';
import {
  AUDIT_RECORD_REPOSITORY,
  type AuditRecordRepository,
  type AuditRecordView,
  type PersonalActivitySummary,
} from './audit-record.repository.js';

/** Background noise that would drown a personal timeline. */
const NOISE = ['AUTH_TOKEN_REFRESH', 'USER_VIEW'] as const;
const SUMMARY_DAYS = 30;

/**
 * "My activity" for every signed-in user (no audit permission needed): what
 * they did, what others did to their account, and failed sign-ins with their
 * username — the self-service security review banks expect (like Google's
 * "Recent security activity").
 */
@Injectable()
export class PersonalActivityUseCase {
  constructor(
    @Inject(AUDIT_RECORD_REPOSITORY) private readonly repository: AuditRecordRepository,
  ) {}

  async list(
    principal: Principal,
    options: { beforeSeq: bigint | null; limit: number },
  ): Promise<{ items: AuditRecordView[]; nextCursor: string | null }> {
    const items = await this.repository.findForSubject(
      { userId: principal.userId, username: principal.username },
      { ...options, limit: options.limit + 1, excludeActions: NOISE },
    );
    const more = items.length > options.limit;
    const page = more ? items.slice(0, options.limit) : items;
    return {
      items: page,
      nextCursor: more ? (page.at(-1)?.seq.toString() ?? null) : null,
    };
  }

  summary(principal: Principal): Promise<PersonalActivitySummary & { days: number }> {
    const since = new Date(Date.now() - SUMMARY_DAYS * 86_400_000);
    return this.repository
      .summarizeForSubject({ userId: principal.userId, username: principal.username }, since)
      .then((s) => ({ ...s, days: SUMMARY_DAYS }));
  }
}
