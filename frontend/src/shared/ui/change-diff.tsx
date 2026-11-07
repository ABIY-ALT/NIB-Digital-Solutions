'use client';

import { ArrowRight, Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { keyed } from '@/shared/lib/keys';

export interface ChangeDiffLabels {
  field: string;
  before: string;
  after: string;
  empty: string;
  created: string;
  deleted: string;
  onlyChanges: string;
  allFields: string;
  unchanged: (count: number) => string;
  added: string;
  removed: string;
}

/** Translated labels (shared `changeDiff` namespace); `overrides` for context wording. */
export function useChangeDiffLabels(overrides?: Partial<ChangeDiffLabels>): ChangeDiffLabels {
  const t = useTranslations('changeDiff');
  return useMemo(
    () => ({
      field: t('field'),
      before: t('before'),
      after: t('after'),
      empty: t('empty'),
      created: t('created'),
      deleted: t('deleted'),
      onlyChanges: t('onlyChanges'),
      allFields: t('allFields'),
      unchanged: (count: number) => t('unchanged', { count }),
      added: t('added'),
      removed: t('removed'),
      ...overrides,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- overrides are static per call site
    [t],
  );
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === '';
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** JSON data as text: scalars as they are, arrays comma-joined, objects as JSON. */
function jsonText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.join(',');
  return JSON.stringify(value) ?? '';
}

function Value({
  value,
  labels,
}: Readonly<{ value: unknown; labels: ChangeDiffLabels }>): ReactNode {
  if (isEmpty(value)) return <span className="text-subtle-foreground italic">{labels.empty}</span>;
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (Array.isArray(value)) {
    return value.length ? (
      <span className="flex flex-wrap gap-1">
        {keyed(value.map(String), (text) => text).map(({ key, item: text }) => (
          <code key={key} className="rounded-item bg-muted px-1.5 py-0.5 text-[11px]">
            {text}
          </code>
        ))}
      </span>
    ) : (
      <span className="text-subtle-foreground italic">{labels.empty}</span>
    );
  }
  if (typeof value === 'object') {
    return (
      <span className="grid gap-0.5">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <span key={k} className="text-xs">
            <span className="text-muted-foreground">{k}:</span> {jsonText(v ?? '—')}
          </span>
        ))}
      </span>
    );
  }
  return <span className="break-words">{jsonText(value)}</span>;
}

/** Arrays diff as added / removed chips (e.g. permissions of a role). */
function ArrayDiff({
  before,
  after,
  labels,
}: Readonly<{
  before: unknown[];
  after: unknown[];
  labels: ChangeDiffLabels;
}>) {
  const b = new Set(before.map(String));
  const a = new Set(after.map(String));
  const added = [...a].filter((x) => !b.has(x));
  const removed = [...b].filter((x) => !a.has(x));
  const kept = [...a].filter((x) => b.has(x));
  return (
    <div className="space-y-1.5">
      {added.length ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="sr-only">{labels.added}</span>
          {added.map((x) => (
            <code
              key={`+${x}`}
              className="inline-flex items-center gap-0.5 rounded-item bg-success-soft px-1.5 py-0.5 text-[11px] font-semibold text-success"
            >
              <Plus className="size-3" aria-hidden />
              {x}
            </code>
          ))}
        </div>
      ) : null}
      {removed.length ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="sr-only">{labels.removed}</span>
          {removed.map((x) => (
            <code
              key={`-${x}`}
              className="inline-flex items-center gap-0.5 rounded-item bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger line-through decoration-danger/60"
            >
              <Minus className="size-3" aria-hidden />
              {x}
            </code>
          ))}
        </div>
      ) : null}
      {kept.length ? (
        <p className="text-[11px] text-subtle-foreground">{labels.unchanged(kept.length)}</p>
      ) : null}
    </div>
  );
}

type DiffMode = 'created' | 'deleted' | 'updated';

function diffMode(before: object | null, after: object | null): DiffMode {
  if (!before) return 'created';
  return after ? 'updated' : 'deleted';
}

/** One field's value cells: its array diff, the single value, or before → after. */
function FieldCells({
  was,
  now,
  mode,
  labels,
}: Readonly<{ was: unknown; now: unknown; mode: DiffMode; labels: ChangeDiffLabels }>) {
  const isChanged = !same(was, now);
  if (Array.isArray(was) && Array.isArray(now) && isChanged) {
    return (
      <td colSpan={2} className="px-3 py-2.5">
        <ArrayDiff before={was} after={now} labels={labels} />
      </td>
    );
  }
  if (mode !== 'updated') {
    return (
      <td colSpan={3} className="px-3 py-2.5">
        <Value value={mode === 'created' ? now : was} labels={labels} />
      </td>
    );
  }
  return (
    <>
      <td
        className={cn(
          'px-3 py-2.5',
          isChanged && 'bg-danger-soft/50 text-danger line-through decoration-danger/40',
        )}
      >
        <Value value={was} labels={labels} />
      </td>
      <td className="w-6 py-2.5 text-subtle-foreground">
        <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
      </td>
      <td className={cn('px-3 py-2.5', isChanged && 'bg-success-soft/50 font-medium')}>
        <Value value={now} labels={labels} />
      </td>
    </>
  );
}

/**
 * Side-by-side "before → after" of a record, for reviewers (maker–checker),
 * audit details and history views. Changed fields are highlighted; arrays show
 * added / removed items; creation and deletion get their own banner.
 */
export function ChangeDiff({
  before,
  after,
  labels,
  fieldLabel = (f) => f,
  className,
}: Readonly<{
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  labels: ChangeDiffLabels;
  fieldLabel?: (field: string) => string;
  className?: string;
}>) {
  const [showAll, setShowAll] = useState(false);
  const fields = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const changed = fields.filter((f) => !same(before?.[f], after?.[f]));
  const rows = showAll || !before || !after ? fields : changed;
  const mode = diffMode(before, after);
  const summary = mode === 'updated' ? `${changed.length} / ${fields.length}` : labels[mode];

  return (
    <div className={cn('overflow-hidden rounded-surface border border-border', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-2">
        <span
          className={cn(
            'text-xs font-semibold',
            mode === 'created' && 'text-success',
            mode === 'deleted' && 'text-danger',
          )}
        >
          {summary}
        </span>
        {mode === 'updated' && changed.length < fields.length ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded-item text-xs font-semibold text-secondary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showAll ? labels.onlyChanges : labels.allFields}
          </button>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sr-only">
            <tr>
              <th>{labels.field}</th>
              <th>{labels.before}</th>
              <td />
              <th>{labels.after}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((field) => (
              <tr key={field} className="align-top">
                <th
                  scope="row"
                  className="w-36 px-3 py-2.5 text-start text-xs font-semibold text-muted-foreground"
                >
                  {fieldLabel(field)}
                </th>
                <FieldCells
                  was={before?.[field]}
                  now={after?.[field]}
                  mode={mode}
                  labels={labels}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
