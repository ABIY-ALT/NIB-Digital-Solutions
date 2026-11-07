'use client';

import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  ClipboardCheck,
  Cpu,
  Handshake,
  Hammer,
  Layers,
  Lightbulb,
  Mail,
  MapPin,
  MessageSquarePlus,
  Phone,
  Plug,
  Rocket,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  ThumbsUp,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { useIdeas } from '../../hooks/use-ideas';
import { iconFor } from '../../icons';
import { VERIFIED_IMPACT } from '../../showcase';
import { SITE_CONTACT } from '../../site-config';
import { isUpcoming } from '../../taxonomy';
import type { MarketplaceProduct, Platform } from '../../types';
import { InquiryForm } from './forms';
import { IdeaCard } from './ideas-page';
import { useMarketplace } from './marketplace-provider';
import { CountUp, Reveal, SiteButton, SiteSkeleton } from './primitives';
import { ProductCard, ProductIcon } from './product-card';
import { ProductScreen } from './product-screen';

export function SectionHeader({
  eyebrow,
  title,
  lead,
  action,
  dark,
  center,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  action?: ReactNode;
  dark?: boolean;
  center?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-6',
        center ? 'items-center text-center' : 'md:flex-row md:items-end md:justify-between',
      )}
    >
      <Reveal className={cn(center && 'flex flex-col items-center')}>
        <p className={cn('eyebrow', dark && 'text-gold-300! before:bg-gold-300!')}>{eyebrow}</p>
        <h2
          className={cn(
            'section-title mt-4 max-w-3xl text-balance',
            dark && 'text-white!',
            center && 'mx-auto',
          )}
        >
          {title}
        </h2>
        {lead && (
          <p className={cn('section-lead', dark && 'text-white/70!', center && 'mx-auto')}>
            {lead}
          </p>
        )}
      </Reveal>
      {action ? <Reveal delay={120}>{action}</Reveal> : null}
    </div>
  );
}

/** Gold icon tile used across the homepage. */
function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      className={cn(
        'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-300 to-gold-500 text-brown-800 shadow-[0_8px_20px_-10px_rgb(253_185_19/0.9)] transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:rotate-[-4deg]',
        className,
      )}
    >
      <Icon className="h-[22px] w-[22px]" aria-hidden />
    </span>
  );
}

// ── About our office ─────────────────────────────────────────────────────────

export function AboutOffice() {
  const t = useTranslations('marketplace');
  const { products, categories } = useMarketplace();
  const areas = categories.filter((c) => products.some((p) => p.categoryCode === c.code)).length;
  const principles = [
    { icon: Workflow, key: 'automation' },
    { icon: Cpu, key: 'connected' },
    { icon: ShieldCheck, key: 'trust' },
    { icon: Handshake, key: 'partnership' },
  ] as const;
  return (
    <section id="about" className="relative scroll-mt-20 overflow-hidden py-24 sm:py-32">
      <div
        className="absolute top-1/3 -left-40 -z-10 h-[30rem] w-[30rem] rounded-full bg-gold-100/60 blur-3xl motion-safe:animate-drift-slow"
        aria-hidden
      />
      <div className="container-x grid gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <p className="eyebrow">{t('home.about.eyebrow')}</p>
          <h2 className="section-title mt-4 text-balance">{t('info.about.title')}</h2>
          <p className="mt-7 text-lg leading-relaxed text-charcoal">{t('info.about.lead')}</p>
          <p className="mt-4 leading-relaxed text-charcoal/70">{t('info.about.missionText')}</p>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <SiteButton
              href="/about"
              variant="secondary"
              iconRight={<ArrowRight className="h-4 w-4" />}
            >
              {t('home.about.more')}
            </SiteButton>
            {products.length > 0 && (
              <p className="flex items-center gap-2 text-sm font-semibold text-brown-700">
                <span className="h-2 w-2 rounded-full bg-gold-500" aria-hidden />
                {t('home.about.reach', { products: products.length, areas })}
              </p>
            )}
          </div>
        </Reveal>
        <ul className="grid content-start gap-4 sm:grid-cols-2 sm:gap-5">
          {principles.map(({ icon, key }, i) => (
            <Reveal
              as="li"
              key={key}
              variant="scale"
              delay={i * 90}
              className={cn(i % 2 === 1 && 'sm:translate-y-8')}
            >
              <div className="card-accent group relative h-full overflow-hidden rounded-3xl border border-line bg-white p-7 shadow-tile transition-all duration-500 hover:-translate-y-1 hover:border-gold-200 hover:shadow-card-hover">
                <span
                  className="absolute top-5 right-6 font-display text-4xl font-extrabold text-brown-100 transition-colors duration-500 group-hover:text-gold-200"
                  aria-hidden
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <IconTile icon={icon} />
                <h3 className="mt-6 text-lg font-bold">
                  {t(`info.about.principles.${key}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal/75">
                  {t(`info.about.principles.${key}.text`)}
                </p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ── Our digital products (filter by category) ───────────────────────────────

export function ProductsShowcase() {
  const t = useTranslations('marketplace.home');
  const { products, categories } = useMarketplace();
  const [tab, setTab] = useState('all');
  const [changed, setChanged] = useState(false);
  // Launched products only: upcoming ones have their own "Coming soon" section.
  const launched = useMemo(() => products.filter((p) => !isUpcoming(p)), [products]);
  const ordered = useMemo(
    () => [...launched].sort((a, b) => Number(b.featured) - Number(a.featured)),
    [launched],
  );
  const tabs = useMemo(
    () => [
      { id: 'all', label: t('products.all'), count: launched.length },
      ...[...categories]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => ({
          id: c.code,
          label: c.name,
          count: launched.filter((p) => p.categoryCode === c.code).length,
        }))
        .filter((x) => x.count > 0),
    ],
    [categories, launched, t],
  );
  const shown = tab === 'all' ? ordered.slice(0, 6) : ordered.filter((p) => p.categoryCode === tab);

  const select = (id: string) => {
    setTab(id);
    setChanged(true);
  };
  // Arrow keys move between the filter tabs (WAI-ARIA tabs pattern).
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = tabs.findIndex((x) => x.id === tab);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]!;
    select(next.id);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus();
  };

  return (
    <section id="products" className="relative scroll-mt-20 bg-cream py-24 sm:py-32">
      <div
        className="honeycomb-bg absolute inset-x-0 top-0 h-80 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent)]"
        aria-hidden
      />
      <div className="container-x relative">
        <SectionHeader
          eyebrow={t('products.eyebrow')}
          title={t('products.title')}
          lead={t('featured.lead')}
          action={
            <SiteButton
              href={tab === 'all' ? '/products' : `/products?category=${tab}`}
              variant="outline"
              iconRight={<ArrowRight className="h-4 w-4" />}
            >
              {tab === 'all'
                ? t('products.viewAll', { count: products.length })
                : t('products.openCatalog')}
            </SiteButton>
          }
        />
        <Reveal delay={80} className="mt-12">
          <div
            role="tablist"
            aria-label={t('products.filterLabel')}
            onKeyDown={onTabKey}
            className="scroll-fade -mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:[mask-image:none]"
          >
            {tabs.map((x) => {
              const active = tab === x.id;
              return (
                <button
                  key={x.id}
                  type="button"
                  role="tab"
                  data-tab={x.id}
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => select(x.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-full py-2 pr-2.5 pl-4 text-sm font-semibold transition-all duration-300',
                    active
                      ? 'bg-brown-600 text-white shadow-[0_10px_24px_-12px_rgb(138_77_31/0.9)]'
                      : 'bg-white text-charcoal ring-1 ring-line hover:-translate-y-px hover:text-brown-900 hover:ring-gold-300',
                  )}
                >
                  {x.label}
                  <span
                    className={cn(
                      'min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs tabular-nums',
                      active ? 'bg-gold-500 text-brown-900' : 'bg-cream text-brown-700',
                    )}
                  >
                    {x.count}
                  </span>
                </button>
              );
            })}
          </div>
        </Reveal>
        <div
          key={tab}
          role="tabpanel"
          aria-label={tabs.find((x) => x.id === tab)?.label}
          className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-7"
        >
          {shown.map((p, i) =>
            changed ? (
              <div
                key={p.slug}
                className="animate-scale-up"
                style={{ animationDelay: `${Math.min(i, 5) * 70}ms` }}
              >
                <ProductCard product={p} source="homepage" />
              </div>
            ) : (
              <Reveal key={p.slug} variant="scale" delay={(i % 3) * 90}>
                <ProductCard product={p} source="homepage" />
              </Reveal>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

// ── Product categories: by business function or by industry ─────────────────

export function ProductCategories() {
  const t = useTranslations('marketplace.home.categories');
  const [view, setView] = useState<'need' | 'industry'>('need');
  return (
    <section id="categories" className="scroll-mt-20 py-24 sm:py-32">
      <div className="container-x">
        <SectionHeader
          eyebrow={t('eyebrow')}
          title={t('title')}
          action={
            <div
              className="inline-flex rounded-full bg-cream p-1 ring-1 ring-line"
              role="group"
              aria-label={t('label')}
            >
              {(['need', 'industry'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={view === id}
                  onClick={() => setView(id)}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-semibold transition',
                    view === id
                      ? 'bg-white text-brown-900 shadow-tile'
                      : 'text-charcoal/70 hover:text-brown-900',
                  )}
                >
                  {id === 'need' ? t('byNeed') : t('byIndustry')}
                </button>
              ))}
            </div>
          }
        />
        <div key={view} className="mt-12 animate-fade-in">
          {view === 'need' ? <ByNeed /> : <ByIndustry />}
        </div>
      </div>
    </section>
  );
}

function ByNeed() {
  const t = useTranslations('marketplace');
  const { products, taxonomy } = useMarketplace();
  const [selected, setSelected] = useState<string | null>(null);
  const current = taxonomy.needs.find((n) => n.id === selected) ?? taxonomy.needs[0];
  const active = current?.id ?? '';
  const related = useMemo(
    () => products.filter((p) => p.needs.includes(active)),
    [products, active],
  );
  if (!current) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div
        className="flex flex-col gap-1.5"
        role="tablist"
        aria-label={t('home.needs.label')}
        aria-orientation="vertical"
      >
        {taxonomy.needs.map((n) => {
          const Icon = iconFor(n.icon);
          const isActive = n.id === active;
          return (
            <button
              key={n.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSelected(n.id)}
              className={cn(
                'flex items-center gap-3.5 rounded-2xl px-4 py-3 text-left transition-all',
                isActive
                  ? 'bg-white shadow-tile ring-1 ring-gold-200'
                  : 'text-charcoal hover:bg-cream',
              )}
            >
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition',
                  isActive
                    ? 'bg-gold-500 text-brown-900'
                    : 'bg-cream text-brown-600 ring-1 ring-line',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className={cn('flex-1 font-semibold', isActive && 'text-brown-900')}>
                {n.name}
              </span>
              <span className="text-xs font-semibold text-charcoal/40 tabular-nums">
                {products.filter((p) => p.needs.includes(n.id)).length}
              </span>
            </button>
          );
        })}
      </div>
      <div
        key={active}
        role="tabpanel"
        className="animate-fade-in rounded-3xl bg-cream p-6 ring-1 ring-line sm:p-8"
      >
        <h3 className="text-2xl font-bold">{current.name}</h3>
        <p className="mt-2 max-w-2xl text-charcoal/70">{current.description}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {related.map((p, i) => (
            <Link
              key={p.slug}
              href={`/products/${p.slug}`}
              className="group flex animate-fade-up items-start gap-3.5 rounded-2xl bg-white p-4 ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-card-hover hover:ring-gold-200"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <ProductIcon product={p} />
              <div className="min-w-0">
                <p className="font-semibold text-brown-900 group-hover:underline">{p.name}</p>
                <p className="mt-1 line-clamp-2 text-sm text-charcoal/70">{p.summary}</p>
              </div>
            </Link>
          ))}
        </div>
        <Link
          href={`/products?need=${active}`}
          className="group mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brown-700 hover:text-brown-900"
        >
          {t('home.needs.more')}{' '}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

function ByIndustry() {
  const t = useTranslations('marketplace');
  const { products, taxonomy } = useMarketplace();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {taxonomy.industries.map((ind, i) => {
        const Icon = iconFor(ind.icon);
        const list = products.filter((p) => p.industries.includes(ind.id));
        return (
          <Link
            key={ind.id}
            href={`/products?industry=${ind.id}`}
            className="card-accent group flex h-full animate-fade-up flex-col overflow-hidden rounded-3xl border border-line bg-white p-6 transition-all duration-500 hover:-translate-y-1 hover:border-gold-200 hover:shadow-card-hover"
            style={{ animationDelay: `${Math.min(i, 7) * 50}ms` }}
          >
            <div className="flex items-center justify-between">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brown-600 text-gold-300 transition group-hover:bg-gold-500 group-hover:text-brown-900">
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <span className="text-xs font-semibold text-charcoal/50">
                {t('common.products', { count: list.length })}
              </span>
            </div>
            <h3 className="mt-5 text-lg font-bold">{ind.name}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-charcoal/70">
              {ind.description}
            </p>
            <div className="mt-5 flex -space-x-1.5" aria-hidden>
              {list.slice(0, 5).map((p) => (
                <ProductIcon
                  key={p.slug}
                  product={p}
                  size="sm"
                  className="bg-white! ring-2 ring-white"
                />
              ))}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ── Our impact ───────────────────────────────────────────────────────────────
// Only verified figures (showcase.ts) or facts computed from the live catalog.
// Nothing in this section is typed in by hand; a figure of zero is not shown.

export function Impact() {
  const t = useTranslations('marketplace');
  const { products, categories, taxonomy } = useMarketplace();
  const facts = useMemo(() => {
    const platforms = new Set(products.flatMap((p) => p.platforms));
    const deployments = [...new Set(products.flatMap((p) => p.deployment))];
    const industries = taxonomy.industries.filter((i) =>
      products.some((p) => p.industries.includes(i.id)),
    );
    const order: Platform[] = ['web', 'android', 'ios', 'ussd'];
    const n = (a: MarketplaceProduct['availability']) =>
      products.filter((p) => p.availability === a).length;
    const availability = [
      n('available') && t('home.impact.available', { count: n('available') }),
      n('pilot') && t('home.impact.pilot', { count: n('pilot') }),
      n('coming_soon') && t('home.impact.comingSoon', { count: n('coming_soon') }),
    ]
      .filter(Boolean)
      .join(', ');
    return [
      { value: products.length, label: t('home.impact.products'), detail: availability },
      {
        value: categories.filter((c) => products.some((p) => p.categoryCode === c.code)).length,
        label: t('home.impact.areas'),
        detail: t('home.impact.areasDetail'),
      },
      {
        value: industries.length,
        label: t('home.impact.industries'),
        detail: industries.map((i) => i.name).join(' · '),
      },
      {
        value: platforms.size,
        label: t('home.impact.channels'),
        detail: order
          .filter((o) => platforms.has(o))
          .map((o) => t(`platform.${o}`))
          .join(' · '),
      },
      {
        value: deployments.length,
        label: t('home.impact.deployments'),
        detail: deployments.map((d) => t(`deployment.${d}`)).join(' · '),
      },
      {
        value: products.filter((p) => p.content.demo).length,
        label: t('home.impact.demos'),
        detail: t('home.impact.demosDetail'),
      },
    ].filter((f) => f.value > 0);
  }, [products, categories, taxonomy, t]);

  if (!products.length) return null;
  const verified = VERIFIED_IMPACT.length > 0;

  return (
    <section
      id="impact"
      className="brand-band relative scroll-mt-20 overflow-hidden py-24 text-white sm:py-32"
    >
      <div className="honeycomb-light pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="pointer-events-none absolute -top-24 right-[8%] h-80 w-80 rounded-full bg-gold-400/25 blur-3xl motion-safe:animate-drift"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-32 left-[4%] h-96 w-96 rounded-full bg-gold-300/15 blur-3xl motion-safe:animate-drift-slow"
        aria-hidden
      />
      <div className="container-x relative">
        <SectionHeader
          dark
          eyebrow={t('home.impact.eyebrow')}
          title={verified ? t('home.impact.titleVerified') : t('home.impact.title')}
          lead={verified ? undefined : t('home.impact.lead')}
        />
        {verified && (
          <Reveal delay={80} className="mt-12">
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {VERIFIED_IMPACT.map((f) => (
                <li
                  key={f.label}
                  className="rounded-3xl bg-white/10 p-7 ring-1 ring-white/15 backdrop-blur"
                >
                  <p className="font-display text-4xl font-extrabold text-gold-300 sm:text-5xl">
                    {f.value}
                  </p>
                  <p className="mt-3 font-semibold text-white">{f.label}</p>
                  <p className="mt-1 text-xs text-white/55">
                    {t('home.impact.source', { source: f.source })}
                  </p>
                </li>
              ))}
            </ul>
          </Reveal>
        )}
        <ul className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', verified ? 'mt-4' : 'mt-14')}>
          {facts.map((f, i) => (
            <Reveal as="li" key={f.label} variant="scale" delay={(i % 3) * 90}>
              <div className="group h-full rounded-3xl bg-white/[0.07] p-7 ring-1 ring-white/15 backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 hover:bg-white/[0.12] hover:ring-gold-300/50 sm:p-8">
                <p className="font-display text-6xl font-extrabold tracking-[-0.04em] text-white">
                  <CountUp value={f.value} />
                </p>
                <p className="mt-4 flex items-center gap-2 font-semibold text-gold-300">
                  <span className="h-0.5 w-5 rounded-full bg-gold-400 transition-all duration-500 group-hover:w-8" />
                  {f.label}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{f.detail}</p>
              </div>
            </Reveal>
          ))}
        </ul>
        <p className="mt-8 text-xs text-white/50">{t('home.impact.liveNote')}</p>
      </div>
    </section>
  );
}

// ── Why choose our solutions ─────────────────────────────────────────────────

export function WhyChoose() {
  const t = useTranslations('marketplace.home.why');
  const { products } = useMarketplace();
  const ussd = products.filter((p) => p.platforms.includes('ussd')).length;
  const reasons = [
    { icon: Sparkles, key: 'innovation' },
    { icon: Workflow, key: 'efficiency' },
    { icon: Smartphone, key: 'accessibility' },
    { icon: Plug, key: 'value' },
    { icon: ShieldCheck, key: 'trust' },
    { icon: Layers, key: 'fit' },
  ] as const;
  return (
    <section id="why" className="scroll-mt-20 bg-cream py-24 sm:py-32">
      <div className="container-x">
        <SectionHeader eyebrow={t('eyebrow')} title={t('title')} />
        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {reasons.map(({ icon, key }, i) => (
            <Reveal as="li" key={key} variant="scale" delay={(i % 3) * 90}>
              <div className="card-accent group relative h-full overflow-hidden rounded-3xl border border-line bg-white p-7 transition-all duration-500 hover:-translate-y-1 hover:border-gold-200 hover:shadow-card-hover sm:p-8">
                <div className="flex items-center justify-between gap-3">
                  <IconTile icon={icon} />
                  <span className="rounded-full bg-cream px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-gold-800 uppercase ring-1 ring-line">
                    {t(`${key}.theme`)}
                  </span>
                </div>
                <h3 className="mt-6 text-xl font-bold">{t(`${key}.title`)}</h3>
                <p className="mt-2 leading-relaxed text-charcoal/75">
                  {key === 'accessibility' && ussd
                    ? t('accessibility.textUssd', { count: ussd })
                    : t(`${key}.text`)}
                </p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ── How our digital solutions work ───────────────────────────────────────────

export function HowItWorks() {
  const t = useTranslations('marketplace.home.how');
  const steps = [
    { key: 'discover', icon: Search },
    { key: 'demo', icon: CalendarCheck },
    { key: 'tailor', icon: Plug },
    { key: 'launch', icon: Rocket },
  ] as const;
  return (
    <section id="how" className="scroll-mt-20 py-24 sm:py-32">
      <div className="container-x">
        <SectionHeader center eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />
        <div className="relative mt-16">
          {/* The connecting line between steps (large screens). */}
          <Reveal
            variant="fade"
            className="pointer-events-none absolute top-8 right-[12.5%] left-[12.5%] hidden h-px lg:block"
          >
            <div className="h-px w-full bg-gradient-to-r from-gold-300 via-brown-200 to-gold-300" />
          </Reveal>
          <ol className="relative grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {steps.map(({ key, icon: Icon }, i) => (
              <Reveal
                as="li"
                key={key}
                delay={i * 120}
                className="group relative flex flex-col items-center text-center"
              >
                <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lift ring-1 ring-line transition-all duration-500 group-hover:-translate-y-1 group-hover:ring-gold-300">
                  <Icon className="h-6 w-6 text-brown-600" aria-hidden />
                  <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-gold-500 font-display text-xs font-bold text-brown-900 ring-4 ring-white">
                    {i + 1}
                  </span>
                </span>
                <p className="mt-6 text-[11px] font-semibold tracking-[0.14em] text-gold-700 uppercase">
                  {t('step', { number: i + 1 })}
                </p>
                <h3 className="mt-1.5 text-xl font-bold">{t(`${key}.title`)}</h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-charcoal/75">
                  {t(`${key}.text`)}
                </p>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

// ── What should we build next? (idea board teaser) ───────────────────────────

export function IdeasTeaser() {
  const t = useTranslations('marketplace.home.ideas');
  const { data, isPending, isError } = useIdeas({ sort: 'popular', limit: 3 });
  const steps = [
    { key: 'suggest', icon: Lightbulb },
    { key: 'review', icon: ClipboardCheck },
    { key: 'vote', icon: ThumbsUp },
    { key: 'build', icon: Hammer },
  ] as const;
  const ideas = isError ? [] : (data ?? []);
  return (
    <section id="ideas" className="relative scroll-mt-20 overflow-hidden py-24 sm:py-32">
      <div
        className="absolute -right-40 bottom-0 -z-10 h-[28rem] w-[28rem] rounded-full bg-gold-100/70 blur-3xl motion-safe:animate-drift"
        aria-hidden
      />
      <div className="container-x grid gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <Reveal>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2 className="section-title mt-4 text-balance">{t('title')}</h2>
          <p className="section-lead">{t('lead')}</p>
          <ol className="mt-10 grid gap-3 sm:grid-cols-2">
            {steps.map(({ key, icon: Icon }, i) => (
              <li
                key={key}
                className="flex items-start gap-3.5 rounded-2xl bg-cream p-4 ring-1 ring-line"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brown-600 ring-1 ring-line">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold text-brown-900">
                    <span className="mr-1.5 text-gold-700 tabular-nums">{i + 1}.</span>
                    {t(`steps.${key}.title`)}
                  </span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-charcoal/70">
                    {t(`steps.${key}.text`)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-9 flex flex-wrap gap-3">
            <SiteButton href="/ideas#suggest" iconLeft={<MessageSquarePlus className="h-4 w-4" />}>
              {t('suggest')}
            </SiteButton>
            <SiteButton
              href="/ideas"
              variant="outline"
              iconRight={<ArrowRight className="h-4 w-4" />}
            >
              {t('board')}
            </SiteButton>
          </div>
        </Reveal>
        <Reveal delay={120} className="lg:pt-6">
          <div className="rounded-[1.75rem] bg-gradient-to-br from-cream to-brown-50 p-5 ring-1 ring-line sm:p-7">
            <p className="flex items-center gap-2 text-sm font-semibold text-brown-800">
              <ThumbsUp className="h-4 w-4 text-gold-700" aria-hidden /> {t('top')}
            </p>
            <div className="mt-5">
              {isPending && !isError ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <SiteSkeleton key={i} className="h-28 rounded-2xl" />
                  ))}
                </div>
              ) : ideas.length ? (
                <ul className="space-y-3">
                  {ideas.map((idea) => (
                    <li key={idea.reference}>
                      <IdeaCard idea={idea} compact />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-brown-200 bg-white/70 px-6 py-12 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-500 text-brown-900 shadow-glow">
                    <Lightbulb className="h-7 w-7" aria-hidden />
                  </span>
                  <p className="mt-5 max-w-xs font-semibold text-brown-900">{t('empty')}</p>
                  <SiteButton
                    href="/ideas#suggest"
                    className="mt-6"
                    variant="secondary"
                    iconLeft={<MessageSquarePlus className="h-4 w-4" />}
                  >
                    {t('suggest')}
                  </SiteButton>
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── Latest news & announcements ──────────────────────────────────────────────
// Built only from dated catalog records (a product's publication date and
// availability); there is no separate news feed, so nothing here is invented.

export function LatestNews() {
  const t = useTranslations('marketplace');
  const format = useFormatter();
  const { products, categoryName } = useMarketplace();
  const latest = useMemo(
    () => [...products].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4),
    [products],
  );
  if (!latest.length) return null;
  const [lead, ...rest] = latest as [MarketplaceProduct, ...MarketplaceProduct[]];
  const kind = (p: MarketplaceProduct) =>
    p.availability === 'pilot'
      ? t('home.news.pilot')
      : p.availability === 'coming_soon'
        ? t('home.news.upcoming')
        : t('home.news.launched');
  const date = (p: MarketplaceProduct) =>
    format.dateTime(new Date(p.createdAt), { dateStyle: 'long' });
  const shot = lead.content.screenshots.find((s) => s.variant !== 'mobile');

  return (
    <section id="news" className="scroll-mt-20 bg-cream py-24 sm:py-32">
      <div className="container-x">
        <SectionHeader
          eyebrow={t('home.news.eyebrow')}
          title={t('home.news.title')}
          lead={t('home.news.lead')}
          action={
            <SiteButton
              href="/products?sort=newest"
              variant="outline"
              iconRight={<ArrowRight className="h-4 w-4" />}
            >
              {t('home.news.all')}
            </SiteButton>
          }
        />
        <div className="mt-14 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <Reveal variant="scale">
            <article className="card-accent group relative flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-white transition-all duration-500 hover:-translate-y-1 hover:shadow-card-hover">
              <div className="relative overflow-hidden bg-gradient-to-br from-cream to-brown-50 px-6 pt-6 sm:px-8 sm:pt-8">
                <ProductScreen
                  product={lead}
                  variant={shot?.variant ?? 'dashboard'}
                  imageUrl={shot?.imageUrl}
                  alt={shot?.title}
                  className="translate-y-3 rounded-t-xl shadow-lift transition-transform duration-700 group-hover:translate-y-0"
                />
              </div>
              <div className="flex flex-1 flex-col p-6 sm:p-8">
                <NewsMeta kind={kind(lead)} date={date(lead)} dateTime={lead.createdAt} />
                <h3 className="mt-3 text-2xl leading-snug font-bold">
                  <Link
                    href={`/products/${lead.slug}`}
                    className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                  >
                    {lead.name}
                  </Link>
                </h3>
                <p className="mt-2 line-clamp-2 leading-relaxed text-charcoal/75">{lead.summary}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brown-700">
                  {t('home.news.read')}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </article>
          </Reveal>
          <ul className="flex flex-col gap-4">
            {rest.map((p, i) => (
              <Reveal as="li" key={p.slug} delay={(i + 1) * 90} className="flex-1">
                <article className="group relative flex h-full items-start gap-4 rounded-3xl border border-line bg-white p-5 transition-all duration-500 hover:-translate-y-0.5 hover:border-gold-200 hover:shadow-card-hover sm:p-6">
                  <ProductIcon product={p} size="lg" />
                  <div className="min-w-0 flex-1">
                    <NewsMeta kind={kind(p)} date={date(p)} dateTime={p.createdAt} />
                    <h3 className="mt-2 text-lg leading-snug font-bold">
                      <Link
                        href={`/products/${p.slug}`}
                        className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                      >
                        {p.name}
                      </Link>
                    </h3>
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-charcoal/70">
                      {p.tagline || p.summary}
                    </p>
                    <p className="mt-2 text-xs font-medium text-charcoal/50">
                      {categoryName(p.categoryCode)}
                    </p>
                  </div>
                  <ArrowUpRight
                    className="h-5 w-5 shrink-0 text-charcoal/30 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-gold-700"
                    aria-hidden
                  />
                </article>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function NewsMeta({ kind, date, dateTime }: { kind: string; date: string; dateTime: string }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded-full bg-gold-50 px-2.5 py-0.5 font-semibold text-gold-800 ring-1 ring-gold-200">
        {kind}
      </span>
      <time dateTime={dateTime} className="font-medium text-charcoal/55">
        {date}
      </time>
    </p>
  );
}

// ── Contact & collaboration ──────────────────────────────────────────────────

/** Email, phone and address cards (homepage and Contact page). */
export function ContactDetails({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations('marketplace.info.contact');
  const cards = [
    {
      icon: Mail,
      title: t('email'),
      value: SITE_CONTACT.email,
      href: `mailto:${SITE_CONTACT.email}`,
    },
    {
      icon: Phone,
      title: t('phone'),
      value: SITE_CONTACT.phone,
      href: `tel:${SITE_CONTACT.phone.replace(/\s/g, '')}`,
    },
    { icon: MapPin, title: t('visit'), value: SITE_CONTACT.address },
  ];
  return (
    <div className={cn(compact ? 'space-y-3' : 'space-y-4', className)}>
      {cards.map(({ icon: Icon, title, value, href }) => (
        <div
          key={title}
          className={cn(
            'group flex items-start gap-4 rounded-2xl border border-line bg-white transition hover:border-gold-200 hover:shadow-tile',
            compact ? 'p-4' : 'p-5',
          )}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cream text-brown-600 ring-1 ring-line transition group-hover:bg-gold-500 group-hover:text-brown-900 group-hover:ring-gold-500">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-charcoal/60">{title}</p>
            {href ? (
              <a href={href} className="font-semibold break-words text-brown-900 hover:underline">
                {value}
              </a>
            ) : (
              <p className="font-semibold text-brown-900">{value}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ContactCollaboration() {
  const t = useTranslations('marketplace');
  return (
    <section id="contact" className="scroll-mt-20 bg-cream py-24 sm:py-32">
      <div className="container-x grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
        <div>
          <Reveal>
            <p className="eyebrow">{t('home.contact.eyebrow')}</p>
            <h2 className="section-title mt-4 text-balance">{t('home.contact.title')}</h2>
            <p className="section-lead">{t('home.contact.lead')}</p>
          </Reveal>
          <Reveal delay={100}>
            <ContactDetails compact className="mt-10" />
            <div className="brand-band mt-3 flex items-start gap-3 rounded-2xl p-5 text-white">
              <Handshake className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" aria-hidden />
              <p className="text-sm leading-relaxed text-white/80">
                <span className="font-semibold text-white">{t('home.contact.partners')}</span>{' '}
                {t('info.contact.partnersText')}
              </p>
            </div>
          </Reveal>
        </div>
        <Reveal delay={140} variant="scale">
          <div className="rounded-3xl border border-line bg-white p-6 shadow-lift sm:p-8">
            <h3 className="text-xl font-bold">{t('forms.inquiry.heading')}</h3>
            <p className="mt-1 mb-6 text-sm text-charcoal/60">{t('forms.inquiry.required')}</p>
            <InquiryForm source="homepage" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
