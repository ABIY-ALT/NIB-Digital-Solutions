'use client';

import { CornerDownLeft, Search, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/shared/lib/cn';
import { keyed } from '@/shared/lib/keys';
import { highlightSegments } from '@/shared/lib/fuzzy';
import { Spinner } from './spinner';

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  /** Small trailing tag (status, kind). */
  badge?: ReactNode;
  /** Matched label positions to highlight. */
  indices?: readonly number[];
  /** Trailing content shown only on the active row (e.g. "Open"). */
  hint?: ReactNode;
  /** Optional per-item secondary action (e.g. remove from recent). */
  secondary?: { label: string; icon: ReactNode; onSelect: () => void };
}

export interface CommandGroup {
  id: string;
  label: string;
  items: CommandItem[];
  /** Shown instead of items while this group is loading. */
  loading?: boolean;
}

export interface CommandPaletteLabels {
  title: string;
  placeholder: string;
  close: string;
  navigate: string;
  select: string;
  dismiss: string;
  loading: string;
}

/** The option index after a keyboard move: first, last, or one step (wrapping around). */
function nextIndex(delta: number | 'first' | 'last', index: number, count: number): number {
  if (delta === 'first') return 0;
  if (delta === 'last') return count - 1;
  return (index + delta + count) % count;
}

/**
 * Command palette (⌘K / Ctrl K) — the reusable UI behind quick search:
 * a combobox input over grouped, keyboard-navigable results (↑ ↓ Home End,
 * Enter, Esc), with match highlighting, loading rows and custom idle / empty
 * content. The data and what selecting does belong to the caller.
 */
export function CommandPalette({
  open,
  onOpenChange,
  query,
  onQueryChange,
  groups,
  onSelect,
  labels,
  busy,
  idle,
  empty,
  footer,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (query: string) => void;
  groups: CommandGroup[];
  onSelect: (item: CommandItem) => void;
  labels: CommandPaletteLabels;
  /** Spinner in the input (e.g. server search running). */
  busy?: boolean;
  /** Content below the groups when the query is empty (suggestions). */
  idle?: ReactNode;
  /** Content when a query found nothing. */
  empty?: ReactNode;
  /** Extra footer content (right side). */
  footer?: ReactNode;
}>) {
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = items.find((i) => i.id === activeId) ?? items[0] ?? null;
  const optionId = (id: string) => `${listId}-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  // New results: start from the top.
  useEffect(() => setActiveId(null), [query]);

  // Keep the active option visible.
  useEffect(() => {
    if (!active) return;
    document.getElementById(optionId(active.id))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId is stable per listId
  }, [active?.id]);

  const move = (delta: number | 'first' | 'last') => {
    if (items.length === 0) return;
    const index = active ? items.findIndex((i) => i.id === active.id) : -1;
    setActiveId(items[nextIndex(delta, index, items.length)]!.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return; // IME (e.g. Amharic keyboards) in progress
    if (e.key === 'ArrowDown') move(1);
    else if (e.key === 'ArrowUp') move(-1);
    else if (e.key === 'Home' && e.ctrlKey) move('first');
    else if (e.key === 'End' && e.ctrlKey) move('last');
    else if (e.key === 'Enter' && active) onSelect(active);
    else return;
    e.preventDefault();
  };

  const showEmpty = query.trim() !== '' && items.length === 0 && !groups.some((g) => g.loading);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed start-1/2 top-[10vh] z-50 flex max-h-[80vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 flex-col overflow-hidden rounded-surface border border-border bg-surface shadow-overlay outline-none rtl:translate-x-1/2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:rounded-none max-sm:border-0"
        >
          <DialogPrimitive.Title className="sr-only">{labels.title}</DialogPrimitive.Title>
          <div className="flex shrink-0 items-center gap-3 border-b border-border px-4">
            {busy ? (
              <Spinner size={20} tone="muted" label={labels.loading} />
            ) : (
              <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={active ? optionId(active.id) : undefined}
              aria-label={labels.placeholder}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={labels.placeholder}
              spellCheck={false}
              autoComplete="off"
              className="h-14 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-subtle-foreground"
            />
            {query ? (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                aria-label={labels.dismiss}
                className="rounded-item p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" />
              </button>
            ) : null}
            <DialogPrimitive.Close
              className="hidden rounded-item border border-border px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:block"
              aria-label={labels.close}
            >
              Esc
            </DialogPrimitive.Close>
            <DialogPrimitive.Close
              className="rounded-item p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
              aria-label={labels.close}
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>

          <div // NOSONAR -- combobox popup (WAI-ARIA): <select>/<datalist> cannot show rich, searchable results
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={labels.title}
            className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2"
          >
            {groups.map((group) =>
              group.items.length || group.loading ? (
                <fieldset key={group.id} aria-label={group.label} className="mb-1 min-w-0">
                  <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.label}
                  </div>
                  {group.loading && group.items.length === 0 ? (
                    <div className="space-y-1 px-3 py-1" aria-hidden>
                      {[0, 1].map((i) => (
                        <div key={i} className="flex items-center gap-3 py-1.5">
                          <span className="size-8 animate-pulse rounded-control bg-muted" />
                          <span className="h-3 w-40 animate-pulse rounded-pill bg-muted" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    group.items.map((item) => (
                      <Option
                        key={item.id}
                        id={optionId(item.id)}
                        item={item}
                        active={item.id === active?.id}
                        onHover={() => setActiveId(item.id)}
                        onSelect={() => onSelect(item)}
                      />
                    ))
                  )}
                </fieldset>
              ) : null,
            )}
            {showEmpty ? empty : null}
            {!query.trim() ? idle : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface-muted px-4 py-2 text-[11px] text-muted-foreground max-sm:hidden">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> {labels.navigate}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>
                <CornerDownLeft className="size-3" aria-hidden />
              </Kbd>{' '}
              {labels.select}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Esc</Kbd> {labels.close}
            </span>
            {footer ? <span className="ms-auto">{footer}</span> : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Option({
  id,
  item,
  active,
  onHover,
  onSelect,
}: Readonly<{
  id: string;
  item: CommandItem;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}>) {
  return (
    <div // NOSONAR -- option of the combobox popup above (no native element fits)
      id={id}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onMouseMove={onHover}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        onSelect();
      }}
      className={cn(
        'group relative flex cursor-pointer items-center gap-3 rounded-control px-3 py-2 text-sm',
        active ? 'bg-primary-softer' : 'hover:bg-hover',
      )}
    >
      {active ? (
        <span
          className="absolute inset-y-1.5 start-0 w-[3px] rounded-pill bg-primary"
          aria-hidden
        />
      ) : null}
      {item.icon ? (
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-control [&_svg]:size-4',
            active ? 'bg-primary-soft text-primary-text' : 'bg-muted text-muted-foreground',
          )}
          aria-hidden
        >
          {item.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          <Highlight text={item.label} indices={item.indices} />
        </span>
        {item.description ? (
          <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
        ) : null}
      </span>
      {item.badge ? <span className="shrink-0">{item.badge}</span> : null}
      {item.secondary ? (
        <button
          type="button"
          aria-label={item.secondary.label}
          title={item.secondary.label}
          onClick={(e) => {
            e.stopPropagation();
            item.secondary!.onSelect();
          }}
          className="shrink-0 rounded-item p-1 text-subtle-foreground opacity-0 outline-none group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5"
        >
          {item.secondary.icon}
        </button>
      ) : null}
      {active ? (
        <span className="shrink-0 text-subtle-foreground" aria-hidden>
          {item.hint ?? <CornerDownLeft className="size-3.5 rtl:-scale-x-100" />}
        </span>
      ) : null}
    </div>
  );
}

/** Label with fuzzy-match characters emphasised. */
export function Highlight({
  text,
  indices,
}: Readonly<{ text: string; indices?: readonly number[] }>) {
  if (!indices?.length) return <>{text}</>;
  return (
    <>
      {keyed(highlightSegments(text, indices), (s) => `${s.match ? '+' : '-'}${s.text}`).map(
        ({ key, item: s }) =>
          s.match ? (
            <mark key={key} className="bg-transparent font-bold text-primary-text">
              {s.text}
            </mark>
          ) : (
            <span key={key}>{s.text}</span>
          ),
      )}
    </>
  );
}

export function Kbd({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-item border border-border bg-surface px-1 font-sans text-[11px] font-semibold text-muted-foreground',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
