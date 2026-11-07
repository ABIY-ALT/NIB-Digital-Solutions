import { describe, expect, it } from 'vitest';
import { searchToSend } from './table-search';

describe('searchToSend', () => {
  it('sends a changed, trimmed query', () => {
    expect(searchToSend('  lemma ', '')).toBe('lemma');
    expect(searchToSend('kassa', 'lemma')).toBe('kassa');
  });

  it('sends nothing when the query is unchanged', () => {
    expect(searchToSend('lemma ', 'lemma')).toBeNull();
    expect(searchToSend('   ', '')).toBeNull();
  });

  it('holds back queries shorter than minLength but always allows clearing', () => {
    expect(searchToSend('a', '', 2)).toBeNull();
    expect(searchToSend('ab', '', 2)).toBe('ab');
    expect(searchToSend('', 'lemma', 2)).toBe('');
  });
});
