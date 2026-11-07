'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { keyed } from '@/shared/lib/keys';

export interface CalendarEvent {
  id: string;
  /** YYYY-MM-DD (local calendar day). */
  date: string;
  title: ReactNode;
  tone?: 'primary' | 'secondary' | 'success' | 'danger' | 'info';
  time?: string;
}

const DOT = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  success: 'bg-success',
  danger: 'bg-danger',
  info: 'bg-info',
} as const;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 6×7 grid of days for the month containing `month`, weeks starting Monday. */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  return Array.from(
    { length: 42 },
    (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + i),
  );
}

/** The selected day is filled, today is ringed, other days highlight on hover. */
function dayClass(selected: boolean, today: boolean): string {
  if (selected) return 'bg-primary font-bold text-primary-foreground';
  return today ? 'font-bold text-primary-text ring-1 ring-primary' : 'hover:bg-hover';
}

/**
 * Month calendar with event dots and an agenda for the selected day.
 * Keyboard: every day is a button; arrows move focus inside the grid.
 */
export function MiniCalendar({
  events,
  locale,
  today = new Date(),
  labels,
  className,
}: Readonly<{
  events: CalendarEvent[];
  locale: string;
  today?: Date;
  labels: { previous: string; next: string; noEvents: string };
  className?: string;
}>) {
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(iso(today));
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [events]);
  const days = monthGrid(month);
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' }),
  );
  const agenda = byDay.get(selected) ?? [];
  const todayIso = iso(today);

  const move = (delta: number) => {
    const d = new Date(`${selected}T00:00:00`);
    d.setDate(d.getDate() + delta);
    setSelected(iso(d));
    if (d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear())
      setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(`[data-day="${iso(d)}"]`)?.focus(),
    );
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          {month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
        </p>
        <div className="flex gap-1">
          {[
            [-1, labels.previous, ChevronLeft],
            [1, labels.next, ChevronRight],
          ].map(([delta, label, Icon]) => {
            const I = Icon as typeof ChevronLeft;
            return (
              <button
                key={String(delta)}
                type="button"
                aria-label={label as string}
                onClick={() =>
                  setMonth((m) => new Date(m.getFullYear(), m.getMonth() + (delta as number), 1))
                }
                className="flex size-7 items-center justify-center rounded-item text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <I className="size-4 rtl:rotate-180" />
              </button>
            );
          })}
        </div>
      </div>
      <div
        role="grid"
        aria-label={month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
        className="grid grid-cols-7 gap-y-1 text-center"
      >
        {keyed(weekdays, (w) => w).map(({ key, item: w }) => (
          <span
            key={key}
            role="columnheader"
            className="pb-1 text-[10px] font-semibold text-subtle-foreground uppercase"
          >
            {w}
          </span>
        ))}
        {days.map((d) => {
          const key = iso(d);
          const inMonth = d.getMonth() === month.getMonth();
          const dayEvents = byDay.get(key) ?? [];
          const isSelected = key === selected;
          const eventCount = dayEvents.length ? ` · ${dayEvents.length}` : '';
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              data-day={key}
              tabIndex={isSelected ? 0 : -1}
              aria-selected={isSelected}
              aria-label={`${d.toLocaleDateString(locale, { dateStyle: 'full' })}${eventCount}`}
              onClick={() => setSelected(key)}
              onKeyDown={(e) => {
                const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
                if (delta) {
                  e.preventDefault();
                  move(delta);
                }
              }}
              className={cn(
                'relative mx-auto flex size-8 flex-col items-center justify-center rounded-item text-xs tabular outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                !inMonth && 'text-subtle-foreground/60',
                dayClass(isSelected, key === todayIso),
              )}
            >
              {d.getDate()}
              {dayEvents.length ? (
                <span className="absolute bottom-0.5 flex gap-0.5" aria-hidden>
                  {dayEvents.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      className={cn(
                        'size-1 rounded-full',
                        isSelected ? 'bg-primary-foreground' : DOT[e.tone ?? 'primary'],
                      )}
                    />
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="border-t border-border pt-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">
          {new Date(`${selected}T00:00:00`).toLocaleDateString(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
        {agenda.length === 0 ? (
          <p className="text-xs text-subtle-foreground">{labels.noEvents}</p>
        ) : (
          <ul className="space-y-1.5">
            {agenda.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span
                  className={cn('size-2 shrink-0 rounded-full', DOT[e.tone ?? 'primary'])}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{e.title}</span>
                {e.time ? (
                  <span className="text-xs text-subtle-foreground tabular">{e.time}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
