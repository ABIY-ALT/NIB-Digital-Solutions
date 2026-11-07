'use client';

import {
  ArrowLeftRight,
  Braces,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Fingerprint,
  Globe,
  Hash,
  Link2,
  MapPin,
  Monitor,
  Network,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Tag as TagIcon,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { formatDateTime } from '@/shared/lib/format';
import { Badge, type BadgeTone } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ChangeDiff, useChangeDiffLabels } from '@/shared/ui/change-diff';
import { EmptyState, Skeleton } from '@/shared/ui/feedback';
import { FormSurface } from '@/shared/ui/form-surface';
import { RelativeTime } from '@/shared/ui/relative-time';
import { toast } from '@/shared/ui/toaster';
import {
  CATEGORY_STYLE,
  changeRecords,
  changedFields,
  isFailure,
  isPrivateIp,
  OUTCOME_TONE,
  parseAction,
  parseUserAgent,
  recordStyle,
  shortId,
} from '../lib/audit-display';
import type { AuditChange, AuditLogEntry } from '../types';
import { useActionLabel, useFieldLabel } from './audit-labels';

export interface AuditDetailNavigation {
  index: number;
  total: number;
  onPrevious?: () => void;
  onNext?: () => void;
}

type ApplyFilters = (filters: Record<string, string | undefined>) => void;

/**
 * Read-only forensic view of one audit record (IB "view details" idiom):
 * summary, actor & session, request & outcome, client & location, the
 * previous → new values of every changed field, recorded context and the
 * cross-references (correlation id, tamper-evident chain link).
 */
export function AuditLogDetailDialog({
  open,
  entry,
  loading,
  onOpenChange,
  onFilter,
  navigation,
}: Readonly<{
  open: boolean;
  entry: AuditLogEntry | null | undefined;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  /** Applies list filters (and closes the dialog), e.g. "same request". */
  onFilter: ApplyFilters;
  navigation?: AuditDetailNavigation;
}>) {
  const t = useTranslations('audit');
  const td = useTranslations('audit.detail');
  const tc = useTranslations('common');
  const locale = useLocale();

  const style = entry ? recordStyle(entry) : CATEGORY_STYLE.SYSTEM;
  const failed = entry ? isFailure(entry) : false;

  let body: ReactNode;
  if (entry) {
    body = <AuditDetailBody entry={entry} onFilter={onFilter} />;
  } else if (loading) {
    body = (
      <div className="space-y-4" aria-busy aria-label={td('loading')}>
        <Skeleton className="h-12" />
        <Skeleton className="h-32" />
        <Skeleton className="h-40" />
      </div>
    );
  } else {
    body = <EmptyState icon={<ScrollText />} title={td('notFound')} />;
  }

  return (
    <FormSurface
      id="audit.detail"
      open={open}
      onOpenChange={onOpenChange}
      closeOnOutsideClick
      size="xl"
      tone={failed ? 'danger' : 'primary'}
      icon={failed ? <ShieldAlert /> : <ScrollText />}
      iconClassName={style.soft}
      title={entry ? <AuditTitle entry={entry} failed={failed} /> : t('title')}
      description={
        entry ? (
          <span className="flex flex-wrap items-center gap-x-1.5">
            {formatDateTime(entry.occurredAt, locale)}
            <span aria-hidden>·</span>
            <span className="font-mono text-[11px]">#{entry.seq}</span>
            <span aria-hidden>·</span>
            <span className="font-mono text-[11px]">{shortId(entry.id)}</span>
          </span>
        ) : undefined
      }
      footer={
        <>
          <DetailNavigation navigation={navigation} />
          {entry?.correlationId ? (
            <Button
              variant="outline"
              onClick={() => onFilter({ correlationId: entry.correlationId ?? undefined })}
            >
              <Link2 /> {td('related')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('close')}
          </Button>
        </>
      }
    >
      {body}
    </FormSurface>
  );
}

function AuditTitle({ entry, failed }: Readonly<{ entry: AuditLogEntry; failed: boolean }>) {
  const t = useTranslations('audit');
  const actionLabel = useActionLabel();
  const { requested } = parseAction(entry.action);
  return (
    <span className="flex flex-wrap items-center gap-2">
      {actionLabel(entry.action)}
      <Badge tone={CATEGORY_STYLE[entry.category].tone}>{t(`categories.${entry.category}`)}</Badge>
      {failed ? (
        <Badge tone={OUTCOME_TONE[entry.outcome]} dot>
          {t(`outcomes.${entry.outcome}`)}
          {entry.errorCode ? ` · ${entry.errorCode}` : ''}
        </Badge>
      ) : null}
      {requested ? <Badge tone="warning">{t('requested')}</Badge> : null}
    </span>
  );
}

/** Previous / next record of the list the dialog was opened from. */
function DetailNavigation({ navigation }: Readonly<{ navigation?: AuditDetailNavigation }>) {
  const td = useTranslations('audit.detail');
  if (!navigation || navigation.total < 2) return null;
  return (
    <div className="me-auto flex items-center gap-1 max-sm:me-0 max-sm:w-full max-sm:justify-center">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={td('previous')}
        disabled={!navigation.onPrevious}
        onClick={navigation.onPrevious}
      >
        <ChevronLeft className="rtl:rotate-180" />
      </Button>
      <span className="min-w-16 text-center text-xs text-muted-foreground tabular">
        {td('position', { index: navigation.index + 1, total: navigation.total })}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={td('next')}
        disabled={!navigation.onNext}
        onClick={navigation.onNext}
      >
        <ChevronRight className="rtl:rotate-180" />
      </Button>
    </div>
  );
}

function AuditDetailBody({
  entry,
  onFilter,
}: Readonly<{
  entry: AuditLogEntry;
  onFilter: ApplyFilters;
}>) {
  const td = useTranslations('audit.detail');
  const te = useTranslations('errors');

  const failed = isFailure(entry);
  const errorText =
    entry.errorCode && te.has(entry.errorCode) ? te(entry.errorCode) : entry.errorCode;
  const showChanges =
    entry.changes.length > 0 ||
    (!failed && (entry.category === 'DATA_CHANGE' || entry.category === 'FINANCIAL'));

  return (
    <div className="flex flex-col gap-5">
      <AuditSummary entry={entry} failed={failed} errorText={errorText} />

      {showChanges ? (
        <section>
          <SectionTitle>{td('sections.changes')}</SectionTitle>
          {entry.changes.length ? (
            <ChangesView changes={entry.changes} />
          ) : (
            <p className="rounded-control border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
              {td('noChanges')}
            </p>
          )}
        </section>
      ) : null}

      <ActorSection entry={entry} onFilter={onFilter} />
      <RequestSection entry={entry} failed={failed} errorText={errorText} onFilter={onFilter} />
      <ClientSection entry={entry} />
      <ContextSection entry={entry} />

      <div className="h-px bg-border" aria-hidden />

      <ReferencesSection entry={entry} />
    </div>
  );
}

/** "User 1a2b3c4d": the resource type and the start of its id. */
function resourceTarget(entry: AuditLogEntry): string | null {
  if (!entry.resourceType) return null;
  return entry.resourceId
    ? `${entry.resourceType} ${entry.resourceId.slice(0, 8)}`
    : entry.resourceType;
}

/** Human-readable summary (IB callout). */
function AuditSummary({
  entry,
  failed,
  errorText,
}: Readonly<{ entry: AuditLogEntry; failed: boolean; errorText: string | null }>) {
  const t = useTranslations('audit');
  const td = useTranslations('audit.detail');
  const actionLabel = useActionLabel();
  const fieldLabel = useFieldLabel();

  const fields = changedFields(entry.changes);
  const actor = entry.actorUsername ?? (entry.actorId ? shortId(entry.actorId) : null);
  const target = resourceTarget(entry);
  let outcome: string | null = null;
  if (entry.outcome === 'FAILURE') {
    outcome = td('summaryFailed', { error: errorText ?? td('unknown') });
  } else if (entry.outcome === 'DENIED') {
    outcome = td('summaryDenied', { error: entry.errorCode ?? 'none' });
  }

  return (
    <div
      className={cn(
        'rounded-control border border-s-4 px-3.5 py-2.5 text-sm leading-relaxed',
        failed
          ? 'border-danger/30 border-s-danger bg-danger-soft/40'
          : 'border-info/30 border-s-info bg-info-soft/40',
      )}
    >
      {target
        ? td('summaryTarget', {
            actor: actor ?? t('system'),
            action: actionLabel(entry.action),
            target,
          })
        : td('summary', { actor: actor ?? t('system'), action: actionLabel(entry.action) })}{' '}
      {outcome}{' '}
      {fields.length
        ? td('summaryChanges', {
            count: fields.length,
            fields: fields.map((field) => fieldLabel(field)).join(', '),
          })
        : null}
    </div>
  );
}

/** Who acted when no username was recorded: someone not signed in yet, an id, or the system. */
function unnamedActor(entry: AuditLogEntry, td: (key: string) => string): string {
  if (!entry.actorId && entry.category === 'AUTHENTICATION') return td('preAuth');
  return entry.actorId ? shortId(entry.actorId) : td('systemActor');
}

function ActorSection({
  entry,
  onFilter,
}: Readonly<{ entry: AuditLogEntry; onFilter: ApplyFilters }>) {
  const td = useTranslations('audit.detail');
  const locale = useLocale();
  return (
    <Section title={td('sections.actor')}>
      <Item
        icon={<User />}
        label={td('fields.actor')}
        mono={!!entry.actorUsername}
        value={entry.actorUsername ?? unnamedActor(entry, td)}
      />
      <Item
        icon={<Clock />}
        label={td('fields.timestamp')}
        value={
          <span className="flex flex-wrap items-baseline gap-x-2">
            {formatDateTime(entry.occurredAt, locale)}
            <RelativeTime
              value={entry.occurredAt}
              locale={locale}
              className="text-xs text-muted-foreground"
            />
          </span>
        }
      />
      <Item
        icon={<Fingerprint />}
        label={td('fields.actorId')}
        mono={!!entry.actorId}
        value={
          entry.actorId ? (
            <FilterLink
              label={td('actorActivity')}
              onClick={() => onFilter({ actorId: entry.actorId ?? undefined })}
            >
              {shortId(entry.actorId)}
            </FilterLink>
          ) : (
            '—'
          )
        }
      />
      <Item
        icon={<Link2 />}
        label={td('fields.correlation')}
        mono={!!entry.correlationId}
        value={
          entry.correlationId ? (
            <FilterLink
              label={td('related')}
              onClick={() => onFilter({ correlationId: entry.correlationId ?? undefined })}
            >
              {shortId(entry.correlationId)}
            </FilterLink>
          ) : (
            '—'
          )
        }
      />
    </Section>
  );
}

function RequestSection({
  entry,
  failed,
  errorText,
  onFilter,
}: Readonly<{
  entry: AuditLogEntry;
  failed: boolean;
  errorText: string | null;
  onFilter: ApplyFilters;
}>) {
  const t = useTranslations('audit');
  const td = useTranslations('audit.detail');
  const explained = !!errorText && errorText !== entry.errorCode;
  return (
    <Section title={td('sections.request')}>
      <Item
        icon={failed ? <ShieldAlert /> : <ShieldCheck />}
        label={td('fields.outcome')}
        value={
          <span className={cn('font-semibold', failed ? 'text-danger' : 'text-success')}>
            {t(`outcomes.${entry.outcome}`)}
            {entry.errorCode ? (
              <span className="font-normal text-muted-foreground">
                {' '}
                · <code className="font-mono text-xs">{entry.errorCode}</code>
              </span>
            ) : null}
          </span>
        }
      />
      <Item
        icon={<TagIcon />}
        label={td('fields.action')}
        mono
        value={<span className="text-xs">{entry.action}</span>}
      />
      <Item
        icon={<Braces />}
        label={td('fields.resource')}
        full={explained}
        value={
          entry.resourceType ? (
            <span className="flex flex-wrap items-center gap-x-1.5">
              {entry.resourceType}
              {entry.resourceId ? (
                <FilterLink
                  label={td('resourceHistory')}
                  onClick={() =>
                    onFilter({
                      resourceType: entry.resourceType ?? undefined,
                      resourceId: entry.resourceId ?? undefined,
                    })
                  }
                >
                  <span className="font-mono text-xs">{shortId(entry.resourceId)}</span>
                </FilterLink>
              ) : null}
            </span>
          ) : (
            '—'
          )
        }
      />
      <Item
        icon={<TagIcon />}
        label={td('fields.category')}
        value={
          <Badge tone={CATEGORY_STYLE[entry.category].tone}>
            {t(`categories.${entry.category}`)}
          </Badge>
        }
      />
      {explained ? (
        <Item icon={<ShieldAlert />} label={td('fields.errorCode')} full value={errorText} />
      ) : null}
    </Section>
  );
}

/** Private (internal) or public network, from the client address. */
function networkOf(ipAddress: string | null, td: (key: string) => string): string {
  if (!ipAddress) return '—';
  return isPrivateIp(ipAddress) ? td('privateNetwork') : td('publicNetwork');
}

function ClientSection({ entry }: Readonly<{ entry: AuditLogEntry }>) {
  const td = useTranslations('audit.detail');
  const client = parseUserAgent(entry.userAgent);
  return (
    <Section title={td('sections.client')}>
      <Item icon={<Globe />} label={td('fields.ip')} mono value={entry.ipAddress ?? '—'} />
      <Item
        icon={<MapPin />}
        label={td('fields.location')}
        value={networkOf(entry.ipAddress, td)}
      />
      <Item
        icon={<Monitor />}
        label={td('fields.device')}
        value={[td(`devices.${client.kind}`), client.browser, client.os]
          .filter(Boolean)
          .join(' · ')}
      />
      <Item
        icon={<Network />}
        label={td('fields.userAgent')}
        full
        mono
        value={
          <span className="text-xs leading-relaxed text-muted-foreground">
            {entry.userAgent ?? '—'}
          </span>
        }
      />
    </Section>
  );
}

/** Recorded context (metadata); an approval id links to the request. */
function ContextSection({ entry }: Readonly<{ entry: AuditLogEntry }>) {
  const td = useTranslations('audit.detail');
  const fieldLabel = useFieldLabel();
  const context = Object.entries(entry.metadata ?? {});
  const approvalId =
    typeof entry.metadata?.['approvalId'] === 'string' ? entry.metadata['approvalId'] : null;
  if (!context.length) return null;
  return (
    <Section title={td('sections.context')}>
      {context.map(([key, value]) => (
        <Item
          key={key}
          label={fieldLabel(key)}
          mono
          full={typeof value === 'object' && value !== null}
          value={
            key === 'approvalId' && approvalId ? (
              <Link
                href={`/approvals?box=all&id=${encodeURIComponent(approvalId)}`}
                className="rounded-item text-secondary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                {shortId(approvalId)} · {td('openApproval')}
              </Link>
            ) : (
              <ContextValue value={value} />
            )
          }
        />
      ))}
    </Section>
  );
}

/** Cross-references (IB dashed monospace box). */
function ReferencesSection({ entry }: Readonly<{ entry: AuditLogEntry }>) {
  const td = useTranslations('audit.detail');
  return (
    <section>
      <SectionTitle>{td('sections.references')}</SectionTitle>
      <dl className="grid gap-2 rounded-control border border-dashed border-border-strong bg-muted/30 p-3.5 font-mono text-xs">
        <Ref label={td('refs.eventId')} value={entry.id} />
        <Ref label={td('refs.actorId')} value={entry.actorId} />
        <Ref label={td('refs.resourceId')} value={entry.resourceId} />
        <Ref
          label={td('refs.correlationId')}
          value={entry.correlationId}
          hint={td('refs.correlationHint')}
        />
        <Ref
          label={td('refs.chain')}
          value={`#${entry.seq}`}
          copyValue={entry.seq}
          hint={td('refs.chainHint')}
        />
        <Ref label={td('refs.prevHash')} value={entry.prevHash} truncate />
        <Ref label={td('refs.hash')} value={entry.hash} truncate fallback={td('refs.unsealed')} />
      </dl>
      <Link
        href="/compliance?tab=integrity"
        className="mt-2 inline-flex items-center gap-1 rounded-item text-xs font-semibold text-secondary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Hash className="size-3.5" aria-hidden /> {td('verifyChain')}
      </Link>
    </section>
  );
}

const OPERATION_TONE: Record<AuditChange['operation'], BadgeTone> = {
  create: 'success',
  update: 'primary',
  delete: 'danger',
  restore: 'info',
};

/** Previous → new values, per changed record, as a diff or raw JSON (IB "Change payload"). */
function ChangesView({ changes }: Readonly<{ changes: readonly AuditChange[] }>) {
  const td = useTranslations('audit.detail');
  const fieldLabel = useFieldLabel();
  const labels = useChangeDiffLabels();
  const [view, setView] = useState<'compare' | 'json'>('compare');

  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label={td('sections.changes')}
        className="inline-flex gap-0.5 rounded-control bg-muted p-0.5"
      >
        {(['compare', 'json'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={view === v}
            onClick={() => setView(v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-item px-2.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5',
              view === v
                ? 'bg-surface font-semibold text-primary-text shadow-card'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {v === 'compare' ? <ArrowLeftRight aria-hidden /> : <Braces aria-hidden />}
            {td(v)}
          </button>
        ))}
      </div>
      {changes.map((change, i) => {
        const records = changeRecords(change, td('redacted'));
        let values: ReactNode;
        if (change.fields.length === 0) {
          values = (
            <p className="rounded-control border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              {td('noFieldChanges')}
            </p>
          );
        } else if (view === 'compare') {
          values = (
            <ChangeDiff
              before={records.before}
              after={records.after}
              labels={labels}
              fieldLabel={fieldLabel}
            />
          );
        } else {
          values = (
            <div className="grid gap-3 md:grid-cols-2">
              <JsonPanel title={labels.before} value={records.before} />
              <JsonPanel title={labels.after} value={records.after} />
            </div>
          );
        }
        return (
          <div key={`${change.resourceType}-${change.resourceId}-${i}`} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold">{change.resourceType}</span>
              {change.resourceId ? (
                <code className="font-mono text-[11px] text-muted-foreground">
                  {shortId(change.resourceId)}
                </code>
              ) : null}
              <Badge tone={OPERATION_TONE[change.operation]}>
                {td(`operations.${change.operation}`)}
              </Badge>
              {change.proposed ? <Badge tone="warning">{td('proposed')}</Badge> : null}
            </div>
            {values}
          </div>
        );
      })}
    </div>
  );
}

function JsonPanel({ title, value }: Readonly<{ title: string; value: unknown }>) {
  return (
    <div className="overflow-hidden rounded-control border border-border bg-muted/40">
      <div className="border-b border-border bg-surface px-3 py-2 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
        {title}
      </div>
      <pre className="scrollbar-thin max-h-80 overflow-auto p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
        {value === null ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function ContextValue({ value }: Readonly<{ value: unknown }>) {
  if (value === null || value === undefined || value === '') return <>—</>;
  if (typeof value === 'object') {
    return (
      <pre className="scrollbar-thin max-h-48 overflow-auto rounded-item bg-muted/50 p-2 text-xs leading-relaxed break-words whitespace-pre-wrap">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return <span className="text-[13px]">{String(value as string | number | boolean)}</span>;
}

function SectionTitle({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

/** One label/value cell (IB nib-detail-item). */
function Item({
  icon,
  label,
  value,
  mono,
  full,
}: Readonly<{
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  mono?: boolean;
  full?: boolean;
}>) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', full && 'sm:col-span-2')}>
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase [&_svg]:size-3">
        {icon ? <span aria-hidden>{icon}</span> : null}
        {label}
      </dt>
      <dd className={cn('text-sm break-words', mono && 'font-mono text-[13px]')}>{value}</dd>
    </div>
  );
}

/** A value that also filters the list (e.g. every event of the same request). */
function FilterLink({
  label,
  onClick,
  children,
}: Readonly<{
  label: string;
  onClick: () => void;
  children: ReactNode;
}>) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-item text-secondary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <span className="font-sans text-[11px] font-semibold">· {label}</span>
    </button>
  );
}

function Ref({
  label,
  value,
  copyValue,
  hint,
  truncate,
  fallback = '—',
}: Readonly<{
  label: string;
  value: string | null | undefined;
  copyValue?: string;
  hint?: string;
  truncate?: boolean;
  fallback?: string;
}>) {
  const td = useTranslations('audit.detail');
  const text = value ?? null;
  return (
    <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
      <dt className="font-sans text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn('min-w-0', truncate ? 'truncate' : 'break-all')} title={text ?? ''}>
            {text ?? <span className="font-sans text-subtle-foreground">{fallback}</span>}
          </span>
          {text ? (
            <button
              type="button"
              aria-label={td('copy', { label })}
              className="shrink-0 rounded-item text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                void navigator.clipboard.writeText(copyValue ?? text);
                toast.success(td('copied'));
              }}
            >
              <Copy className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </span>
        {hint ? (
          <span className="mt-0.5 block font-sans text-[11px] text-subtle-foreground">{hint}</span>
        ) : null}
      </dd>
    </div>
  );
}
