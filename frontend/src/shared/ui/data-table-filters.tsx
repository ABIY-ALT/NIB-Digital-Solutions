'use client';

import { Check, CirclePlus, Search, X } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import {
  datePreset,
  decodeFilter,
  describeFilter,
  encodeFilter,
  type DateRange,
  type FilterDef,
  type FilterValue,
} from '@/shared/lib/table-filters';
import { Button } from './button';
import { fieldVariants, useFieldAppearance } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface FilterLabels {
  yes: string;
  no: string;
  clear: string;
  apply: string;
  reset: string;
  searchOptions: string;
  noOptions: string;
  from: string;
  to: string;
  presets: Record<'today' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth', string>;
  /** Accessible name of the remove (✕) button on an active filter. */
  remove: (filter: string) => string;
}

export interface DataTableFiltersProps {
  filters: FilterDef[];
  /** Raw encoded values, e.g. ListParams.filters from the URL. */
  values: Record<string, string | undefined>;
  onChange: (patch: Record<string, string | undefined>) => void;
  labels: FilterLabels;
  /** Extra reset behaviour (e.g. also clear search); defaults to clearing these filters. */
  onReset?: () => void;
}

/**
 * Faceted filter bar (IB toolbar style). Each filter is a button: dashed "⊕ Status"
 * when inactive, a filled chip "Status: Active, Locked ✕" when active. Values are
 * encoded to the backend syntax (see table-filters.ts) and live in the URL.
 */
export function DataTableFilters({
  filters,
  values,
  onChange,
  labels,
  onReset,
}: Readonly<DataTableFiltersProps>) {
  const active = filters.filter((f) => values[f.id]);
  return (
    <fieldset className="flex min-w-0 flex-wrap items-center gap-2" aria-label="Filters">
      {filters.map((def) => (
        <FilterButton
          key={def.id}
          def={def}
          raw={values[def.id]}
          labels={labels}
          onChange={(value) => onChange({ [def.id]: encodeFilter(def, value) })}
        />
      ))}
      {active.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-[30px] px-2 text-muted-foreground"
          onClick={() =>
            onReset ? onReset() : onChange(Object.fromEntries(active.map((f) => [f.id, undefined])))
          }
        >
          <X /> {labels.reset}
        </Button>
      ) : null}
    </fieldset>
  );
}

function FilterButton({
  def,
  raw,
  labels,
  onChange,
}: Readonly<{
  def: FilterDef;
  raw: string | undefined;
  labels: FilterLabels;
  onChange: (value: FilterValue | undefined) => void;
}>) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const value = decodeFilter(def, raw);
  const isActive = value !== undefined;
  const summary = describeFilter(def, value, locale, labels);
  const set = (next: FilterValue | undefined, close = false) => {
    onChange(next);
    if (close) setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          'inline-flex h-[30px] items-center rounded-control border text-xs transition-colors',
          isActive
            ? 'border-primary/50 bg-primary-softer text-foreground'
            : 'border-dashed border-border-strong bg-surface text-muted-foreground hover:border-primary/60 hover:text-foreground',
        )}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-full max-w-72 items-center gap-1.5 rounded-control px-2.5 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isActive ? null : <CirclePlus className="size-3.5 shrink-0" aria-hidden />}
            <span className="shrink-0">{def.label}</span>
            {isActive ? (
              <>
                <span className="h-3.5 w-px shrink-0 bg-primary/40" aria-hidden />
                <span className="truncate font-medium text-primary-text">{summary}</span>
              </>
            ) : null}
          </button>
        </PopoverTrigger>
        {isActive ? (
          <button
            type="button"
            aria-label={labels.remove(def.label)}
            onClick={() => set(undefined)}
            className="me-1 inline-flex size-5 items-center justify-center rounded-item text-muted-foreground outline-none hover:bg-primary/15 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3" aria-hidden />
          </button>
        ) : null}
      </div>
      <PopoverContent className={cn(def.type === 'dateRange' ? 'w-80' : 'w-64')}>
        <p className="border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
          {def.label}
        </p>
        <FilterPanel def={def} value={value} labels={labels} set={set} />
        {isActive ? (
          <div className="border-t border-border p-1">
            <button
              type="button"
              onClick={() => set(undefined, true)}
              className="w-full rounded-item px-2.5 py-1.5 text-center text-xs font-medium text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:bg-hover"
            >
              {labels.clear}
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** The option values a filter value selects. */
function selectedOptions(value: FilterValue | undefined): string[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  return typeof value === 'object' ? [] : [String(value)];
}

/** The editor in a filter's popover, by filter type. */
function FilterPanel({
  def,
  value,
  labels,
  set,
}: Readonly<{
  def: FilterDef;
  value: FilterValue | undefined;
  labels: FilterLabels;
  set: (next: FilterValue | undefined, close?: boolean) => void;
}>) {
  switch (def.type) {
    case 'select':
    case 'multiselect':
      return (
        <OptionsPanel
          options={def.options}
          multiple={def.type === 'multiselect'}
          selected={selectedOptions(value)}
          labels={labels}
          onChange={(vals) =>
            set(def.type === 'multiselect' ? vals : vals[0], def.type === 'select')
          }
        />
      );
    case 'boolean':
      return (
        <OptionsPanel
          options={[
            { value: 'true', label: def.trueLabel ?? labels.yes },
            { value: 'false', label: def.falseLabel ?? labels.no },
          ]}
          multiple={false}
          selected={selectedOptions(value)}
          labels={labels}
          onChange={(vals) => set(vals[0] === undefined ? undefined : vals[0] === 'true', true)}
        />
      );
    case 'text':
      return (
        <TextPanel
          initial={typeof value === 'string' ? value : ''}
          placeholder={def.placeholder}
          labels={labels}
          onApply={(text) => set(text || undefined, true)}
        />
      );
    default:
      return (
        <DateRangePanel
          initial={(value as DateRange | undefined) ?? {}}
          labels={labels}
          onApply={(range) => set(range.from || range.to ? range : undefined, true)}
        />
      );
  }
}

/** The selection after picking `v`: toggled with `multiple`, else chosen (or cleared when picked again). */
function toggled(draft: string[], v: string, multiple: boolean): string[] {
  if (multiple) return draft.includes(v) ? draft.filter((s) => s !== v) : [...draft, v];
  return draft[0] === v ? [] : [v];
}

function OptionsPanel({
  options,
  multiple,
  selected,
  labels,
  onChange,
}: Readonly<{
  options: Array<{ value: string; label: string }>;
  multiple: boolean;
  selected: string[];
  labels: FilterLabels;
  onChange: (values: string[]) => void;
}>) {
  const [query, setQuery] = useState('');
  const appearance = useFieldAppearance();
  // Local draft: several quick toggles must build on each other, not on the (async) URL state.
  const [draft, setDraft] = useState(selected);
  const shown = options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (v: string) => {
    const next = toggled(draft, v, multiple);
    setDraft(next);
    onChange(next);
  };

  return (
    <div>
      {options.length > 6 ? (
        <div className="relative border-b border-border p-2">
          <Search
            className="pointer-events-none absolute start-4.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle-foreground"
            aria-hidden
          />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.searchOptions}
            aria-label={labels.searchOptions}
            className={cn(fieldVariants({ appearance }), 'h-7 ps-7 pe-2 text-xs')}
          />
        </div>
      ) : null}
      <ul
        role="listbox"
        aria-multiselectable={multiple}
        className="scrollbar-thin max-h-64 overflow-y-auto p-1"
      >
        {shown.length === 0 ? (
          <li className="px-2.5 py-3 text-center text-xs text-muted-foreground">
            {labels.noOptions}
          </li>
        ) : null}
        {shown.map((o) => {
          const on = draft.includes(o.value);
          return (
            <li key={o.value} role="option" aria-selected={on}>
              <button
                type="button"
                onClick={() => toggle(o.value)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-item px-2.5 py-1.5 text-start text-[13px] outline-none hover:bg-hover focus-visible:bg-hover',
                  on && 'font-medium',
                )}
              >
                {multiple ? (
                  // Visual checkbox only (a real one would nest a button inside this button).
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded-[min(var(--radius-item),4px)] border',
                      on
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-surface',
                    )}
                    aria-hidden
                  >
                    {on ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                ) : (
                  <span className="flex size-4 items-center justify-center" aria-hidden>
                    {on ? <Check className="size-3.5 text-primary" /> : null}
                  </span>
                )}
                <span className="truncate">{o.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TextPanel({
  initial,
  placeholder,
  labels,
  onApply,
}: Readonly<{
  initial: string;
  placeholder?: string;
  labels: FilterLabels;
  onApply: (text: string) => void;
}>) {
  const [text, setText] = useState(initial);
  const appearance = useFieldAppearance();
  return (
    <form
      className="flex gap-2 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(text.trim());
      }}
    >
      <input
        autoFocus
        value={text}
        maxLength={100}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className={cn(fieldVariants({ appearance }), 'h-[30px] w-auto flex-1 px-2.5 text-xs')}
      />
      <Button type="submit" size="sm" className="h-[30px]">
        {labels.apply}
      </Button>
    </form>
  );
}

function DateRangePanel({
  initial,
  labels,
  onApply,
}: Readonly<{
  initial: DateRange;
  labels: FilterLabels;
  onApply: (range: DateRange) => void;
}>) {
  const [range, setRange] = useState<DateRange>(initial);
  const appearance = useFieldAppearance();
  const invalid = !!range.from && !!range.to && range.from > range.to;
  const field = (key: 'from' | 'to', label: string): ReactNode => (
    <label className="flex flex-1 flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
      {label}
      <input
        type="date"
        value={range[key] ?? ''}
        max={key === 'from' ? range.to : undefined}
        min={key === 'to' ? range.from : undefined}
        onChange={(e) => setRange((r) => ({ ...r, [key]: e.target.value || undefined }))}
        className={cn(fieldVariants({ appearance }), 'h-[30px] px-2 text-xs font-normal')}
      />
    </label>
  );
  return (
    <div className="grid grid-cols-[auto_1fr]">
      <ul className="border-e border-border p-1">
        {(Object.keys(labels.presets) as Array<keyof FilterLabels['presets']>).map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => onApply(datePreset(p))}
              className="w-full rounded-item px-2.5 py-1.5 text-start text-xs whitespace-nowrap outline-none hover:bg-hover focus-visible:bg-hover"
            >
              {labels.presets[p]}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2.5 p-2.5">
        {field('from', labels.from)}
        {field('to', labels.to)}
        <Button
          size="sm"
          className="h-[30px]"
          disabled={invalid || (!range.from && !range.to)}
          onClick={() => onApply(range)}
        >
          {labels.apply}
        </Button>
      </div>
    </div>
  );
}
