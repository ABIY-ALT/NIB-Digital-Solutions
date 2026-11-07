'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useDelayedLoading } from '@/shared/hooks/use-delayed-loading';
import { cn } from '@/shared/lib/cn';

type Phase = 'idle' | 'loading' | 'done';

/** A same-tab, same-origin link to a different page (what the App Router navigates). */
export function isInternalNavigation(
  event: Pick<
    MouseEvent,
    'defaultPrevented' | 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'target'
  >,
  current: Pick<Location, 'href' | 'origin' | 'pathname' | 'search'>,
): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = (event.target as Element | null)?.closest?.('a');
  if (!anchor || anchor.hasAttribute('download')) return false;
  const target = anchor.getAttribute('target');
  if (target && target !== '_self') return false;
  const url = new URL(anchor.getAttribute('href') ?? '', current.href);
  if (url.origin !== current.origin) return false;
  return url.pathname !== current.pathname || url.search !== current.search;
}

/**
 * Thin brand-gradient bar at the top of the viewport while a page loads after
 * a link click: it creeps forward, completes when the new route renders, then
 * fades. Navigations faster than `ui.loading.delayMs` show nothing.
 * (Programmatic router.push() calls are not tracked.)
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>('idle');
  const visible = useDelayedLoading(phase === 'loading', { minDurationMs: 0 });
  // Whether the bar actually appeared during this navigation (so it can finish).
  const appeared = useRef(false);
  if (visible) appeared.current = true;

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (isInternalNavigation(event, window.location)) setPhase('loading');
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  const route = `${pathname}?${searchParams.toString()}`;
  const lastRoute = useRef(route);
  useEffect(() => {
    if (route === lastRoute.current) return;
    lastRoute.current = route;
    setPhase((p) => (p === 'loading' ? 'done' : p));
  }, [route]);

  // Safety net: a click that never navigated (handled elsewhere) must not leave the bar running.
  useEffect(() => {
    if (phase !== 'loading') return;
    const timer = setTimeout(() => setPhase('idle'), 15_000);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'done') return;
    const timer = setTimeout(() => {
      appeared.current = false;
      setPhase('idle');
    }, 500);
    return () => clearTimeout(timer);
  }, [phase]);

  const finishing = phase === 'done' && appeared.current;
  if (!(phase === 'loading' && visible) && !finishing) return null;
  return (
    <div
      aria-hidden
      data-motion="essential"
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px]"
    >
      <div
        className={cn(
          'h-full w-full origin-left rounded-e-pill bg-[linear-gradient(90deg,var(--brand-primary),var(--brand-secondary))] shadow-[0_0_10px_var(--brand-primary)] rtl:origin-right',
          finishing
            ? 'animate-[route-progress-done_500ms_ease-out_forwards]'
            : 'animate-[route-progress_10s_cubic-bezier(0.08,0.8,0.3,1)_forwards]',
        )}
      />
    </div>
  );
}
