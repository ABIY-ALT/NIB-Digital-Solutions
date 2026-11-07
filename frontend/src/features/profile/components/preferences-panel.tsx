'use client';

import { useMutation } from '@tanstack/react-query';
import { Check, Languages, Palette, PanelRight, Rows3, Type } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { cn } from '@/shared/lib/cn';
import type { ColorMode } from '@/shared/theme/color-mode';
import { useTheme } from '@/shared/theme/theme-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { toast } from '@/shared/ui/toaster';
import { useSavePreferences } from '../hooks/use-account';
import type { Preferences } from '../preferences';

type Density = NonNullable<Preferences['density']>;
type FontScale = NonNullable<Preferences['fontScale']>;
type FormSurface = NonNullable<Preferences['formSurface']>;

/** Row gap of each density's preview. */
const DENSITY_GAP: Record<Density, number> = { compact: 2, default: 4, comfortable: 6 };
/** Sample text size of each font scale's preview. */
const SCALE_SAMPLE: Record<FontScale, string> = { sm: 'text-sm', md: 'text-lg', lg: 'text-2xl' };

/** Preferences tab: language, appearance, density, text size and form surface (saved per browser in cookies). */
export interface PreferencesPanelProps {
  density: Density;
  fontScale: FontScale;
  /** Effective form surface (the user's choice or the product default). */
  formSurface: FormSurface;
  /** The product lets users choose (app.config `ui.forms.userChoice`). */
  formSurfaceChoice: boolean;
  locales: Array<{ code: string; label: string }>;
}

export function PreferencesPanel({
  density,
  fontScale,
  formSurface,
  formSurfaceChoice,
  locales,
}: Readonly<PreferencesPanelProps>) {
  const t = useTranslations('profile.preferences');
  const tt = useTranslations('theme');
  const theme = useTheme();
  const locale = useLocale();
  const router = useRouter();
  const save = useSavePreferences();
  const changeLocale = useMutation({
    mutationFn: (code: string) =>
      apiFetch('/api/locale', { method: 'POST', body: { locale: code } }),
    onSuccess: () => router.refresh(),
  });

  const persist = (next: Preferences) =>
    save.mutate(
      { density, fontScale, ...(formSurfaceChoice ? { formSurface } : {}), ...next },
      { onSuccess: () => toast.success(t('saved')) },
    );

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Section
        icon={<Languages />}
        title={t('language')}
        description={t('languageHint')}
        className="xl:col-span-2"
      >
        <ChoiceGrid
          value={locale}
          disabled={changeLocale.isPending}
          onChange={(code) => changeLocale.mutate(code)}
          options={locales.map((l) => ({
            value: l.code,
            label: l.label,
            hint: l.code.toUpperCase(),
            lang: l.code,
          }))}
        />
      </Section>

      {theme.canSwitch ? (
        <Section
          icon={<Palette />}
          title={tt('appearance')}
          description={tt('appearanceHint')}
          className="xl:col-span-2"
        >
          <ChoiceGrid<ColorMode>
            value={theme.mode}
            onChange={(mode) => theme.setMode(mode)}
            options={theme.modes.map((mode) => ({
              value: mode,
              label: tt(`modes.${mode}`),
              hint: tt(`hints.${mode}`),
              preview: <ModePreview mode={mode} />,
            }))}
          />
        </Section>
      ) : null}

      <Section icon={<Rows3 />} title={t('density')} description={t('densityHint')}>
        <ChoiceGrid<Density>
          value={density}
          disabled={save.isPending}
          onChange={(value) => persist({ density: value })}
          options={(['compact', 'default', 'comfortable'] as const).map((value) => ({
            value,
            label: t(`densities.${value}`),
            preview: <DensityPreview gap={DENSITY_GAP[value]} />,
          }))}
        />
      </Section>

      <Section icon={<Type />} title={t('textSize')} description={t('textSizeHint')}>
        <ChoiceGrid<FontScale>
          value={fontScale}
          disabled={save.isPending}
          onChange={(value) => persist({ fontScale: value })}
          options={(['sm', 'md', 'lg'] as const).map((value) => ({
            value,
            label: t(`sizes.${value}`),
            preview: <span className={cn('font-semibold', SCALE_SAMPLE[value])}>Aa</span>,
          }))}
        />
      </Section>

      {formSurfaceChoice ? (
        <Section icon={<PanelRight />} title={t('forms')} description={t('formsHint')}>
          <ChoiceGrid<FormSurface>
            value={formSurface}
            disabled={save.isPending}
            onChange={(value) => persist({ formSurface: value })}
            options={(['dialog', 'drawer'] as const).map((value) => ({
              value,
              label: t(`surfaces.${value}`),
              hint: t(`surfaceHints.${value}`),
              preview: <SurfacePreview surface={value} />,
            }))}
          />
        </Section>
      ) : null}
    </div>
  );
}

function Section({
  icon,
  title,
  description,
  className,
  children,
}: Readonly<{
  icon: ReactNode;
  title: string;
  description: string;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <Card className={className}>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2 [&_svg]:size-4 [&_svg]:text-muted-foreground">
            {icon} {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

interface Choice<V extends string> {
  value: V;
  label: string;
  hint?: string;
  lang?: string;
  preview?: ReactNode;
}

/** IB-style selectable cards (radio semantics). */
function ChoiceGrid<V extends string>({
  value,
  options,
  onChange,
  disabled,
}: Readonly<{
  value: string;
  options: Choice<V>[];
  onChange: (v: V) => void;
  disabled?: boolean;
}>) {
  return (
    <div role="radiogroup" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            lang={o.lang}
            disabled={disabled}
            onClick={() => !selected && onChange(o.value)}
            className={cn(
              'relative flex flex-col items-center gap-2 rounded-control border bg-surface px-3 py-4 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
              selected
                ? 'border-primary bg-primary-softer shadow-[inset_0_0_0_1px_var(--color-primary)]'
                : 'border-border hover:border-border-strong hover:bg-hover',
            )}
          >
            {selected ? (
              <span
                className="absolute end-2 top-2 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
                aria-hidden
              >
                <Check className="size-3" />
              </span>
            ) : null}
            {o.preview ? (
              <span className="flex h-9 items-center text-muted-foreground">{o.preview}</span>
            ) : null}
            <span className={cn('font-semibold', selected && 'text-primary-text')}>{o.label}</span>
            {o.hint ? <span className="text-xs text-muted-foreground">{o.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Miniature page with a centred modal or a panel on the end edge. */
function SurfacePreview({ surface }: Readonly<{ surface: FormSurface }>) {
  return (
    <span
      className="relative flex h-9 w-16 overflow-hidden rounded-item border border-border-strong bg-surface-muted"
      aria-hidden
    >
      <span
        className={cn(
          'absolute border border-border-strong bg-surface',
          surface === 'dialog'
            ? 'inset-x-3 inset-y-1.5 rounded-[3px]'
            : 'inset-y-0 end-0 w-7 border-y-0 border-e-0',
        )}
      >
        <span className="block h-0.5 bg-primary" />
      </span>
    </span>
  );
}

function DensityPreview({ gap }: Readonly<{ gap: number }>) {
  return (
    <span className="flex w-12 flex-col" style={{ gap }} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 rounded-pill bg-border-strong" />
      ))}
    </span>
  );
}

/** Miniature window in the palette it stands for (system = half light, half dark). */
function ModePreview({ mode }: Readonly<{ mode: ColorMode }>) {
  const pane = (dark: boolean) => (
    <span
      className={cn(
        'flex h-full flex-1 flex-col gap-1 p-1.5',
        dark ? 'bg-[#1b1a19]' : 'bg-[#faf9f8]',
      )}
    >
      <span className={cn('h-1.5 w-2/3 rounded-pill', dark ? 'bg-[#484644]' : 'bg-[#d2d0ce]')} />
      <span className="h-1.5 w-1/3 rounded-pill bg-primary" />
      <span className={cn('h-1.5 w-1/2 rounded-pill', dark ? 'bg-[#3b3a39]' : 'bg-[#edebe9]')} />
    </span>
  );
  return (
    <span
      className="flex h-9 w-16 overflow-hidden rounded-item border border-border-strong"
      aria-hidden
    >
      {mode === 'system' ? (
        <>
          {pane(false)}
          {pane(true)}
        </>
      ) : (
        pane(mode === 'dark')
      )}
    </span>
  );
}
