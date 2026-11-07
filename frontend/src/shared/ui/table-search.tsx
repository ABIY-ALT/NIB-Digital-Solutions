'use client';

import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/shared/lib/cn';
import { fieldVariants, useFieldAppearance } from './input';
import { useUiSettings, type SearchMode } from './ui-settings';

/**
 * Search box for list toolbars.
 *
 *   <TableSearch value={params.search ?? ''} onChange={(search) => update({ search })}
 *                placeholder={t('searchPlaceholder')} label={tc('search')} />
 *
 * When the query reaches the backend follows app.config `ui.search` (or the
 * `mode` prop for one list):
 *   • "submit" — only when the user clicks the search button (or presses Enter,
 *     unless `submitOnEnter` is off). Typing shows the button as pending.
 *     Escape restores the applied query; ✕ clears and shows every record again.
 *   • "live"   — while typing, debounced by `liveDelayMs`.
 * Queries shorter than `minLength` are not sent (clearing always is).
 */
/**
 * The query to send for `input` given the applied one, or null when nothing
 * should be sent (unchanged, or shorter than `minLength`; clearing always is).
 */
export function searchToSend(input: string, applied: string, minLength = 0): string | null {
  const next = input.trim();
  if (next === applied.trim()) return null;
  if (next.length > 0 && next.length < minLength) return null;
  return next;
}

export interface TableSearchProps {
  /** The applied query (e.g. from the URL). */
  value: string;
  /** Runs the search (receives the trimmed query). */
  onChange: (value: string) => void;
  placeholder: string;
  /** Accessible name of the field. */
  label: string;
  mode?: SearchMode;
  submitOnEnter?: boolean;
  /** Live-mode debounce (ms). */
  delayMs?: number;
  minLength?: number;
  className?: string;
}

export function TableSearch({
  value,
  onChange,
  placeholder,
  label,
  mode: modeProp,
  submitOnEnter: submitOnEnterProp,
  delayMs,
  minLength: minLengthProp,
  className,
}: Readonly<TableSearchProps>) {
  const t = useTranslations('table.search');
  const { search: settings } = useUiSettings();
  const appearance = useFieldAppearance();
  const mode = modeProp ?? settings.mode;
  const submitOnEnter = submitOnEnterProp ?? settings.submitOnEnter;
  const minLength = minLengthProp ?? settings.minLength;
  const liveDelay = delayMs ?? settings.liveDelayMs;

  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  const query = text.trim();
  const tooShort = query.length > 0 && query.length < minLength;
  const pending = query !== value.trim();

  const run = () => {
    const next = searchToSend(text, value, minLength);
    if (next !== null) onChange(next);
  };

  // Live mode: search while typing. A ref keeps inline onChange callbacks from
  // restarting the debounce on every parent render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    if (mode !== 'live' || !pending || tooShort) return;
    const timer = setTimeout(() => onChangeRef.current(query), liveDelay);
    return () => clearTimeout(timer);
  }, [mode, pending, tooShort, query, liveDelay]);

  const clear = () => {
    setText('');
    if (value) onChange('');
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && (mode === 'live' || submitOnEnter)) {
      e.preventDefault();
      run();
    } else if (e.key === 'Escape' && pending) {
      e.preventDefault();
      setText(value);
    }
  };

  const submitMode = mode === 'submit';
  let hint = '';
  if (tooShort) hint = t('tooShort', { min: minLength });
  else if (submitMode) hint = t('hint');
  return (
    <div
      role="search"
      className={cn(
        'group flex h-[30px] w-full items-stretch transition-[width] sm:w-64 sm:focus-within:w-80',
        className,
      )}
    >
      <div className="relative min-w-0 flex-1">
        {submitMode ? null : (
          <Search
            className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-subtle-foreground"
            aria-hidden
          />
        )}
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          aria-label={label}
          aria-invalid={tooShort || undefined}
          aria-describedby={submitMode || tooShort ? hintId : undefined}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className={cn(
            fieldVariants({ appearance }),
            'h-full pe-7 text-xs',
            submitMode ? 'ps-2.5' : 'ps-7',
            submitMode && appearance !== 'underline' && 'rounded-e-none',
          )}
        />
        {text ? (
          <button
            type="button"
            aria-label={t('clear')}
            title={t('clear')}
            onClick={clear}
            className="absolute end-1 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-item text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      {submitMode ? (
        <SearchButton
          label={t('submit')}
          tooShortLabel={t('tooShort', { min: minLength })}
          tooShort={tooShort}
          pending={pending}
          underline={appearance === 'underline'}
          onClick={run}
        />
      ) : null}
      <span id={hintId} className="sr-only" aria-live="polite">
        {hint}
      </span>
    </div>
  );
}

/** Submit mode's search button; filled while the box holds a query not yet searched. */
function SearchButton({
  label,
  tooShortLabel,
  tooShort,
  pending,
  underline,
  onClick,
}: Readonly<{
  label: string;
  tooShortLabel: string;
  tooShort: boolean;
  pending: boolean;
  underline: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={tooShort ? tooShortLabel : label}
      disabled={tooShort}
      data-pending={pending || undefined}
      onClick={onClick}
      className={cn(
        'inline-flex w-9 shrink-0 items-center justify-center border outline-none transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        underline ? 'ms-1 rounded-control' : '-ms-px rounded-e-control',
        pending
          ? 'border-primary bg-primary text-primary-foreground hover:bg-primary-hover'
          : 'border-border bg-surface text-muted-foreground hover:bg-hover hover:text-foreground',
      )}
    >
      <Search className="size-3.5" aria-hidden />
    </button>
  );
}
