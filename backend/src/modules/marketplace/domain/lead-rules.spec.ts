import { describe, expect, it } from 'vitest';
import { cleanLine, cleanText, makeReference, readNotes } from './lead-rules.js';

describe('lead rules', () => {
  it('strips control characters and markup', () => {
    expect(cleanLine('a\u0000b\u0007c  <b>d</b>', 50)).toBe('abc bd/b');
    expect(cleanText('line one\n\n\n\nline two\tend', 50)).toBe('line one\n\nline two end');
  });

  it('makes unambiguous reference numbers in Addis Ababa time', () => {
    const ref = makeReference('DEMO', new Date('2026-11-03T22:30:00Z'));
    expect(ref).toMatch(/^DEMO-261104-[A-HJ-NP-Z2-9]{5}$/);
  });

  it('reads only well-formed stored notes', () => {
    expect(
      readNotes([{ id: 'n1', author: 'a', body: 'b', createdAt: 'x' }, { bogus: true }, 'x']),
    ).toHaveLength(1);
    expect(readNotes(null)).toEqual([]);
  });
});
