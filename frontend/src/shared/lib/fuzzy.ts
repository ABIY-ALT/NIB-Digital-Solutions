/**
 * Fuzzy matching for quick search, menu filters and pickers (dependency-free).
 *
 * Ranking, best first:
 *   1. exact / prefix matches ("use" → "Users")
 *   2. word-start acronyms and abbreviations ("rd" → "Reference data", "usr" → "Users")
 *   3. scattered subsequences, preferring consecutive characters and word starts
 *   4. one typo in longer words ("pasword" → "Password", "audti" → "Audit")
 *
 * Matching ignores case and Latin diacritics; Ethiopic text is matched as is.
 * Every query word must match somewhere (label or keywords); only label matches
 * are highlighted.
 */

export interface FuzzyResult {
  score: number;
  /** Matched character positions in the label (for highlighting). */
  indices: number[];
}

export interface FuzzyCandidate {
  label: string;
  /** Extra searchable text (synonyms, codes, e-mail, section), weighted lower. */
  keywords?: readonly (string | null | undefined)[];
}

const SEPARATOR = /[\s\-_/.:,()[\]·|>]/;

/** One output char per input char, so match positions map back to the original. */
export function normalizeChars(text: string): string {
  let out = '';
  for (const ch of text) {
    const base = ch.normalize('NFD')[0] ?? ch;
    out += base.toLowerCase().length === 1 ? base.toLowerCase() : ch;
  }
  return out;
}

function boundaries(text: string): boolean[] {
  const chars = [...text];
  return chars.map((ch, i) => {
    if (i === 0) return true;
    const prev = chars[i - 1]!;
    if (SEPARATOR.test(prev)) return !SEPARATOR.test(ch);
    // camelCase and letter ↔ digit transitions start a new word
    if (/[a-z]/.test(prev) && /[A-Z]/.test(ch)) return true;
    return /\d/.test(prev) !== /\d/.test(ch) && /[\p{L}\d]/u.test(ch);
  });
}

const SCORE = { match: 16, boundary: 10, first: 12, consecutive: 8, gap: 1, gapStart: 3 };
/** "Unreachable" in the alignment; it stays so under the additions and subtractions below. */
const NEG = -Infinity;

const matchBonus = (starts: boolean[], j: number) =>
  SCORE.match + (starts[j] ? SCORE.boundary : 0) + (j === 0 ? SCORE.first : 0);

/**
 * Fills one row of the alignment: `ch` (query character i, i ≥ 1) matched at
 * each text position, after the previous query character (row `prev`).
 */
function alignRow(
  ch: string,
  i: number,
  t: string[],
  starts: boolean[],
  prev: number[],
  row: number[],
  from: number[],
): void {
  let best = NEG;
  let bestAt = -1;
  for (let j = i; j < t.length; j++) {
    // Carry the best predecessor forward, decaying with the gap length.
    const before = prev[j - 1]!;
    best -= SCORE.gap;
    if (before - SCORE.gapStart > best) {
      best = before - SCORE.gapStart;
      bestAt = j - 1;
    }
    if (ch !== t[j]) continue;
    const bonus = matchBonus(starts, j);
    const viaRun = before + bonus + SCORE.consecutive;
    const viaGap = best + bonus;
    if (viaRun >= viaGap && viaRun !== NEG) {
      row[j] = viaRun;
      from[j] = j - 1;
    } else if (viaGap !== NEG) {
      row[j] = viaGap;
      from[j] = bestAt;
    }
  }
}

/**
 * Best subsequence alignment of `query` in `text` (dynamic programming, as in
 * fzf): rewards word starts and runs, penalises gaps.
 */
function subsequence(query: string, text: string, starts: boolean[]): FuzzyResult | null {
  const q = [...query];
  const t = [...text];
  const m = q.length;
  const n = t.length;
  if (m === 0 || m > n) return null;
  // score[i][j]: best score with q[i] matched at t[j]; from[i][j]: where q[i - 1] was matched.
  const score: number[][] = Array.from({ length: m }, () => new Array<number>(n).fill(NEG));
  const from: number[][] = Array.from({ length: m }, () => new Array<number>(n).fill(-1));
  for (let j = 0; j < n; j++) {
    if (q[0] === t[j]) score[0]![j] = matchBonus(starts, j) - j * 0.2;
  }
  for (let i = 1; i < m; i++) alignRow(q[i]!, i, t, starts, score[i - 1]!, score[i]!, from[i]!);
  let end = -1;
  let top = NEG;
  for (let j = 0; j < n; j++) {
    if (score[m - 1]![j]! > top) {
      top = score[m - 1]![j]!;
      end = j;
    }
  }
  if (end < 0) return null;
  const indices: number[] = [];
  for (let i = m - 1, j = end; i >= 0 && j >= 0; i--) {
    indices.unshift(j);
    j = from[i]![j]!;
  }
  return { score: top, indices };
}

/** Optimal string alignment distance (Damerau–Levenshtein with adjacent swaps). */
export function editDistance(a: string, b: string, max = 2): number {
  const x = [...a];
  const y = [...b];
  if (Math.abs(x.length - y.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: x.length + 1 }, (_, i) =>
    // First row and column: the distance to an empty string (j or i).
    Array.from({ length: y.length + 1 }, (_, j) => (i === 0 || j === 0 ? i + j : 0)),
  );
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d[x.length]![y.length]!;
}

/** `q` occurs in `t`, first at `at`. */
function substringMatch(q: string, t: string, starts: boolean[], at: number): FuzzyResult {
  // Prefer a hit at a word start over the first occurrence.
  let pos = at;
  for (let i = at; i >= 0; i = t.indexOf(q, i + 1)) {
    if (starts[i]) {
      pos = i;
      break;
    }
  }
  const length = [...q].length;
  const indices = Array.from({ length }, (_, k) => pos + k);
  const coverage = (length / Math.max(1, [...t].length)) * 30;
  if (starts[pos]) {
    return { score: 100 + (pos === 0 ? 40 : 25) + coverage - pos * 0.3, indices };
  }
  // Inside a word ("rd" in "Dashboard"): a short query is more likely an acronym.
  const inside = 40 + (length >= 3 ? 35 : 0) + coverage - pos * 0.3;
  const acronym = subsequence(q, t, starts);
  return acronym && acronym.score > inside ? acronym : { score: inside, indices };
}

/** Index just past the word that starts at `i`. */
function wordEnd(chars: string[], i: number): number {
  let j = i;
  while (j < chars.length && !SEPARATOR.test(chars[j]!)) j++;
  return j;
}

/** Typo tolerance for words of 4+ characters: compare with each word of the text. */
function typoMatch(q: string, t: string, starts: boolean[]): FuzzyResult | null {
  const length = [...q].length;
  if (length < 4) return null;
  const allowed = length >= 8 ? 2 : 1;
  let best: FuzzyResult | null = null;
  const chars = [...t];
  for (let i = 0; i < chars.length; i++) {
    if (!starts[i]) continue;
    const j = wordEnd(chars, i);
    const token = chars.slice(i, j).join('');
    // Compare with the whole word and with a prefix of similar length (typing in progress).
    for (const c of [token, token.slice(0, length)]) {
      const distance = editDistance(q, c, allowed);
      const score = 40 - distance * 12;
      if (distance <= allowed && (!best || score > best.score)) {
        best = {
          score,
          indices: Array.from({ length: Math.min([...c].length, j - i) }, (_, k) => i + k),
        };
      }
    }
  }
  return best;
}

/** A query word against one text: substring, then subsequence, then one typo. */
export function matchWord(word: string, text: string): FuzzyResult | null {
  const q = normalizeChars(word);
  const t = normalizeChars(text);
  if (!q) return { score: 0, indices: [] };
  const starts = boundaries(text);
  const at = t.indexOf(q);
  if (at >= 0) return substringMatch(q, t, starts, at);
  return subsequence(q, t, starts) ?? typoMatch(q, t, starts);
}

/** A query word's best score among the keywords (a keyword hit counts 70 %). */
function keywordScore(word: string, keywords: readonly string[]): number {
  let best = -Infinity;
  for (const keyword of keywords) {
    const hit = matchWord(word, keyword);
    if (hit && hit.score * 0.7 > best) best = hit.score * 0.7;
  }
  return best;
}

/** Scores a candidate: every query word must match the label or a keyword. */
export function fuzzyMatch(query: string, candidate: FuzzyCandidate): FuzzyResult | null {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { score: 0, indices: [] };
  const keywords = (candidate.keywords ?? []).filter((k): k is string => !!k);
  let total = 0;
  const indices = new Set<number>();
  for (const word of words) {
    const onLabel = matchWord(word, candidate.label);
    const best = Math.max(onLabel ? onLabel.score : -Infinity, keywordScore(word, keywords));
    if (best === -Infinity) return null;
    total += best;
    if (onLabel && onLabel.score >= best) onLabel.indices.forEach((i) => indices.add(i));
  }
  // Whole-query prefix of the label wins over scattered multi-word hits.
  if (normalizeChars(candidate.label).startsWith(normalizeChars(query.trim()))) total += 30;
  return { score: total, indices: [...indices].sort((a, b) => a - b) };
}

/**
 * Filters and ranks items (stable for equal scores). `relativeCutoff` drops
 * weak scattered matches when strong ones exist (0.35 = keep results scoring at
 * least 35 % of the best one).
 */
export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  toCandidate: (item: T) => FuzzyCandidate,
  {
    limit = Infinity,
    minScore = 0,
    relativeCutoff = 0,
  }: { limit?: number; minScore?: number; relativeCutoff?: number } = {},
): Array<{ item: T; score: number; indices: number[] }> {
  if (!query.trim()) return items.slice(0, limit).map((item) => ({ item, score: 0, indices: [] }));
  const results: Array<{ item: T; score: number; indices: number[]; order: number }> = [];
  items.forEach((item, order) => {
    const hit = fuzzyMatch(query, toCandidate(item));
    if (hit && hit.score >= minScore) results.push({ item, ...hit, order });
  });
  const best = Math.max(0, ...results.map((r) => r.score));
  return results
    .filter((r) => r.score >= best * relativeCutoff)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ item, score, indices }) => ({ item, score, indices }));
}

/** Splits text into highlighted / plain segments for rendering. */
export function highlightSegments(
  text: string,
  indices: readonly number[],
): Array<{ text: string; match: boolean }> {
  if (indices.length === 0) return [{ text, match: false }];
  const set = new Set(indices);
  const chars = [...text];
  const segments: Array<{ text: string; match: boolean }> = [];
  chars.forEach((ch, i) => {
    const match = set.has(i);
    const last = segments.at(-1);
    if (last?.match === match) last.text += ch;
    else segments.push({ text: ch, match });
  });
  return segments;
}
