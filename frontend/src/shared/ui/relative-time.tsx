'use client';

import { useEffect, useState } from 'react';
import { formatDateTime, formatRelative } from '@/shared/lib/format';

/**
 * "3 minutes ago" that is safe for SSR and stays fresh.
 *
 * The server and the browser render a few seconds apart, so the text can
 * legitimately differ at hydration; that single text node opts out of the
 * mismatch check. Afterwards it re-renders every `refreshMs`. The absolute
 * date is kept in `dateTime` (machines) and `title` (hover).
 */
export function RelativeTime({
  value,
  locale,
  className,
  refreshMs = 30_000,
}: Readonly<{
  value: string | Date;
  locale: string;
  className?: string;
  refreshMs?: number;
}>) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs]);
  const date = typeof value === 'string' ? new Date(value) : value;

  return (
    <time
      dateTime={date.toISOString()}
      title={formatDateTime(date, locale)}
      className={className}
      suppressHydrationWarning
    >
      {formatRelative(date, locale, now)}
    </time>
  );
}
