'use client';

import { LogOut, Monitor, ShieldCheck, Smartphone } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { describeError } from '@/shared/errors/error-messages';
import { formatDateTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { DataTable, DataTableToolbar, type DataTableColumn } from '@/shared/ui/data-table';
import { useDataTableLabels } from '@/shared/ui/data-table-labels';
import { ErrorState } from '@/shared/ui/feedback';
import { ConfirmDialog } from '@/shared/ui/overlay';
import { RowActionsMenu } from '@/shared/ui/row-actions';
import { toast } from '@/shared/ui/toaster';
import { useMySessions, useRevokeOtherSessions, useRevokeSession } from '../hooks/use-account';
import { describeUserAgent, type AccountSession } from '../types';

type Translate = (key: string, values?: Record<string, string>) => string;

function sessionColumns(t: Translate, locale: string): DataTableColumn<AccountSession>[] {
  return [
    {
      id: 'device',
      header: t('columns.device'),
      cell: (s) => {
        const { browser, os } = describeUserAgent(s.userAgent);
        const mobile = os === 'Android' || os === 'iOS';
        const Icon = mobile ? Smartphone : Monitor;
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-control bg-primary-softer text-primary-text"
              aria-hidden
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">
                {os ? t('browserOn', { browser, os }) : browser}
              </p>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate font-mono">{s.ipAddress ?? '—'}</span>
                {s.current ? (
                  <Badge tone="success" dot className="py-0">
                    {t('thisDevice')}
                  </Badge>
                ) : null}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: 'method',
      header: t('columns.method'),
      hideOnMobile: true,
      cell: (s) => (
        <div className="flex flex-wrap items-center gap-1">
          <Badge tone="neutral">{s.authMethod}</Badge>
          {s.mfaVerified ? (
            <Badge tone="primary">
              <ShieldCheck className="size-3" /> MFA
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      id: 'createdAt',
      header: t('columns.signedIn'),
      hideOnMobile: true,
      cell: (s) => (
        <span className="text-muted-foreground">{formatDateTime(s.createdAt, locale)}</span>
      ),
    },
    {
      id: 'lastActivityAt',
      header: t('columns.lastActive'),
      hideOnMobile: true,
      cell: (s) => (
        <span className="text-muted-foreground">{formatDateTime(s.lastActivityAt, locale)}</span>
      ),
    },
  ];
}

/** Row menu: sign out a session (never this device's). */
function sessionActions(t: Translate, onRevoke: (session: AccountSession) => void) {
  return (s: AccountSession) => (
    <RowActionsMenu
      label={t('actionsFor')}
      actions={[
        {
          id: 'revoke',
          label: t('signOut'),
          description: t('signOutHint'),
          icon: <LogOut />,
          danger: true,
          hidden: s.current,
          onSelect: () => onRevoke(s),
        },
      ]}
    />
  );
}

/** Sessions tab: every device signed in to this account, with sign-out controls. */
export function SessionsPanel() {
  const t = useTranslations('profile.sessions');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const labels = useDataTableLabels();
  const { data, isPending, error, refetch } = useMySessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const [revoking, setRevoking] = useState<AccountSession | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);
  const sessions = data ?? [];
  const others = sessions.filter((s) => !s.current).length;
  const columns = sessionColumns(t, locale);

  return (
    <>
      <DataTable
        caption={t('title')}
        columns={columns}
        data={sessions}
        getRowId={(s) => s.id}
        labels={labels}
        loading={isPending}
        skeletonRows={3}
        toolbar={
          <DataTableToolbar
            filters={
              <div>
                <p className="text-sm font-semibold">{t('title')}</p>
                <p className="text-xs text-muted-foreground">{t('description')}</p>
              </div>
            }
            search={
              <Button
                variant="outline"
                disabled={others === 0}
                onClick={() => setConfirmOthers(true)}
                className="w-full sm:w-auto"
              >
                <LogOut /> {t('signOutOthers')}
              </Button>
            }
          />
        }
        rowActions={sessionActions(t, setRevoking)}
        error={
          error ? (
            <ErrorState
              title={te('title')}
              description={describeError(error, te).message}
              correlationId={describeError(error, te).correlationId}
              referenceLabel={tc('reference')}
              action={
                <Button variant="outline" onClick={() => refetch()}>
                  {tc('retry')}
                </Button>
              }
            />
          ) : undefined
        }
      />

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={t('confirmOneTitle')}
        description={t('confirmOneText')}
        confirmLabel={t('signOut')}
        cancelLabel={tc('cancel')}
        loading={revoke.isPending}
        onConfirm={() =>
          revoking &&
          revoke.mutate(revoking.id, {
            onSuccess: () => {
              toast.success(t('endedOne'));
              setRevoking(null);
            },
            onError: (e) => toast.error(describeError(e, te).message),
          })
        }
      />
      <ConfirmDialog
        open={confirmOthers}
        onOpenChange={setConfirmOthers}
        title={t('confirmOthersTitle')}
        description={t('confirmOthersText', { count: others })}
        confirmLabel={t('signOutOthers')}
        cancelLabel={tc('cancel')}
        loading={revokeOthers.isPending}
        onConfirm={() =>
          revokeOthers.mutate(undefined, {
            onSuccess: (r) => {
              toast.success(t('endedOthers', { count: r.terminated }));
              setConfirmOthers(false);
            },
            onError: (e) => toast.error(describeError(e, te).message),
          })
        }
      />
    </>
  );
}
