'use client';

import {
  Award,
  BookOpenCheck,
  CalendarDays,
  Clock,
  Flame,
  GraduationCap,
  Star,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCurrentUser } from '@/features/auth/components/permissions-provider';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { DonutChart, MiniBars, RadialProgress, TrendChart } from '@/shared/ui/charts';
import { Avatar } from '@/shared/ui/menu';
import {
  CompactTable,
  EntityList,
  HeroCard,
  ProgressBar,
  WidgetCard,
  type CompactColumn,
} from '@/shared/ui/widgets';
import { useDashboardFormat, type DashboardFormat } from '../../hooks/use-dashboard-format';
import type { AcademyDashboard } from '../../types';
import { Figure, GRID, MetricCard, type DashboardViewProps, type Translate } from './parts';

/** Above `good` is on track, above `fair` in progress, below it lagging. */
function progressTone(
  progress: number,
  good: number,
  fair: number,
): 'success' | 'primary' | 'warning' {
  if (progress > good) return 'success';
  return progress > fair ? 'primary' : 'warning';
}

function courseColumns(
  t: Translate,
  f: DashboardFormat,
): CompactColumn<AcademyDashboard['courses'][number]>[] {
  return [
    {
      id: 'title',
      header: t('courses.course'),
      rowHeader: true,
      cell: (c) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{c.title}</span>
          <span className="block text-xs text-subtle-foreground">
            {t('courses.lessons', { count: c.lessons })}
          </span>
        </span>
      ),
    },
    {
      id: 'topic',
      header: t('courses.topic'),
      hideBelow: 'md',
      cell: (c) => <Badge tone="secondary">{t(`topic.${c.topic}`)}</Badge>,
    },
    {
      id: 'learners',
      header: t('courses.learners'),
      align: 'end',
      hideBelow: 'sm',
      cell: (c) => <span className="tabular">{f.count(c.learners)}</span>,
    },
    {
      id: 'progress',
      header: t('courses.progress'),
      className: 'w-40',
      cell: (c) => (
        <span className="flex items-center gap-2">
          <ProgressBar
            value={c.progress}
            tone={progressTone(c.progress, 0.75, 0.35)}
            label={t('courses.progress')}
          />
          <span className="w-9 text-end text-xs tabular">{f.percent(c.progress, 0)}</span>
        </span>
      ),
    },
  ];
}

/** Academy / learning: learner progress, activity, topics, instructors, courses, assignments, webinars. */
export function AcademyDashboardView({
  data,
  range,
}: Readonly<DashboardViewProps<AcademyDashboard>>) {
  const t = useTranslations('dashboards.academy');
  const f = useDashboardFormat();
  const user = useCurrentUser();
  const { learner, kpis } = data;
  // Weekday index (Monday = 0), computed once per visit.
  const [today] = useState(() => (new Date().getDay() + 6) % 7);

  return (
    <div className="space-y-5">
      <div className={GRID.three}>
        <HeroCard
          tone="info"
          eyebrow={t('hero.eyebrow')}
          title={t('hero.title', { name: user?.name.split(' ')[0] ?? '' })}
          description={t('hero.description', { percent: f.percent(learner.completion, 0) })}
          value={t('hero.value', { hours: f.decimal(learner.hours), goal: learner.goalHours })}
          caption={t('hero.caption')}
          visual={<GraduationCap />}
        />
        <WidgetCard title={t('week.title')} description={t('week.description')}>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-2xl font-semibold tabular">
                {f.hours(data.weekHours.reduce((a, b) => a + b, 0))}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                <Flame className="size-3.5" aria-hidden />
                {t('week.streak', { days: learner.streakDays })}
              </p>
            </div>
            <div>
              <MiniBars values={data.weekHours} highlight={today} width={150} height={72} gap={6} />
              <div className="mt-1 flex w-[150px] justify-between" aria-hidden>
                {f.weekdays.map((d) => (
                  <span key={d} className="w-4 text-center text-[9px] text-subtle-foreground">
                    {d.slice(0, 1)}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="text-muted-foreground">{t('week.goal')}</span>
              <span className="font-semibold tabular">
                {f.percent(Math.min(1, learner.hours / learner.goalHours), 0)}
              </span>
            </div>
            <ProgressBar
              value={learner.hours / learner.goalHours}
              tone="info"
              label={t('week.goal')}
            />
          </div>
        </WidgetCard>
        <WidgetCard title={t('topics.title')} description={t('topics.description')}>
          <DonutChart
            title={t('topics.title')}
            data={data.topics.map((s) => ({ label: t(`topic.${s.key}`), value: s.value }))}
            centerLabel={t('topics.hours')}
            centerValue={f.compact(data.topics.reduce((a, s) => a + s.value, 0))}
            formatValue={f.count}
            legend="right"
            size={140}
          />
        </WidgetCard>
      </div>

      <div className={GRID.kpis}>
        <MetricCard
          label={t('kpi.learners')}
          metric={kpis.learners}
          format={f.count}
          range={range}
          icon={<Users />}
          tone="primary"
        />
        <MetricCard
          label={t('kpi.completions')}
          metric={kpis.completions}
          format={f.count}
          range={range}
          icon={<BookOpenCheck />}
          tone="success"
        />
        <MetricCard
          label={t('kpi.avgScore')}
          metric={kpis.avgScore}
          format={(v) => f.decimal(v)}
          range={range}
          icon={<Award />}
          tone="warning"
        />
        <MetricCard
          label={t('kpi.hours')}
          metric={kpis.hours}
          format={f.compact}
          range={range}
          icon={<Clock />}
          tone="info"
        />
      </div>

      <div className={GRID.three}>
        <WidgetCard
          className={GRID.wide}
          title={t('activity.title')}
          description={t('activity.description')}
        >
          <TrendChart
            title={t('activity.title')}
            data={data.activity}
            label={(d) => f.bucket(d.date, data.granularity)}
            series={[
              { key: 'learners', label: t('activity.learners') },
              { key: 'completions', label: t('activity.completions'), color: 'var(--chart-3)' },
            ]}
            variant="line"
            formatValue={f.count}
            formatAxis={f.compact}
            height={280}
          />
        </WidgetCard>
        <WidgetCard title={t('instructors.title')} description={t('instructors.description')}>
          <EntityList
            items={data.instructors.map((i) => ({
              id: i.id,
              leading: <Avatar name={i.name} size={36} />,
              title: i.name,
              subtitle: t('instructors.subtitle', {
                topic: t(`topic.${i.topic}`),
                courses: i.courses,
              }),
              value: t('instructors.students', { count: f.compact(i.students) }),
              meta: (
                <span className="inline-flex items-center gap-0.5">
                  <Star className="size-3 fill-current text-warning" aria-hidden />
                  {f.decimal(i.rating)}
                </span>
              ),
            }))}
          />
        </WidgetCard>
      </div>

      <div className={GRID.three}>
        <WidgetCard
          className={GRID.wide}
          title={t('courses.title')}
          description={t('courses.description')}
          flush
        >
          <CompactTable
            caption={t('courses.title')}
            rows={data.courses}
            rowKey={(c) => c.id}
            columns={courseColumns(t, f)}
          />
        </WidgetCard>
        <WidgetCard title={t('assignments.title')} description={t('assignments.description')}>
          <ul className="space-y-4">
            {data.assignments.map((a) => (
              <li key={a.id} className="flex items-center gap-3">
                <RadialProgress
                  value={a.progress * 100}
                  size={46}
                  thickness={5}
                  tone={progressTone(a.progress, 0.7, 0.4)}
                  label={<span className="text-[11px]">{f.percent(a.progress, 0)}</span>}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('assignments.due', { date: f.shortDate(a.dueAt) })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </WidgetCard>
      </div>

      <section aria-labelledby="academy-webinars" className="space-y-3">
        <h2 id="academy-webinars" className="text-sm font-semibold text-muted-foreground">
          {t('webinars.title')}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.webinars.map((w) => (
            <Card key={w.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary-text">
                <CalendarDays className="size-3.5" aria-hidden />
                {f.dayTime(w.at)}
              </div>
              <p className="text-sm leading-snug font-semibold">{w.title}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Avatar name={w.host} size={22} />
                {w.host}
              </div>
              <dl className="mt-auto grid grid-cols-2 gap-2">
                <Figure
                  label={t('webinars.booked')}
                  value={`${f.count(w.booked)}/${f.count(w.seats)}`}
                />
                <Figure
                  label={t('webinars.left')}
                  value={f.count(w.seats - w.booked)}
                  tone={w.seats - w.booked < w.seats * 0.1 ? 'danger' : undefined}
                />
              </dl>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
