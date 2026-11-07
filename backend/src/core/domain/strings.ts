/**
 * Array#sort comparator for identifiers (codes, keys, names in stored data):
 * UTF-16 code-unit order, i.e. the order `sort()` uses without a comparator,
 * stated explicitly. Unlike `localeCompare` it does not depend on the
 * runtime's locale data, so hashes, audit snapshots and stored lists stay
 * stable everywhere. Use `localeCompare` for text that people read.
 */
export function compareCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * `value` without the leading and trailing characters (UTF-16 code units)
 * that `strip` matches. One pass, where a `^x+|x+$` regex backtracks on long
 * runs of `x`.
 */
export function trimWhere(value: string, strip: (char: string) => boolean): string {
  let start = 0;
  let end = value.length;
  while (start < end && strip(value[start]!)) start++;
  while (end > start && strip(value[end - 1]!)) end--;
  return value.slice(start, end);
}
