'use client';

import {
  ArrowRight,
  CalendarCheck,
  CornerDownLeft,
  Mail,
  MapPin,
  Menu,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { appConfig } from '@/infrastructure/config/app.config';
import { cn } from '@/shared/lib/cn';
import { iconFor } from '../../icons';
import { searchProducts } from '../../lib/search';
import { SITE_CONTACT } from '../../site-config';
import { AssistantWidget } from './assistant';
import { LAUNCH_BAR_HEIGHT, LaunchBar, useLaunchBar } from './coming-soon';
import { IdeasFab } from './ideas-fab';
import { useMarketplace } from './marketplace-provider';
import { ProductIcon } from './product-card';
import { SiteButton, SiteModal } from './primitives';

export function Logo({
  tone = 'dark',
  className,
  wordmarkClassName,
  href = '/',
}: {
  tone?: 'dark' | 'light';
  className?: string;
  /** e.g. hide the "NIB Digital Solutions" words on very narrow screens (the mark stays). */
  wordmarkClassName?: string;
  href?: string;
}) {
  const t = useTranslations('marketplace.brand');
  return (
    <Link
      href={href}
      className={cn('group inline-flex items-center gap-2.5', className)}
      aria-label={t('homeLabel')}
    >
      {/* The official NIB International Bank mark (same file as the staff portal). */}
      <Image
        src={appConfig.app.logo ?? '/brand/nib-logo.png'}
        alt=""
        width={40}
        height={40}
        priority
        className="h-10 w-10 shrink-0 transition-transform group-hover:scale-105"
      />
      <span className={cn('leading-none', wordmarkClassName)}>
        <span
          className={cn(
            'block font-display text-[15px] font-extrabold tracking-tight',
            tone === 'dark' ? 'text-brown-900' : 'text-white',
          )}
        >
          {t('name')}
        </span>
        <span
          className={cn(
            'block text-[11px] font-semibold tracking-[0.12em] uppercase',
            tone === 'dark' ? 'text-gold-700' : 'text-gold-400',
          )}
        >
          {t('product')}
        </span>
      </span>
    </Link>
  );
}

const NAV = [
  { href: '/', key: 'home', exact: true },
  { href: '/products', key: 'products' },
  { href: '/ideas', key: 'ideas' },
  { href: '/about', key: 'about' },
  { href: '/contact', key: 'contact' },
] as const;

/** Desktop navigation link (also used, invisibly, to measure the space the links need). */
const navLink =
  'relative shrink-0 rounded-full px-2.5 py-2 text-[14px] leading-5 font-medium whitespace-nowrap transition-colors 2xl:px-3';

function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('marketplace');
  const { products, openAssistant, taxonomy } = useMarketplace();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
    }
  }, [open]);

  const items = useMemo(() => {
    const go = (path: string) => () => {
      onClose();
      router.push(path);
    };
    const term = q.trim().toLowerCase();
    const prods = (
      term ? searchProducts(products, term, taxonomy) : products.filter((p) => p.featured)
    )
      .slice(0, 6)
      .map((p) => ({
        id: p.slug,
        group: 'products' as const,
        title: p.name,
        subtitle: p.summary,
        run: go(`/products/${p.slug}`),
        icon: <ProductIcon product={p} size="sm" />,
      }));
    const inds = taxonomy.industries
      .filter(
        (i) =>
          !term || i.name.toLowerCase().includes(term) || i.keywords.some((k) => k.includes(term)),
      )
      .slice(0, term ? 3 : 4)
      .map((i) => {
        const Icon = iconFor(i.icon);
        return {
          id: i.id,
          group: 'industries' as const,
          title: i.name,
          subtitle: t('search.industry'),
          run: go(`/products?industry=${i.id}`),
          icon: <Icon className="h-4.5 w-4.5 text-brown-600" />,
        };
      });
    const needs = term
      ? taxonomy.needs
          .filter(
            (n) => n.name.toLowerCase().includes(term) || n.keywords.some((k) => k.includes(term)),
          )
          .slice(0, 3)
          .map((n) => {
            const Icon = iconFor(n.icon);
            return {
              id: n.id,
              group: 'needs' as const,
              title: n.name,
              subtitle: t('search.need'),
              run: go(`/products?need=${n.id}`),
              icon: <Icon className="h-4.5 w-4.5 text-brown-600" />,
            };
          })
      : [];
    const askItem = term
      ? [
          {
            id: 'ask',
            group: 'assistant' as const,
            title: t('search.ask', { query: q.trim() }),
            subtitle: t('search.askHint'),
            run: () => {
              onClose();
              openAssistant(q.trim());
            },
            icon: <Sparkles className="h-4.5 w-4.5 text-gold-600" />,
          },
        ]
      : [];
    return [...prods, ...inds, ...needs, ...askItem];
  }, [q, products, taxonomy, router, onClose, openAssistant, t]);

  useEffect(() => setActive(0), [q]);

  const groups = [
    { label: q ? t('search.products') : t('search.featured'), id: 'products' },
    { label: t('search.industries'), id: 'industries' },
    { label: t('search.needs'), id: 'needs' },
    { label: t('search.assistant'), id: 'assistant' },
  ] as const;

  return (
    <SiteModal
      open={open}
      onClose={onClose}
      size="md"
      bare
      className="rounded-2xl bg-white shadow-lift sm:mt-[-10vh]"
    >
      <div
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, items.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            items[active]?.run();
          }
        }}
      >
        <div className="flex items-center gap-3 border-b border-line px-5">
          <Search className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            data-autofocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search.placeholder')}
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
            aria-label={t('search.label')}
            role="combobox"
            aria-expanded
            aria-controls="site-search-results"
            aria-activedescendant={items[active] ? `ssr-${items[active].id}` : undefined}
          />
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-[11px] text-slate-400 sm:block">
            Esc
          </kbd>
        </div>
        <div id="site-search-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {items.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-slate-500">{t('search.empty')}</p>
          )}
          {groups.map((g) => {
            const groupItems = items.filter((i) => i.group === g.id);
            if (!groupItems.length) return null;
            return (
              <div key={g.id} className="mb-1">
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                  {g.label}
                </div>
                {groupItems.map((item) => {
                  const idx = items.indexOf(item);
                  return (
                    <button
                      id={`ssr-${item.id}`}
                      key={item.id}
                      role="option"
                      aria-selected={idx === active}
                      onMouseEnter={() => setActive(idx)}
                      onClick={item.run}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left',
                        idx === active ? 'bg-brown-50' : 'hover:bg-mist',
                      )}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center">
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-brown-900">
                          {item.title}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {item.subtitle}
                        </span>
                      </span>
                      {idx === active ? (
                        <CornerDownLeft className="h-4 w-4 text-slate-400" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </SiteModal>
  );
}

function Navbar({ launch }: { launch: ReturnType<typeof useLaunchBar> }) {
  const t = useTranslations('marketplace.nav');
  const pathname = usePathname();
  const { openDemoRequest } = useMarketplace();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Transparent over the top of the home page's (light) hero, frosted white elsewhere.
  const overHero = pathname === '/' && !scrolled && !mobileOpen;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Layout from measured widths, not breakpoints, so text size, zoom and longer
  // translations never make items overlap:
  //   inline  — logo, every link and the actions on one line;
  //   menu    — the links move into the menu (nothing is dropped);
  //   compact — as menu, with the logo mark only and tighter spacing (narrow screens);
  //   + tiny  — still too narrow (small phone, very large text): "Request a Demo"
  //             becomes an icon button that keeps its accessible name.
  // `null` = not measured yet (CSS breakpoints decide until then). Decisions use the
  // full logo and the normal-size actions, so the result never flips back and forth.
  const rowRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const normalActions = useRef(0);
  const layoutRef = useRef<'inline' | 'menu' | 'compact' | null>(null);
  const [layout, setLayout] = useState<'inline' | 'menu' | 'compact' | null>(null);
  const [tiny, setTiny] = useState(false);
  // Bumped on every measurement so the overflow safety net re-runs even when the layout is unchanged.
  const [measured, setMeasured] = useState(0);
  const inline = layout === null ? null : layout === 'inline';
  const compact = layout === 'compact';
  useLayoutEffect(() => {
    const row = rowRef.current;
    const logo = logoRef.current;
    const actions = actionsRef.current;
    const measure = measureRef.current;
    if (!row || !logo || !actions || !measure) return;
    const check = () => {
      if (layoutRef.current !== 'compact') normalActions.current = actions.offsetWidth;
      const style = getComputedStyle(row);
      const gap = parseFloat(style.columnGap) || 0;
      const content =
        row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const logoWidth = logo.scrollWidth;
      // The menu button is h-10 w-10 (2.5rem), so it grows with the text size.
      const menuButton = 2.5 * parseFloat(getComputedStyle(document.documentElement).fontSize);
      const fixed = logoWidth + normalActions.current + gap * 2;
      // +8: room for the active link's heavier weight.
      const next =
        fixed + measure.scrollWidth + 8 <= content
          ? 'inline'
          : logoWidth + normalActions.current + menuButton + gap * 2 + 8 <= content
            ? 'menu'
            : 'compact';
      layoutRef.current = next;
      setLayout(next);
      if (next !== 'compact') setTiny(false);
      setMeasured((n) => n + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(row);
    ro.observe(measure);
    ro.observe(logo);
    void document.fonts?.ready.then(check);
    return () => ro.disconnect();
  }, []);
  // Safety net, from the visible elements' real positions: if anything still
  // overflows, step down one level (inline → menu → compact → icon-only demo button).
  useLayoutEffect(() => {
    const row = rowRef.current;
    const cluster = actionsRef.current?.parentElement;
    const nav = navRef.current;
    if (!row || !cluster || layout === null) return;
    const rowRight =
      row.getBoundingClientRect().right - parseFloat(getComputedStyle(row).paddingRight);
    const overflowing =
      cluster.getBoundingClientRect().right > rowRight + 0.5 ||
      (layout === 'inline' && !!nav && nav.scrollWidth > nav.clientWidth + 1);
    if (!overflowing) return;
    const next = layout === 'inline' ? 'menu' : 'compact';
    if (layout !== 'compact') {
      layoutRef.current = next;
      setLayout(next);
    } else if (!tiny) setTiny(true);
  }, [layout, tiny, measured]);
  useEffect(() => {
    if (inline) setMobileOpen(false);
  }, [inline]);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <a
        href="#main"
        className="sr-only z-[90] rounded-lg bg-gold-500 px-4 py-2 font-semibold text-brown-950 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('skip')}
      </a>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,border-color] duration-300',
          overHero
            ? 'border-b border-transparent bg-transparent'
            : 'border-b border-line/70 bg-[#fffdf9]/88 shadow-[0_8px_30px_-18px_rgb(61_35_18/0.25)] backdrop-blur-xl',
        )}
      >
        {launch.product ? <LaunchBar product={launch.product} onClose={launch.close} /> : null}
        {/* The header row is wider than the page content so large screens give the links room. */}
        <div
          ref={rowRef}
          className="container-x relative flex h-[72px] max-w-[96rem] items-center gap-4"
        >
          <div className="shrink-0">
            <Logo
              tone="dark"
              wordmarkClassName={
                layout === 'compact' ? 'hidden' : layout === null ? 'max-[519px]:hidden' : undefined
              }
            />
          </div>
          {/* Invisible full-width logo, so measuring never depends on the current layout. */}
          <div
            ref={logoRef}
            className="pointer-events-none invisible absolute top-0 left-0 w-max"
            aria-hidden
            inert
          >
            <Logo tone="dark" />
          </div>
          {/* Invisible copy of the links, used only to measure the width they need. */}
          <div
            ref={measureRef}
            className="pointer-events-none invisible absolute top-0 left-0 flex gap-0.5 whitespace-nowrap"
            aria-hidden
          >
            {NAV.map((n) => (
              <span key={n.href} className={navLink}>
                {t(n.key)}
              </span>
            ))}
          </div>
          <nav
            ref={navRef}
            className={cn(
              'flex-1 items-center justify-center gap-0.5',
              inline === null ? 'hidden xl:flex' : inline ? 'flex' : 'hidden',
            )}
            aria-label={t('main')}
          >
            {NAV.map((n) => {
              const active = isActive(n.href, 'exact' in n);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    navLink,
                    'after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:origin-left after:rounded-full after:bg-gold-500 after:transition-transform after:duration-300',
                    active
                      ? 'font-semibold text-brown-900 after:scale-x-100'
                      : 'text-charcoal after:scale-x-0 hover:text-brown-900 hover:after:scale-x-100',
                  )}
                >
                  {t(n.key)}
                </Link>
              );
            })}
          </nav>
          <div
            className={cn(
              'flex shrink-0 items-center',
              compact ? 'gap-1' : 'gap-2',
              !inline && 'ml-auto',
            )}
          >
            <div ref={actionsRef} className={cn('flex items-center', compact ? 'gap-1' : 'gap-2')}>
              <button
                onClick={() => setSearchOpen(true)}
                className={cn(
                  // Phones: at least a 40 x 40 touch target.
                  'flex h-10 shrink-0 items-center justify-center gap-2 rounded-full text-sm whitespace-nowrap text-charcoal transition hover:bg-white/80 hover:text-brown-900 max-sm:min-w-10',
                  compact ? 'px-2' : 'px-2.5',
                )}
                aria-label={t('search')}
                title={t('search')}
              >
                <Search className="h-[18px] w-[18px] shrink-0" />
                <kbd className="hidden rounded-md border border-line bg-white/60 px-1.5 py-0.5 font-sans text-[11px] leading-none 2xl:inline-block">
                  Ctrl K
                </kbd>
              </button>
              {tiny ? (
                <SiteButton
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => openDemoRequest({ source: 'navigation' })}
                  aria-label={t('requestDemo')}
                  title={t('requestDemo')}
                >
                  <CalendarCheck className="h-[18px] w-[18px]" aria-hidden />
                </SiteButton>
              ) : (
                <SiteButton
                  size="sm"
                  className={cn('h-10 shrink-0', compact ? 'px-3 text-[13px]' : 'px-4')}
                  onClick={() => openDemoRequest({ source: 'navigation' })}
                  iconRight={
                    compact ? undefined : <ArrowRight className="hidden h-4 w-4 sm:block" />
                  }
                >
                  {t('requestDemo')}
                </SiteButton>
              )}
            </div>
            <button
              className={cn(
                'h-10 w-10 shrink-0 items-center justify-center rounded-full text-brown-900 transition hover:bg-white/80',
                inline === null ? 'flex xl:hidden' : inline ? 'hidden' : 'flex',
              )}
              onClick={() => setMobileOpen((o) => !o)}
              aria-expanded={mobileOpen}
              aria-controls="site-mobile-menu"
              aria-label={mobileOpen ? t('closeMenu') : t('openMenu')}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileOpen && !inline && (
          <div
            id="site-mobile-menu"
            className="max-h-[calc(100dvh-var(--site-top,72px))] animate-fade-in overflow-y-auto border-t border-line bg-[#fffdf9] shadow-lift"
          >
            <nav className="container-x flex flex-col gap-0.5 py-4" aria-label={t('mobile')}>
              {NAV.map((n, i) => {
                const active = isActive(n.href, 'exact' in n);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex animate-fade-up items-center justify-between rounded-2xl px-4 py-3.5 text-base font-medium transition',
                      active
                        ? 'bg-gold-50 text-brown-900 ring-1 ring-gold-200'
                        : 'text-charcoal hover:bg-cream',
                    )}
                    style={{ animationDelay: `${i * 35}ms` }}
                  >
                    {t(n.key)}
                    <ArrowRight
                      className={cn('h-4 w-4', active ? 'text-gold-700' : 'text-charcoal/30')}
                      aria-hidden
                    />
                  </Link>
                );
              })}
              <div className="mt-3 grid gap-2 border-t border-line pt-4 sm:grid-cols-2">
                <SiteButton
                  variant="outline"
                  onClick={() => {
                    setMobileOpen(false);
                    setSearchOpen(true);
                  }}
                  iconLeft={<Search className="h-4 w-4" />}
                >
                  {t('searchShort')}
                </SiteButton>
                <SiteButton
                  onClick={() => {
                    setMobileOpen(false);
                    openDemoRequest({ source: 'navigation' });
                  }}
                  iconRight={<ArrowRight className="h-4 w-4" />}
                >
                  {t('requestDemo')}
                </SiteButton>
              </div>
            </nav>
          </div>
        )}
      </header>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

const footerLink = 'transition-colors hover:text-gold-300';

function FooterHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-white!">
      <span className="h-3.5 w-0.5 rounded-full bg-gold-400" aria-hidden />
      {children}
    </h3>
  );
}

function Footer() {
  const t = useTranslations('marketplace');
  const { products, taxonomy } = useMarketplace();
  return (
    <footer className="brand-band relative overflow-hidden text-white/75">
      <div className="honeycomb-light pointer-events-none absolute inset-0" aria-hidden />
      <div className="container-x relative grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          {/* Light plate: the logo's brown arch must stay visible on the brown footer. */}
          <div className="inline-flex rounded-2xl bg-white px-3.5 py-2.5 shadow-tile">
            <Logo tone="dark" />
          </div>
          <p className="mt-5 max-w-sm text-sm leading-relaxed">{t('footer.blurb')}</p>
          <ul className="mt-6 space-y-3 text-sm">
            <li className="flex items-center gap-2.5">
              <Mail className="h-4 w-4 shrink-0 text-gold-400" />
              <a href={`mailto:${SITE_CONTACT.email}`} className={footerLink}>
                {SITE_CONTACT.email}
              </a>
            </li>
            <li className="flex items-center gap-2.5">
              <Phone className="h-4 w-4 shrink-0 text-gold-400" />
              <a href={`tel:${SITE_CONTACT.phone.replace(/\s/g, '')}`} className={footerLink}>
                {SITE_CONTACT.phone}
              </a>
            </li>
            <li className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" /> {SITE_CONTACT.address}
            </li>
          </ul>
        </div>
        <div>
          <FooterHeading>{t('footer.popular')}</FooterHeading>
          <ul className="mt-5 space-y-2.5 text-sm">
            {products
              .filter((p) => p.featured)
              .slice(0, 6)
              .map((p) => (
                <li key={p.slug}>
                  <Link href={`/products/${p.slug}`} className={footerLink}>
                    {p.name}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
        <div>
          <FooterHeading>{t('footer.industries')}</FooterHeading>
          <ul className="mt-5 space-y-2.5 text-sm">
            {taxonomy.industries.slice(0, 6).map((i) => (
              <li key={i.id}>
                <Link href={`/products?industry=${i.id}`} className={footerLink}>
                  {i.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <FooterHeading>{t('footer.company')}</FooterHeading>
          <ul className="mt-5 space-y-2.5 text-sm">
            <li>
              <Link href="/about" className={footerLink}>
                {t('footer.about')}
              </Link>
            </li>
            <li>
              <Link href="/ideas" className={footerLink}>
                {t('footer.ideas')}
              </Link>
            </li>
            <li>
              <Link href="/contact" className={footerLink}>
                {t('footer.contact')}
              </Link>
            </li>
            <li>
              <a
                href={SITE_CONTACT.bankUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={footerLink}
              >
                {t('footer.bank')}
              </a>
            </li>
            <li>
              <Link href="/login" className={footerLink}>
                {t('footer.staff')}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="relative border-t border-white/15">
        {/* pb-24: room for the floating ideas and assistant buttons, so they never cover this line. */}
        <div className="container-x flex flex-col gap-3 pt-6 pb-24 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>{t('footer.rights', { year: new Date().getFullYear() })}</p>
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-gold-400" /> {t('footer.safety')}
          </p>
        </div>
      </div>
    </footer>
  );
}

/** Public site chrome: navbar, footer, floating assistant; resets scroll per page. */
export function SiteChrome({ children }: { children: ReactNode }) {
  const launch = useLaunchBar();
  // Height of the fixed header (+ the coming-soon bar): page tops and sticky bars sit below it.
  const top = 72 + (launch.product ? LAUNCH_BAR_HEIGHT : 0);
  return (
    <div
      className="site flex min-h-dvh flex-col"
      style={{ '--site-top': `${top}px` } as CSSProperties}
    >
      <Navbar launch={launch} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <IdeasFab />
      <AssistantWidget />
    </div>
  );
}

/**
 * Interior page header (light band under the fixed navbar). Phones get a
 * compact version (smaller title and lead, less padding), so the page's own
 * content starts on the first screen instead of below the introduction.
 */
export function PageHero({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-cream to-white pt-[var(--site-top,72px)]">
      <div
        className="honeycomb-bg absolute inset-0 opacity-80 [mask-image:linear-gradient(to_bottom,black,transparent)]"
        aria-hidden
      />
      <div
        className="absolute -top-40 right-[-10%] h-[420px] w-[420px] rounded-full bg-gold-200/45 blur-3xl motion-safe:animate-drift"
        aria-hidden
      />
      <div className="container-x relative py-7 sm:py-20">
        {eyebrow && <p className="eyebrow animate-fade-up">{eyebrow}</p>}
        <h1
          className="mt-2.5 max-w-3xl animate-fade-up text-[clamp(1.75rem,7.6vw,2.25rem)] leading-[1.1] font-extrabold tracking-[-0.03em] text-balance sm:mt-3 sm:text-5xl sm:leading-[1.08]"
          style={{ animationDelay: '80ms' }}
        >
          {title}
        </h1>
        {lead && <PageLead>{lead}</PageLead>}
        {children ? (
          <div className="animate-fade-up" style={{ animationDelay: '240ms' }}>
            {children}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Up to this many characters, a lead fits in three lines even on a 320 px phone. */
const LEAD_FITS = 100;

/**
 * The page's introduction. Phones show its first three lines and "Read more",
 * so the page's content starts on the first screen; larger screens always show
 * it whole. Whether the button shows is decided on the server from the text's
 * length (nothing jumps when the page loads); once loaded it is dropped again
 * if the text turns out to fit, and its full text is always in the page for
 * screen readers and search engines.
 */
function PageLead({ children }: { children: ReactNode }) {
  const t = useTranslations('marketplace.common');
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [toggle, setToggle] = useState(
    () => typeof children !== 'string' || children.length > LEAD_FITS,
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const check = () => {
      // Not clamped (sm and up: the button is hidden by CSS anyway) or no layout yet.
      if (getComputedStyle(el).webkitLineClamp === 'none' || el.clientHeight === 0) return;
      setToggle(el.scrollHeight > el.clientHeight + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  return (
    <>
      <p
        ref={ref}
        id="page-lead"
        className={cn(
          'mt-3 max-w-2xl animate-fade-up text-base leading-relaxed text-charcoal sm:mt-5 sm:text-lg',
          !open && 'max-sm:line-clamp-3',
        )}
        style={{ animationDelay: '160ms' }}
      >
        {children}
      </p>
      {toggle || open ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="page-lead"
          className="mt-1 -ml-1 inline-flex h-9 animate-fade-up items-center rounded-lg px-1 text-sm font-semibold text-brown-700 underline-offset-4 hover:underline sm:hidden"
          style={{ animationDelay: '160ms' }}
        >
          {open ? t('showLess') : t('readMore')}
        </button>
      ) : null}
    </>
  );
}
