'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Avatar, type AvatarVariant } from './menu';

export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';

const PRESENCE: Record<PresenceStatus, string> = {
  online: 'bg-success',
  away: 'bg-warning',
  busy: 'bg-danger',
  offline: 'bg-subtle-foreground',
};

export interface ProfileMetaItem {
  icon: ReactNode;
  label: ReactNode;
  /** Accessible description, e.g. "Branch". */
  title?: string;
  /** Identifies the entry when neither a title nor a plain-text label does. */
  id?: string;
}

/** React key of a meta entry: its id, else its title, else its text. */
export function metaKey(m: ProfileMetaItem): string {
  return m.id ?? m.title ?? (typeof m.label === 'string' ? m.label : '');
}

export interface ProfileTab {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Count or status shown next to the label. */
  badge?: ReactNode;
  href: string;
}

/**
 * Profile hero (Vuexy / Materio "user profile" idiom), reusable for people,
 * customers, merchants or branches:
 *   • brand cover (or a custom one) with an overlapping avatar and presence dot
 *   • name, verification / status badges, handle
 *   • meta line (role, branch, joined …) and primary actions
 *   • tabs as links (keep the active tab in the URL: ?tab=…)
 * Stacks and centres on small screens.
 */
export function ProfileHeader({
  name,
  handle,
  avatarSrc,
  presence,
  presenceLabel,
  badges,
  meta = [],
  actions,
  cover,
  coverTone = 'soft',
  avatarVariant = 'soft',
  tabs,
  activeTab,
  tabsLabel,
  avatarAction,
  className,
}: Readonly<{
  name: string;
  /** Secondary identity line, e.g. "@jdoe". */
  handle?: ReactNode;
  avatarSrc?: string | null;
  presence?: PresenceStatus;
  presenceLabel?: string;
  /** Inline badges after the name (status, verified, role). */
  badges?: ReactNode;
  meta?: ProfileMetaItem[];
  actions?: ReactNode;
  /** Replaces the default cover (image, gradient…). */
  cover?: ReactNode;
  /**
   * Default cover when `cover` is not given: "soft" (light brand wash, the
   * default), "brand" (bold gradient) or "none" (no cover band).
   */
  coverTone?: 'soft' | 'brand' | 'none';
  /** Avatar style (see Avatar): "soft" by default. */
  avatarVariant?: AvatarVariant;
  tabs?: ProfileTab[];
  activeTab?: string;
  tabsLabel?: string;
  /** Overlay control on the avatar (e.g. change photo). */
  avatarAction?: ReactNode;
  className?: string;
}>) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-surface border border-border bg-surface shadow-card',
        className,
      )}
      aria-label={name}
    >
      {cover || coverTone !== 'none' ? (
        <div className="relative h-20 sm:h-24">
          {cover ?? (coverTone === 'brand' ? <BrandCover /> : <SoftCover />)}
        </div>
      ) : null}

      <div className={cn('relative px-5 pb-4 sm:px-6', !cover && coverTone === 'none' && 'pt-5')}>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
          <div
            className={cn(
              'relative shrink-0',
              (cover || coverTone !== 'none') && '-mt-10 sm:-mt-12',
            )}
          >
            <Avatar
              name={name}
              src={avatarSrc}
              size={96}
              variant={avatarVariant}
              className="rounded-surface text-3xl ring-4 ring-surface"
            />
            {presence ? (
              <>
                <span
                  className={cn(
                    'absolute end-1 bottom-1 size-4 rounded-full ring-[3px] ring-surface',
                    PRESENCE[presence],
                  )}
                  title={presenceLabel ?? presence}
                  aria-hidden
                />
                <span className="sr-only">{presenceLabel ?? presence}</span>
              </>
            ) : null}
            {avatarAction ? <div className="absolute -end-1 -top-1">{avatarAction}</div> : null}
          </div>

          <div className="min-w-0 flex-1 text-center sm:pb-1 sm:text-start">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className="truncate text-xl leading-tight font-semibold sm:text-2xl">{name}</h1>
              {badges}
            </div>
            {handle ? <p className="mt-0.5 text-sm text-muted-foreground">{handle}</p> : null}
            {meta.length ? (
              <ul className="mt-2.5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground sm:justify-start">
                {meta.map((m) => (
                  <li
                    key={metaKey(m)}
                    className="flex items-center gap-1.5 [&_svg]:size-4 [&_svg]:shrink-0"
                    title={m.title}
                  >
                    <span aria-hidden>{m.icon}</span>
                    {m.title ? <span className="sr-only">{m.title}: </span> : null}
                    <span>{m.label}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {actions ? (
            <div className="flex shrink-0 flex-wrap justify-center gap-2 sm:pb-1">{actions}</div>
          ) : null}
        </div>
      </div>

      {tabs?.length ? (
        <nav
          aria-label={tabsLabel ?? name}
          className="scrollbar-thin flex overflow-x-auto border-t border-border px-3 sm:px-4"
        >
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                scroll={false}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_svg]:size-4',
                  active
                    ? 'font-semibold text-primary-text'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.icon ? <span aria-hidden>{tab.icon}</span> : null}
                {tab.label}
                {tab.badge}
                {active ? (
                  <span
                    className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-pill bg-primary"
                    aria-hidden
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </section>
  );
}

/** Default cover: a light brand wash with a faint honeycomb texture. */
export function SoftCover() {
  return (
    <div
      className="absolute inset-0 overflow-hidden border-b border-border bg-gradient-to-r from-primary-softer via-surface-muted to-surface"
      aria-hidden
    >
      <div className="absolute inset-0 bg-[url('/brand/honeycomb.png')] bg-[length:420px_auto] opacity-[0.05]" />
    </div>
  );
}

/** Bold cover (coverTone="brand"): brand gradient, honeycomb texture and soft light circles. */
export function BrandCover() {
  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[linear-gradient(120deg,var(--brand-secondary)_0%,#a3622a_50%,var(--brand-primary)_100%)]"
      aria-hidden
    >
      <div className="absolute inset-0 bg-[url('/brand/honeycomb.png')] bg-[length:420px_auto] opacity-[0.14] mix-blend-overlay" />
      <span className="absolute -end-10 -top-16 size-56 rounded-full bg-white/10" />
      <span className="absolute end-40 -bottom-20 size-40 rounded-full bg-white/10" />
      <span className="absolute start-1/3 top-4 size-3 rounded-full bg-white/30" />
    </div>
  );
}
