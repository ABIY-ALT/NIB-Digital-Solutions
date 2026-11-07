'use client';

import { useMutation } from '@tanstack/react-query';
import {
  ClipboardCheck,
  Database,
  KeyRound,
  Languages,
  LogOut,
  ScrollText,
  Search,
  SearchX,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { useLogout } from '@/features/auth/hooks/use-auth';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { useFeatureFlags } from '@/shared/feature-flags/feature-flags';
import type { ResolvedNavItem, ResolvedNavSection } from '@/shared/layouts/navigation';
import { NavIcon } from '@/shared/layouts/navigation';
import { cn } from '@/shared/lib/cn';
import { fuzzyFilter, fuzzyMatch } from '@/shared/lib/fuzzy';
import { COLOR_MODE_ICON } from '@/shared/theme/theme-switcher';
import { useTheme } from '@/shared/theme/theme-provider';
import { Badge } from '@/shared/ui/badge';
import {
  CommandPalette,
  Kbd,
  type CommandGroup,
  type CommandItem,
} from '@/shared/ui/command-palette';
import { DESTINATIONS } from '../destinations';
import { useRecordSearch } from '../hooks/use-record-search';
import { pushRecent, readRecent, removeRecent } from '../recent';
import type { QuickSearchRecord } from '../types';

/** A page or action the palette can open (records come from the server). */
interface Entry {
  id: string;
  kind: 'page' | 'action';
  label: string;
  description?: string;
  icon: ReactNode;
  keywords: string[];
  href?: string;
  run?: () => void;
}

const SOURCE_ICON: Record<QuickSearchRecord['source'], LucideIcon> = {
  users: Users,
  roles: ShieldCheck,
  'reference-data': Database,
  approvals: ClipboardCheck,
  audit: ScrollText,
};
const SOURCE_ORDER: readonly QuickSearchRecord['source'][] = [
  'users',
  'roles',
  'reference-data',
  'approvals',
  'audit',
];

function flatten(
  items: ResolvedNavItem[],
  section?: string,
): Array<ResolvedNavItem & { section?: string }> {
  return items.flatMap((item) => [
    ...(item.href ? [{ ...item, section }] : []),
    ...flatten(item.children ?? [], section),
  ]);
}

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  !!el.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]');

/**
 * Quick search (⌘K / Ctrl K, or "/"): one box to reach any page, setting,
 * action or record the user may access. Pages and actions are ranked locally
 * with fuzzy matching (abbreviations, typos, Amharic); records come from a
 * federated, permission-aware server search.
 */
export function QuickSearch({
  sections,
  locales,
}: Readonly<{
  sections: ResolvedNavSection[];
  locales: Array<{ code: string; label: string }>;
}>) {
  const t = useTranslations('quickSearch');
  const tt = useTranslations('theme');
  const router = useRouter();
  const locale = useLocale();
  const { can, user } = usePermissions();
  const flags = useFeatureFlags();
  const theme = useTheme();
  const logout = useLogout();
  const changeLocale = useMutation({
    mutationFn: (code: string) =>
      apiFetch('/api/locale', { method: 'POST', body: { locale: code } }),
    onSuccess: () => router.refresh(),
  });

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [isMac, setIsMac] = useState(false);
  const { records, searching, failed, minLength } = useRecordSearch(query, open);

  useEffect(() => setIsMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  useEffect(() => {
    if (open) setRecent(readRecent(user?.id));
  }, [open, user?.id]);

  // ⌘K / Ctrl K toggles from anywhere; "/" opens when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !isEditable(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Searchable pages and actions ──────────────────────────────────────────
  const entries = useMemo<Entry[]>(() => {
    const pages: Entry[] = sections.flatMap((s) =>
      flatten(s.items, s.label).map((item) => ({
        id: `page:${item.href}`,
        kind: 'page' as const,
        label: item.label,
        description: item.section,
        icon: <NavIcon name={item.icon} className="size-4" />,
        keywords: [item.id.replaceAll('-', ' ')],
        href: item.href,
      })),
    );
    const destinations: Entry[] = DESTINATIONS.filter(
      (d) => (!d.permission || can(d.permission)) && (!d.feature || flags[d.feature] !== false),
    ).map((d) => ({
      id: `page:${d.href}`,
      kind: 'page',
      label: t(`destinations.${d.id}.label`),
      description: t(`destinations.${d.id}.section`),
      icon: <d.icon />,
      keywords: t(`destinations.${d.id}.keywords`).split(','),
      href: d.href,
    }));
    const actions: Entry[] = [
      ...(theme.canSwitch
        ? theme.modes
            .filter((m) => m !== theme.mode)
            .map((m) => {
              const Icon = COLOR_MODE_ICON[m];
              return {
                id: `action:theme-${m}`,
                kind: 'action' as const,
                label: t('actions.theme', { mode: tt(`modes.${m}`) }),
                description: tt('label'),
                icon: <Icon />,
                keywords: t('keywords.theme').split(','),
                run: () => theme.setMode(m),
              };
            })
        : []),
      ...locales
        .filter((l) => l.code !== locale)
        .map((l) => ({
          id: `action:locale-${l.code}`,
          kind: 'action' as const,
          label: t('actions.language', { language: l.label }),
          description: t('actions.languageHint'),
          icon: <Languages />,
          keywords: [...t('keywords.language').split(','), l.code, l.label],
          run: () => changeLocale.mutate(l.code),
        })),
      {
        id: 'action:change-password',
        kind: 'action',
        label: t('actions.changePassword'),
        description: t('destinations.security.section'),
        icon: <KeyRound />,
        keywords: t('keywords.password').split(','),
        href: '/profile?tab=security',
      },
      {
        id: 'action:sign-out',
        kind: 'action',
        label: t('actions.signOut'),
        description: user?.username,
        icon: <LogOut />,
        keywords: t('keywords.signOut').split(','),
        run: () => logout.mutate(undefined),
      },
    ];
    // A destination may repeat a navigation page (same href): keep the first.
    const seen = new Set<string>();
    return [...pages, ...destinations, ...actions].filter((e) =>
      seen.has(e.id) ? false : (seen.add(e.id), true),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutations are stable enough; labels follow t
  }, [sections, locales, locale, t, tt, theme.mode, theme.canSwitch, can, flags, user?.username]);

  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const openEntry = (entry: Entry) => {
    setRecent(pushRecent(user?.id, entry.id));
    close();
    if (entry.run) entry.run();
    else if (entry.href) router.push(entry.href);
  };

  // ── Groups ───────────────────────────────────────────────────────────────
  const toItem = (e: Entry, indices?: number[]): CommandItem => ({
    id: e.id,
    label: e.label,
    description: e.description,
    icon: e.icon,
    indices,
    badge:
      e.kind === 'action' ? (
        <span className="text-[11px] text-subtle-foreground">{t('kinds.action')}</span>
      ) : undefined,
  });

  const groups: CommandGroup[] = useMemo(() => {
    if (!query.trim()) {
      const items = recent
        .map((id) => byId.get(id))
        .filter((e): e is Entry => !!e)
        .map((e) => ({
          ...toItem(e),
          secondary: {
            label: t('removeRecent'),
            icon: <X />,
            onSelect: () => setRecent(removeRecent(user?.id, e.id)),
          },
        }));
      return [{ id: 'recent', label: t('groups.recent'), items }];
    }
    const ranked = fuzzyFilter(
      entries,
      query,
      (e) => ({ label: e.label, keywords: [...e.keywords, e.description] }),
      { relativeCutoff: 0.35 },
    );
    const pages = ranked.filter((r) => r.item.kind === 'page').slice(0, 6);
    const actions = ranked.filter((r) => r.item.kind === 'action').slice(0, 4);
    const recordGroups: CommandGroup[] = SOURCE_ORDER.map((source) => {
      const Icon = SOURCE_ICON[source];
      return {
        id: `records:${source}`,
        label: t(`sources.${source}`),
        items: records
          .filter((r) => r.source === source)
          .map((r) => ({
            id: `record:${r.source}:${r.id}`,
            label: r.title,
            description: r.subtitle,
            icon: <Icon />,
            indices: fuzzyMatch(query, { label: r.title })?.indices,
            badge: r.badge ? (
              <Badge tone="neutral" className="px-1.5 py-0 text-[10px]">
                {r.badge}
              </Badge>
            ) : undefined,
          })),
      };
    });
    const waiting = searching && records.length === 0 && query.trim().length >= minLength;
    return [
      { id: 'pages', label: t('groups.pages'), items: pages.map((r) => toItem(r.item, r.indices)) },
      {
        id: 'actions',
        label: t('groups.actions'),
        items: actions.map((r) => toItem(r.item, r.indices)),
      },
      ...recordGroups,
      ...(waiting ? [{ id: 'records', label: t('groups.records'), items: [], loading: true }] : []),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toItem only depends on t
  }, [query, entries, records, recent, byId, searching, minLength, t, user?.id]);

  const onSelect = (item: CommandItem) => {
    const entry = byId.get(item.id);
    if (entry) return openEntry(entry);
    const record = records.find((r) => item.id === `record:${r.source}:${r.id}`);
    if (record) {
      close();
      router.push(record.href);
    }
  };

  const suggestions = sections
    .map((s) => ({ id: s.id, label: s.label, items: flatten(s.items).slice(0, 5) }))
    .filter((s) => s.items.length > 0);

  let footer: ReactNode = null;
  if (failed.length) {
    footer = <span className="text-warning">{t('footer.partial')}</span>;
  } else if (query.trim().length < minLength) {
    footer = t('footer.hint', { count: minLength });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('open')}
        aria-keyshortcuts="Control+K Meta+K /"
        className={cn(
          'flex h-8 items-center gap-2 rounded-control text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
          'max-md:w-8 max-md:justify-center max-md:hover:bg-hover',
          'md:w-56 md:border md:border-border md:bg-surface-muted md:px-2.5 md:hover:border-border-strong md:hover:bg-surface',
        )}
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="hidden flex-1 truncate text-start text-xs text-subtle-foreground md:inline">
          {t('trigger')}
        </span>
        <span className="hidden items-center gap-0.5 md:flex" aria-hidden>
          <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <CommandPalette
        open={open}
        onOpenChange={(v) => (v ? setOpen(true) : close())}
        query={query}
        onQueryChange={setQuery}
        groups={groups}
        onSelect={onSelect}
        busy={searching}
        labels={{
          title: t('title'),
          placeholder: t('placeholder'),
          close: t('close'),
          navigate: t('footer.navigate'),
          select: t('footer.select'),
          dismiss: t('clear'),
          loading: t('searching'),
        }}
        footer={footer}
        idle={
          <div className="grid gap-x-6 gap-y-4 px-3 pt-2 pb-3 sm:grid-cols-2">
            {suggestions.map((s) => (
              <div key={s.id}>
                <div className="pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {s.label ?? t('groups.pages')}
                </div>
                <ul className="space-y-0.5">
                  {s.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          const entry = byId.get(`page:${item.href}`);
                          if (entry) openEntry(entry);
                        }}
                        className="flex w-full items-center gap-2 rounded-item px-1.5 py-1 text-start text-sm text-foreground outline-none hover:bg-hover hover:text-primary-text focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <NavIcon name={item.icon} className="size-4 text-muted-foreground" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        }
        empty={
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <SearchX className="size-6" aria-hidden />
            </span>
            <p className="font-semibold">{t('empty.title', { query: query.trim() })}</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t('empty.hint')}</p>
          </div>
        }
      />
    </>
  );
}
