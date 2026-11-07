'use client';

import { useEffect, useRef, useState } from 'react';
import { useUiSettings } from '@/shared/ui/ui-settings';

export interface DelayedVisibilityOptions {
  /** Become visible only after the work has run this long. */
  delayMs: number;
  /** Once visible, stay visible at least this long. */
  minDurationMs: number;
}

/**
 * Loader timing without React: `update(true)` when work starts, `update(false)`
 * when it ends. Work shorter than `delayMs` never shows a loader (no flash);
 * a loader that did appear stays for `minDurationMs` (no flicker).
 */
export function createDelayedVisibility(
  { delayMs, minDurationMs }: DelayedVisibilityOptions,
  onChange: (visible: boolean) => void,
  { initiallyVisible = false, now = () => Date.now() } = {},
) {
  let visible = initiallyVisible;
  let shownAt = initiallyVisible ? now() : 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const set = (next: boolean) => {
    timer = undefined;
    if (next === visible) return;
    visible = next;
    if (next) shownAt = now();
    onChange(next);
  };

  return {
    update(active: boolean) {
      clear();
      if (active) {
        if (visible) return;
        if (delayMs <= 0) set(true);
        else timer = setTimeout(() => set(true), delayMs);
      } else {
        if (!visible) return;
        const remaining = minDurationMs - (now() - shownAt);
        if (remaining <= 0) set(false);
        else timer = setTimeout(() => set(false), remaining);
      }
    },
    dispose: clear,
  };
}

/**
 * Whether a loader should be on screen for `active` work, using the product
 * timing (app.config `ui.loading`) unless overridden:
 *
 *   const showSpinner = useDelayedLoading(query.isFetching);
 */
export function useDelayedLoading(
  active: boolean,
  options: Partial<DelayedVisibilityOptions> = {},
): boolean {
  const { loading } = useUiSettings();
  const delayMs = options.delayMs ?? loading.delayMs;
  const minDurationMs = options.minDurationMs ?? loading.minDurationMs;
  const [visible, setVisible] = useState(active && delayMs <= 0);
  const controller = useRef<ReturnType<typeof createDelayedVisibility> | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    const c = createDelayedVisibility({ delayMs, minDurationMs }, setVisible, {
      initiallyVisible: visibleRef.current,
    });
    controller.current = c;
    return () => c.dispose();
  }, [delayMs, minDurationMs]);

  useEffect(() => {
    controller.current?.update(active);
  }, [active, delayMs, minDurationMs]);

  return visible;
}
