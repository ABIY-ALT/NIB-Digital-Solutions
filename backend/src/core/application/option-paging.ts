import { createPage, pageOffset, type Page } from '#core/domain/pagination.js';
import type { OptionItem, OptionsRequest } from './ports/option-source.port.js';

const fold = (s: string): string => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Search, value resolution and paging over an in-memory option list — for
 * sources backed by a cached lookup rather than a database query.
 *
 * Every search word must appear in the label, value, hint or description;
 * matches at the start of the label rank first.
 */
export function pageOptions(
  items: readonly OptionItem[],
  request: OptionsRequest,
): Page<OptionItem> {
  if (request.values) {
    const wanted = new Set(request.values);
    const found = items.filter((o) => wanted.has(o.value));
    return createPage(found, found.length, { page: 1, pageSize: Math.max(1, found.length) });
  }
  const words = fold(request.search?.trim() ?? '')
    .split(/\s+/)
    .filter(Boolean);
  let matches = [...items];
  if (words.length > 0) {
    const scored = items
      .map((o) => {
        const label = fold(o.label);
        const value = fold(o.value);
        const haystack = `${label} ${value} ${fold(o.hint ?? '')} ${fold(o.description ?? '')}`;
        if (!words.every((w) => haystack.includes(w))) return null;
        return { o, rank: rankOf(label, value, words[0]!) };
      })
      .filter((x): x is { o: OptionItem; rank: number } => x !== null);
    // Stable sort keeps the source's own order within a rank.
    matches = scored.toSorted((a, b) => a.rank - b.rank).map((x) => x.o);
  }
  const offset = pageOffset(request);
  return createPage(matches.slice(offset, offset + request.pageSize), matches.length, request);
}

/** 0 when the label starts with the first search word, 1 when the value does, else 2. */
function rankOf(label: string, value: string, firstWord: string): number {
  if (label.startsWith(firstWord)) return 0;
  return value.startsWith(firstWord) ? 1 : 2;
}
