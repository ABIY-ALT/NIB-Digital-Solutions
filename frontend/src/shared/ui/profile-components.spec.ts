import { describe, expect, it } from 'vitest';
import { parseUserAgent } from '@/shared/lib/user-agent';
import { checklistScore } from './checklist-score';

describe('checklistScore', () => {
  it('weights items and rounds to a percentage', () => {
    expect(
      checklistScore([
        { id: 'mfa', label: 'MFA', done: false, weight: 3 },
        { id: 'password', label: 'Password', done: true, weight: 2 },
        { id: 'phone', label: 'Phone', done: true },
      ]),
    ).toBe(50);
    expect(checklistScore([])).toBe(100);
    expect(checklistScore([{ id: 'a', label: 'A', done: true }])).toBe(100);
  });
});

describe('shared user-agent parser', () => {
  it('is the single implementation used by audit, sessions and activity', () => {
    expect(
      parseUserAgent(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
      ),
    ).toEqual({ kind: 'desktop', browser: 'Chrome 128', os: 'Linux' });
  });
});
