/**
 * React keys for list items that have no unique id of their own: each item is
 * keyed by an identity taken from its content, and a repeated identity gets a
 * "~n" suffix, so keys stay unique and follow the items when the list changes.
 */
export function keyed<T>(
  items: readonly T[],
  idOf: (item: T) => string,
): Array<{ key: string; item: T }> {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const id = idOf(item);
    const repeats = seen.get(id) ?? 0;
    seen.set(id, repeats + 1);
    return { key: repeats === 0 ? id : `${id}~${repeats}`, item };
  });
}
