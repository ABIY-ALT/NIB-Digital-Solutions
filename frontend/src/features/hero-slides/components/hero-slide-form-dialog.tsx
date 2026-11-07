'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, ImageIcon, Images, Upload, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { describeError } from '@/shared/errors/error-messages';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import {
  Form,
  FormActions,
  FormGrid,
  FormRootError,
  SubmitButton,
  TextField,
} from '@/shared/ui/form';
import { SwitchField, TextareaField } from '@/shared/ui/form-fields';
import { FormSurface } from '@/shared/ui/form-surface';
import { Spinner } from '@/shared/ui/feedback';
import {
  heroImageUrl,
  ImagePrepError,
  useSaveHeroSlide,
  useUploadHeroImage,
  type ImageKind,
} from '../hooks/use-hero-slides';
import {
  heroSlideFormDefaults,
  heroSlideFormSchema,
  toHeroSlideInput,
  type HeroSlideFormValues,
} from '../schemas';
import type { HeroSlide } from '../types';

type Values = HeroSlideFormValues;

/** Create / edit a slide: images (upload, preview, replace), optional text and button. */
export function HeroSlideFormDialog({
  open,
  entity,
  onOpenChange,
}: {
  open: boolean;
  entity: HeroSlide | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('heroSlides');
  return (
    <FormSurface
      id="hero-slides"
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      icon={<Images />}
      title={entity ? t('form.editTitle') : t('form.createTitle')}
    >
      {open ? <HeroSlideForm entity={entity} onDone={() => onOpenChange(false)} /> : null}
    </FormSurface>
  );
}

function HeroSlideForm({ entity, onDone }: { entity: HeroSlide | null; onDone: () => void }) {
  const t = useTranslations('heroSlides');
  const tc = useTranslations('common');
  const save = useSaveHeroSlide();
  const feedback = useSaveFeedback();
  const [reason, setReason] = useState('');
  const form = useForm<Values>({
    resolver: zodResolver(heroSlideFormSchema(t)),
    defaultValues: heroSlideFormDefaults(entity),
  });
  const values = form.watch();

  return (
    <Form
      form={form}
      onSubmit={async (v) => {
        const input = toHeroSlideInput(v);
        const result = await save.mutateAsync(
          entity
            ? { id: entity.id, input: { ...input, version: entity.version }, reason }
            : { input, reason },
        );
        feedback(result, entity ? t('toast.updated') : t('toast.created'));
        onDone();
      }}
    >
      <section aria-labelledby="hero-images" className="space-y-3">
        <h3 id="hero-images" className="text-sm font-semibold">
          {t('form.images')}
        </h3>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <ImageField form={form} kind="desktop" />
          <ImageField form={form} kind="mobile" />
        </div>
      </section>

      <section aria-labelledby="hero-text" className="mt-6 space-y-3">
        <div>
          <h3 id="hero-text" className="text-sm font-semibold">
            {t('form.text')}
          </h3>
          <p className="text-xs text-muted-foreground">{t('hints.text')}</p>
        </div>
        <FormGrid columns={2}>
          <TextField<Values>
            name="title"
            label={t('fields.title')}
            description={t('hints.title')}
            maxLength={160}
            className="col-span-full"
          />
          <TextareaField<Values>
            name="description"
            label={t('fields.description')}
            rows={2}
            className="col-span-full"
          />
          <TextField<Values> name="ctaLabel" label={t('fields.ctaLabel')} maxLength={160} />
          <TextField<Values>
            name="ctaHref"
            label={t('fields.ctaHref')}
            description={t('hints.ctaHref')}
            placeholder="/products"
            maxLength={160}
          />
          <TextField<Values>
            name="altText"
            label={t('fields.altText')}
            description={t('hints.altText')}
            maxLength={160}
            className="col-span-full"
          />
          <SwitchField<Values> name="active" label={t('fields.active')} />
        </FormGrid>
      </section>

      {values.desktopImageId ? <SlidePreview values={values} /> : null}

      <ApprovalNotice
        action={entity ? 'hero-slides.update' : 'hero-slides.create'}
        reason={reason}
        onReasonChange={setReason}
      />
      <FormRootError referenceLabel={tc('reference')} />
      <FormActions>
        <Button type="button" variant="outline" onClick={onDone}>
          {tc('cancel')}
        </Button>
        <SubmitButton>{entity ? tc('save') : t('form.create')}</SubmitButton>
      </FormActions>
    </Form>
  );
}

// ── Image upload with preview ───────────────────────────────────────────────

const TARGET: Record<ImageKind, { ratio: number; label: string; minWidth: number }> = {
  desktop: { ratio: 16 / 9, label: '16:9', minWidth: 1600 },
  mobile: { ratio: 4 / 5, label: '4:5', minWidth: 900 },
};

function ImageField({ form, kind }: { form: UseFormReturn<Values>; kind: ImageKind }) {
  const t = useTranslations('heroSlides');
  const te = useTranslations('errors');
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadHeroImage();
  const field = kind === 'desktop' ? 'desktopImageId' : 'mobileImageId';
  const value = form.watch(field);
  const error = form.formState.errors[field]?.message;
  const [info, setInfo] = useState<{ text: string; warnings: string[] } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setFailure(null);
    setInfo(null);
    try {
      // Read the source size first: warnings are about the original, not the optimised copy.
      const source = await createImageBitmap(file).catch(() => null);
      const uploaded = await upload.mutateAsync({ file, kind });
      form.setValue(field, uploaded.id, { shouldDirty: true, shouldValidate: true });
      const warnings: string[] = [];
      if (source) {
        const target = TARGET[kind];
        if (source.width < target.minWidth)
          warnings.push(t('image.lowResolution', { width: source.width, height: source.height }));
        if (Math.abs(source.width / source.height - target.ratio) / target.ratio > 0.04)
          warnings.push(t('image.ratio', { ratio: target.label }));
        source.close();
      }
      setInfo({
        text: t('image.optimised', {
          width: uploaded.width,
          height: uploaded.height,
          size: Math.round(uploaded.bytes / 1000),
        }),
        warnings,
      });
    } catch (err) {
      setFailure(
        err instanceof ImagePrepError
          ? t(`image.errors.${err.reason}`)
          : `${t('image.errors.upload')} ${describeError(err, te).message}`,
      );
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const label = kind === 'desktop' ? t('fields.desktopImageId') : t('fields.mobileImageId');
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
        {kind === 'desktop' ? <span className="text-danger"> *</span> : null}
      </label>
      <div
        className={cn(
          'relative overflow-hidden rounded-surface border bg-muted',
          kind === 'desktop' ? 'aspect-video' : 'mx-auto aspect-[4/5] max-h-64',
          error ? 'border-danger' : 'border-border',
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded media, already optimised
          <img
            src={heroImageUrl(value)}
            alt=""
            className="h-full w-full object-cover"
            decoding="async"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-subtle-foreground">
            <ImageIcon className="size-8" aria-hidden />
            <span className="text-xs">{t('image.empty')}</span>
          </div>
        )}
        {upload.isPending ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-surface/80 text-sm font-medium">
            <Spinner /> {t('image.uploading')}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          className="sr-only"
          onChange={(e) => void choose(e.target.files?.[0])}
          aria-describedby={`${inputId}-help`}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={upload.isPending}
          onClick={() => fileRef.current?.click()}
        >
          <Upload /> {value ? t('image.replace') : t('image.upload')}
        </Button>
        {kind === 'mobile' && value ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              form.setValue('mobileImageId', '', { shouldDirty: true });
              setInfo(null);
            }}
          >
            <X /> {t('image.remove')}
          </Button>
        ) : null}
      </div>
      <p id={`${inputId}-help`} className="text-xs text-muted-foreground">
        {kind === 'desktop' ? t('image.desktopHelp') : t('image.mobileHelp')}
      </p>
      {info ? <p className="text-xs text-success">{info.text}</p> : null}
      {info?.warnings.map((w) => (
        <p key={w} className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden /> {w}
        </p>
      ))}
      {failure || error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {failure ?? error}
        </p>
      ) : null}
    </div>
  );
}

// ── Preview: how the slide reads on the website ─────────────────────────────

function SlidePreview({ values }: { values: Values }) {
  const t = useTranslations('heroSlides');
  const hasText = !!(values.title || values.description || values.ctaLabel);
  return (
    <section aria-labelledby="hero-preview" className="mt-6 space-y-2">
      <h3 id="hero-preview" className="text-sm font-semibold">
        {t('preview.title')}
      </h3>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <figure className="space-y-1">
          <div className="relative aspect-video overflow-hidden rounded-surface border border-border bg-[#fdf7ef]">
            {/* eslint-disable-next-line @next/next/no-img-element -- uploaded media */}
            <img
              src={heroImageUrl(values.desktopImageId)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            {hasText ? (
              <div className="absolute inset-y-0 left-0 flex w-[55%] flex-col justify-center gap-1.5 bg-linear-to-r from-[#fdf7ef]/95 via-[#fdf7ef]/75 to-transparent p-[4%]">
                {values.title ? (
                  <p className="line-clamp-3 text-sm leading-tight font-extrabold text-[#3d2312]">
                    {values.title}
                  </p>
                ) : null}
                {values.description ? (
                  <p className="line-clamp-3 text-[10px] text-[#4a423c]">{values.description}</p>
                ) : null}
                {values.ctaLabel ? (
                  <span className="mt-1 w-fit rounded bg-[#feb914] px-2 py-1 text-[10px] font-semibold text-[#27160b]">
                    {values.ctaLabel}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <figcaption className="text-xs text-muted-foreground">{t('preview.desktop')}</figcaption>
        </figure>
        <figure className="space-y-1">
          <div className="mx-auto w-40 overflow-hidden rounded-surface border border-border bg-[#fdf7ef]">
            {/* eslint-disable-next-line @next/next/no-img-element -- uploaded media */}
            <img
              src={heroImageUrl(values.mobileImageId || values.desktopImageId)}
              alt=""
              className={cn(
                'w-full object-cover',
                values.mobileImageId ? 'aspect-[4/5]' : 'aspect-video',
              )}
            />
            {hasText ? (
              <div className="space-y-1 p-2">
                {values.title ? (
                  <p className="line-clamp-2 text-[10px] leading-tight font-extrabold text-[#3d2312]">
                    {values.title}
                  </p>
                ) : null}
                {values.ctaLabel ? (
                  <span className="inline-block rounded bg-[#feb914] px-1.5 py-0.5 text-[9px] font-semibold text-[#27160b]">
                    {values.ctaLabel}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <figcaption className="text-center text-xs text-muted-foreground">
            {t('preview.mobile')}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
