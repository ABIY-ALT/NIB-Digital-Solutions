import { describe, expect, it } from 'vitest';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import { ApprovalRequest } from './approval-request.js';

const maker = { id: 'maker-1', name: 'Maker' };
const checker = { id: 'checker-1', name: 'Checker' };

function pending(expiresInMs = 60_000) {
  return ApprovalRequest.submit({
    action: 'roles.update',
    resourceType: 'Role',
    resourceId: 'r1',
    summary: 'Update role Teller',
    payload: { id: 'r1' },
    before: { name: 'Teller', permissions: ['a', 'b'] },
    after: { name: 'Senior Teller', permissions: ['a', 'b'] },
    maker,
    makerComment: null,
    checkerPermissions: ['roles:update'],
    expiresAt: new Date(Date.now() + expiresInMs),
    correlationId: null,
  });
}

describe('ApprovalRequest (four-eyes state machine)', () => {
  it('lets a different person approve, then records the applied result', () => {
    const r = pending();
    r.approve(checker, 'ok');
    expect(r.status).toBe('APPROVED');
    r.markApplied({ id: 'r1' });
    expect(r.toSnapshot().result).toEqual({ id: 'r1' });
  });

  it('never lets the maker decide their own request', () => {
    const r = pending();
    expect(() => r.approve(maker, null)).toThrowError(
      expect.objectContaining({ code: ErrorCode.APPROVAL_SELF_DECISION }),
    );
    expect(() => r.reject(maker, 'no way')).toThrowError(
      expect.objectContaining({ code: ErrorCode.APPROVAL_SELF_DECISION }),
    );
  });

  it('requires a reason to reject and allows only one decision', () => {
    const r = pending();
    expect(() => r.reject(checker, ' ')).toThrow(/reason/i);
    r.reject(checker, 'Wrong branch');
    expect(r.status).toBe('REJECTED');
    expect(() => r.approve(checker, null)).toThrowError(
      expect.objectContaining({ code: ErrorCode.APPROVAL_NOT_PENDING }),
    );
  });

  it('cannot be approved after expiry; only the maker can withdraw', () => {
    const r = pending(-1);
    expect(() => r.approve(checker, null)).toThrowError(
      expect.objectContaining({ code: ErrorCode.APPROVAL_NOT_PENDING }),
    );
    const w = pending();
    expect(() => w.cancel(checker)).toThrow(/requester/);
    w.cancel(maker);
    expect(w.status).toBe('CANCELLED');
  });

  it('turns into FAILED when the approved change cannot be applied', () => {
    const r = pending();
    r.approve(checker, null);
    r.markFailed('CONCURRENCY_CONFLICT', 'Changed meanwhile');
    expect(r.status).toBe('FAILED');
    expect(r.toSnapshot().errorCode).toBe('CONCURRENCY_CONFLICT');
  });

  it('diffs only the fields that change', () => {
    expect(pending().changes()).toEqual([
      { field: 'name', before: 'Teller', after: 'Senior Teller' },
    ]);
  });
});
