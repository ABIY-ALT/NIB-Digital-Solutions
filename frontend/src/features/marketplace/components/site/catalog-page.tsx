'use client';

import { PackageSearch, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { filterProducts } from '../../lib/search';
import { AVAILABILITIES, DEPLOYMENTS } from '../../taxonomy';
import type { Availability, CatalogQuery, DeploymentType, IndustryId, NeedId } from '../../types';
import { useMarketplace } from './marketplace-provider';
import { EmptyState, SiteButton, SiteDrawer } from './primitives';
import { ProductCard } from './product-card';
import { PageHero } from './site-shell';

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

function useCatalogParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query: CatalogQuery = useMemo(
    () => ({
      search: params.get('q') ?? '',
      industries: list(params.get('industry')) as IndustryId[],
      needs: list(params.get('need')) as NeedId[],
      categories: list(params.get('category')),
      availability: list(params.get('availability')) as Availability[],
      deployment: list(params.get('deployment')) as DeploymentType[],
      hasDemo: params.get('demo') === '1',
      sort: (params.get('sort') as CatalogQuery['sort']) || 'featured',
    }),
    [params],
  );
  const update = (patch: Record<string, string | string[] | boolean | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      const value = Array.isArray(v)
        ? v.join(',')
        : typeof v === 'boolean'
          ? v
            ? '1'
            : ''
          : (v ?? '');
      if (value) next.set(k, value);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const reset = () => router.replace(pathname, { scroll: false });
  return { query, update, reset };
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-b border-line pb-5 last:border-0">
      <legend className="mb-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">
        {title}
      </legend>
      <div className="space-y-1">{children}</div>
    </fieldset>
  );
}

function CheckOption({
  label,
  checked,
  onChange,
  count,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  count?: number;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-charcoal hover:bg-mist">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded accent-brown-900"
      />
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-xs text-slate-400 tabular-nums">{count}</span>}
    </label>
  );
}

type BrowseMode = 'need' | 'industry';

/**
 * Quick browsing by business need or industry (what the former Solutions and
 * Industries pages offered): one chip per need or industry, with counts.
 */
function BrowseBy({
  query,
  update,
}: {
  query: CatalogQuery;
  update: (patch: Record<string, string | undefined>) => void;
}) {
  const t = useTranslations('marketplace.catalog.browse');
  const { products, taxonomy } = useMarketplace();
  const [mode, setMode] = useState<BrowseMode>(
    query.industries?.length && !query.needs?.length ? 'industry' : 'need',
  );
  const entries = mode === 'need' ? taxonomy.needs : taxonomy.industries;
  const selected: readonly string[] = (mode === 'need' ? query.needs : query.industries) ?? [];
  const count = (id: string) =>
    products.filter((p) => (mode === 'need' ? p.needs : p.industries).includes(id)).length;
  const modes: BrowseMode[] = ['need', 'industry'];

  return (
    <div className="mt-6">
      <div
        role="group"
        aria-label={t('label')}
        className="inline-flex items-center gap-1 rounded-full bg-cream-deep/70 p-1 ring-1 ring-line"
      >
        <span className="ps-2.5 pe-1 text-xs font-semibold text-charcoal/70">{t('label')}</span>
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={cn(
              'h-8 rounded-full px-3.5 text-[13px] font-bold transition',
              mode === m
                ? 'bg-white text-brown-900 shadow-tile'
                : 'text-charcoal/70 hover:text-brown-900',
            )}
          >
            {t(m)}
          </button>
        ))}
      </div>
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {entries
          .filter((e) => count(e.id) > 0)
          .map((e) => {
            const on = selected.includes(e.id);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => update({ [mode]: on ? '' : e.id })}
                aria-pressed={on}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap transition',
                  on
                    ? 'border-brown-900 bg-brown-900 text-white'
                    : 'border-line bg-white text-brown-900 hover:border-gold-300 hover:bg-gold-50',
                )}
              >
                {e.name}
                <span
                  className={cn('text-[11px] font-bold', on ? 'text-gold-200' : 'text-charcoal/50')}
                >
                  {count(e.id)}
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}

/** About the one business need or industry chosen: its description and the assistant. */
function BrowseSummary({ query, results }: { query: CatalogQuery; results: number }) {
  const t = useTranslations('marketplace.catalog.browse');
  const { need, industry, openAssistant } = useMarketplace();
  const entry =
    query.needs?.length === 1
      ? { kind: 'need' as const, ...need(query.needs[0]!) }
      : query.industries?.length === 1 && !query.needs?.length
        ? { kind: 'industry' as const, ...industry(query.industries[0]!) }
        : null;
  if (!entry?.name) return null;
  const name = entry.name;
  return (
    <div className="brand-band relative mt-5 overflow-hidden rounded-3xl px-6 py-6 text-white sm:px-7">
      <div
        className="pointer-events-none absolute -top-20 -right-16 h-64 w-64 rounded-full bg-gold-400/25 blur-3xl"
        aria-hidden
      />
      <p className="relative text-xs font-bold tracking-[0.14em] text-gold-300 uppercase">
        {t(entry.kind)}
      </p>
      <h2 className="relative mt-1.5 text-2xl font-extrabold text-white!">{name}</h2>
      {entry.description ? (
        <p className="relative mt-2 max-w-2xl leading-relaxed text-white/80">{entry.description}</p>
      ) : null}
      <div className="relative mt-5 flex flex-wrap items-center gap-3">
        <SiteButton
          size="sm"
          onClick={() => openAssistant(t('askPrompt', { name }))}
          iconLeft={<Sparkles className="h-4 w-4" />}
        >
          {t('ask')}
        </SiteButton>
        <span className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/90">
          {t('fit', { count: results })}
        </span>
      </div>
    </div>
  );
}

export function CatalogPage() {
  const t = useTranslations('marketplace');
  const { products, categories, categoryName, openAssistant, taxonomy, industry, need } =
    useMarketplace();
  const { query, update, reset } = useCatalogParams();
  const [searchText, setSearchText] = useState(query.search ?? '');
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText !== (query.search ?? '')) update({ q: searchText });
    }, 250);
    return () => clearTimeout(timer);
    // update reads the latest params on each call
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  // Old Solutions / Industries links (/solutions#digital-lending) arrive here with their #hash.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || query.needs?.length || query.industries?.length) return;
    if (taxonomy.needs.some((n) => n.id === id)) update({ need: id });
    else if (taxonomy.industries.some((i) => i.id === id)) update({ industry: id });
    // Only once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = useMemo(
    () => filterProducts(products, query, taxonomy),
    [products, query, taxonomy],
  );
  const toggle = <T extends string>(key: string, arr: T[], v: T, on: boolean) =>
    update({ [key]: on ? [...arr, v] : arr.filter((x) => x !== v) });
  const clearAll = () => {
    reset();
    setSearchText('');
  };

  const chips = [
    ...(query.needs ?? []).map((n) => ({
      label: need(n)?.name ?? n,
      clear: () => toggle('need', query.needs!, n, false),
    })),
    ...(query.industries ?? []).map((i) => ({
      label: industry(i)?.name ?? i,
      clear: () => toggle('industry', query.industries!, i, false),
    })),
    ...(query.categories ?? []).map((c) => ({
      label: categoryName(c) ?? c,
      clear: () => toggle('category', query.categories!, c, false),
    })),
    ...(query.availability ?? []).map((a) => ({
      label: t(`availability.${a}`),
      clear: () => toggle('availability', query.availability!, a, false),
    })),
    ...(query.deployment ?? []).map((d) => ({
      label: t(`deployment.${d}`),
      clear: () => toggle('deployment', query.deployment!, d, false),
    })),
    ...(query.hasDemo
      ? [{ label: t('catalog.hasDemo'), clear: () => update({ demo: false }) }]
      : []),
  ];

  const filters = (
    <div className="space-y-5">
      <FilterGroup title={t('catalog.groups.need')}>
        {taxonomy.needs.map((n) => (
          <CheckOption
            key={n.id}
            label={n.name}
            checked={!!query.needs?.includes(n.id)}
            onChange={(on) => toggle('need', query.needs!, n.id, on)}
            count={products.filter((p) => p.needs.includes(n.id)).length}
          />
        ))}
      </FilterGroup>
      <FilterGroup title={t('catalog.groups.industry')}>
        {taxonomy.industries.map((i) => (
          <CheckOption
            key={i.id}
            label={i.name}
            checked={!!query.industries?.includes(i.id)}
            onChange={(on) => toggle('industry', query.industries!, i.id, on)}
            count={products.filter((p) => p.industries.includes(i.id)).length}
          />
        ))}
      </FilterGroup>
      <FilterGroup title={t('catalog.groups.category')}>
        {categories.map((c) => (
          <CheckOption
            key={c.code}
            label={c.name}
            checked={!!query.categories?.includes(c.code)}
            onChange={(on) => toggle('category', query.categories!, c.code, on)}
            count={products.filter((p) => p.categoryCode === c.code).length}
          />
        ))}
      </FilterGroup>
      <FilterGroup title={t('catalog.groups.availability')}>
        {AVAILABILITIES.map((a) => (
          <CheckOption
            key={a}
            label={t(`availability.${a}`)}
            checked={!!query.availability?.includes(a)}
            onChange={(on) => toggle('availability', query.availability!, a, on)}
            count={products.filter((p) => p.availability === a).length}
          />
        ))}
      </FilterGroup>
      <FilterGroup title={t('catalog.groups.demo')}>
        <CheckOption
          label={t('catalog.hasDemo')}
          checked={!!query.hasDemo}
          onChange={(on) => update({ demo: on })}
          count={products.filter((p) => p.content.demo).length}
        />
      </FilterGroup>
      <FilterGroup title={t('catalog.groups.deployment')}>
        {DEPLOYMENTS.map((d) => (
          <CheckOption
            key={d}
            label={t(`deployment.${d}`)}
            checked={!!query.deployment?.includes(d)}
            onChange={(on) => toggle('deployment', query.deployment!, d, on)}
            count={products.filter((p) => p.deployment.includes(d)).length}
          />
        ))}
      </FilterGroup>
    </div>
  );

  return (
    <>
      <PageHero eyebrow={t('catalog.eyebrow')} title={t('catalog.title')} lead={t('catalog.lead')}>
        <div className="mt-3 flex max-w-2xl items-center gap-3 rounded-2xl border border-line bg-white p-2 pl-4 shadow-lift sm:mt-8">
          <Search className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t('catalog.searchPlaceholder')}
            className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-slate-400"
            aria-label={t('catalog.searchLabel')}
            maxLength={120}
          />
          {searchText && (
            <button
              onClick={() => setSearchText('')}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              aria-label={t('catalog.clearSearch')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <BrowseBy query={query} update={update} />
      </PageHero>

      <section className="container-x py-6 sm:py-10 lg:py-14">
        <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
          <aside className="hidden lg:block" aria-label={t('catalog.filters')}>
            <div className="sticky top-24">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-base font-bold">{t('catalog.filters')}</h2>
                {chips.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="text-xs font-semibold text-brown-600 hover:text-brown-900"
                  >
                    {t('catalog.clearAll')}
                  </button>
                )}
              </div>
              {filters}
            </div>
          </aside>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-slate-500" aria-live="polite">
                <span className="font-semibold text-brown-900">
                  {t('catalog.results', { count: results.length })}
                </span>
                {query.search ? <> {t('catalog.resultsFor', { query: query.search })}</> : null}
              </p>
              <div className="ml-auto flex items-center gap-2">
                <SiteButton
                  variant="outline"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setDrawer(true)}
                  iconLeft={<SlidersHorizontal className="h-4 w-4" />}
                >
                  {t('catalog.filters')}
                  {chips.length ? ` (${chips.length})` : ''}
                </SiteButton>
                <label className="flex items-center gap-2 text-sm text-slate-500">
                  <span className="hidden sm:inline">{t('catalog.sortBy')}</span>
                  <select
                    value={query.sort}
                    onChange={(e) =>
                      update({ sort: e.target.value === 'featured' ? '' : e.target.value })
                    }
                    className="h-9 rounded-xl border border-line bg-white px-3 text-sm font-medium text-brown-900 outline-none focus:ring-4 focus:ring-brown-50"
                  >
                    {(['featured', 'rating', 'newest', 'alphabetical'] as const).map((s) => (
                      <option key={s} value={s}>
                        {t(`catalog.sort.${s}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <BrowseSummary query={query} results={results.length} />
            {chips.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {chips.map((c) => (
                  <button
                    key={c.label}
                    onClick={c.clear}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brown-700 py-1 pr-2 pl-3 text-xs font-medium text-white hover:bg-brown-800"
                  >
                    {c.label} <X className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            )}
            <div className="mt-6">
              {results.length === 0 ? (
                <EmptyState
                  icon={<PackageSearch className="h-6 w-6" />}
                  title={t('catalog.empty.title')}
                  description={
                    query.search
                      ? t('catalog.empty.search', { query: query.search })
                      : t('catalog.empty.filters')
                  }
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      <SiteButton variant="outline" onClick={clearAll}>
                        {t('catalog.clear')}
                      </SiteButton>
                      <SiteButton
                        onClick={() => openAssistant(query.search || undefined)}
                        iconLeft={<Sparkles className="h-4 w-4" />}
                      >
                        {t('catalog.askAssistant')}
                      </SiteButton>
                    </div>
                  }
                />
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {results.map((p) => (
                    <div key={p.slug} className="animate-fade-in">
                      <ProductCard product={p} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <SiteDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title={t('catalog.filters')}
        closeLabel={t('common.close')}
        footer={
          <div className="flex gap-2">
            <SiteButton variant="outline" className="flex-1" onClick={clearAll}>
              {t('catalog.clear')}
            </SiteButton>
            <SiteButton variant="secondary" className="flex-1" onClick={() => setDrawer(false)}>
              {t('catalog.showResults', { count: results.length })}
            </SiteButton>
          </div>
        }
      >
        {filters}
      </SiteDrawer>
    </>
  );
}
