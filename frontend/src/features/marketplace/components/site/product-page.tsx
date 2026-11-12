'use client';

import {
  ArrowRight,
  Bot,
  CalendarCheck,
  Check,
  ChevronRight,
  CircleDot,
  Cloud,
  Code2,
  MessageSquare,
  PlayCircle,
  Receipt,
  Server,
  Smartphone,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { track } from '../../client';
import { iconFor } from '../../icons';
import { DEPLOYMENTS } from '../../taxonomy';
import type { DeploymentType, MarketplaceProduct } from '../../types';
import { AssistantChat } from './assistant';
import { DemoPlayer, durationSeconds } from './demo-player';
import { AskDeveloperForm } from './forms';
import { useMarketplace } from './marketplace-provider';
import { Accordion, Reveal, SiteBadge, SiteButton, SiteModal } from './primitives';
import { AvailabilityBadge, ProductCard, ProductIcon } from './product-card';
import { ProductReviews } from './product-reviews';
import { RatingLine } from './ratings';
import { ProductScreen, tint } from './product-screen';

const SECTIONS = [
  'overview',
  'benefits',
  'features',
  'screens',
  'demo',
  'customers',
  'deployment',
  'reviews',
  'faq',
  'ask',
] as const;
const DEPLOY_ICON: Record<DeploymentType, typeof Cloud> = {
  cloud: Cloud,
  on_premise: Server,
  hybrid: Workflow,
};

function SectionTitle({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="mb-8">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold sm:text-3xl">{title}</h2>
      {lead && <p className="mt-3 max-w-2xl text-charcoal/80">{lead}</p>}
    </div>
  );
}

function SubNav({ product }: { product: MarketplaceProduct }) {
  const t = useTranslations('marketplace.product');
  const [active, setActive] = useState('overview');
  useEffect(() => {
    const els = SECTIONS.map((id) => document.getElementById(id)).filter(
      (e): e is HTMLElement => !!e,
    );
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '-120px 0px -60% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [product.slug]);
  return (
    <div className="sticky top-[var(--site-top,72px)] z-30 border-b border-line bg-white/90 backdrop-blur-xl">
      <div className="container-x">
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label={t('sectionsLabel')}>
          {SECTIONS.filter((id) => id !== 'demo' || product.content.demo).map((id) => (
            <a
              key={id}
              href={`#${id}`}
              className={cn(
                'shrink-0 border-b-2 px-3 py-3.5 text-sm font-medium transition',
                active === id
                  ? 'border-gold-500 text-brown-900'
                  : 'border-transparent text-slate-500 hover:text-brown-900',
              )}
            >
              {t(`sections.${id}`)}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

function Gallery({ product }: { product: MarketplaceProduct }) {
  const t = useTranslations('marketplace');
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const shots = product.content.screenshots;
  const shot = shots[active];
  if (!shot) return null;
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <button
          onClick={() => setLightbox(true)}
          className="group relative overflow-hidden rounded-3xl bg-mist p-4 ring-1 ring-line sm:p-6"
          aria-label={t('product.screens.enlarge', { title: shot.title })}
        >
          <div key={active} className="animate-fade-in">
            <ProductScreen
              product={product}
              variant={shot.variant}
              imageUrl={shot.imageUrl}
              alt={shot.title}
              className="rounded-xl shadow-lift"
            />
          </div>
          <div className="mt-4 text-left">
            <p className="font-semibold text-brown-900">{shot.title}</p>
            <p className="text-sm text-slate-500">{shot.caption}</p>
          </div>
        </button>
        <div className="flex gap-3 overflow-x-auto lg:flex-col lg:overflow-visible">
          {shots.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActive(i)}
              aria-pressed={i === active}
              className={cn(
                'w-48 shrink-0 rounded-2xl p-2.5 text-left ring-1 transition lg:w-auto',
                i === active
                  ? 'bg-white shadow-tile ring-brown-900'
                  : 'bg-mist ring-line hover:ring-brown-200',
              )}
            >
              <ProductScreen
                product={product}
                variant={s.variant}
                imageUrl={s.imageUrl}
                className="rounded-lg"
                alt={s.title}
              />
              <p className="mt-2 truncate px-1 text-xs font-semibold text-brown-900">{s.title}</p>
            </button>
          ))}
        </div>
      </div>
      <SiteModal open={lightbox} onClose={() => setLightbox(false)} size="full" bare dark>
        <div className="relative">
          <button
            onClick={() => setLightbox(false)}
            className="absolute -top-12 right-0 rounded-full p-2 text-white/80 hover:bg-white/10"
            aria-label={t('common.close')}
          >
            <X className="h-6 w-6" />
          </button>
          <ProductScreen
            product={product}
            variant={shot.variant}
            imageUrl={shot.imageUrl}
            alt={shot.title}
            className="rounded-2xl"
          />
          <p className="mt-4 text-center text-white/80">
            {shot.title} — {shot.caption}
          </p>
        </div>
      </SiteModal>
    </>
  );
}

function related(product: MarketplaceProduct, all: MarketplaceProduct[]) {
  return all
    .filter((p) => p.slug !== product.slug)
    .map((p) => ({
      p,
      score:
        (p.categoryCode === product.categoryCode ? 3 : 0) +
        p.industries.filter((i) => product.industries.includes(i)).length * 2 +
        p.needs.filter((n) => product.needs.includes(n)).length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.p);
}

export function ProductPage({ product }: { product: MarketplaceProduct }) {
  const t = useTranslations('marketplace');
  const { products, categoryName, openDemoRequest, openInquiry, openVideo, industry } =
    useMarketplace();
  const c = product.content;
  const minutes = Math.max(1, Math.round(durationSeconds(c.demo?.duration) / 60));
  const relatedProducts = useMemo(() => related(product, products), [product, products]);
  const category = categoryName(product.categoryCode);
  const [asking, setAsking] = useState(false);

  useEffect(() => track('product_view', product.slug), [product.slug]);

  return (
    <>
      <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-gold-50 to-white pt-[var(--site-top,72px)]">
        <div
          className="honeycomb-bg absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent)]"
          aria-hidden
        />
        <div
          className="absolute -top-32 -right-32 h-[30rem] w-[30rem] rounded-full blur-3xl"
          style={{ background: tint(product.accent, 0.12) }}
          aria-hidden
        />
        {/* Phones: compact type, spacing and buttons, so the product picture and the
            page's sections are not pushed two screens down. sm and up are unchanged. */}
        <div className="container-x relative grid items-center gap-8 py-7 sm:gap-12 sm:py-12 lg:grid-cols-[1fr_1.05fr] lg:py-20">
          <div className="animate-fade-up">
            <nav
              className="flex items-center gap-1.5 text-sm text-charcoal/70"
              aria-label={t('product.breadcrumbLabel')}
            >
              <Link href="/products" className="hover:text-brown-900">
                {t('product.breadcrumb')}
              </Link>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-brown-900">{product.name}</span>
            </nav>
            <div className="mt-4 flex items-center gap-3 sm:mt-6">
              <ProductIcon product={product} size="lg" />
              <div className="text-sm text-charcoal/80">
                {category}
                {category && <span className="mx-1.5">·</span>}
                {product.industries.map((i) => industry(i)?.short ?? i).join(', ')}
              </div>
            </div>
            <h1 className="mt-4 text-[clamp(1.75rem,7.6vw,2.25rem)] font-extrabold max-sm:leading-[1.12] sm:mt-5 sm:text-5xl">
              {product.name}
            </h1>
            <p className="mt-2.5 text-lg font-medium text-brown-600 sm:mt-4 sm:text-xl">
              {product.tagline}
            </p>
            <RatingLine product={product} invite className="mt-3" />
            <p className="mt-4 max-w-xl leading-relaxed text-charcoal sm:mt-5">{product.summary}</p>
            <div className="mt-5 flex flex-wrap gap-2 sm:mt-6">
              <AvailabilityBadge product={product} />
              {product.platforms.map((p) => (
                <span
                  key={p}
                  className="rounded-full border border-line bg-white px-2.5 py-0.5 text-xs font-medium text-charcoal"
                >
                  {t(`platform.${p}`)}
                </span>
              ))}
            </div>
            {/* Phones: the two main actions full width, the two "Ask" actions as compact links. */}
            <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2.5 sm:mt-9 sm:gap-3">
              <SiteButton
                size="lg"
                className="max-sm:h-12 max-sm:w-full"
                onClick={() =>
                  openDemoRequest({ productSlug: product.slug, source: 'product_page' })
                }
                iconLeft={<CalendarCheck className="h-5 w-5" />}
              >
                {t('product.requestDemo')}
              </SiteButton>
              {c.demo && (
                <SiteButton
                  size="lg"
                  variant="outline"
                  className="max-sm:h-12 max-sm:w-full"
                  onClick={() => openVideo(product)}
                  iconLeft={<PlayCircle className="h-5 w-5 text-brown-600" />}
                >
                  {t('product.watchDemo', { minutes })}
                </SiteButton>
              )}
              <SiteButton
                size="lg"
                variant="ghost"
                className="max-sm:h-10 max-sm:px-1 max-sm:text-sm"
                href="#ask"
                iconLeft={<Bot className="h-5 w-5" />}
              >
                {t('product.ask')}
              </SiteButton>
              {product.askDeveloper && (
                <SiteButton
                  size="lg"
                  variant="ghost"
                  className="max-sm:h-10 max-sm:px-1 max-sm:text-sm"
                  onClick={() => setAsking(true)}
                  iconLeft={<Code2 className="h-5 w-5" />}
                >
                  {t('product.askDeveloper.button')}
                </SiteButton>
              )}
            </div>
          </div>
          {/* Phones open on the product picture, then its name and description. */}
          <div className="animate-fade-up [animation-delay:120ms] max-sm:order-first">
            <div className="rounded-2xl border border-line bg-white p-2 shadow-lift">
              <ProductScreen
                product={product}
                variant={c.screenshots[0]?.variant ?? 'dashboard'}
                imageUrl={c.screenshots[0]?.imageUrl}
                className="rounded-xl shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      <SubNav product={product} />

      <div className="container-x space-y-14 py-10 sm:space-y-24 sm:py-20">
        <section id="overview" className="scroll-mt-36">
          <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
            <Reveal>
              <SectionTitle
                eyebrow={t('product.overview.eyebrow')}
                title={t('product.overview.title')}
              />
              <p className="text-lg leading-relaxed text-charcoal">{product.overview}</p>
              {product.problem && (
                <div className="mt-8 rounded-2xl border-l-4 border-gold-500 bg-gold-50/60 p-6">
                  <p className="text-sm font-semibold tracking-wide text-gold-800 uppercase">
                    {t('product.overview.problem')}
                  </p>
                  <p className="mt-2 leading-relaxed text-charcoal">{product.problem}</p>
                </div>
              )}
            </Reveal>
            <Reveal delay={100}>
              <dl className="divide-y divide-line rounded-2xl border border-line bg-white text-sm shadow-tile">
                {[
                  [t('product.facts.category'), category ?? '—'],
                  [
                    t('product.facts.industries'),
                    product.industries.map((i) => industry(i)?.name ?? i).join(', '),
                  ],
                  [
                    t('product.facts.platforms'),
                    product.platforms.map((p) => t(`platform.${p}`)).join(', '),
                  ],
                  [
                    t('product.facts.deployment'),
                    product.deployment.map((d) => t(`deployment.${d}`)).join(', '),
                  ],
                  [
                    t('product.facts.customizable'),
                    product.customizable
                      ? t('product.facts.customizableYes')
                      : t('product.facts.customizableNo'),
                  ],
                  [t('product.facts.status'), t(`availability.${product.availability}`)],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-1 px-5 py-3.5">
                    <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      {k}
                    </dt>
                    <dd className="font-medium text-brown-900">{v}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </section>

        {c.benefits.length > 0 && (
          <section id="benefits" className="scroll-mt-36">
            <SectionTitle
              eyebrow={t('product.benefits.eyebrow')}
              title={t('product.benefits.title')}
            />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {c.benefits.map((b, i) => {
                const Icon = iconFor(b.icon);
                return (
                  <Reveal
                    key={b.title}
                    delay={i * 70}
                    className="rounded-2xl border border-line bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-lift"
                  >
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-xl"
                      style={{ background: tint(product.accent, 0.12), color: product.accent }}
                    >
                      <Icon className="h-5.5 w-5.5" />
                    </span>
                    <h3 className="mt-5 font-bold">{b.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">{b.description}</p>
                  </Reveal>
                );
              })}
            </div>
          </section>
        )}

        {c.modules.length > 0 && (
          <section id="features" className="scroll-mt-36">
            <SectionTitle
              eyebrow={t('product.features.eyebrow')}
              title={t('product.features.title', { count: c.modules.length })}
              lead={t('product.features.lead')}
            />
            <Accordion
              items={c.modules.map((m) => ({
                title: (
                  <span className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
                    <span>{m.name}</span>
                    <span className="text-sm font-normal text-slate-500">{m.description}</span>
                  </span>
                ),
                meta: (
                  <SiteBadge tone="outline">
                    {t('product.features.count', { count: m.features.length })}
                  </SiteBadge>
                ),
                content: (
                  <ul className="grid gap-2.5 pt-1 sm:grid-cols-2">
                    {m.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {f}
                      </li>
                    ))}
                  </ul>
                ),
              }))}
            />
          </section>
        )}

        {c.screenshots.length > 0 && (
          <section id="screens" className="scroll-mt-36">
            <SectionTitle
              eyebrow={t('product.screens.eyebrow')}
              title={t('product.screens.title')}
            />
            <Gallery product={product} />
          </section>
        )}

        {c.demo && (
          <section id="demo" className="scroll-mt-36">
            <SectionTitle
              eyebrow={t('product.demo.eyebrow')}
              title={t('product.demo.title', { name: product.name, minutes })}
            />
            <div className="overflow-hidden rounded-3xl shadow-lift ring-1 ring-brown-900/10">
              <DemoPlayer
                product={product}
                autoPlay={false}
                onRequestDemo={() =>
                  openDemoRequest({ productSlug: product.slug, source: 'product_page' })
                }
              />
            </div>
          </section>
        )}

        {c.targetCustomers.length > 0 && (
          <section id="customers" className="scroll-mt-36">
            <SectionTitle
              eyebrow={t('product.customers.eyebrow')}
              title={t('product.customers.title')}
            />
            <div className="grid gap-5 md:grid-cols-3">
              {c.targetCustomers.map((tc, i) => (
                <Reveal
                  key={tc.title}
                  delay={i * 70}
                  className="flex gap-4 rounded-2xl bg-mist p-6"
                >
                  <Users className="h-6 w-6 shrink-0 text-brown-600" />
                  <div>
                    <h3 className="font-bold">{tc.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                      {tc.description}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>
        )}

        <section id="deployment" className="scroll-mt-36">
          <SectionTitle
            eyebrow={t('product.deploymentSection.eyebrow')}
            title={t('product.deploymentSection.title')}
          />
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {DEPLOYMENTS.map((d) => {
                const Icon = DEPLOY_ICON[d];
                const on = product.deployment.includes(d);
                return (
                  <div
                    key={d}
                    className={cn(
                      'rounded-2xl border p-5',
                      on
                        ? 'border-line bg-white shadow-tile'
                        : 'border-dashed border-line bg-mist/50 opacity-60',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <Icon className={cn('h-6 w-6', on ? 'text-brown-700' : 'text-slate-400')} />
                      {on ? (
                        <SiteBadge tone="green">
                          {t('product.deploymentSection.supported')}
                        </SiteBadge>
                      ) : (
                        <SiteBadge>{t('product.deploymentSection.notOffered')}</SiteBadge>
                      )}
                    </div>
                    <h3 className="mt-4 font-bold">{t(`deployment.${d}`)}</h3>
                    <p className="mt-1.5 text-sm text-slate-500">{t(`deploymentText.${d}`)}</p>
                  </div>
                );
              })}
            </div>
            <div className="rounded-2xl bg-brown-700 p-6 text-white sm:p-8">
              <h3 className="flex items-center gap-2 font-bold text-white!">
                <Smartphone className="h-5 w-5 text-gold-400" />{' '}
                {t('product.deploymentSection.integrations')}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/70">{c.integrationNotes}</p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {c.integrations.map((i) => (
                  <li
                    key={i}
                    className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium"
                  >
                    <CircleDot className="h-3 w-3 text-gold-400" /> {i}
                  </li>
                ))}
              </ul>
              <SiteButton
                className="mt-6"
                size="sm"
                variant="light"
                onClick={() =>
                  openInquiry({
                    productSlug: product.slug,
                    inquiryType: 'integration',
                    source: 'product_page',
                  })
                }
              >
                {t('product.deploymentSection.discuss')}
              </SiteButton>
            </div>
          </div>
        </section>

        <ProductReviews product={product} />

        {c.faqs.length > 0 && (
          <section id="faq" className="scroll-mt-36">
            <div className="grid gap-10 lg:grid-cols-[320px_1fr]">
              <div>
                <SectionTitle eyebrow={t('product.faq.eyebrow')} title={t('product.faq.title')} />
                <p className="-mt-4 text-sm text-slate-500">{t('product.faq.lead')}</p>
              </div>
              <Accordion items={c.faqs.map((f) => ({ title: f.question, content: f.answer }))} />
            </div>
          </section>
        )}

        <section id="ask" className="scroll-mt-36">
          <div className="grid gap-8 overflow-hidden rounded-3xl border border-line bg-mist lg:grid-cols-[1fr_1.3fr]">
            <div className="p-8 sm:p-10">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brown-700 text-gold-400">
                <Bot className="h-6 w-6" />
              </span>
              <h2 className="mt-5 text-2xl font-bold sm:text-3xl">
                {t('product.askSection.title', { name: product.name })}
              </h2>
              <p className="mt-3 leading-relaxed text-charcoal/80">
                {t('product.askSection.lead')}
              </p>
              {product.askDeveloper && (
                <div className="mt-6 rounded-2xl border border-gold-200 bg-white p-5">
                  <p className="flex items-center gap-2 font-semibold text-brown-900">
                    <Code2 className="h-4.5 w-4.5 text-gold-700" />
                    {t('product.askDeveloper.title')}
                  </p>
                  <p className="mt-1.5 text-sm text-charcoal/80">
                    {t('product.askDeveloper.lead')}
                  </p>
                  <SiteButton
                    className="mt-4"
                    size="sm"
                    onClick={() => setAsking(true)}
                    iconLeft={<Code2 className="h-4 w-4" />}
                  >
                    {t('product.askDeveloper.button')}
                  </SiteButton>
                </div>
              )}
              <SiteButton
                className="mt-6"
                variant="outline"
                onClick={() =>
                  openInquiry({
                    productSlug: product.slug,
                    inquiryType: 'technical_consultation',
                    source: 'product_page',
                  })
                }
                iconLeft={<MessageSquare className="h-4 w-4" />}
              >
                {t('product.askSection.team')}
              </SiteButton>
            </div>
            <div className="border-t border-line bg-white lg:border-t-0 lg:border-l">
              <AssistantChat focusProduct={product} variant="embedded" className="h-[520px]" />
            </div>
          </div>
        </section>

        {relatedProducts.length > 0 && (
          <section>
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow">{t('product.related.eyebrow')}</p>
                <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
                  {t('product.related.title')}
                </h2>
              </div>
              <Link
                href="/products"
                className="hidden items-center gap-1.5 text-sm font-semibold text-brown-700 hover:text-brown-900 sm:inline-flex"
              >
                {t('product.related.all')} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {relatedProducts.map((p) => (
                <ProductCard key={p.slug} product={p} layout="compact" />
              ))}
            </div>
          </section>
        )}
      </div>

      <section className="brand-band border-t border-line">
        <div className="container-x flex flex-col items-center gap-8 py-16 text-center lg:flex-row lg:justify-between lg:text-left">
          <div>
            <h2 className="text-3xl font-extrabold text-white!">{t('product.final.title')}</h2>
            <p className="mt-2 text-white/70">{t('product.final.lead', { name: product.name })}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <SiteButton
              size="lg"
              onClick={() => openDemoRequest({ productSlug: product.slug, source: 'product_page' })}
              iconLeft={<CalendarCheck className="h-5 w-5" />}
            >
              {t('product.final.demo')}
            </SiteButton>
            <SiteButton
              size="lg"
              variant="light"
              onClick={() =>
                openInquiry({
                  productSlug: product.slug,
                  inquiryType: 'pricing',
                  source: 'product_page',
                })
              }
              iconLeft={<Receipt className="h-5 w-5" />}
            >
              {t('product.final.pricing')}
            </SiteButton>
            <SiteButton
              size="lg"
              variant="light"
              onClick={() => openInquiry({ productSlug: product.slug, source: 'product_page' })}
            >
              {t('product.final.contact')}
            </SiteButton>
          </div>
        </div>
      </section>

      {product.askDeveloper && (
        <SiteModal
          open={asking}
          onClose={() => setAsking(false)}
          title={t('product.askDeveloper.title')}
          description={t('product.askDeveloper.lead')}
          closeLabel={t('common.close')}
        >
          <AskDeveloperForm
            productSlug={product.slug}
            productName={product.name}
            onDone={() => setAsking(false)}
          />
        </SiteModal>
      )}
    </>
  );
}
