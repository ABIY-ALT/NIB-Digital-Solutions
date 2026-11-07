'use client';

import { CheckCheck, ClipboardCheck, Inbox, Send, History, Layers } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { describeError } from '@/shared/errors/error-messages';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import {
  DataTable,
  DataTableToolbar,
  TableSearch,
  type DataTableColumn,
} from '@/shared/ui/data-table';
import { useDataTableLabels } from '@/shared/ui/data-table-labels';
import { EmptyState, ErrorState } from '@/shared/ui/feedback';
import { Avatar, Tabs, TabsList, TabsTrigger } from '@/shared/ui/menu';
import { PageHeader } from '@/shared/ui/page-header';
import { RelativeTime } from '@/shared/ui/relative-time';
import { RefreshButton } from '@/shared/ui/row-actions';
import { useApprovals, useApprovalSummary } from '../hooks/use-approvals';
import {
  APPROVAL_BOXES,
  APPROVAL_STATUSES,
  type ApprovalBox,
  type ApprovalRequest,
  type ApprovalStatus,
} from '../types';
import { useUiSettings } from '@/shared/ui/ui-settings';
import { ApprovalDetailDrawer } from './approval-detail';
import { ApprovalStatusBadge } from './approval-status';

const BOX_ICON = { inbox: Inbox, mine: Send, history: History, all: Layers } as const;

/** URL-backed state: ?box=inbox&status=PENDING&q=…&page=2&pageSize=50&id=<approval> */
function useApprovalParams() {
  const sp = useSearchParams();
  const { pagination } = useUiSettings();
  const router = useRouter();
  const pathname = usePathname();
  const box = (APPROVAL_BOXES as readonly string[]).includes(sp.get('box') ?? '')
    ? (sp.get('box') as ApprovalBox)
    : 'inbox';
  const status = (sp.get('status') ?? '')
    .split(',')
    .filter((s): s is ApprovalStatus => (APPROVAL_STATUSES as string[]).includes(s));
  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );
  return {
    box,
    status,
    search: sp.get('q') ?? '',
    page: Math.max(1, Number(sp.get('page')) || 1),
    pageSize: Math.min(
      pagination.maxPageSize,
      Math.max(1, Number(sp.get('pageSize')) || pagination.pageSize),
    ),
    openId: sp.get('id'),
    set,
  };
}

function approvalColumns(
  t: (key: string) => string,
  locale: string,
): DataTableColumn<ApprovalRequest>[] {
  return [
    {
      id: 'summary',
      header: t('columns.request'),
      hideable: false,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-semibold">{r.summary}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{r.action}</p>
        </div>
      ),
    },
    {
      id: 'maker',
      header: t('columns.maker'),
      hideOnMobile: true,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={r.maker.name} size={24} />
          <span className="truncate">{r.maker.name}</span>
        </span>
      ),
    },
    {
      id: 'submitted',
      header: t('columns.submitted'),
      width: 130,
      hideOnMobile: true,
      cell: (r) => (
        <RelativeTime
          value={r.createdAt}
          locale={locale}
          className="whitespace-nowrap text-muted-foreground"
        />
      ),
    },
    {
      id: 'status',
      header: t('columns.status'),
      width: 190,
      cell: (r) => (
        <div className="flex flex-col items-start gap-0.5">
          <ApprovalStatusBadge status={r.status} />
          {statusNote(r, t, locale)}
        </div>
      ),
    },
  ];
}

/** Under the status: when a pending request expires, or who decided it. */
function statusNote(r: ApprovalRequest, t: (key: string) => string, locale: string) {
  if (r.status === 'PENDING') {
    return (
      <span className="text-[11px] text-muted-foreground">
        {t('detail.expires')} <RelativeTime value={r.expiresAt} locale={locale} />
      </span>
    );
  }
  return r.checker ? (
    <span className="text-[11px] text-muted-foreground">{r.checker.name}</span>
  ) : null;
}

/**
 * Maker–checker workspace: requests waiting for me, my own requests, the ones I
 * decided and (auditors) every request — with a side panel to review the diff
 * and decide.
 */
export function ApprovalsPage() {
  const t = useTranslations('approvals');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const labels = useDataTableLabels();
  const { can } = usePermissions();
  const p = useApprovalParams();
  const summary = useApprovalSummary();
  const { data, isPending, isFetching, error, refetch } = useApprovals({
    box: p.box,
    status: p.status.length ? p.status : undefined,
    search: p.search,
    page: p.page,
    pageSize: p.pageSize,
  });
  const boxes = APPROVAL_BOXES.filter((b) => b !== 'all' || can('approvals:read'));
  const columns = approvalColumns(t, locale);

  const count = (box: ApprovalBox) => {
    if (box === 'inbox') return summary.data?.inbox;
    return box === 'mine' ? summary.data?.mine : undefined;
  };

  return (
    <>
      <PageHeader icon={<ClipboardCheck />} title={t('title')} description={t('description')} />

      <Tabs
        value={p.box}
        onValueChange={(box) => p.set({ box, page: null, status: null, id: null })}
      >
        <TabsList className="mb-4 overflow-x-auto">
          {boxes.map((box) => {
            const Icon = BOX_ICON[box];
            const n = count(box);
            return (
              <TabsTrigger key={box} value={box} className="flex items-center gap-1.5">
                <Icon className="size-4" aria-hidden />
                {t(`boxes.${box}`)}
                {n ? (
                  <span
                    className={cn(
                      'rounded-pill px-1.5 text-[10px] leading-4 font-bold tabular',
                      box === 'inbox'
                        ? 'bg-danger text-danger-foreground'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {n}
                  </span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <DataTable
        caption={t(`boxes.${p.box}`)}
        columns={columns}
        data={data?.items ?? []}
        getRowId={(r) => r.id}
        labels={labels}
        loading={isPending}
        selectedId={p.openId}
        onRowClick={(r) => p.set({ id: r.id })}
        pagination={data?.pagination}
        onPageChange={(page) => p.set({ page: String(page) })}
        onPageSizeChange={(size) => p.set({ pageSize: String(size), page: null })}
        emptyState={
          p.box === 'inbox' && !p.search ? (
            <EmptyState
              icon={<CheckCheck />}
              title={t('empty.inbox')}
              description={t('empty.inboxHint')}
            />
          ) : (
            <EmptyState title={t('empty.other')} />
          )
        }
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
        toolbar={
          <DataTableToolbar
            search={
              <TableSearch
                value={p.search}
                onChange={(q) => p.set({ q, page: null })}
                placeholder={t('searchPlaceholder')}
                label={tc('search')}
              />
            }
            filters={
              p.box === 'inbox' ? null : (
                <fieldset className="flex min-w-0 flex-wrap gap-1" aria-label={t('columns.status')}>
                  {(['', ...APPROVAL_STATUSES] as const).map((s) => {
                    const active = s === '' ? p.status.length === 0 : p.status.includes(s);
                    return (
                      <button
                        key={s || 'all'}
                        type="button"
                        aria-pressed={active}
                        onClick={() => p.set({ status: s || null, page: null })}
                        className={cn(
                          'h-[30px] rounded-control border px-2.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                          active
                            ? 'border-primary bg-primary-soft text-primary-text'
                            : 'border-border text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {s ? t(`status.${s}`) : tc('all')}
                      </button>
                    );
                  })}
                </fieldset>
              )
            }
            actions={
              <RefreshButton
                busy={isFetching}
                onClick={() => refetch()}
                label={tc('refresh')}
                busyLabel={tc('refreshing')}
              />
            }
          />
        }
      />

      <ApprovalDetailDrawer id={p.openId} onOpenChange={(open) => !open && p.set({ id: null })} />
    </>
  );
}
