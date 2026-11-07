export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Consecutive failures that trip the breaker. */
  failureThreshold: number;
  /** How long the breaker stays open before allowing a trial call. */
  resetTimeoutMs: number;
  /** Successful trial calls needed in HALF_OPEN to close again. */
  successThreshold: number;
}

export class CircuitOpenError extends Error {
  constructor(readonly circuit: string) {
    super(`Circuit "${circuit}" is open`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Minimal, dependency-free circuit breaker (CLOSED → OPEN → HALF_OPEN → CLOSED).
 * One instance per downstream system, shared by all calls to it.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private openedAt = 0;
  private halfOpenInFlight = false;

  constructor(
    readonly name: string,
    private readonly options: CircuitBreakerOptions,
    private readonly onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void,
  ) {}

  get currentState(): CircuitState {
    if (this.state === 'OPEN' && Date.now() - this.openedAt >= this.options.resetTimeoutMs) {
      this.transition('HALF_OPEN');
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.currentState;
    if (state === 'OPEN') throw new CircuitOpenError(this.name);
    if (state === 'HALF_OPEN') {
      if (this.halfOpenInFlight) throw new CircuitOpenError(this.name);
      this.halfOpenInFlight = true;
    }
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    } finally {
      if (state === 'HALF_OPEN') this.halfOpenInFlight = false;
    }
  }

  private recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.options.successThreshold) this.transition('CLOSED');
    } else {
      this.failures = 0;
    }
  }

  private recordFailure(): void {
    if (this.state === 'HALF_OPEN') {
      this.transition('OPEN');
      return;
    }
    this.failures++;
    if (this.failures >= this.options.failureThreshold) this.transition('OPEN');
  }

  private transition(to: CircuitState): void {
    const from = this.state;
    if (from === to) return;
    this.state = to;
    this.failures = 0;
    this.successes = 0;
    if (to === 'OPEN') this.openedAt = Date.now();
    this.onStateChange?.(this.name, from, to);
  }
}
