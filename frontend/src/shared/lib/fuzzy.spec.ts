import { describe, expect, it } from 'vitest';
import {
  editDistance,
  fuzzyFilter,
  fuzzyMatch,
  highlightSegments,
  matchWord,
  normalizeChars,
} from './fuzzy';

const labels = [
  'Dashboard',
  'Users',
  'Roles & permissions',
  'Reference data',
  'Audit log',
  'Security & compliance',
  'Change password',
  'Notifications',
];
const rank = (q: string) => fuzzyFilter(labels, q, (label) => ({ label })).map((r) => r.item);

describe('fuzzy matching', () => {
  it('ranks prefixes, word starts and acronyms first', () => {
    expect(rank('use')[0]).toBe('Users');
    expect(rank('rd')[0]).toBe('Reference data');
    expect(rank('perm')[0]).toBe('Roles & permissions');
    expect(rank('sec comp')[0]).toBe('Security & compliance');
    expect(rank('log')[0]).toBe('Audit log');
  });

  it('finds abbreviations as subsequences', () => {
    expect(rank('dshb')[0]).toBe('Dashboard');
    expect(rank('ntf')[0]).toBe('Notifications');
  });

  it('tolerates a typo in longer words', () => {
    expect(rank('pasword')[0]).toBe('Change password');
    expect(rank('audti')[0]).toBe('Audit log');
    expect(editDistance('audti', 'audit')).toBe(1);
    expect(matchWord('xyzq', 'Users')).toBeNull();
  });

  it('requires every word and uses keywords with lower weight', () => {
    expect(fuzzyMatch('users zzz', { label: 'Users' })).toBeNull();
    const byKeyword = fuzzyMatch('staff', { label: 'Users', keywords: ['staff', 'employees'] });
    expect(byKeyword?.score).toBeGreaterThan(0);
    expect(byKeyword?.indices).toEqual([]);
  });

  it('ignores case and diacritics, keeps Ethiopic, and highlights matches', () => {
    expect(normalizeChars('Crème')).toBe('creme');
    expect(fuzzyMatch('ተጠቃሚ', { label: 'ተጠቃሚዎች' })).not.toBeNull();
    const hit = fuzzyMatch('ref dat', { label: 'Reference data' })!;
    expect(highlightSegments('Reference data', hit.indices)).toEqual([
      { text: 'Ref', match: true },
      { text: 'erence ', match: false },
      { text: 'dat', match: true },
      { text: 'a', match: false },
    ]);
  });

  it('drops weak scattered matches when strong ones exist', () => {
    const items = ['Audit log', 'Background jobs'];
    expect(fuzzyFilter(items, 'aud', (label) => ({ label }))).toHaveLength(2);
    expect(
      fuzzyFilter(items, 'aud', (label) => ({ label }), { relativeCutoff: 0.35 }).map(
        (r) => r.item,
      ),
    ).toEqual(['Audit log']);
  });

  it('returns items unchanged for an empty query and respects the limit', () => {
    expect(
      fuzzyFilter(labels, '  ', (label) => ({ label }), { limit: 2 }).map((r) => r.item),
    ).toEqual(['Dashboard', 'Users']);
  });
});
