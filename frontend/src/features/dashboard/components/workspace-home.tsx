'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarCheck,
  Clock,
  ExternalLink,
  Eye,
  Inbox,
  Lightbulb,
  MessageCircleQuestionMark,
  PlayCircle,
  Plus,
  Star,
  Trophy,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { useCurrentUser, usePermissions } from '@/features/auth/components/permissions-provider';
import {
  LeadStatusBadge,
  useLeadOwners,
  type LeadKind,
} from '@/features/marketplace-admin/components/lead-list';
import {
  analyticsKey,
  Ranked,
} from '@/features/marketplace-admin/components/marketplace-analytics';
import type { MarketplaceAnalytics } from '@/features/marketplace/types';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { cn } from '@/shared/lib/cn';
import { formatDate, formatNumber } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { BarChart, TrendChart } from '@/shared/ui/charts';
import { Skeleton } from '@/shared/ui/feedback';
import { RelativeTime } from '@/shared/ui/relative-time';
import { StatStrip } from '@/shared/ui/stat-strip';
import { WAITING_AFTER_MS, type DigitalSolutionsWorkspace, type WorkspaceLead } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Staff home page of NIB Digital Solutions: what needs attention now, the
// website and pipeline figures of a reporting period, the latest leads, top
// products and the catalogue. Each part shows only when the user may read it.
// Counts come from GET /api/dashboard; figures from the marketplace analytics
// (same query as the Analytics page, so both share one cache entry).
// ─────────────────────────────────────────────────────────────────────────────

const PERIODS = [7, 30, 90] as const;
type Period = (typeof PERIODS)[number];

/** Pipeline statuses in workflow order, each with its colour (also told apart by lightness). */
const PIPELINE = [
  ['new', 'bg-primary'],
  ['contacted', 'bg-[#c08a5e]'],
  ['scheduled', 'bg-info'],
  ['completed', 'bg-[#2a9d8f]'],
  ['qualified', 'bg-secondary'],
  ['closed_won', 'bg-success'],
  ['closed_lost', 'bg-border-strong'],
] as const;

const TOP_TABS = ['viewed', 'requested', 'watched'] as const;
type TopTab = (typeof TOP_TABS)[number];

const pct = (part: number, whole: number) => {
  if (!whole) return '0%';
  const value = (part / whole) * 100;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}%`;
};

export function WorkspaceHome({
  workspace,
  productNames,
}: Readonly<{ workspace: DigitalSolutionsWorkspace; productNames: Record<string, string> }>) {
  const t = useTranslations('dashboard');
  const tw = useTranslations('dashboard.workspace');
  const user = useCurrentUser();
  const { can } = usePermissions();
  const [days, setDays] = useState<Period>(30);
  const showFigures = can('marketplace-analytics:read');
  const firstName = user?.name.split(' ')[0] ?? '';
  const productName = (slug: string | null) => (slug ? (productNames[slug] ?? slug) : null);

  const analytics = useQuery({
    queryKey: [...analyticsKey, days],
    queryFn: async ({ signal }) =>
      (
        await apiFetch<MarketplaceAnalytics>('/api/marketplace/admin/analytics', {
          query: { days },
          signal,
          background: true,
        })
      ).data,
    enabled: showFigures,
    // Keep the current figures on screen while another period loads.
    placeholderData: (previous) => previous,
  });
  const figures = showFigures ? analytics.data : undefined;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] leading-tight font-semibold">
            {t('greeting', { name: firstName })}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showFigures ? (
            <div
              role="group"
              aria-label={tw('figures.period')}
              className="inline-flex rounded-control border border-border-strong bg-surface p-0.5"
            >
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDays(p)}
                  aria-pressed={days === p}
                  className={cn(
                    'h-7 rounded-control px-3 text-xs font-semibold transition-colors',
                    days === p
                      ? 'bg-primary-soft text-primary-text'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tw('figures.days', { count: p })}
                </button>
              ))}
            </div>
          ) : null}
          <Button variant="outline" asChild>
            <a href="/" target="_blank" rel="noreferrer">
              <ExternalLink /> {tw('viewWebsite')}
            </a>
          </Button>
          {can('digital-products:create') ? (
            <Button asChild>
              <Link href="/digital-products/new">
                <Plus /> {tw('addProduct')}
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <Attention workspace={workspace} />

      {showFigures ? <Figures data={figures} failed={!!analytics.error} days={days} /> : null}

      {showFigures ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <ViewsAndLeads data={figures} />
          <Pipeline data={figures} />
        </div>
      ) : null}

      {workspace.latestLeads || showFigures ? (
        <div
          className={cn(
            'grid items-start gap-4',
            workspace.latestLeads && showFigures && 'xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]',
          )}
        >
          {workspace.latestLeads ? (
            <LatestLeads leads={workspace.latestLeads} productName={productName} />
          ) : null}
          {showFigures ? <TopProducts data={figures} productName={productName} /> : null}
        </div>
      ) : null}

      {showFigures || workspace.catalogue ? (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {showFigures ? <Sources data={figures} /> : null}
          {showFigures ? <Owners data={figures} /> : null}
          {workspace.catalogue ? <Catalogue catalogue={workspace.catalogue} /> : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Needs your attention ─────────────────────────────────────────────────────

function Attention({ workspace }: Readonly<{ workspace: DigitalSolutionsWorkspace }>) {
  const tw = useTranslations('dashboard.workspace.attention');
  const { demoRequests, inquiries, ideas, questions, reviews } = workspace;
  if (!demoRequests && !inquiries && !ideas && !questions && !reviews) return null;
  return (
    <section aria-labelledby="attention-title">
      <h2 id="attention-title" className="mb-3 text-[15px] font-semibold">
        {tw('title')}
      </h2>
      <div
        className={cn(
          'grid gap-4 sm:grid-cols-2',
          reviews ? 'xl:grid-cols-3 2xl:grid-cols-5' : 'xl:grid-cols-4',
        )}
      >
        {demoRequests ? (
          <AttentionCard
            href="/demo-requests?filter[status]=new&sort=createdAt:asc"
            icon={<CalendarCheck />}
            tone="bg-primary-soft text-primary-text"
            count={demoRequests.new}
            title={tw('demo.title')}
            detail={tw('waiting', { count: demoRequests.waiting })}
            urgent={demoRequests.waiting > 0}
            link={tw('demo.link')}
          />
        ) : null}
        {inquiries ? (
          <AttentionCard
            href="/product-inquiries?filter[status]=new&sort=createdAt:asc"
            icon={<Inbox />}
            tone="bg-secondary-soft text-secondary"
            count={inquiries.new}
            title={tw('inquiries.title')}
            detail={tw('waiting', { count: inquiries.waiting })}
            urgent={inquiries.waiting > 0}
            link={tw('inquiries.link')}
          />
        ) : null}
        {ideas ? (
          <AttentionCard
            href="/product-ideas?filter[status]=in:submitted,under_review"
            icon={<Lightbulb />}
            tone="bg-info-soft text-info"
            count={ideas.submitted + ideas.underReview}
            title={tw('ideas.title')}
            detail={tw('ideas.detail', {
              submitted: ideas.submitted,
              underReview: ideas.underReview,
            })}
            link={tw('ideas.link')}
          />
        ) : null}
        {questions ? (
          <AttentionCard
            href="/product-questions?filter[status]=in:open,in_progress"
            icon={<MessageCircleQuestionMark />}
            tone="bg-success-soft text-success"
            count={questions.open + questions.inProgress}
            title={tw('questions.title')}
            detail={tw('questions.detail', {
              open: questions.open,
              inProgress: questions.inProgress,
            })}
            link={tw('questions.link')}
          />
        ) : null}
        {reviews ? (
          <AttentionCard
            href="/product-reviews?filter[status]=pending&sort=createdAt:asc"
            icon={<Star />}
            tone="bg-warning-soft text-warning"
            count={reviews.pending}
            title={tw('reviews.title')}
            detail={tw('reviews.detail')}
            link={tw('reviews.link')}
          />
        ) : null}
      </div>
    </section>
  );
}

function AttentionCard({
  href,
  icon,
  tone,
  count,
  title,
  detail,
  urgent = false,
  link,
}: Readonly<{
  href: string;
  icon: ReactNode;
  tone: string;
  count: number;
  title: string;
  detail: string;
  urgent?: boolean;
  link: string;
}>) {
  const locale = useLocale();
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-surface border border-border bg-surface p-4 shadow-raised transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-border-strong hover:shadow-overlay focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    >
      <span className="flex items-center justify-between">
        <span
          className={cn(
            'flex size-9 items-center justify-center rounded-control [&_svg]:size-[18px]',
            tone,
          )}
          aria-hidden
        >
          {icon}
        </span>
        <span className="text-3xl leading-none font-bold tabular">
          {formatNumber(count, locale)}
        </span>
      </span>
      <span className="mt-3.5 font-semibold">{title}</span>
      <span
        className={cn(
          'mt-1 flex items-center gap-1.5 text-xs',
          urgent ? 'font-medium text-warning' : 'text-muted-foreground',
        )}
      >
        {urgent ? <Clock className="size-3.5" aria-hidden /> : null}
        {detail}
      </span>
      <span className="mt-3.5 inline-flex items-center gap-1 text-[13px] font-semibold text-primary-text">
        {link}
        <ArrowRight
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </Link>
  );
}

// ── Website and pipeline figures ─────────────────────────────────────────────

function Figures({
  data,
  failed,
  days,
}: Readonly<{ data: MarketplaceAnalytics | undefined; failed: boolean; days: Period }>) {
  const t = useTranslations('marketplaceAdmin.analytics');
  const tw = useTranslations('dashboard.workspace.figures');
  const locale = useLocale();
  return (
    <section aria-labelledby="figures-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="figures-title" className="text-[15px] font-semibold">
          {tw('title')}
        </h2>
        <span className="text-xs text-muted-foreground">{t(`periods.${days}`)}</span>
      </div>
      {failed && !data ? (
        <p className="rounded-surface border border-border bg-surface p-4 text-sm text-muted-foreground">
          {tw('error')}
        </p>
      ) : !data ? (
        <Skeleton className="h-[92px] rounded-surface" />
      ) : (
        <StatStrip
          items={[
            {
              id: 'views',
              label: t('stats.views'),
              value: formatNumber(data.productViews, locale),
              icon: <Eye />,
              tone: 'info',
              hint: tw('viewsHint'),
            },
            {
              id: 'plays',
              label: t('stats.plays'),
              value: formatNumber(data.demoPlays, locale),
              icon: <PlayCircle />,
              tone: 'primary',
              hint: t('stats.playsHint', { rate: pct(data.demoPlays, data.productViews) }),
            },
            {
              id: 'demos',
              label: t('stats.demoRequests'),
              value: formatNumber(data.demoRequests, locale),
              icon: <CalendarCheck />,
              tone: 'success',
              hint: tw('received'),
            },
            {
              id: 'inquiries',
              label: t('stats.inquiries'),
              value: formatNumber(data.inquiries, locale),
              icon: <Inbox />,
              tone: 'info',
              hint: tw('received'),
            },
            {
              id: 'conversion',
              label: t('stats.conversion'),
              value: pct(data.demoRequests + data.inquiries, data.productViews),
              icon: <Workflow />,
              tone: 'secondary',
              hint: t('stats.conversionHint'),
            },
            {
              id: 'won',
              label: t('stats.won'),
              value: pct(data.leadsByStatus.closed_won, data.demoRequests + data.inquiries),
              icon: <Trophy />,
              tone: 'success',
              hint: t('stats.wonHint', {
                won: data.leadsByStatus.closed_won,
                leads: data.demoRequests + data.inquiries,
              }),
            },
          ]}
        />
      )}
    </section>
  );
}

function ViewsAndLeads({ data }: Readonly<{ data: MarketplaceAnalytics | undefined }>) {
  const t = useTranslations('marketplaceAdmin.analytics');
  const tw = useTranslations('dashboard.workspace');
  const locale = useLocale();
  const day = (d: { date: string }) =>
    formatDate(d.date, locale, { day: 'numeric', month: 'short' });
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{tw('chart.title')}</CardTitle>
          <CardDescription>{tw('chart.perDay')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data ? (
          <Skeleton className="h-[330px]" />
        ) : (
          <>
            <TrendChart
              title={t('viewsChart')}
              data={data.daily}
              label={day}
              series={[{ key: 'views', label: t('views') }]}
              value={(d) => d.views}
              variant="area"
              height={200}
            />
            <BarChart
              title={t('leadsChart')}
              data={data.daily}
              label={day}
              series={[{ key: 'leads', label: t('leads') }]}
              value={(d) => d.leads}
              height={120}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Pipeline({ data }: Readonly<{ data: MarketplaceAnalytics | undefined }>) {
  const t = useTranslations('marketplaceAdmin');
  const tw = useTranslations('dashboard.workspace');
  const locale = useLocale();
  const total = data ? PIPELINE.reduce((sum, [s]) => sum + data.leadsByStatus[s], 0) : 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics.pipeline')}</CardTitle>
        {data ? (
          <span className="text-xs text-muted-foreground">
            {tw('leadsCount', { count: total })}
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        {!data ? (
          <Skeleton className="h-60" />
        ) : (
          <>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              {PIPELINE.map(([status, color]) =>
                data.leadsByStatus[status] ? (
                  <span
                    key={status}
                    className={color}
                    style={{ width: `${(data.leadsByStatus[status] / total) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
            <ul className="mt-4 space-y-2.5">
              {PIPELINE.map(([status, color]) => (
                <li key={status} className="flex items-center gap-2.5 text-sm">
                  <span className={cn('size-2.5 rounded-[3px]', color)} aria-hidden />
                  <span className="flex-1">{t(`status.${status}`)}</span>
                  <span className="font-semibold tabular">
                    {formatNumber(data.leadsByStatus[status], locale)}
                  </span>
                  <span className="w-11 text-end text-xs text-muted-foreground tabular">
                    {pct(data.leadsByStatus[status], total)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Latest leads ─────────────────────────────────────────────────────────────

function LatestLeads({
  leads,
  productName,
}: Readonly<{ leads: WorkspaceLead[]; productName: (slug: string | null) => string | null }>) {
  const tw = useTranslations('dashboard.workspace.latest');
  const tl = useTranslations('marketplaceAdmin.leads');
  const tm = useTranslations('marketplace');
  const locale = useLocale();
  const { can } = usePermissions();
  const owners = (kind: LeadKind) => leads.filter((l) => l.kind === kind).map((l) => l.assignedTo);
  const demoOwner = useLeadOwners('demo', owners('demo'));
  const inquiryOwner = useLeadOwners('inquiry', owners('inquiry'));
  const [now] = useState(() => Date.now());

  const typeLabel = (lead: WorkspaceLead) => {
    const kind = lead.kind === 'demo' ? tw('demo') : tw('inquiry');
    const key = lead.kind === 'demo' ? `demoType.${lead.type}` : `inquiryType.${lead.type}`;
    return lead.type && tm.has(key) ? `${kind} · ${tm(key)}` : kind;
  };
  const listPath = (lead: WorkspaceLead) =>
    lead.kind === 'demo' ? '/demo-requests' : '/product-inquiries';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tw('title')}</CardTitle>
        <div className="flex flex-wrap gap-3 text-[13px] font-semibold">
          {can('demo-requests:read') ? (
            <Link href="/demo-requests" className="text-primary-text hover:underline">
              {tw('allDemos')}
            </Link>
          ) : null}
          {can('product-inquiries:read') ? (
            <Link href="/product-inquiries" className="text-primary-text hover:underline">
              {tw('allInquiries')}
            </Link>
          ) : null}
        </div>
      </CardHeader>
      {!leads.length ? (
        <p className="px-5 pb-6 text-sm text-muted-foreground">{tw('empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs text-muted-foreground">
                <th scope="col" className="px-5 py-2 text-start font-semibold">
                  {tw('reference')}
                </th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  {tw('contact')}
                </th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  {tw('product')}
                </th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  {tw('status')}
                </th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  {tw('received')}
                </th>
                <th scope="col" className="py-2 ps-3 pe-5 text-start font-semibold">
                  {tw('owner')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leads.map((lead) => {
                const owner =
                  lead.kind === 'demo' ? demoOwner(lead.assignedTo) : inquiryOwner(lead.assignedTo);
                const waiting =
                  lead.status === 'new' && now - Date.parse(lead.createdAt) > WAITING_AFTER_MS;
                return (
                  <tr key={`${lead.kind}-${lead.id}`} className="hover:bg-hover">
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <Link
                        href={`${listPath(lead)}?search=${encodeURIComponent(lead.reference)}`}
                        className="font-semibold text-primary-text tabular hover:underline"
                      >
                        {lead.reference}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{typeLabel(lead)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="block font-medium">{lead.name}</span>
                      {lead.organization ? (
                        <span className="block text-xs text-muted-foreground">
                          {lead.organization}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      {productName(lead.productSlug) ?? (
                        <span className="text-muted-foreground">{tl('general')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <LeadStatusBadge status={lead.status} />
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2.5 whitespace-nowrap',
                        waiting ? 'font-medium text-warning' : 'text-muted-foreground',
                      )}
                    >
                      <RelativeTime value={lead.createdAt} locale={locale} />
                    </td>
                    <td
                      className={cn(
                        'py-2.5 ps-3 pe-5 whitespace-nowrap',
                        !owner && 'font-medium text-warning',
                      )}
                    >
                      {owner ?? tl('unassigned')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Top products, sources, owners, catalogue ────────────────────────────────

function TopProducts({
  data,
  productName,
}: Readonly<{
  data: MarketplaceAnalytics | undefined;
  productName: (slug: string | null) => string | null;
}>) {
  const tw = useTranslations('dashboard.workspace');
  const [tab, setTab] = useState<TopTab>('viewed');
  const rows = data
    ? {
        viewed: data.topViewed,
        requested: data.topRequested,
        watched: data.topWatched,
      }[tab]
    : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tw('top.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          role="group"
          aria-label={tw('top.title')}
          className="-mt-1 mb-4 flex flex-wrap gap-1 border-b border-border"
        >
          {TOP_TABS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={cn(
                '-mb-px border-b-2 px-2 pb-2 text-xs font-semibold transition-colors',
                tab === key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tw(`top.${key}`)}
            </button>
          ))}
        </div>
        {!data ? (
          <Skeleton className="h-48" />
        ) : (
          <>
            <Ranked
              rows={rows
                .slice(0, 5)
                .map((r) => ({ label: productName(r.slug) ?? r.slug, value: r.count }))}
              empty={tw('empty')}
            />
            <p className="mt-4 text-xs text-muted-foreground">{tw(`top.${tab}Hint`)}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Sources({ data }: Readonly<{ data: MarketplaceAnalytics | undefined }>) {
  const t = useTranslations('marketplaceAdmin');
  const tw = useTranslations('dashboard.workspace');
  const label = (source: string) =>
    source === 'unknown' || !t.has(`leads.sources.${source}`)
      ? t('analytics.unknownSource')
      : t(`leads.sources.${source}`);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t('analytics.bySource')}</CardTitle>
          <CardDescription>{t('analytics.bySourceHint')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {!data ? (
          <Skeleton className="h-40" />
        ) : (
          <Ranked
            rows={data.leadsBySource.map((r) => ({ label: label(r.source), value: r.count }))}
            empty={tw('empty')}
          />
        )}
      </CardContent>
    </Card>
  );
}

function Owners({ data }: Readonly<{ data: MarketplaceAnalytics | undefined }>) {
  const t = useTranslations('marketplaceAdmin');
  const tw = useTranslations('dashboard.workspace');
  const ownerName = useLeadOwners(
    'demo',
    (data?.openByOwner ?? []).map((o) => o.ownerId),
  );
  const unassigned = data?.openByOwner.find((o) => !o.ownerId)?.count ?? 0;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t('analytics.byOwner')}</CardTitle>
          <CardDescription>{t('analytics.byOwnerHint')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {!data ? (
          <Skeleton className="h-40" />
        ) : (
          <>
            <Ranked
              rows={data.openByOwner.map((r) => ({
                label: ownerName(r.ownerId) ?? t('leads.unassigned'),
                value: r.count,
              }))}
              empty={tw('empty')}
            />
            {unassigned > 0 ? (
              <Link
                href="/demo-requests?filter[status]=new&sort=createdAt:asc"
                className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-primary-text hover:underline"
              >
                {tw('owners.assign')} <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Catalogue({
  catalogue,
}: Readonly<{ catalogue: NonNullable<DigitalSolutionsWorkspace['catalogue']> }>) {
  const tw = useTranslations('dashboard.workspace.catalogue');
  const locale = useLocale();
  const { can } = usePermissions();
  const tile = (value: ReactNode, label: string) => (
    <div className="rounded-surface border border-border bg-surface-muted p-3">
      <p className="text-xl font-bold tabular">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{tw('title')}</CardTitle>
          <CardDescription>{tw('hint')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2.5">
          {tile(
            <>
              {formatNumber(catalogue.published, locale)}
              <span className="text-sm font-medium text-muted-foreground">
                {' '}
                / {formatNumber(catalogue.total, locale)}
              </span>
            </>,
            tw('published'),
          )}
          {tile(formatNumber(catalogue.comingSoon, locale), tw('comingSoon'))}
          {tile(formatNumber(catalogue.pilot, locale), tw('pilot'))}
          {catalogue.heroSlides !== null
            ? tile(formatNumber(catalogue.heroSlides, locale), tw('heroSlides'))
            : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-[13px] font-semibold">
          <Link href="/digital-products" className="text-primary-text hover:underline">
            {tw('manageProducts')}
          </Link>
          {can('hero-slides:read') ? (
            <Link href="/hero-slides" className="text-primary-text hover:underline">
              {tw('heroCarousel')}
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
