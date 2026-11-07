'use client';

import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SESSION_EXPIRED_EVENT } from '@/infrastructure/api/api-fetch';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent } from '@/shared/ui/overlay';
import { useLogout } from '../hooks/use-auth';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const;
const KEEPALIVE_INTERVAL_MS = 60_000;

/**
 * Idle timeout with a warning, plus reaction to server-side session expiry.
 *
 *  • Tracks user activity (shared across tabs via BroadcastChannel).
 *  • While active, pings the session (Auth.js API route) at most once a minute
 *    so the server-side idle clock enforced by proxy.ts keeps running.
 *  • Shows a countdown dialog `warningSeconds` before signing out.
 *  • Listens for SESSION_EXPIRED events from API calls and signs out.
 */
export function SessionGuard({
  idleTimeoutSeconds,
  warningSeconds,
}: Readonly<{
  idleTimeoutSeconds: number;
  warningSeconds: number;
}>) {
  const t = useTranslations('auth.idle');
  const { update } = useSession();
  const { mutate: doLogout, isPending: loggingOut } = useLogout();
  const lastActivity = useRef(Date.now());
  const lastPing = useRef(Date.now());
  const warning = useRef(false);
  const ended = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const end = useCallback(
    (reason?: 'idle' | 'expired') => {
      if (ended.current) return;
      ended.current = true;
      doLogout(reason);
    },
    [doLogout],
  );

  const recordActivity = useCallback(
    (broadcast = true) => {
      lastActivity.current = Date.now();
      if (broadcast) channel.current?.postMessage('activity');
      if (Date.now() - lastPing.current > KEEPALIVE_INTERVAL_MS) {
        lastPing.current = Date.now();
        void update({ activity: true });
      }
    },
    [update],
  );

  useEffect(() => {
    channel.current =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('appcore-activity') : null;
    channel.current?.addEventListener('message', () => (lastActivity.current = Date.now()));
    let throttle = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - throttle < 5_000 || warning.current) return;
      throttle = now;
      recordActivity();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const onExpired = () => end('expired');
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);

    const timer = setInterval(() => {
      const left = Math.ceil(
        (idleTimeoutSeconds * 1000 - (Date.now() - lastActivity.current)) / 1000,
      );
      if (left <= 0) end('idle');
      else if (left <= warningSeconds) {
        warning.current = true;
        setRemaining(left);
      } else if (warning.current) {
        warning.current = false;
        setRemaining(null);
      }
    }, 1_000);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
      clearInterval(timer);
      channel.current?.close();
    };
  }, [idleTimeoutSeconds, warningSeconds, recordActivity, end]);

  const stay = () => {
    lastPing.current = 0;
    warning.current = false;
    recordActivity();
    setRemaining(null);
  };

  return (
    <Dialog open={remaining !== null} onOpenChange={(open) => !open && stay()}>
      <DialogContent
        size="sm"
        title={t('title')}
        description={t('description', { seconds: remaining ?? 0 })}
        footer={
          <>
            <Button variant="outline" loading={loggingOut} onClick={() => end()}>
              {t('signOut')}
            </Button>
            <Button onClick={stay}>{t('stay')}</Button>
          </>
        }
      >
        <p className="text-center text-4xl font-semibold tabular" aria-live="assertive">
          {remaining}s
        </p>
      </DialogContent>
    </Dialog>
  );
}
