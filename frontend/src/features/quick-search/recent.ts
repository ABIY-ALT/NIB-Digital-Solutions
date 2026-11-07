/**
 * Recently opened quick-search entries, per user and browser. Only ids of
 * pages and actions are kept (never record names), so nothing sensitive is
 * left on a shared workstation; labels are rebuilt in the current language.
 */
const MAX = 6;
const key = (userId: string) => `appcore.quick-search.recent.${userId}`;

export function readRecent(userId: string | undefined): string[] {
  if (!userId || typeof window === 'undefined') return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key(userId)) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecent(userId: string | undefined, id: string): string[] {
  if (!userId) return [];
  const next = [id, ...readRecent(userId).filter((x) => x !== id)].slice(0, MAX);
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(next));
  } catch {
    /* storage full or disabled: recent items are a convenience only */
  }
  return next;
}

export function removeRecent(userId: string | undefined, id: string): string[] {
  if (!userId) return [];
  const next = readRecent(userId).filter((x) => x !== id);
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
