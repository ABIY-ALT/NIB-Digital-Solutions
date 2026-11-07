import { describe, expect, it } from 'vitest';
import { keyed } from '@/shared/lib/keys';

describe('keyed', () => {
  it('keys items by their identity', () => {
    expect(keyed(['a', 'b'], (s) => s)).toEqual([
      { key: 'a', item: 'a' },
      { key: 'b', item: 'b' },
    ]);
  });

  it('keeps repeated identities unique', () => {
    expect(keyed(['x', 'y', 'x', 'x'], (s) => s).map((k) => k.key)).toEqual([
      'x',
      'y',
      'x~1',
      'x~2',
    ]);
  });
});
