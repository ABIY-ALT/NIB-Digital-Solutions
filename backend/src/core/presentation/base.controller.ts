import type { ApprovalTicket, GateOutcome } from '#core/application/ports/approval.port.js';
import type { Page } from '#core/domain/pagination.js';
import { ApiResult } from './http/api-response.js';

/**
 * Base controller with the response conventions shared by every feature:
 *   • ok(data)                    → { success, data, message, correlationId, timestamp }
 *   • paginated(page, mapper)     → data = items, meta.pagination = page info
 *   • empty(message)              → data = null
 *   • gated(outcome, mapper)      → 200 with the result, or 202 + approval ticket
 *                                   when the change awaits a checker (maker–checker)
 *
 * Pagination / sort / filter / search parsing is done with @ListQuery(spec) and
 * documented with @ApiListQuery(spec), so every list endpoint behaves the same.
 */
export abstract class BaseController {
  protected ok<T>(data: T, message?: string): ApiResult<T> {
    return ApiResult.ok(data, message);
  }

  protected paginated<T, R = T>(
    page: Page<T>,
    map?: (item: T) => R,
    message?: string,
  ): ApiResult<R[]> {
    const mapped: Page<R> = map
      ? { ...page, items: page.items.map(map) }
      : (page as unknown as Page<R>);
    return ApiResult.paginated(mapped, message);
  }

  protected empty(message?: string): ApiResult<null> {
    return ApiResult.empty(message);
  }

  protected gated<T, R>(
    outcome: GateOutcome<T>,
    map: (result: T) => R,
    message?: string,
  ): ApiResult<R | ApprovalTicket> {
    if (outcome.status === 'PENDING') {
      return ApiResult.accepted<R | ApprovalTicket>(
        outcome.ticket,
        'Submitted for approval. The change takes effect once a checker approves it.',
        { approval: { id: outcome.ticket.approvalId, status: 'PENDING' } },
      );
    }
    return ApiResult.ok<R | ApprovalTicket>(map(outcome.result), message);
  }
}
