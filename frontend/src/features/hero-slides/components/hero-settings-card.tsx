'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Select, Switch } from '@/shared/ui/choice';
import { ErrorState, Skeleton } from '@/shared/ui/feedback';
import { Input, Label } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toaster';
import { describeError } from '@/shared/errors/error-messages';
import { useHeroSettings, useUpdateHeroSettings } from '../hooks/use-hero-slides';
import type { HeroCarouselSettings, HeroNavigation } from '../types';

const NAVIGATION: HeroNavigation[] = ['arrows-and-dots', 'dots', 'arrows'];
const RANGES = {
  intervalSeconds: { min: 3, max: 30 },
  transitionMs: { min: 200, max: 2000 },
} as const;

/** Rotation, timing and navigation of the homepage carousel. */
export function HeroSettingsCard() {
  const t = useTranslations('heroSlides.settings');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { can } = usePermissions();
  const editable = can('hero-slides:update');
  const { data, isPending, error, refetch } = useHeroSettings();
  const update = useUpdateHeroSettings();
  const [draft, setDraft] = useState<HeroCarouselSettings | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const set = <K extends keyof HeroCarouselSettings>(key: K, value: HeroCarouselSettings[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  const outOfRange = (key: keyof typeof RANGES) =>
    !!draft &&
    (draft[key] < RANGES[key].min || draft[key] > RANGES[key].max || !Number.isInteger(draft[key]));
  const invalid = outOfRange('intervalSeconds') || outOfRange('transitionMs');
  const dirty = !!draft && !!data && JSON.stringify(draft) !== JSON.stringify(data);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState
            title={te('title')}
            description={describeError(error, te).message}
            correlationId={describeError(error, te).correlationId}
            referenceLabel={tc('reference')}
            action={
              <Button variant="outline" onClick={() => void refetch()}>
                {tc('retry')}
              </Button>
            }
          />
        ) : isPending || !draft ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (invalid) return;
              update.mutate(draft, {
                onSuccess: () => toast.success(t('saved')),
              });
            }}
          >
            <fieldset disabled={!editable || update.isPending} className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label htmlFor="hero-autoplay">{t('autoplay')}</Label>
                  <p className="text-xs text-muted-foreground">{t('autoplayHint')}</p>
                </div>
                <Switch
                  id="hero-autoplay"
                  checked={draft.autoplay}
                  onCheckedChange={(v) => set('autoplay', v)}
                />
              </div>

              <NumberSetting
                id="hero-interval"
                label={t('intervalSeconds')}
                hint={t('range', RANGES.intervalSeconds)}
                value={draft.intervalSeconds}
                disabled={!draft.autoplay}
                invalid={outOfRange('intervalSeconds')}
                {...RANGES.intervalSeconds}
                onChange={(v) => set('intervalSeconds', v)}
              />
              <NumberSetting
                id="hero-transition"
                label={t('transitionMs')}
                hint={t('range', RANGES.transitionMs)}
                value={draft.transitionMs}
                step={100}
                invalid={outOfRange('transitionMs')}
                {...RANGES.transitionMs}
                onChange={(v) => set('transitionMs', v)}
              />

              <div className="flex items-start justify-between gap-3">
                <Label htmlFor="hero-hover">{t('pauseOnHover')}</Label>
                <Switch
                  id="hero-hover"
                  checked={draft.pauseOnHover}
                  disabled={!draft.autoplay}
                  onCheckedChange={(v) => set('pauseOnHover', v)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hero-navigation">{t('navigation')}</Label>
                <Select
                  id="hero-navigation"
                  value={draft.navigation}
                  onValueChange={(v) => set('navigation', v as HeroNavigation)}
                  options={NAVIGATION.map((value) => ({
                    value,
                    label: t(`navigationOptions.${value}`),
                  }))}
                />
              </div>
            </fieldset>

            {editable ? (
              <Button type="submit" loading={update.isPending} disabled={!dirty || invalid}>
                {t('save')}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">{t('readOnly')}</p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function NumberSetting({
  id,
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  disabled,
  invalid,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  invalid: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={Number.isNaN(value) ? '' : value}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
      <p
        id={`${id}-hint`}
        className={invalid ? 'text-xs text-danger' : 'text-xs text-muted-foreground'}
      >
        {hint}
      </p>
    </div>
  );
}
