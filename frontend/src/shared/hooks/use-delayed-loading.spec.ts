import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDelayedVisibility } from './use-delayed-loading';

describe('createDelayedVisibility', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (delayMs = 150, minDurationMs = 400) => {
    const changes: boolean[] = [];
    const c = createDelayedVisibility({ delayMs, minDurationMs }, (v) => changes.push(v), {
      now: () => Date.now(),
    });
    return { c, changes };
  };

  it('never shows a loader for work shorter than the delay', () => {
    const { c, changes } = setup();
    c.update(true);
    vi.advanceTimersByTime(100);
    c.update(false);
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([]);
  });

  it('shows after the delay and keeps it up for the minimum duration', () => {
    const { c, changes } = setup();
    c.update(true);
    vi.advanceTimersByTime(150);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(50);
    c.update(false); // work ended 50 ms after the loader appeared
    vi.advanceTimersByTime(349);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true, false]);
  });

  it('hides immediately when the minimum has already passed', () => {
    const { c, changes } = setup();
    c.update(true);
    vi.advanceTimersByTime(1000);
    c.update(false);
    expect(changes).toEqual([true, false]);
  });

  it('shows at once without a delay and cancels pending timers on dispose', () => {
    const { c, changes } = setup(0, 0);
    c.update(true);
    expect(changes).toEqual([true]);
    const delayed = setup();
    delayed.c.update(true);
    delayed.c.dispose();
    vi.advanceTimersByTime(1000);
    expect(delayed.changes).toEqual([]);
  });

  it('stays visible when work restarts during the minimum duration', () => {
    const { c, changes } = setup();
    c.update(true);
    vi.advanceTimersByTime(150);
    c.update(false);
    c.update(true);
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([true]);
  });
});
