import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  const fail = () => Promise.reject(new Error('boom'));
  const ok = () => Promise.resolve('ok');

  it('opens after the failure threshold and rejects fast', async () => {
    const cb = new CircuitBreaker('t', {
      failureThreshold: 2,
      resetTimeoutMs: 10_000,
      successThreshold: 1,
    });
    await expect(cb.execute(fail)).rejects.toThrow('boom');
    await expect(cb.execute(fail)).rejects.toThrow('boom');
    expect(cb.currentState).toBe('OPEN');
    await expect(cb.execute(ok)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('half-opens after the reset timeout and closes on success', async () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker('t', {
      failureThreshold: 1,
      resetTimeoutMs: 1_000,
      successThreshold: 1,
    });
    await expect(cb.execute(fail)).rejects.toThrow();
    vi.advanceTimersByTime(1_001);
    expect(cb.currentState).toBe('HALF_OPEN');
    await expect(cb.execute(ok)).resolves.toBe('ok');
    expect(cb.currentState).toBe('CLOSED');
    vi.useRealTimers();
  });
});
