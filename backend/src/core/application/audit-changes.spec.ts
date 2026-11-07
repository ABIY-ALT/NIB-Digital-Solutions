import { describe, expect, it } from 'vitest';
import { trackChange, takeChanges } from './audit-changes.js';
import type { RequestContextData } from './ports/request-context.port.js';
import {
  auditValue,
  changeOperation,
  diffSnapshots,
  isSecretField,
  REDACTED,
} from '#core/domain/audit-change.js';

describe('audit change capture', () => {
  it('lists changed fields with previous and new values, ignoring bookkeeping', () => {
    const at = new Date('2026-01-01T00:00:00Z');
    const fields = diffSnapshots(
      { name: 'Teller', description: null, version: 1, updatedAt: at, permissions: ['a'] },
      {
        name: 'Senior teller',
        description: null,
        version: 2,
        updatedAt: new Date(),
        permissions: ['a', 'b'],
      },
    );
    expect(fields).toEqual([
      { field: 'name', before: 'Teller', after: 'Senior teller' },
      { field: 'permissions', before: ['a'], after: ['a', 'b'] },
    ]);
  });

  it('never records secret values, only that they changed', () => {
    const fields = diffSnapshots(
      { passwordHash: 'old', mfaSecret: null },
      { passwordHash: 'new', mfaSecret: 'x' },
    );
    expect(fields).toEqual([
      { field: 'passwordHash', before: REDACTED, after: REDACTED, redacted: true },
      { field: 'mfaSecret', before: null, after: REDACTED, redacted: true },
    ]);
    expect(isSecretField('api_token')).toBe(true);
    expect(isSecretField('shippingAddress')).toBe(false);
    expect(isSecretField('pinned')).toBe(false);
    expect(auditValue({ nested: { secretKey: 'x' } })).toEqual({ nested: { secretKey: REDACTED } });
  });

  it('describes creations with set fields only and derives the operation', () => {
    expect(diffSnapshots(null, { code: 'X', note: null, amount: 10n })).toEqual([
      { field: 'code', before: null, after: 'X' },
      { field: 'amount', before: null, after: '10' },
    ]);
    expect(changeOperation(null, {})).toBe('create');
    expect(changeOperation({}, null)).toBe('delete');
    expect(changeOperation({ deletedAt: null }, { deletedAt: new Date() })).toBe('delete');
    expect(changeOperation({ deletedAt: new Date() }, { deletedAt: null })).toBe('restore');
  });

  it('collects changes per request and skips no-op updates', () => {
    const ctx = {
      correlationId: 'c',
      ipAddress: null,
      userAgent: null,
      startedAt: 0,
    } as RequestContextData;
    trackChange(ctx, { resourceType: 'Role', resourceId: '1', before: { a: 1 }, after: { a: 1 } });
    trackChange(ctx, { resourceType: 'Role', resourceId: '1', before: { a: 1 }, after: { a: 2 } });
    trackChange(undefined, {
      resourceType: 'Role',
      resourceId: '1',
      before: null,
      after: { a: 1 },
    });
    const taken = takeChanges(ctx);
    expect(taken).toHaveLength(1);
    expect(taken[0]).toMatchObject({
      operation: 'update',
      fields: [{ field: 'a', before: 1, after: 2 }],
    });
    expect(takeChanges(ctx)).toEqual([]);
  });

  it('keeps audit values JSON-safe and bounded', () => {
    expect(auditValue(undefined)).toBeNull();
    expect(auditValue(new Date('invalid'))).toBeNull();
    expect(auditValue(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01T00:00:00.000Z');
    expect(auditValue(Number.NaN)).toBeNull();
    expect(auditValue(1.5)).toBe(1.5);
    expect(auditValue(true)).toBe(true);
    expect(auditValue(() => 1)).toBeNull();
    expect(auditValue(Symbol('s'))).toBeNull();
    expect(auditValue('x'.repeat(2_001))).toHaveLength(2_001);
    // Decimal-like values serialise through toJSON.
    class Decimal {
      toJSON() {
        return '12.50';
      }
    }
    expect(auditValue({ amount: new Decimal(), skipped: undefined })).toEqual({ amount: '12.50' });
    expect(auditValue([1, 'a', null])).toEqual([1, 'a', null]);
    // Oversized objects are cut to a string.
    const big = auditValue({ items: Array.from({ length: 2_000 }, (_, i) => `item-${i}`) });
    expect(typeof big).toBe('string');
  });
});
