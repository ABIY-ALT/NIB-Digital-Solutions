/**
 * Deterministic pseudo-random numbers for sample data, demos and tests.
 *
 * The same seed always yields the same sequence, so a server render and a
 * browser render agree (no hydration mismatch) and screenshots stay stable.
 * Never use it for anything security-relevant.
 */

/** mulberry32: tiny, fast 32-bit PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit seed from text (FNV-1a): seedFrom('crm', '30d', '2026-10-14'). */
export function seedFrom(...parts: Array<string | number>): number {
  let hash = 0x811c9dc5;
  for (const char of parts.join('|')) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface Sampler {
  /** Float in [0, 1). */
  next: () => number;
  /** Float in [min, max). */
  between: (min: number, max: number) => number;
  /** Integer in [min, max]. */
  int: (min: number, max: number) => number;
  /** Multiplier around 1: noise(0.2) → [0.9, 1.1). */
  noise: (spread: number) => number;
  pick: <T>(items: readonly T[]) => T;
  /** Random walk of `n` values starting near `start`, each step within ±volatility / 2. */
  walk: (start: number, n: number, volatility: number) => number[];
}

export function createSampler(seed: number): Sampler {
  const next = mulberry32(seed);
  const between = (min: number, max: number) => min + next() * (max - min);
  return {
    next,
    between,
    int: (min, max) => Math.floor(between(min, max + 1)),
    noise: (spread) => 1 + (next() - 0.5) * spread,
    pick: (items) => items[Math.floor(next() * items.length)]!,
    walk: (start, n, volatility) => {
      let v = start;
      return Array.from({ length: n }, () => (v = v * (1 + (next() - 0.5) * volatility)));
    },
  };
}
