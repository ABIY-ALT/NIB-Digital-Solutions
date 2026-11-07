'use client';

import { Bell, Keyboard, Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { describeError } from '@/shared/errors/error-messages';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { ErrorState } from '@/shared/ui/feedback';
import { Input } from '@/shared/ui/input';
import { Dialog, DialogContent } from '@/shared/ui/overlay';
import { PageHeader } from '@/shared/ui/page-header';
import { toast } from '@/shared/ui/toaster';
import {
  useNotification,
  useNotificationAction,
  useNotifications,
  useNotificationSummary,
} from '../hooks/use-notifications';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_FOLDERS,
  type AppNotification,
  type NotificationAction,
  type NotificationFolder,
} from '../types';
import { ComposeDialog } from './compose-dialog';
import { NotificationList, NotificationToolbar, type SelectMode } from './notification-list';
import { NotificationReader } from './notification-reader';
import { NotificationSidebar } from './notification-sidebar';
import { PreferencesDialog } from './preferences-dialog';

const PAGE_SIZE = 25;
const SHORTCUTS = [
  ['j / k', 'next'],
  ['o / Enter', 'open'],
  ['u', 'back'],
  ['e', 'archive'],
  ['#', 'trash'],
  ['s', 'star'],
  ['Shift + i', 'read'],
  ['Shift + u', 'unread'],
  ['/', 'search'],
  ['?', 'help'],
] as const;

/** Gmail shortcuts that act on the focused message: what to do with it, if anything. */
function messageShortcut(
  key: string,
  n: AppNotification,
  folder: NotificationFolder,
): NotificationAction | 'open' | null {
  switch (key) {
    case 'o':
    case 'Enter':
      return 'open';
    case 'e':
      return folder === 'archived' ? 'unarchive' : 'archive';
    case '#':
      return 'trash';
    case 's':
      return n.starred ? 'unstar' : 'star';
    case 'I':
      return 'read';
    case 'U':
      return 'unread';
    default:
      return null;
  }
}

/** URL-backed state (?folder=&cat=&q=&page=&id=&settings=) so views are linkable. */
function useCenterParams() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const folder = (NOTIFICATION_FOLDERS as readonly string[]).includes(sp.get('folder') ?? '')
    ? (sp.get('folder') as NotificationFolder)
    : 'inbox';
  const cat = sp.get('cat');
  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );
  return {
    folder,
    category: cat && (NOTIFICATION_CATEGORIES as string[]).includes(cat) ? cat : null,
    search: sp.get('q') ?? '',
    page: Math.max(1, Number(sp.get('page')) || 1),
    openId: sp.get('id'),
    settings: sp.get('settings') === '1',
    set,
  };
}

/**
 * Notification centre (Gmail-style): folders and category labels, selectable
 * rows with hover actions, bulk toolbar, reading pane, search, announcements
 * (Compose), channel settings and keyboard shortcuts.
 */
export function NotificationCenter() {
  const t = useTranslations('notifications');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const { can } = usePermissions();
  const p = useCenterParams();
  const summary = useNotificationSummary();
  const list = useNotifications({
    folder: p.folder,
    category: p.category ?? undefined,
    search: p.search,
    page: p.page,
    pageSize: PAGE_SIZE,
  });
  const opened = useNotification(p.openId);
  const act = useNotificationAction();
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allInFolder, setAllInFolder] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [query, setQuery] = useState(p.search);
  const searchRef = useRef<HTMLInputElement>(null);

  // A new view starts with nothing selected.
  useEffect(() => {
    setSelected(new Set());
    setAllInFolder(false);
  }, [p.folder, p.category, p.search, p.page]);

  const current = items.find((n) => n.id === p.openId) ?? opened.data;

  const open = useCallback(
    (n: AppNotification) => {
      if (!n.read) act.mutate({ action: 'read', target: { ids: [n.id] } });
      setFocusId(n.id);
      p.set({ id: n.id });
    },
    [act, p],
  );

  const runOn = useCallback(
    (ids: string[], action: NotificationAction, undoable = true) => {
      if (ids.length === 0) return;
      act.mutate(
        { action, target: { ids } },
        {
          onSuccess: (res) => {
            const undo: Partial<Record<NotificationAction, NotificationAction>> = {
              archive: 'unarchive',
              trash: 'restore',
              unarchive: 'archive',
            };
            const reverse = undo[action];
            if (reverse && undoable) {
              toast(t(`toast.${action}`, { count: res.affected }), {
                action: {
                  label: t('actions.undo'),
                  onClick: () => act.mutate({ action: reverse, target: { ids } }),
                },
              });
            } else if (action === 'delete') {
              toast(t('toast.delete', { count: res.affected }));
            }
          },
          onError: (error) => toast.error(describeError(error, te).message),
        },
      );
      if (
        ['archive', 'unarchive', 'trash', 'restore', 'delete'].includes(action) &&
        p.openId &&
        ids.includes(p.openId)
      ) {
        p.set({ id: null });
      }
    },
    [act, p, t, te],
  );

  const bulk = (action: NotificationAction) => {
    if (allInFolder || selected.size === 0) {
      act.mutate(
        { action, target: { folder: p.folder, category: p.category ?? undefined } },
        {
          onSuccess: (res) => toast(t(`toast.${action}`, { count: res.affected })),
          onError: (error) => toast.error(describeError(error, te).message),
        },
      );
      setSelected(new Set());
      setAllInFolder(false);
      return;
    }
    runOn([...selected], action);
    setSelected(new Set());
  };

  const selectMode = (mode: SelectMode) => {
    setAllInFolder(false);
    const pick: Record<SelectMode, (n: AppNotification) => boolean> = {
      all: () => true,
      none: () => false,
      read: (n) => n.read,
      unread: (n) => !n.read,
      starred: (n) => n.starred,
      unstarred: (n) => !n.starred,
    };
    setSelected(new Set(items.filter(pick[mode]).map((n) => n.id)));
  };

  // ── Keyboard shortcuts (Gmail) ────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
        return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const index = items.findIndex((n) => n.id === (focusId ?? p.openId));
      const focused = items[index] ?? current;
      const move = (delta: number) => {
        const next = items[Math.min(items.length - 1, Math.max(0, index + delta))];
        if (!next) return;
        setFocusId(next.id);
        document.querySelector(`[data-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' });
        if (p.openId) open(next);
      };
      const onMessage = (n: AppNotification): boolean => {
        const action = messageShortcut(e.key, n, p.folder);
        if (!action) return false;
        if (action === 'open') open(n);
        else runOn([n.id], action);
        return true;
      };
      const handle = (): boolean => {
        switch (e.key) {
          case 'j':
            move(1);
            return true;
          case 'k':
            move(-1);
            return true;
          case 'u':
            if (!p.openId) return false;
            p.set({ id: null });
            return true;
          case '/':
            searchRef.current?.focus();
            return true;
          case '?':
            setHelpOpen(true);
            return true;
          default:
            return focused ? onMessage(focused) : false;
        }
      };
      if (handle()) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, focusId, items, open, p, runOn]);

  const pageFull = items.length > 0 && selected.size === items.length;
  const total = list.data?.pagination.totalItems ?? 0;
  const viewName = p.category ? t(`categories.${p.category}`) : t(`folders.${p.folder}`);
  const emptyKey = p.folder === 'inbox' || p.folder === 'unread' ? p.folder : 'other';

  return (
    <>
      <PageHeader
        icon={<Bell />}
        title={t('title')}
        description={t('description')}
        actions={
          <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
            <Keyboard /> {t('shortcuts.button')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <NotificationSidebar
          folder={p.folder}
          category={p.category}
          summary={summary.data}
          canCompose={can('notifications:broadcast')}
          onFolder={(folder) =>
            p.set({ folder: folder === 'inbox' ? null : folder, cat: null, page: null, id: null })
          }
          onCategory={(cat) => p.set({ cat, folder: null, page: null, id: null })}
          onCompose={() => setComposeOpen(true)}
          onSettings={() => p.set({ settings: '1' })}
        />

        <section className="min-w-0 overflow-hidden rounded-surface border border-border bg-surface shadow-card">
          <form
            role="search"
            className="border-b border-border p-2"
            onSubmit={(e) => {
              e.preventDefault();
              p.set({ q: query.trim() || null, page: null, id: null });
            }}
          >
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className="h-10 rounded-pill border-transparent bg-muted ps-10 focus-visible:bg-surface"
              startAdornment={<Search />}
              endAdornment={
                query ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('clearSearch')}
                    onClick={() => {
                      setQuery('');
                      p.set({ q: null, page: null });
                    }}
                  >
                    <X />
                  </Button>
                ) : undefined
              }
            />
          </form>

          <div className={cn('grid', p.openId && 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]')}>
            <div
              className={cn('min-w-0', p.openId && 'max-xl:hidden xl:border-e xl:border-border')}
            >
              <NotificationToolbar
                folder={p.folder}
                items={items}
                selected={selected}
                allInFolder={allInFolder}
                pagination={list.data?.pagination}
                busy={list.isFetching}
                onSelect={selectMode}
                onAction={bulk}
                onRefresh={() => {
                  void list.refetch();
                  void summary.refetch();
                }}
                onPage={(page) => p.set({ page: page > 1 ? String(page) : null })}
              />
              {pageFull && total > items.length && !allInFolder ? (
                <p className="border-b border-border bg-muted/60 px-4 py-2 text-center text-xs">
                  {t('select.pageSelected', { count: items.length })}{' '}
                  <button
                    type="button"
                    className="font-semibold text-secondary hover:underline"
                    onClick={() => setAllInFolder(true)}
                  >
                    {t('select.selectAllIn', { count: total, view: viewName })}
                  </button>
                </p>
              ) : null}
              {allInFolder ? (
                <p className="border-b border-border bg-primary-softer px-4 py-2 text-center text-xs">
                  {t('select.allSelected', { count: total, view: viewName })}{' '}
                  <button
                    type="button"
                    className="font-semibold text-secondary hover:underline"
                    onClick={() => selectMode('none')}
                  >
                    {t('select.clear')}
                  </button>
                </p>
              ) : null}
              {list.error ? (
                <ErrorState
                  title={te('title')}
                  description={describeError(list.error, te).message}
                  correlationId={describeError(list.error, te).correlationId}
                  referenceLabel={tc('reference')}
                  action={
                    <Button variant="outline" onClick={() => list.refetch()}>
                      {tc('retry')}
                    </Button>
                  }
                />
              ) : (
                <NotificationList
                  items={items}
                  loading={list.isPending}
                  selected={selected}
                  activeId={p.openId}
                  focusId={focusId}
                  folder={p.folder}
                  emptyTitle={p.search ? t('empty.search') : t(`empty.${emptyKey}`)}
                  onToggle={(id) =>
                    setSelected((s) => {
                      const next = new Set(s);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      setAllInFolder(false);
                      return next;
                    })
                  }
                  onOpen={open}
                  onAction={(n, action) => runOn([n.id], action)}
                />
              )}
            </div>
            {p.openId ? (
              <div className="min-w-0">
                <NotificationReader
                  notification={current}
                  loading={!current && opened.isPending}
                  onBack={() => p.set({ id: null })}
                  onAction={(n, action) => runOn([n.id], action)}
                />
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} />
      <PreferencesDialog open={p.settings} onOpenChange={(o) => !o && p.set({ settings: null })} />
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent size="sm" title={t('shortcuts.title')} icon={<Keyboard />}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {SHORTCUTS.map(([keys, id]) => (
              <div key={id} className="contents">
                <dt>
                  <kbd className="rounded-item border border-border-strong bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {keys}
                  </kbd>
                </dt>
                <dd className="text-muted-foreground">{t(`shortcuts.${id}`)}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}
