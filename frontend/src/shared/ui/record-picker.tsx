'use client';

import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { FieldValues } from 'react-hook-form';
import {
  useOptionPages,
  useResolvedOptions,
  type OptionPages,
  type OptionSourceRef,
  type PickerOption,
} from '@/shared/data/record-options';
import { cn } from '@/shared/lib/cn';
import { keyed } from '@/shared/lib/keys';
import { fuzzyMatch, highlightSegments } from '@/shared/lib/fuzzy';
import { FormField } from './form';
import type { FieldBaseProps } from './form-fields';
import { fieldShellVariants, useFieldAppearance, type FieldAppearance } from './input';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './popover';
import { Spinner } from './spinner';

export type { OptionSourceRef, PickerOption };

/**
 * Record picker — the one control for "choose a record" fields.
 *
 *   <RecordPicker source="refdata.branches" value={code} onChange={setCode} clearable />
 *   <RecordPicker source="roles" multiple value={codes} onChange={setCodes} maxSelected={5} />
 *   <RecordPicker source={[{ value: 'A', label: 'Alpha' }]} value={v} onChange={setV} />
 *   <RecordPickerField<Values> name="roles" source="roles" multiple label="Roles" />
 *
 * `source` is a backend option source (GET /options/{source}: permission-checked,
 * searched and paginated on the server) or a static array. Features: debounced
 * search with match highlighting, infinite scroll with a "load more" fallback,
 * total counts, keyboard navigation (↑ ↓ PgUp PgDn Enter Esc, Backspace removes
 * the last chip), chips with overflow, "selected only" view, select all shown,
 * maximum selections, groups, disabled/inactive options, labels resolved for
 * saved values, and custom option rendering.
 */
interface RecordPickerCommonProps {
  /** Backend source key ("roles", "users", "refdata.branches") or a static list. */
  source: OptionSourceRef;
  /** Parent filter for hierarchical sources (e.g. branches of a region). */
  parent?: string | null;
  /** Options per page (server) / per reveal (static). */
  pageSize?: number;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Shown when nothing matches. */
  emptyText?: ReactNode;
  disabled?: boolean;
  invalid?: boolean;
  /** Overrides the product's field appearance (app.config `ui.controls.field`). */
  appearance?: FieldAppearance;
  id?: string;
  className?: string;
  /** Classes for the floating panel. */
  contentClassName?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
  /** Show option hints (e.g. codes). Default true. */
  showHint?: boolean;
  /** Show option descriptions in the list. Default true. */
  showDescription?: boolean;
  /** Values never offered (e.g. the record being edited). */
  exclude?: readonly string[];
  isOptionDisabled?: (option: PickerOption) => boolean;
  /** Replaces the default option body (label, hint, description). */
  renderOption?: (
    option: PickerOption,
    state: { selected: boolean; active: boolean; search: string },
  ) => ReactNode;
  /** Hide the search box (short lists). Default true. */
  searchable?: boolean;
  /** Search debounce for server sources, in ms. */
  debounceMs?: number;
  /** Show a clear (✕) button when something is selected. */
  clearable?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface SingleRecordPickerProps extends RecordPickerCommonProps {
  multiple?: false;
  value: string | null | undefined;
  onChange: (value: string | null, option: PickerOption | null) => void;
}

export interface MultipleRecordPickerProps extends RecordPickerCommonProps {
  multiple: true;
  value: readonly string[] | null | undefined;
  onChange: (values: string[], options: PickerOption[]) => void;
  maxSelected?: number;
  /** Chips shown in the field before collapsing into "+N". Default 6. */
  maxChips?: number;
}

export type RecordPickerProps = SingleRecordPickerProps | MultipleRecordPickerProps;

const toValues = (value: string | readonly string[] | null | undefined): string[] => {
  if (value == null || value === '') return [];
  return typeof value === 'string' ? [value] : [...value];
};

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Limits of a multiple picker; a single picker has none (and shows no chips). */
function multipleLimits(props: RecordPickerProps): { maxSelected?: number; maxChips: number } {
  return props.multiple
    ? { maxSelected: props.maxSelected, maxChips: props.maxChips ?? 6 }
    : { maxChips: 0 };
}

/** Multiple: the chips shown (the rest collapse into "+N"). Single: the selected option. */
function selectionDisplay(selected: PickerOption[], multiple: boolean, maxChips: number) {
  if (!multiple) return { chips: [], overflow: 0, single: selected[0] };
  const chips = selected.slice(0, maxChips);
  return { chips, overflow: selected.length - chips.length, single: undefined };
}

/** An option's hint, unless hints are off or it only repeats the label. */
const optionHint = (o: PickerOption, showHint: boolean) =>
  showHint && o.hint && o.hint !== o.label ? o.hint : null;

function emptyMessage(view: 'all' | 'selected', search: string, t: Translate): string {
  if (view === 'selected') return t('noneSelected');
  return search ? t('noMatches', { search }) : t('noOptions');
}

/** The trigger's prompt when no single option is shown. */
function promptText(
  multiple: boolean,
  hasValues: boolean,
  placeholder: string | undefined,
  t: Translate,
): string {
  if (multiple && hasValues) return t('addMore');
  return placeholder ?? (multiple ? t('placeholderMany') : t('placeholder'));
}

export function RecordPicker(props: RecordPickerProps) {
  const {
    source,
    parent,
    pageSize = 20,
    placeholder,
    searchPlaceholder,
    emptyText,
    disabled,
    invalid,
    id,
    className,
    contentClassName,
    showHint = true,
    showDescription = true,
    exclude,
    isOptionDisabled,
    renderOption,
    searchable = true,
    debounceMs = 250,
    clearable = props.multiple === true,
    onOpenChange,
  } = props;
  const t = useTranslations('picker');
  const appearance = useFieldAppearance(props.appearance);
  const multiple = props.multiple === true;
  const { maxSelected, maxChips } = multipleLimits(props);
  const rawValue = props.value;
  const values = useMemo(() => toValues(rawValue), [rawValue]);
  const remote = typeof source === 'string';

  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const [view, setView] = useState<'all' | 'selected'>('all');
  // Options picked in this session: labels stay right while a new search loads.
  const [picked, setPicked] = useState<ReadonlyMap<string, PickerOption>>(new Map());
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollToActive = useRef(false);

  useEffect(() => {
    const next = query.trim();
    if (next === search) return;
    const timer = setTimeout(() => setSearch(next), remote ? debounceMs : 0);
    return () => clearTimeout(timer);
  }, [query, search, remote, debounceMs]);

  const pages = useOptionPages(source, { search, parent, pageSize, enabled: open });
  const resolved = useResolvedOptions(source, values);

  const loaded = new Map(pages.options.map((o) => [o.value, o]));
  const optionFor = (value: string): PickerOption =>
    resolved.byValue.get(value) ??
    picked.get(value) ??
    loaded.get(value) ?? { value, label: value };
  const selected = values.map(optionFor);
  const selectedSet = new Set(values);
  const excluded = new Set(exclude ?? []);
  const atMax = maxSelected !== undefined && values.length >= maxSelected;

  const list = view === 'selected' ? selected : pages.options.filter((o) => !excluded.has(o.value));
  const activeIndex = Math.min(active, list.length - 1);
  const optionId = (index: number) => `${listId}-option-${index}`;

  const canToggle = (o: PickerOption): boolean =>
    multiple && selectedSet.has(o.value)
      ? true // always allow removing, even inactive ones
      : !(o.disabled || isOptionDisabled?.(o) || (multiple && atMax));

  // Keep the keyboard-active option visible.
  useEffect(() => {
    if (!scrollToActive.current) return;
    scrollToActive.current = false;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
  });

  // Infinite scroll: load the next page when the end of the list comes into view.
  const loadMoreRef = useRef(pages.loadMore);
  useEffect(() => {
    loadMoreRef.current = pages.loadMore;
  });
  const hasMore = view === 'all' && pages.hasMore;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!open || !hasMore || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMoreRef.current();
      },
      { root: listRef.current, rootMargin: '96px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, hasMore, pages.options.length]);

  const changeOpen = (next: boolean) => {
    if (disabled && next) return;
    setOpen(next);
    onOpenChange?.(next);
    if (!next) {
      setQuery('');
      setSearch('');
      setActive(0);
      setView('all');
    }
  };

  const emitMany = (next: string[], extra?: PickerOption) => {
    if (!props.multiple) return;
    props.onChange(
      next,
      next.map((v) => (extra?.value === v ? extra : optionFor(v))),
    );
  };

  const toggle = (o: PickerOption) => {
    if (!canToggle(o)) return;
    setPicked((prev) => new Map(prev).set(o.value, o));
    if (props.multiple) {
      emitMany(
        selectedSet.has(o.value) ? values.filter((v) => v !== o.value) : [...values, o.value],
        o,
      );
    } else {
      props.onChange(o.value, o);
      changeOpen(false);
    }
  };

  const remove = (value: string) => {
    if (props.multiple) emitMany(values.filter((v) => v !== value));
    else props.onChange(null, null);
  };

  const clear = () => {
    if (props.multiple) props.onChange([], []);
    else props.onChange(null, null);
  };

  const selectAllShown = () => {
    const room = maxSelected === undefined ? Infinity : maxSelected - values.length;
    const add = list
      .filter((o) => !selectedSet.has(o.value) && canToggle(o))
      .slice(0, Math.max(0, room));
    if (add.length === 0) return;
    setPicked((prev) => {
      const next = new Map(prev);
      for (const o of add) next.set(o.value, o);
      return next;
    });
    if (props.multiple) {
      const byValue = new Map(add.map((o) => [o.value, o]));
      const next = [...values, ...add.map((o) => o.value)];
      props.onChange(
        next,
        next.map((v) => byValue.get(v) ?? optionFor(v)),
      );
    }
  };

  const move = (delta: number) => {
    if (list.length === 0) return;
    const next = Math.min(list.length - 1, Math.max(0, activeIndex + delta));
    scrollToActive.current = true;
    setActive(next);
    if (hasMore && next >= list.length - 3) pages.loadMore();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'PageDown':
        e.preventDefault();
        move(8);
        break;
      case 'PageUp':
        e.preventDefault();
        move(-8);
        break;
      case 'Enter': {
        e.preventDefault();
        const o = list[activeIndex];
        if (o) toggle(o);
        break;
      }
      case 'Backspace':
        if (multiple && !query && values.length > 0) remove(values[values.length - 1]!);
        break;
    }
  };

  const openOnArrow = (e: KeyboardEvent<HTMLElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      changeOpen(true);
    }
  };

  const { chips, overflow, single } = selectionDisplay(selected, multiple, maxChips);
  const canSelectAll =
    view === 'all' && list.some((o) => !selectedSet.has(o.value) && canToggle(o));

  const renderRows = () =>
    list.map((o, index) => (
      <OptionRow
        key={o.value}
        option={o}
        id={optionId(index)}
        heading={o.group && o.group !== list[index - 1]?.group ? o.group : null}
        selected={selectedSet.has(o.value)}
        active={index === activeIndex}
        enabled={canToggle(o)}
        multiple={multiple}
        highlight={search ? fuzzyMatch(search, { label: o.label })?.indices : null}
        hint={optionHint(o, showHint)}
        showDescription={showDescription}
        inactiveLabel={t('inactive')}
        renderOption={renderOption}
        search={search}
        onHover={() => setActive(index)}
        onSelect={() => toggle(o)}
      />
    ));

  return (
    <Popover open={open} onOpenChange={changeOpen} modal>
      <PopoverAnchor asChild>
        <div
          data-slot="record-picker"
          data-disabled={disabled || undefined}
          className={cn(
            fieldShellVariants({ appearance, open, disabled: !!disabled }),
            'relative flex min-h-control w-full min-w-0 items-center',
            multiple && chips.length > 0 && 'flex-wrap gap-1 py-[3px] ps-1',
            invalid && 'border-danger',
            className,
          )}
        >
          <PickerChips
            chips={chips}
            overflow={overflow}
            disabled={disabled}
            removeLabel={(label) => t('remove', { label })}
            moreLabel={t('more', { count: overflow })}
            onRemove={remove}
            onShowSelected={() => {
              changeOpen(true);
              setView('selected');
            }}
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              id={id}
              role="combobox"
              disabled={disabled}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-invalid={invalid || undefined}
              aria-required={props['aria-required']}
              aria-label={props['aria-label']}
              aria-describedby={props['aria-describedby']}
              onKeyDown={openOnArrow}
              className={cn(
                'flex min-h-[calc(var(--spacing-control)-2px)] min-w-24 flex-1 items-center gap-2 self-stretch rounded-control ps-3 text-start outline-none disabled:cursor-not-allowed',
                multiple && chips.length > 0 && 'min-h-6 ps-1',
              )}
            >
              <SelectionText
                single={single}
                showHint={showHint}
                inactiveLabel={t('inactive')}
                prompt={promptText(multiple, values.length > 0, placeholder, t)}
              />
            </button>
          </PopoverTrigger>
          <FieldEnd
            loading={resolved.isLoading}
            canClear={clearable && values.length > 0 && !disabled}
            clearLabel={t('clear')}
            open={open}
            disabled={disabled}
            onClear={clear}
            onToggle={() => changeOpen(!open)}
          />
        </div>
      </PopoverAnchor>

      <PopoverContent
        className={cn(
          'flex w-[max(var(--radix-popover-trigger-width),18rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden',
          contentClassName,
        )}
        onKeyDown={searchable ? undefined : onKeyDown}
      >
        <PickerPanel
          t={t}
          listId={listId}
          listRef={listRef}
          sentinelRef={sentinelRef}
          searchable={searchable}
          searchLabel={searchPlaceholder ?? t('search')}
          query={query}
          activeDescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          onQueryChange={(next) => {
            setQuery(next);
            setActive(0);
            if (view === 'selected') setView('all');
          }}
          onKeyDown={onKeyDown}
          multiple={multiple}
          view={view}
          onViewChange={(next) => {
            setView(next);
            setActive(0);
          }}
          selectedCount={values.length}
          maxSelected={maxSelected}
          pages={pages}
          listLength={list.length}
          empty={emptyText ?? emptyMessage(view, search, t)}
          hasMore={hasMore}
          renderRows={renderRows}
          canSelectAll={canSelectAll}
          onSelectAll={selectAllShown}
          onClear={clear}
          atMax={atMax}
        />
      </PopoverContent>
    </Popover>
  );
}

/** The selected values as removable chips, then "+N" (which opens the "selected" view). */
function PickerChips({
  chips,
  overflow,
  disabled,
  removeLabel,
  moreLabel,
  onRemove,
  onShowSelected,
}: Readonly<{
  chips: PickerOption[];
  overflow: number;
  disabled?: boolean;
  removeLabel: (label: string) => string;
  moreLabel: string;
  onRemove: (value: string) => void;
  onShowSelected: () => void;
}>) {
  return (
    <>
      {chips.map((o) => (
        <span
          key={o.value}
          className={cn(
            'inline-flex max-w-full min-w-0 items-center gap-1 rounded-item border border-border bg-surface-muted py-0.5 ps-1.5 pe-0.5 text-xs font-medium text-foreground',
            o.disabled && 'text-muted-foreground line-through',
          )}
          title={o.hint ? `${o.label} · ${o.hint}` : o.label}
        >
          <span className="truncate">{o.label}</span>
          {disabled ? null : (
            <button
              type="button"
              aria-label={removeLabel(o.label)}
              onClick={() => onRemove(o.value)}
              className="inline-flex size-4 shrink-0 items-center justify-center rounded-item text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" aria-hidden />
            </button>
          )}
        </span>
      ))}
      {overflow > 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onShowSelected}
          className="rounded-item bg-primary-soft px-1.5 py-0.5 text-xs font-semibold text-primary-text outline-none hover:bg-primary-soft/80 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {moreLabel}
        </button>
      ) : null}
    </>
  );
}

/** The trigger's text: the selected option of a single picker, else the prompt. */
function SelectionText({
  single,
  showHint,
  inactiveLabel,
  prompt,
}: Readonly<{
  single?: PickerOption;
  showHint: boolean;
  inactiveLabel: string;
  prompt: string;
}>) {
  if (!single) return <span className="truncate text-subtle-foreground">{prompt}</span>;
  const hint = optionHint(single, showHint);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={cn('truncate', single.disabled && 'text-muted-foreground')}>
        {single.label}
      </span>
      {hint ? <span className="shrink-0 text-xs text-subtle-foreground">{hint}</span> : null}
      {single.disabled ? (
        <span className="shrink-0 text-xs text-warning">{inactiveLabel}</span>
      ) : null}
    </span>
  );
}

/** The end of the field: loading spinner, clear button and the open/close chevron. */
function FieldEnd({
  loading,
  canClear,
  clearLabel,
  open,
  disabled,
  onClear,
  onToggle,
}: Readonly<{
  loading: boolean;
  canClear: boolean;
  clearLabel: string;
  open: boolean;
  disabled?: boolean;
  onClear: () => void;
  onToggle: () => void;
}>) {
  return (
    <span className="flex shrink-0 items-center gap-0.5 self-stretch pe-2">
      {loading ? <Spinner size={14} tone="muted" decorative /> : null}
      {canClear ? (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={onClear}
          className="inline-flex size-6 items-center justify-center rounded-item text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
      <ChevronDown
        aria-hidden
        onClick={onToggle}
        className={cn(
          'size-4 cursor-pointer opacity-60 transition-transform',
          open && 'rotate-180',
          disabled && 'cursor-not-allowed',
        )}
      />
    </span>
  );
}

/** The popup: search box, "all / selected" switch, the options and the footer. */
function PickerPanel({
  t,
  listId,
  listRef,
  sentinelRef,
  searchable,
  searchLabel,
  query,
  activeDescendant,
  onQueryChange,
  onKeyDown,
  multiple,
  view,
  onViewChange,
  selectedCount,
  maxSelected,
  pages,
  listLength,
  empty,
  hasMore,
  renderRows,
  canSelectAll,
  onSelectAll,
  onClear,
  atMax,
}: Readonly<{
  t: Translate;
  listId: string;
  listRef: RefObject<HTMLDivElement | null>;
  sentinelRef: RefObject<HTMLDivElement | null>;
  searchable: boolean;
  searchLabel: string;
  query: string;
  activeDescendant?: string;
  onQueryChange: (query: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  multiple: boolean;
  view: 'all' | 'selected';
  onViewChange: (view: 'all' | 'selected') => void;
  selectedCount: number;
  maxSelected?: number;
  pages: OptionPages;
  listLength: number;
  empty: ReactNode;
  hasMore: boolean;
  renderRows: () => ReactNode;
  canSelectAll: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  atMax: boolean;
}>) {
  return (
    <>
      {searchable ? (
        <div className="relative border-b border-border">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
            aria-hidden
          />
          <input
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeDescendant}
            aria-label={searchLabel}
            placeholder={searchLabel}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
            className="h-10 w-full bg-transparent ps-9 pe-9 text-sm outline-none placeholder:text-subtle-foreground"
          />
          {pages.isFetching && !pages.isFetchingMore ? (
            <Spinner
              size="sm"
              tone="muted"
              decorative
              className="absolute end-3 top-1/2 -translate-y-1/2"
            />
          ) : null}
        </div>
      ) : null}

      {multiple ? (
        <ViewSwitch
          t={t}
          view={view}
          onViewChange={onViewChange}
          selectedCount={selectedCount}
          maxSelected={maxSelected}
        />
      ) : null}

      <div // NOSONAR -- combobox popup (WAI-ARIA): <select>/<datalist> cannot show rich, searchable options
        ref={listRef}
        id={listId}
        role="listbox"
        aria-multiselectable={multiple || undefined}
        aria-busy={pages.isLoading || undefined}
        className="max-h-72 overflow-y-auto overscroll-contain p-1"
      >
        <OptionsBody
          state={listState(pages, view, listLength)}
          t={t}
          empty={empty}
          onRetry={pages.retry}
          renderRows={renderRows}
        />
        {hasMore && !pages.isLoading ? (
          <div ref={sentinelRef} className="p-1">
            <button
              type="button"
              onClick={pages.loadMore}
              disabled={pages.isFetchingMore}
              className="flex w-full items-center justify-center gap-2 rounded-item py-1.5 text-xs font-semibold text-primary-text outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
            >
              {pages.isFetchingMore ? (
                <Spinner size={14} variant="dots" tone="current" decorative />
              ) : null}
              {pages.isFetchingMore ? t('loadingMore') : t('loadMore')}
            </button>
          </div>
        ) : null}
      </div>

      <PickerFooter
        t={t}
        view={view}
        pages={pages}
        shown={listLength}
        multiple={multiple}
        canSelectAll={canSelectAll}
        canClear={selectedCount > 0}
        onSelectAll={onSelectAll}
        onClear={onClear}
        atMax={atMax}
        maxSelected={maxSelected}
      />
    </>
  );
}

/** "All / Selected (n)" and, with a maximum, "n of max". */
function ViewSwitch({
  t,
  view,
  onViewChange,
  selectedCount,
  maxSelected,
}: Readonly<{
  t: Translate;
  view: 'all' | 'selected';
  onViewChange: (view: 'all' | 'selected') => void;
  selectedCount: number;
  maxSelected?: number;
}>) {
  return (
    <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 text-xs">
      {(['all', 'selected'] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onViewChange(v)}
          className={cn(
            'rounded-item px-2 py-1 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
            view === v
              ? 'bg-primary-soft text-primary-text'
              : 'text-muted-foreground hover:bg-hover hover:text-foreground',
          )}
        >
          {v === 'all' ? t('viewAll') : t('viewSelected', { count: selectedCount })}
        </button>
      ))}
      <span className="ms-auto text-subtle-foreground">
        {maxSelected === undefined
          ? null
          : t('countOfMax', { count: selectedCount, max: maxSelected })}
      </span>
    </div>
  );
}

type ListState = 'loading' | 'error' | 'empty' | 'options';

/** What the list shows: skeletons and errors only in the "all" view, then options or the empty text. */
function listState(pages: OptionPages, view: 'all' | 'selected', length: number): ListState {
  if (pages.isLoading && view === 'all') return 'loading';
  if (pages.isError && view === 'all') return 'error';
  return length === 0 ? 'empty' : 'options';
}

function OptionsBody({
  state,
  t,
  empty,
  onRetry,
  renderRows,
}: Readonly<{
  state: ListState;
  t: Translate;
  empty: ReactNode;
  onRetry: () => void;
  renderRows: () => ReactNode;
}>) {
  if (state === 'loading') {
    return (
      <div className="space-y-1 p-1" aria-label={t('loading')}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-7 animate-pulse rounded-item bg-muted" />
        ))}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="flex flex-col items-center gap-2 px-3 py-6 text-center text-sm text-muted-foreground">
        {t('error')}
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-semibold text-primary-text underline-offset-4 hover:underline"
        >
          {t('retry')}
        </button>
      </div>
    );
  }
  if (state === 'empty') {
    return <div className="px-3 py-6 text-center text-sm text-muted-foreground">{empty}</div>;
  }
  return renderRows();
}

/** One option, preceded by its group heading when a new group starts. */
function OptionRow({
  option: o,
  id,
  heading,
  selected,
  active,
  enabled,
  multiple,
  highlight,
  hint,
  showDescription,
  inactiveLabel,
  renderOption,
  search,
  onHover,
  onSelect,
}: Readonly<{
  option: PickerOption;
  id: string;
  heading: string | null | undefined;
  selected: boolean;
  active: boolean;
  enabled: boolean;
  multiple: boolean;
  highlight: readonly number[] | null | undefined;
  hint: string | null | undefined;
  showDescription: boolean;
  inactiveLabel: string;
  renderOption?: NonNullable<RecordPickerCommonProps['renderOption']>;
  search: string;
  onHover: () => void;
  onSelect: () => void;
}>) {
  return (
    <>
      {heading ? (
        <div className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-subtle-foreground uppercase">
          {heading}
        </div>
      ) : null}
      <div // NOSONAR -- option of the combobox popup above (no native element fits)
        id={id}
        role="option"
        aria-selected={selected}
        aria-disabled={!enabled || undefined}
        tabIndex={-1}
        data-active={active || undefined}
        onMouseDown={(e) => e.preventDefault()}
        onMouseMove={() => {
          if (!active) onHover();
        }}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
          e.preventDefault();
          onSelect();
        }}
        className={cn(
          'relative flex cursor-default items-start gap-2 rounded-item py-1.5 ps-2 pe-2 text-sm select-none',
          active && 'bg-hover',
          selected && !multiple && 'bg-primary-softer',
          !enabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <SelectionMark multiple={multiple} selected={selected} />
        <span className="min-w-0 flex-1">
          {renderOption ? (
            renderOption(o, { selected, active, search })
          ) : (
            <OptionText
              option={o}
              highlight={highlight}
              hint={hint}
              showDescription={showDescription}
              inactiveLabel={inactiveLabel}
            />
          )}
        </span>
      </div>
    </>
  );
}

/** A checkbox (multiple) or a check mark (single) showing whether the option is selected. */
function SelectionMark({ multiple, selected }: Readonly<{ multiple: boolean; selected: boolean }>) {
  if (multiple) {
    return (
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[min(var(--radius-item),4px)] border',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-input bg-surface',
        )}
      >
        {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
    );
  }
  return (
    <Check
      aria-hidden
      className={cn('mt-0.5 size-4 shrink-0 text-primary-text', !selected && 'invisible')}
    />
  );
}

/** The default option body: label (search matches marked), hint, description, inactive note. */
function OptionText({
  option: o,
  highlight,
  hint,
  showDescription,
  inactiveLabel,
}: Readonly<{
  option: PickerOption;
  highlight: readonly number[] | null | undefined;
  hint: string | null | undefined;
  showDescription: boolean;
  inactiveLabel: string;
}>) {
  return (
    <>
      <span className="flex items-baseline gap-2">
        <span className="min-w-0 truncate">
          {highlight ? <MarkedText text={o.label} indices={highlight} /> : o.label}
        </span>
        {hint ? (
          <span className="ms-auto shrink-0 font-mono text-[11px] text-subtle-foreground">
            {hint}
          </span>
        ) : null}
      </span>
      {showDescription && o.description ? (
        <span className="block truncate text-xs text-muted-foreground">{o.description}</span>
      ) : null}
      {o.disabled ? <span className="block text-xs text-warning">{inactiveLabel}</span> : null}
    </>
  );
}

function MarkedText({ text, indices }: Readonly<{ text: string; indices: readonly number[] }>) {
  return keyed(highlightSegments(text, indices), (s) => `${s.match ? '+' : '-'}${s.text}`).map(
    ({ key, item: s }) =>
      s.match ? (
        <mark key={key} className="rounded-[2px] bg-primary-soft text-inherit">
          {s.text}
        </mark>
      ) : (
        <Fragment key={key}>{s.text}</Fragment>
      ),
  );
}

/** The footer: "shown of total", select all shown and clear all; then the maximum notice. */
function PickerFooter({
  t,
  view,
  pages,
  shown,
  multiple,
  canSelectAll,
  canClear,
  onSelectAll,
  onClear,
  atMax,
  maxSelected,
}: Readonly<{
  t: Translate;
  view: 'all' | 'selected';
  pages: OptionPages;
  shown: number;
  multiple: boolean;
  canSelectAll: boolean;
  canClear: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  atMax: boolean;
  maxSelected?: number;
}>) {
  const counted = view === 'all' && pages.total > 0;
  return (
    <>
      {(counted && !pages.isLoading) || multiple ? (
        <div className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
          <span aria-live="polite" className="tabular">
            {counted ? t('showing', { shown, total: pages.total }) : null}
          </span>
          {multiple ? (
            <FooterActions
              selectAllLabel={canSelectAll ? t('selectAllShown') : null}
              clearAllLabel={canClear ? t('clearAll') : null}
              onSelectAll={onSelectAll}
              onClear={onClear}
            />
          ) : null}
        </div>
      ) : null}
      {atMax ? (
        <p className="border-t border-border bg-warning-soft px-3 py-1.5 text-xs text-warning">
          {t('maxReached', { max: maxSelected! })}
        </p>
      ) : null}
    </>
  );
}

function FooterActions({
  selectAllLabel,
  clearAllLabel,
  onSelectAll,
  onClear,
}: Readonly<{
  /** Null hides the action. */
  selectAllLabel: string | null;
  clearAllLabel: string | null;
  onSelectAll: () => void;
  onClear: () => void;
}>) {
  return (
    <span className="ms-auto flex items-center gap-1">
      {selectAllLabel ? (
        <button
          type="button"
          onClick={onSelectAll}
          className="rounded-item px-1.5 py-0.5 font-semibold text-primary-text outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
        >
          {selectAllLabel}
        </button>
      ) : null}
      {clearAllLabel ? (
        <button
          type="button"
          onClick={onClear}
          className="rounded-item px-1.5 py-0.5 font-semibold outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {clearAllLabel}
        </button>
      ) : null}
    </span>
  );
}

type PickerFieldProps = Omit<
  RecordPickerCommonProps,
  'id' | 'invalid' | 'disabled' | 'className' | 'aria-describedby' | 'aria-required'
> & {
  /** Classes for the picker control (the field wrapper takes `className`). */
  pickerClassName?: string;
};

/** RecordPicker bound to the surrounding <Form> (React Hook Form). */
export function RecordPickerField<T extends FieldValues>(
  props: FieldBaseProps<T> &
    PickerFieldProps &
    ({ multiple?: false } | { multiple: true; maxSelected?: number; maxChips?: number }),
) {
  const { name, label, description, required, disabled, className, pickerClassName, ...picker } =
    props;
  return (
    <FormField<T>
      name={name}
      label={label}
      description={description}
      required={required}
      className={className}
      render={({ field, aria }) => {
        const common = {
          ...picker,
          id: aria.id,
          invalid: aria['aria-invalid'],
          'aria-describedby': aria['aria-describedby'],
          'aria-required': aria['aria-required'],
          disabled,
          className: pickerClassName,
          onOpenChange: (open: boolean) => {
            picker.onOpenChange?.(open);
            if (!open) field.onBlur();
          },
        };
        return picker.multiple ? (
          <RecordPicker
            {...common}
            multiple
            value={(field.value as string[] | null | undefined) ?? []}
            onChange={(next) => field.onChange(next)}
          />
        ) : (
          <RecordPicker
            {...common}
            multiple={false}
            value={(field.value as string | null | undefined) ?? null}
            onChange={(next) => {
              field.onChange(next ?? '');
              field.onBlur();
            }}
          />
        );
      }}
    />
  );
}
