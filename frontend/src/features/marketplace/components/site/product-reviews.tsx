'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, MessageSquareQuote, PenLine, Send, Star } from 'lucide-react';
import { useFormatter, useLocale, useNow, useTranslations } from 'next-intl';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { cn } from '@/shared/lib/cn';
import { fetchReviews, submissionError, submitReview } from '../../client';
import type { MarketplaceProduct, PublicProductReview } from '../../types';
import { Honeypot, SiteButton, SiteInput, SiteTextarea, SiteSkeleton } from './primitives';
import { Stars } from './ratings';

// ─────────────────────────────────────────────────────────────────────────────
// Product page "Customer reviews": the rating summary (filter by stars), the
// approved reviews with the team's replies, and the form to rate the product.
// New reviews appear after staff approve them (Product reviews in the portal).
// ─────────────────────────────────────────────────────────────────────────────

const reviewsKey = (slug: string, rating: number | null) =>
  ['marketplace', 'reviews', slug, rating ?? 'all'] as const;

export function ProductReviews({ product }: { product: MarketplaceProduct }) {
  const t = useTranslations('marketplace.reviews');
  const [rating, setRating] = useState<number | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const { data, isPending, isError } = useQuery({
    queryKey: reviewsKey(product.slug, rating),
    queryFn: ({ signal }) => fetchReviews(product.slug, rating ?? undefined, signal),
    placeholderData: (previous) => previous,
  });
  const summary = data?.summary ?? null;

  const openForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    formRef.current?.querySelector<HTMLButtonElement>('[data-star="5"]')?.focus();
  };

  return (
    <section id="reviews" className="scroll-mt-36" aria-labelledby="reviews-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2 id="reviews-title" className="mt-2 text-2xl font-bold sm:text-3xl">
            {t('title', { name: product.name })}
          </h2>
        </div>
        <SiteButton variant="outline" onClick={openForm} iconLeft={<PenLine className="h-4 w-4" />}>
          {t('rate')}
        </SiteButton>
      </div>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[340px_1fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-line bg-white p-6 shadow-tile">
            {summary ? (
              <Summary summary={summary} selected={rating} onSelect={setRating} />
            ) : isPending ? (
              <SiteSkeleton className="h-48" />
            ) : (
              <div className="text-center">
                <Stars value={0} size="lg" />
                <p className="mt-3 font-semibold text-brown-900">{t('empty.title')}</p>
                <p className="mt-1 text-sm text-charcoal/70">
                  {t('empty.text', { name: product.name })}
                </p>
              </div>
            )}
            <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-charcoal/60">
              {t('moderated')}
            </p>
          </div>
          <div ref={formRef} className="rounded-3xl border border-line bg-white p-6 shadow-tile">
            <ReviewForm product={product} />
          </div>
        </div>

        <div className="min-w-0">
          {isError && !data ? (
            <p className="rounded-2xl bg-mist p-5 text-sm text-charcoal/70" role="alert">
              {t('loadError')}
            </p>
          ) : isPending && !data ? (
            <div className="space-y-4">
              <SiteSkeleton className="h-36" />
              <SiteSkeleton className="h-36" />
            </div>
          ) : (
            <ReviewList
              reviews={data?.reviews ?? []}
              total={summary?.count ?? 0}
              rating={rating}
              onClear={() => setRating(null)}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function Summary({
  summary,
  selected,
  onSelect,
}: {
  summary: NonNullable<Awaited<ReturnType<typeof fetchReviews>>['summary']>;
  selected: number | null;
  onSelect: (rating: number | null) => void;
}) {
  const t = useTranslations('marketplace.reviews');
  const locale = useLocale();
  const max = Math.max(1, ...summary.distribution);
  return (
    <div>
      <div className="flex items-center gap-4">
        <span className="font-display text-5xl leading-none font-extrabold tracking-tight text-brown-900">
          {summary.average.toLocaleString(locale, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}
        </span>
        <div>
          <Stars value={summary.average} size="md" />
          <p className="mt-1 text-sm text-charcoal/70">{t('basedOn', { count: summary.count })}</p>
        </div>
      </div>
      <ul className="mt-5 space-y-1">
        {[5, 4, 3, 2, 1].map((stars) => {
          const count = summary.distribution[stars - 1] ?? 0;
          const on = selected === stars;
          return (
            <li key={stars}>
              <button
                type="button"
                onClick={() => onSelect(on ? null : stars)}
                disabled={!count && !on}
                aria-pressed={on}
                aria-label={t('filterLabel', { stars, count })}
                className={cn(
                  'grid w-full grid-cols-[3rem_1fr_2rem] items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition',
                  on ? 'bg-gold-50 ring-1 ring-gold-300' : 'hover:bg-mist disabled:opacity-50',
                )}
              >
                <span className="inline-flex items-center gap-1 font-semibold text-brown-900">
                  {stars}
                  <Star className="h-3.5 w-3.5 fill-gold-500 text-gold-500" aria-hidden />
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-mist" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-gold-500"
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </span>
                <span className="text-end text-charcoal/60 tabular-nums">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReviewList({
  reviews,
  total,
  rating,
  onClear,
}: {
  reviews: PublicProductReview[];
  total: number;
  rating: number | null;
  onClear: () => void;
}) {
  const t = useTranslations('marketplace.reviews');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  if (!reviews.length && !rating) {
    return (
      <div className="flex flex-col items-center rounded-3xl border border-dashed border-line bg-mist/60 px-6 py-14 text-center">
        <MessageSquareQuote className="h-8 w-8 text-gold-700" aria-hidden />
        <p className="mt-4 max-w-sm text-sm text-charcoal/70">{t('noneYet')}</p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-charcoal/70" aria-live="polite">
          {rating
            ? t('showingStars', { count: reviews.length, stars: rating })
            : t('showing', { shown: reviews.length, total })}
        </p>
        {rating ? (
          <SiteButton variant="outline" size="sm" onClick={onClear}>
            {t('showAll')}
          </SiteButton>
        ) : null}
      </div>
      <ul className="mt-4 space-y-4">
        {reviews.map((r) => (
          <li
            key={r.reference}
            className="animate-fade-in rounded-3xl border border-line bg-white p-6 shadow-tile"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Stars value={r.rating} size="sm" />
              {r.title ? <p className="font-bold text-brown-900">{r.title}</p> : null}
              <time
                dateTime={r.createdAt}
                className="ms-auto text-xs text-charcoal/55"
                title={format.dateTime(new Date(r.createdAt), { dateStyle: 'long' })}
              >
                {format.relativeTime(new Date(r.createdAt), now)}
              </time>
            </div>
            {r.body ? (
              <p className="mt-3 leading-relaxed whitespace-pre-line text-charcoal">{r.body}</p>
            ) : null}
            <div className="mt-4 flex items-center gap-3">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brown-50 text-xs font-bold text-brown-700"
                aria-hidden
              >
                {initials(r.reviewerName ?? t('anonymous'))}
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-brown-900">
                  {r.reviewerName ?? t('anonymous')}
                </p>
                {r.reviewerRole ? (
                  <p className="text-xs text-charcoal/60">{r.reviewerRole}</p>
                ) : null}
              </div>
            </div>
            {r.reply ? (
              <div className="mt-4 rounded-2xl border border-gold-100 bg-gold-50/60 px-4 py-3">
                <p className="text-xs font-bold text-brown-700">{t('reply')}</p>
                <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-charcoal">
                  {r.reply}
                </p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

type Errors = Partial<Record<string, string>>;

function ReviewForm({ product }: { product: MarketplaceProduct }) {
  const t = useTranslations('marketplace');
  const tr = useTranslations('marketplace.reviews.form');
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const [honeypot, setHoneypot] = useState('');
  const empty = {
    rating: 0,
    title: '',
    body: '',
    reviewerName: '',
    reviewerRole: '',
    reviewerEmail: '',
  };
  const [form, setForm] = useState(empty);
  const [hover, setHover] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        // Only the stars are required; an e-mail is checked when one is given.
        rating: z.number().int().min(1, tr('validation.rating')).max(5),
        body: z.string().trim().max(2000),
        reviewerName: z.string().trim().max(120),
        reviewerEmail: z
          .string()
          .trim()
          .max(160)
          .refine((v) => !v || z.email().safeParse(v).success, t('forms.validation.email')),
      }),
    [t, tr],
  );

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const out: Errors = {};
      for (const i of parsed.error.issues) out[String(i.path[0] ?? 'form')] ??= i.message;
      setErrors(out);
      setFormError(t('forms.check'));
      return;
    }
    setSubmitting(true);
    try {
      const ref = await submitReview(
        product.slug,
        {
          rating: form.rating,
          title: form.title.trim() || null,
          body: form.body.trim() || null,
          reviewerName: form.reviewerName.trim() || null,
          reviewerRole: form.reviewerRole.trim() || null,
          reviewerEmail: form.reviewerEmail.trim().toLowerCase() || null,
        },
        { honeypot, openedAt },
      );
      setReference(ref);
    } catch (err) {
      const failure = submissionError(err, t('forms.failed'));
      setErrors(failure.fields);
      setFormError(failure.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (reference) {
    return (
      <div className="animate-scale-in py-2 text-center" role="status">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden />
        </div>
        <h3 className="mt-4 text-lg font-bold">{tr('received')}</h3>
        <p className="mx-auto mt-2 max-w-xs text-sm text-charcoal/70">{tr('receivedText')}</p>
        <SiteButton
          className="mt-5"
          variant="outline"
          onClick={() => {
            setForm(empty);
            setReference(null);
            setOpenedAt(Date.now());
          }}
        >
          {tr('another')}
        </SiteButton>
      </div>
    );
  }

  const shown = hover || form.rating;
  return (
    <form onSubmit={submit} noValidate className="relative space-y-4">
      <div>
        <h3 className="text-lg font-bold">{tr('heading', { name: product.name })}</h3>
        <p className="mt-1 text-sm text-charcoal/70">{tr('onlyStars')}</p>
      </div>
      <Honeypot value={honeypot} onChange={setHoneypot} />
      <fieldset>
        <legend className="text-sm font-semibold text-brown-900">
          {tr('rating')} <span className="text-gold-700">*</span>
        </legend>
        <div className="mt-1.5 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              data-star={n}
              onClick={() => set('rating', n)}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(0)}
              aria-pressed={form.rating === n}
              aria-label={tr('starLabel', { count: n })}
              className="flex h-11 w-11 items-center justify-center rounded-xl transition hover:bg-gold-50 focus-visible:ring-4 focus-visible:ring-gold-200 focus-visible:outline-none"
            >
              <Star
                className={cn(
                  'h-7 w-7 transition-transform',
                  n <= shown ? 'scale-110 fill-gold-500 text-gold-500' : 'text-charcoal/30',
                )}
                aria-hidden
              />
            </button>
          ))}
          <span className="ms-2 text-sm font-semibold text-brown-700" aria-live="polite">
            {shown ? tr(`words.${shown}`) : tr('ratingHint')}
          </span>
        </div>
        {errors.rating ? (
          <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
            {errors.rating}
          </p>
        ) : null}
      </fieldset>
      <SiteInput
        label={tr('title')}
        value={form.title}
        onChange={(e) => set('title', e.target.value)}
        error={errors.title}
        maxLength={160}
      />
      <SiteTextarea
        label={tr('body')}
        hint={tr('bodyHint')}
        rows={4}
        value={form.body}
        onChange={(e) => set('body', e.target.value)}
        error={errors.body}
        maxLength={2000}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <SiteInput
          label={tr('name')}
          autoComplete="name"
          value={form.reviewerName}
          onChange={(e) => set('reviewerName', e.target.value)}
          error={errors.reviewerName}
          maxLength={120}
        />
        <SiteInput
          label={tr('role')}
          hint={tr('roleHint')}
          value={form.reviewerRole}
          onChange={(e) => set('reviewerRole', e.target.value)}
          error={errors.reviewerRole}
          maxLength={160}
        />
      </div>
      <SiteInput
        label={tr('email')}
        hint={tr('emailHint')}
        type="email"
        autoComplete="email"
        value={form.reviewerEmail}
        onChange={(e) => set('reviewerEmail', e.target.value)}
        error={errors.reviewerEmail}
        maxLength={160}
      />
      {formError ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
          {formError}
        </p>
      ) : null}
      <SiteButton
        type="submit"
        size="lg"
        className="w-full"
        loading={submitting}
        iconRight={<Send className="h-4 w-4" />}
      >
        {tr('submit')}
      </SiteButton>
    </form>
  );
}
