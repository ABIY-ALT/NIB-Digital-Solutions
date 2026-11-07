'use client';

import { Check, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toaster';
import { MiniCalendar, TaskList, type CalendarEvent } from '@/shared/ui/widgets';
import { createAdvancedDemoData } from '../../demo/mock-data';
import { Panel } from './panel';

const EVENT_TONE: Record<string, CalendarEvent['tone']> = {
  payroll: 'primary',
  holiday: 'danger',
  board: 'secondary',
  maturity: 'info',
  audit: 'success',
  release: 'secondary',
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Operations tab: approval queue with SLA countdowns, and the operations calendar. */
export function OperationsPanel() {
  const t = useTranslations('dashboard.insights.operations');
  const locale = useLocale();
  const demo = useMemo(() => createAdvancedDemoData(), []);
  // Time-relative demo data is computed on the client only (stable within the visit).
  const [now] = useState(() => new Date());
  const [done, setDone] = useState<string[]>([]);
  const money = (v: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'ETB',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(v);

  const tasks = demo.tasks
    .filter((task) => !done.includes(task.id))
    .map((task) => {
      const kind = t(`tasks.${task.kind}`);
      return {
        id: task.id,
        title: `${kind} · ${task.ref}`,
        subtitle: t('tasks.maker', { maker: task.maker }),
        value: task.amount ? money(task.amount) : undefined,
        priority: task.priority,
        dueAt: new Date(now.getTime() + task.dueInMinutes * 60_000),
      };
    });

  const events: CalendarEvent[] = demo.events.map((e) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + e.dayOffset);
    return {
      id: e.id,
      date: iso(d),
      title: t(`calendar.${e.kind}`),
      tone: EVENT_TONE[e.kind],
      time: e.time,
    };
  });

  const decide = (id: string, approved: boolean) => {
    setDone((d) => [...d, id]);
    toast.success(approved ? t('tasks.approved') : t('tasks.rejected'), {
      description: t('tasks.sampleNote'),
    });
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Panel
        className="lg:col-span-2"
        title={t('tasks.title')}
        description={t('tasks.description')}
        action={<Badge tone="danger">{t('tasks.pending', { count: tasks.length })}</Badge>}
      >
        {tasks.length ? (
          <TaskList
            items={tasks}
            labels={{
              priority: { high: t('tasks.high'), medium: t('tasks.medium'), low: t('tasks.low') },
              dueIn: (time) => t('tasks.dueIn', { time }),
              overdue: (time) => t('tasks.overdue', { time }),
            }}
            renderActions={(item) => (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-danger hover:bg-danger-soft"
                  onClick={() => decide(item.id, false)}
                  aria-label={t('tasks.reject')}
                >
                  <X />
                </Button>
                <Button size="sm" className="h-7 px-2.5" onClick={() => decide(item.id, true)}>
                  <Check /> {t('tasks.approve')}
                </Button>
              </>
            )}
          />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('tasks.empty')}</p>
        )}
      </Panel>
      <Panel title={t('calendar.title')} description={t('calendar.description')}>
        <MiniCalendar
          events={events}
          locale={locale}
          today={now}
          labels={{
            previous: t('calendar.previous'),
            next: t('calendar.next'),
            noEvents: t('calendar.noEvents'),
          }}
        />
      </Panel>
    </div>
  );
}
