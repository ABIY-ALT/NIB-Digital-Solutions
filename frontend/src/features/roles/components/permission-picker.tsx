'use client';

import { CheckCircle2, Circle, CircleX, Eye, Lock, Search, ShieldEllipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/choice';
import { fieldVariants, useFieldAppearance } from '@/shared/ui/input';
import { Tooltip } from '@/shared/ui/menu';
import { groupPermissions, parsePermission, type PermissionDefinition } from '../types';

/**
 * Master-detail permission picker (IB pattern).
 *
 *   ┌──────────────┬──────────────────────────────────────┐
 *   │ Modules      │ Actions of the selected module       │
 *   │ (ring + n/m) │ (checkbox · label · code · purpose)  │
 *   └──────────────┴──────────────────────────────────────┘
 *
 * The height is fixed, so it never grows with the catalogue. Presets apply common
 * policies in one click. Permissions the signed-in user does not hold are locked:
 * the backend rejects granting them anyway. With `readOnly` it becomes a viewer.
 */

interface Preset {
  id: 'all' | 'read' | 'maker';
  match: (action: string) => boolean;
}

const PRESETS: Preset[] = [
  { id: 'all', match: () => true },
  { id: 'read', match: (a) => a === 'read' },
  { id: 'maker', match: (a) => ['create', 'read', 'update'].includes(a) },
];

/** `<b>` in the picker's counter: the figures stand out. */
function strongCount(chunks: ReactNode) {
  return <strong className="text-sm text-foreground tabular">{chunks}</strong>;
}

export function PermissionPicker({
  catalogue,
  value,
  onChange,
  readOnly = false,
  invalid,
}: Readonly<{
  catalogue: PermissionDefinition[];
  value: string[];
  onChange?: (next: string[]) => void;
  readOnly?: boolean;
  invalid?: boolean;
}>) {
  const t = useTranslations('roles');
  const { can } = usePermissions();
  const [filter, setFilter] = useState('');
  const appearance = useFieldAppearance();
  const [onlyGranted, setOnlyGranted] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const selected = useMemo(() => new Set(value), [value]);

  const label = (group: 'modules' | 'verbs' | 'scopes', key: string) =>
    t.has(`${group}.${key}`)
      ? t(`${group}.${key}`)
      : key.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  const moduleName = (resource: string) =>
    label('modules', resource === '*' ? 'superUser' : resource);
  const permissionName = (code: string) => {
    if (code === '*') return t('modules.superUser');
    const { action, scope } = parsePermission(code);
    return scope ? `${label('verbs', action)} · ${label('scopes', scope)}` : label('verbs', action);
  };

  const modules = useMemo(
    () =>
      groupPermissions(catalogue).map((g) => ({
        ...g,
        granted: g.items.filter((p) => selected.has(p.code)).length,
      })),
    [catalogue, selected],
  );

  const visible = modules.filter((m) => {
    const q = filter.trim().toLowerCase();
    if (q && !m.resource.includes(q) && !moduleName(m.resource).toLowerCase().includes(q))
      return false;
    return !onlyGranted || m.granted > 0;
  });
  // Viewers open on the first granted module; editors on the first module.
  const current =
    visible.find((m) => m.resource === active) ??
    (readOnly ? visible.find((m) => m.granted > 0) : undefined) ??
    visible[0] ??
    null;

  const grantable = (code: string) => !readOnly && can(code);
  const set = (next: Iterable<string>) => onChange?.([...new Set(next)]);
  const toggle = (code: string, on: boolean) =>
    set(on ? [...value, code] : value.filter((c) => c !== code));

  /** Presets rewrite only what the caller may grant; the super-user flag is never implied. */
  const applyPreset = (preset: Preset | null) => {
    const managed = catalogue.filter((p) => p.code !== '*' && grantable(p.code));
    const managedCodes = new Set(managed.map((p) => p.code));
    const keep = value.filter((c) => !managedCodes.has(c));
    const add = preset
      ? managed.filter((p) => preset.match(parsePermission(p.code).action)).map((p) => p.code)
      : [];
    set([...keep, ...add]);
  };

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* Presets / counter bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-border bg-surface-muted px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap text-muted-foreground">
          <ShieldEllipsis className="size-3.5" aria-hidden />
          {readOnly ? t('picker.grantedPermissions') : t('picker.presets')}
        </span>
        {!readOnly ? (
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 bg-surface"
                title={t(`picker.presetHint.${p.id}`)}
                onClick={() => applyPreset(p)}
              >
                {t(`picker.preset.${p.id}`)}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 bg-surface"
              disabled={value.length === 0}
              onClick={() => applyPreset(null)}
            >
              <CircleX className="text-muted-foreground" /> {t('picker.clear')}
            </Button>
          </div>
        ) : null}
        <span
          className="ms-auto text-xs whitespace-nowrap text-muted-foreground max-sm:w-full max-sm:text-end"
          aria-live="polite"
        >
          {t.rich(readOnly ? 'picker.grantedCount' : 'picker.count', {
            count: value.length,
            total: catalogue.length,
            b: strongCount,
          })}
        </span>
      </div>

      {/* Master-detail */}
      <div
        className={cn(
          'flex h-[clamp(320px,50vh,540px)] min-h-0 overflow-hidden rounded-control border bg-surface max-md:h-[clamp(420px,65vh,640px)] max-md:flex-col',
          invalid ? 'border-danger' : 'border-border',
        )}
      >
        <aside
          aria-label={t('picker.modules')}
          className="flex w-[260px] shrink-0 flex-col border-e border-border bg-surface-muted max-md:max-h-40 max-md:w-full max-md:border-e-0 max-md:border-b"
        >
          <div className="flex flex-col gap-1.5 border-b border-border p-2.5 max-md:flex-row max-md:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle-foreground"
                aria-hidden
              />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t('picker.filterModules')}
                aria-label={t('picker.filterModules')}
                className={cn(fieldVariants({ appearance }), 'h-[30px] ps-8 pe-2 text-xs')}
              />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 px-0.5 text-xs whitespace-nowrap text-muted-foreground select-none">
              <Checkbox checked={onlyGranted} onCheckedChange={(v) => setOnlyGranted(v === true)} />
              <Eye className="size-3.5" aria-hidden />
              {t('picker.onlyGranted')}
            </label>
          </div>
          <div
            className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-1"
            role="listbox"
            aria-label={t('picker.modules')}
          >
            {visible.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                {filter ? t('picker.noMatch') : t('picker.noneGranted')}
              </p>
            ) : (
              visible.map((m) => {
                const isActive = current?.resource === m.resource;
                return (
                  <button
                    key={m.resource}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => setActive(m.resource)}
                    className={cn(
                      'flex w-full items-center gap-2.5 border-s-[3px] py-2 ps-2.5 pe-3 text-start transition-colors outline-none focus-visible:bg-hover',
                      isActive
                        ? 'border-primary bg-primary-softer'
                        : 'border-transparent hover:bg-hover',
                    )}
                  >
                    <CompletionRing granted={m.granted} total={m.items.length} />
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-[13px] font-medium',
                        isActive && 'text-primary-text',
                      )}
                    >
                      {moduleName(m.resource)}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-pill border bg-surface px-2 text-[11px] leading-[18px] tabular',
                        isActive
                          ? 'border-primary text-primary-text'
                          : 'border-border text-muted-foreground',
                      )}
                    >
                      {m.granted}/{m.items.length}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {current === null ? (
            <p className="m-auto p-8 text-center text-sm text-muted-foreground">
              {t('picker.selectModule')}
            </p>
          ) : (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <h4 className="text-[15px] font-semibold">{moduleName(current.resource)}</h4>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('picker.actionsGranted', {
                      count: current.granted,
                      total: current.items.length,
                    })}
                  </p>
                </div>
                {!readOnly ? (
                  <div className="flex gap-1.5">
                    {(() => {
                      const codes = current.items
                        .filter((p) => p.code !== '*' && grantable(p.code))
                        .map((p) => p.code);
                      return (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7"
                            disabled={codes.every((c) => selected.has(c))}
                            onClick={() => set([...value, ...codes])}
                          >
                            {t('picker.grantAll')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7"
                            disabled={!codes.some((c) => selected.has(c))}
                            onClick={() => set(value.filter((c) => !codes.includes(c)))}
                          >
                            {t('picker.revokeAll')}
                          </Button>
                        </>
                      );
                    })()}
                  </div>
                ) : null}
              </header>
              <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-1">
                {current.items.map((p) => {
                  const on = selected.has(p.code);
                  const locked = !readOnly && !grantable(p.code);
                  const name = permissionName(p.code);
                  const body = (
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2.5 text-[13px] font-semibold">
                        {name}
                        <code className="rounded-item border border-border bg-surface-muted px-1.5 font-mono text-[11px] font-normal text-muted-foreground">
                          {p.code}
                        </code>
                        {locked ? (
                          <Tooltip content={t('picker.notHeld')}>
                            <Lock
                              className="size-3.5 text-subtle-foreground"
                              aria-label={t('picker.notHeld')}
                            />
                          </Tooltip>
                        ) : null}
                      </span>
                      {p.description ? (
                        <span className="text-xs leading-snug text-muted-foreground">
                          {p.description}
                        </span>
                      ) : null}
                    </span>
                  );
                  return (
                    <li key={p.code} className="border-b border-border/60 last:border-0">
                      {readOnly ? (
                        <div
                          className="flex items-start gap-3 px-4 py-3"
                          aria-label={`${p.code}: ${on ? t('picker.granted') : t('picker.notGranted')}`}
                        >
                          {on ? (
                            <CheckCircle2
                              className="mt-px size-[18px] shrink-0 text-success"
                              aria-hidden
                            />
                          ) : (
                            <Circle
                              className="mt-px size-[18px] shrink-0 text-border-strong"
                              aria-hidden
                            />
                          )}
                          {body}
                        </div>
                      ) : (
                        <label
                          className={cn(
                            'flex items-start gap-3 px-4 py-3 transition-colors',
                            locked
                              ? 'cursor-not-allowed opacity-60'
                              : 'cursor-pointer hover:bg-hover',
                          )}
                        >
                          <Checkbox
                            className="mt-px"
                            checked={on}
                            disabled={locked}
                            onCheckedChange={(v) => toggle(p.code, v === true)}
                            aria-label={p.code}
                          />
                          {body}
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** Donut progress: grey when empty, gold while partial, green check when complete. */
function CompletionRing({ granted, total }: Readonly<{ granted: number; total: number }>) {
  if (total > 0 && granted === total)
    return <CheckCircle2 className="size-[18px] shrink-0 text-success" aria-hidden />;
  const circumference = 2 * Math.PI * 7;
  const filled = total === 0 ? 0 : (granted / total) * circumference;
  return (
    <svg viewBox="0 0 18 18" className="size-[18px] shrink-0 -rotate-90" aria-hidden>
      <circle cx="9" cy="9" r="7" fill="none" strokeWidth="3" className="stroke-border" />
      {filled > 0 ? (
        <circle
          cx="9"
          cy="9"
          r="7"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className="stroke-primary"
        />
      ) : null}
    </svg>
  );
}
