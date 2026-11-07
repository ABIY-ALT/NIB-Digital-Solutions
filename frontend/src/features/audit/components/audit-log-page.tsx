'use client';

import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Eye,
  GitCompareArrows,
  RefreshCw,
  ScrollText,
  Users,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo, type ReactNode } from 'react';
import { describeError } from '@/shared/errors/error-messages';
import { useListParams } from '@/shared/hooks/use-list-params';
import { cn } from '@/shared/lib/cn';
import { formatDateTime, formatNumber } from '@/shared/lib/format';
import { Badge, type BadgeTone } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  DataTable,
  DataTableToolbar,
  TableSearch,
  type DataTableColumn,
} from '@/shared/ui/data-table';
import { useDataTableLabels, useTableToolLabels } from '@/shared/ui/data-table-labels';
import { DataTableExport } from '@/shared/ui/data-table-export';
import { DataTableFilters } from '@/shared/ui/data-table-filters';
import { ErrorState } from '@/shared/ui/feedback';
import { Tooltip } from '@/shared/ui/menu';
import { PageHeader } from '@/shared/ui/page-header';
import { RelativeTime } from '@/shared/ui/relative-time';
import {
  auditExportPath,
  useAuditActivity,
  useAuditFacets,
  useAuditLog,
  useAuditLogs,
} from '../hooks/use-audit-logs';
import {
  activeWindow,
  AUDIT_CATEGORIES,
  AUDIT_OUTCOMES,
  CATEGORY_STYLE,
  changedFields,
  isFailure,
  OUTCOME_TONE,
  parseAction,
  recordStyle,
  shortId,
  TIME_WINDOWS,
  windowBounds,
  windowFilter,
  type TimeWindow,
} from '../lib/audit-display';
import { auditResource } from '../resource';
import type { AuditLogEntry } from '../types';
import { useActionLabel, useFieldLabel } from './audit-labels';
import { AuditLogDetailDialog, type AuditDetailNavigation } from './audit-log-detail-dialog';

const FAILURES_FILTER = 'in:FAILURE,DENIED';

/** Stat tile colours (static class strings so Tailwind generates them). */
const TILE: Record<
  Exclude<BadgeTone, 'outline'>,
  { icon: string; value: string; active: string }
> = {
  primary: {
    icon: 'bg-primary-soft text-primary-text',
    value: 'text-primary-text',
    active: 'border-primary bg-primary-soft/40',
  },
  secondary: {
    icon: 'bg-secondary-soft text-secondary',
    value: 'text-secondary',
    active: 'border-secondary bg-secondary-soft/40',
  },
  info: {
    icon: 'bg-info-soft text-info',
    value: 'text-info',
    active: 'border-info bg-info-soft/40',
  },
  success: {
    icon: 'bg-success-soft text-success',
    value: 'text-success',
    active: 'border-success bg-success-soft/40',
  },
  warning: {
    icon: 'bg-warning-soft text-warning',
    value: 'text-warning',
    active: 'border-warning bg-warning-soft/40',
  },
  danger: {
    icon: 'bg-danger-soft text-danger',
    value: 'text-danger',
    active: 'border-danger bg-danger-soft/40',
  },
  neutral: {
    icon: 'bg-muted text-muted-foreground',
    value: 'text-foreground',
    active: 'border-border-strong bg-muted/50',
  },
};

/**
 * Audit trail (IB audit log idiom): activity strip for the selected window,
 * calendar windows, faceted filters, rich rows (category accent, failures,
 * changed fields) and a detail dialog with previous → new values. Every piece
 * of state (window, filters, open record) lives in the URL, so an
 * investigation can be shared as a link.
 */
export function AuditLogPage() {
  const t = useTranslations('audit');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const labels = useDataTableLabels();
  const tools = useTableToolLabels();
  const actionLabel = useActionLabel();
  const fieldLabel = useFieldLabel();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { params, update } = useListParams(auditResource.listDefaults);
  const filters = useMemo(() => params.filters ?? {}, [params.filters]);

  const list = useAuditLogs(params, { live: true });
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const facets = useAuditFacets();
  const win = activeWindow(filters['occurredAt']);
  const activity = useAuditActivity(windowBounds(filters['occurredAt']));

  // ── Open record (?id=) ────────────────────────────────────────────────────
  const openId = sp.get('id');
  const index = openId ? items.findIndex((e) => e.id === openId) : -1;
  const deepLinked = useAuditLog(openId && index < 0 ? openId : null);
  const openEntry = index >= 0 ? items[index] : deepLinked.data;

  /** One URL update for several changes (filters + dialog), read from the live location. */
  const navigate = useCallback(
    (patch: { id?: string | null; filters?: Record<string, string | undefined> }) => {
      const next = new URLSearchParams(window.location.search);
      if (patch.id !== undefined) {
        if (patch.id) next.set('id', patch.id);
        else next.delete('id');
      }
      if (patch.filters) {
        next.delete('page');
        for (const [k, v] of Object.entries(patch.filters)) {
          if (v) next.set(`filter[${k}]`, v);
          else next.delete(`filter[${k}]`);
        }
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const toggleFilter = (key: string, value: string) =>
    update({ filters: { [key]: filters[key] === value ? undefined : value } });

  const columns = auditColumns({ t, locale, actionLabel, fieldLabel });

  const a = activity.data;
  // A custom range reads "windows.custom" like the named windows.
  const windowHint = win === 'all' ? t('stats.totalAll') : t(`windows.${win}`);
  const failureRate = a?.total ? (((a.failures + a.denied) / a.total) * 100).toFixed(1) : '0';

  return (
    <>
      <PageHeader
        icon={<ScrollText />}
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                void list.refetch();
                void activity.refetch();
              }}
              disabled={list.isFetching}
            >
              <RefreshCw className={cn(list.isFetching && 'animate-spin')} /> {t('refresh')}
            </Button>
            <DataTableExport
              endpoint={auditExportPath}
              params={params}
              tableId="audit"
              columnIds={[
                'occurredAt',
                'action',
                'category',
                'actor',
                'resource',
                'outcome',
                'errorCode',
                'ip',
                'correlationId',
                'changes',
              ]}
              fileName="audit-log"
              labels={tools.export}
            />
          </>
        }
      />

      {/* ── Activity strip ─────────────────────────────────────────────── */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          icon={<Activity />}
          label={t('stats.total')}
          tone="info"
          value={a ? formatNumber(a.total, locale) : '…'}
          hint={windowHint}
        />
        <StatTile
          icon={<Users />}
          label={t('stats.actors')}
          tone="secondary"
          value={a ? formatNumber(a.distinctActors, locale) : '…'}
          hint={t('stats.actorsHint')}
        />
        <StatTile
          icon={<AlertTriangle />}
          label={t('stats.failures')}
          tone="danger"
          value={a ? formatNumber(a.failures + a.denied, locale) : '…'}
          hint={
            filters['outcome'] === FAILURES_FILTER
              ? t('stats.filtering')
              : t('stats.failuresHint', { rate: failureRate })
          }
          active={filters['outcome'] === FAILURES_FILTER}
          onClick={() => toggleFilter('outcome', FAILURES_FILTER)}
        />
        {(a?.topActions ?? []).slice(0, 3).map((top) => {
          const active = filters['action'] === top.action;
          const failure = /FAIL|DENIED/.test(top.action);
          return (
            <StatTile
              key={top.action}
              icon={failure ? <AlertTriangle /> : <ScrollText />}
              label={actionLabel(top.action)}
              tone={failure ? 'danger' : 'primary'}
              value={formatNumber(top.count, locale)}
              hint={active ? t('stats.filtering') : t('stats.topHint')}
              active={active}
              onClick={() => toggleFilter('action', top.action)}
            />
          );
        })}
      </div>

      <DataTable
        tableId="audit"
        caption={t('title')}
        columns={columns}
        data={items}
        getRowId={(e) => e.id}
        labels={labels}
        loading={list.isPending}
        virtualizeHeight={560}
        selectedId={openId}
        onRowClick={(e) => navigate({ id: e.id })}
        rowActions={viewAction(t('view'), (id) => navigate({ id }))}
        sort={params.sort}
        onSortChange={(sort) => update({ sort })}
        pagination={list.data?.pagination}
        onPageChange={(page) => update({ page }, false)}
        onPageSizeChange={(pageSize) => update({ pageSize })}
        pageSizeOptions={[50, 100, 200]}
        error={
          list.error ? (
            <ErrorState
              title={te('title')}
              description={describeError(list.error, te).message}
              correlationId={describeError(list.error, te).correlationId}
              referenceLabel={tc('reference')}
              action={
                <Button variant="outline" onClick={() => list.refetch()}>
                  {tc('retry')}
                </Button>
              }
            />
          ) : undefined
        }
        toolbar={
          <DataTableToolbar
            actions={
              <WindowControl
                value={win}
                label={t('windows.label')}
                optionLabel={(w) => t(`windows.${w}`)}
                onChange={(w) => update({ filters: { occurredAt: windowFilter(w) } })}
              />
            }
            filters={
              <DataTableFilters
                filters={[
                  {
                    id: 'outcome',
                    label: t('columns.outcome'),
                    type: 'multiselect',
                    options: AUDIT_OUTCOMES.map((o) => ({ value: o, label: t(`outcomes.${o}`) })),
                  },
                  {
                    id: 'category',
                    label: t('columns.category'),
                    type: 'multiselect',
                    options: AUDIT_CATEGORIES.map((c) => ({
                      value: c,
                      label: t(`categories.${c}`),
                    })),
                  },
                  {
                    id: 'action',
                    label: t('columns.action'),
                    type: 'multiselect',
                    options: (facets.data?.actions ?? []).map((x) => ({
                      value: x.action,
                      label: `${actionLabel(x.action)} (${formatNumber(x.count, locale)})`,
                    })),
                  },
                  {
                    id: 'resourceType',
                    label: t('columns.resourceType'),
                    type: 'multiselect',
                    options: (facets.data?.resourceTypes ?? []).map((x) => ({
                      value: x,
                      label: x,
                    })),
                  },
                  {
                    id: 'actorUsername',
                    label: t('columns.username'),
                    type: 'text',
                    operator: 'contains',
                    placeholder: 'admin',
                  },
                  {
                    id: 'ipAddress',
                    label: t('columns.ip'),
                    type: 'text',
                    operator: 'contains',
                    placeholder: '10.0.',
                  },
                  { id: 'occurredAt', label: t('columns.time'), type: 'dateRange' },
                ]}
                values={filters}
                onChange={(patch) => update({ filters: patch })}
                labels={tools.filters}
                onReset={() =>
                  update({
                    search: '',
                    filters: Object.fromEntries(
                      Object.keys(filters).map((k) => [k, undefined] as const),
                    ),
                  })
                }
              />
            }
            search={
              <TableSearch
                value={params.search ?? ''}
                onChange={(search) => update({ search })}
                placeholder={t('searchPlaceholder')}
                label={tc('search')}
              />
            }
          />
        }
      />

      <AuditLogDetailDialog
        open={!!openId}
        entry={openEntry}
        loading={index < 0 && deepLinked.isPending}
        onOpenChange={(open) => !open && navigate({ id: null })}
        onFilter={(patch) =>
          // Related events may lie outside the current window: search all time.
          navigate({ id: null, filters: { ...clearAll(filters), occurredAt: undefined, ...patch } })
        }
        navigation={pageNavigation(items, index, (id) => navigate({ id }))}
      />
    </>
  );
}

const clearAll = (filters: Record<string, string | undefined>) =>
  Object.fromEntries(Object.keys(filters).map((k) => [k, undefined] as const));

/** Previous / next record of the loaded page, for the detail dialog. */
function pageNavigation(
  items: readonly AuditLogEntry[],
  index: number,
  open: (id: string) => void,
): AuditDetailNavigation | undefined {
  if (index < 0) return undefined;
  return {
    index,
    total: items.length,
    onPrevious: index > 0 ? () => open(items[index - 1]!.id) : undefined,
    onNext: index < items.length - 1 ? () => open(items[index + 1]!.id) : undefined,
  };
}

/** Row action that opens the record (the row itself is clickable too). */
function viewAction(label: string, open: (id: string) => void) {
  return (e: AuditLogEntry) => (
    <Tooltip content={label}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        onClick={(ev) => {
          ev.stopPropagation();
          open(e.id);
        }}
      >
        <Eye />
      </Button>
    </Tooltip>
  );
}

function auditColumns({
  t,
  locale,
  actionLabel,
  fieldLabel,
}: {
  t: (key: string) => string;
  locale: string;
  actionLabel: (action: string) => string;
  fieldLabel: (field: string) => string;
}): DataTableColumn<AuditLogEntry>[] {
  return [
    {
      id: 'action',
      header: t('columns.action'),
      sortable: true,
      hideable: false,
      cell: (e) => {
        const style = recordStyle(e);
        const { requested } = parseAction(e.action);
        return (
          <div className="flex min-w-0 items-stretch gap-2.5">
            <span className={cn('w-[3px] shrink-0 rounded-pill', style.bar)} aria-hidden />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{actionLabel(parseAction(e.action).base)}</span>
                {requested ? (
                  <Badge tone="warning" className="px-1.5 py-0 text-[10px]">
                    {t('requested')}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-0.5 text-[11px]">
                <span className={cn('font-semibold', CATEGORY_STYLE[e.category].text)}>
                  {t(`categories.${e.category}`)}
                </span>
                {isFailure(e) ? (
                  <span className="font-semibold text-danger">
                    {' '}
                    · {t(`outcomes.${e.outcome}`)}
                    {e.errorCode ? ` (${e.errorCode})` : ''}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'actor',
      header: t('columns.actor'),
      cell: (e) => (
        <div className="min-w-0">
          {e.actorUsername ? (
            <div className="truncate font-mono text-[13px]">{e.actorUsername}</div>
          ) : (
            <div className="text-muted-foreground italic">{t('system')}</div>
          )}
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {e.ipAddress ?? '—'}
          </div>
        </div>
      ),
    },
    {
      id: 'target',
      header: t('columns.target'),
      hideOnMobile: true,
      cell: (e) =>
        e.resourceType ? (
          <div className="min-w-0">
            <div className="truncate">{e.resourceType}</div>
            {e.resourceId ? (
              <div className="truncate font-mono text-[11px] text-muted-foreground">
                {shortId(e.resourceId)}
              </div>
            ) : null}
          </div>
        ) : (
          <span className="text-subtle-foreground">—</span>
        ),
    },
    {
      id: 'outcome',
      header: t('columns.outcome'),
      sortable: true,
      hideOnMobile: true,
      cell: (e) => (
        <Badge tone={OUTCOME_TONE[e.outcome]} dot>
          {t(`outcomes.${e.outcome}`)}
        </Badge>
      ),
    },
    {
      id: 'details',
      header: t('columns.details'),
      hideOnMobile: true,
      cell: (e) => <DetailsCell entry={e} fieldLabel={fieldLabel} />,
    },
    {
      id: 'occurredAt',
      header: t('columns.when'),
      sortable: true,
      hideable: false,
      width: 170,
      cell: (e) => (
        <div className="whitespace-nowrap">
          <RelativeTime value={e.occurredAt} locale={locale} className="text-[13px]" />
          <div className="font-mono text-[11px] text-muted-foreground tabular">
            {formatDateTime(e.occurredAt, locale)}
          </div>
        </div>
      ),
    },
  ];
}

/** Changed fields ("Name → …, Permissions") or the most useful recorded context. */
function DetailsCell({
  entry,
  fieldLabel,
}: Readonly<{
  entry: AuditLogEntry;
  fieldLabel: (field: string) => string;
}>) {
  const t = useTranslations('audit');
  const fields = changedFields(entry.changes);
  if (fields.length) {
    const shown = fields.slice(0, 3).map(fieldLabel);
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <GitCompareArrows className="size-3.5 shrink-0 text-primary-text" aria-hidden />
        <span className="sr-only">{t('changesCount', { count: fields.length })}:</span>
        <span className="truncate">
          {shown.join(', ')}
          {fields.length > shown.length ? ` ${t('moreFields', { count: fields.length - 3 })}` : ''}
        </span>
      </span>
    );
  }
  const context = Object.entries(entry.metadata ?? {})
    .filter(([, v]) => v !== null && typeof v !== 'object')
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${String(v as string | number | boolean)}`);
  return context.length ? (
    <span className="block max-w-72 truncate text-xs text-muted-foreground">
      {context.join(' · ')}
    </span>
  ) : (
    <span className="text-subtle-foreground">—</span>
  );
}

/** IB date-window segmented control (calendar windows, shareable in the URL). */
function WindowControl({
  value,
  label,
  optionLabel,
  onChange,
}: Readonly<{
  value: TimeWindow | 'custom';
  label: string;
  optionLabel: (w: TimeWindow) => string;
  onChange: (w: TimeWindow) => void;
}>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-0.5 rounded-control bg-muted p-0.5"
    >
      {TIME_WINDOWS.map((w) => {
        const active = value === w;
        return (
          <button
            key={w}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(w)}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-item px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-surface font-semibold text-primary-text shadow-card'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {w === 'all' ? <CalendarDays className="size-3.5" aria-hidden /> : null}
            {optionLabel(w)}
          </button>
        );
      })}
    </div>
  );
}

/** IB stat card: tinted icon, big number, hint; clickable ones filter the list. */
function StatTile({
  icon,
  label,
  value,
  hint,
  tone,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
  tone: keyof typeof TILE;
  active?: boolean;
  onClick?: () => void;
}) {
  const c = TILE[tone];
  const body = (
    <>
      <span className="mb-2 flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'flex size-[30px] shrink-0 items-center justify-center rounded-control [&_svg]:size-4',
            c.icon,
          )}
          aria-hidden
        >
          {icon}
        </span>
        <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
      </span>
      <span className={cn('block text-[26px] leading-none font-bold tabular', c.value)}>
        {value}
      </span>
      {hint ? (
        <span className="mt-1.5 block truncate text-[11px] text-muted-foreground">{hint}</span>
      ) : null}
    </>
  );
  const base =
    'min-w-0 rounded-surface border-[1.5px] bg-surface px-4 py-3.5 text-start transition-colors';
  return onClick ? (
    <button
      type="button"
      aria-pressed={!!active}
      onClick={onClick}
      className={cn(
        base,
        'outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring',
        active ? c.active : 'border-border',
      )}
    >
      {body}
    </button>
  ) : (
    <div className={cn(base, 'border-border')}>{body}</div>
  );
}
