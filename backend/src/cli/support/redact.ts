const SECRET_NAME = /(secret|password|apikey|token)$/i;

/** Hides the password of a URL with credentials; other strings pass through. */
function maskUrlCredentials(value: string): string {
  if (!/^[a-z][a-z0-9+.-]*:\/\/[^/]*@/i.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.password) url.password = '****';
    return url.toString();
  } catch {
    return '[redacted]';
  }
}

/**
 * A printable copy of the configuration with every secret removed:
 *   • binary key material        → "[secret: 32 bytes]"
 *   • values of key/secret maps  → "[secret]" (the ids stay visible)
 *   • *secret, *password, *apiKey, *token fields → "[secret]"
 *   • passwords inside URLs      → "****"
 * Safe to paste into a ticket.
 */
export function redactConfig(value: unknown, key = ''): unknown {
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return `[secret: ${value.byteLength} bytes]`;
  }
  if (value instanceof Map) {
    return Object.fromEntries(
      [...(value as Map<string, unknown>).entries()].map(([id, entry]) => [
        id,
        typeof entry === 'string' ? '[secret]' : redactConfig(entry, id),
      ]),
    );
  }
  if (Array.isArray(value)) return value.map((item) => redactConfig(item, key));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([name, entry]) => [name, redactConfig(entry, name)]),
    );
  }
  if (typeof value === 'string') {
    return SECRET_NAME.test(key) ? '[secret]' : maskUrlCredentials(value);
  }
  return value;
}

/** `{ a: { b: 1 } }` → `[['a.b', 1]]`, for aligned key/value output. */
export function flatten(value: unknown, prefix = ''): Array<[string, unknown]> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [[prefix, value]];
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return [[prefix, '{}']];
  return entries.flatMap(([key, entry]) => flatten(entry, prefix ? `${prefix}.${key}` : key));
}
