'use client';

import {
  CheckCircle2,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Search,
  Send,
  ThumbsUp,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { cn } from '@/shared/lib/cn';
import { submissionError, submitIdea } from '../../client';
import { useIdeas, useVoteIdea } from '../../hooks/use-ideas';
import type { IdeaSort, IdeaStatus, PublicIdea } from '../../types';
import { useMarketplace } from './marketplace-provider';
import {
  EmptyState,
  Honeypot,
  Reveal,
  SiteButton,
  SiteInput,
  SiteSelect,
  SiteSkeleton,
  SiteTextarea,
} from './primitives';
import { PageHero } from './site-shell';

const STATUSES: IdeaStatus[] = ['approved', 'in_development', 'completed'];

const STATUS_STYLE: Record<IdeaStatus, string> = {
  approved: 'bg-gold-50 text-gold-800 ring-gold-200',
  in_development: 'bg-brown-50 text-brown-700 ring-brown-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
};

export function IdeaStatusBadge({ status }: { status: IdeaStatus }) {
  const t = useTranslations('marketplace.ideas.status');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1',
        STATUS_STYLE[status],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {t(status)}
    </span>
  );
}

/** One idea with its vote button (used on the board and the homepage). */
export function IdeaCard({ idea, compact = false }: { idea: PublicIdea; compact?: boolean }) {
  const t = useTranslations('marketplace.ideas');
  const format = useFormatter();
  const { categoryName } = useMarketplace();
  const vote = useVoteIdea();
  const [failed, setFailed] = useState(false);
  const [justVoted, setJustVoted] = useState(false);
  const category = idea.categoryCode ? categoryName(idea.categoryCode) : undefined;
  const canVote = idea.votable && !idea.voted;
  const label = idea.voted
    ? t('votedFor', { title: idea.title })
    : canVote
      ? t('voteFor', { title: idea.title })
      : undefined;

  return (
    <article className="card-accent group flex gap-4 overflow-hidden rounded-2xl border border-line bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover sm:gap-5 sm:p-6">
      {/* The vote button says what it does: "Vote" (click to vote), "Voted" (done),
          or just the count once voting is closed. One vote per visitor. */}
      <button
        type="button"
        onClick={() => {
          setFailed(false);
          vote.mutate(idea.reference, {
            onSuccess: () => setJustVoted(true),
            onError: () => setFailed(true),
          });
        }}
        disabled={!canVote || vote.isPending}
        aria-pressed={idea.votable ? idea.voted : undefined}
        aria-label={label}
        title={label}
        className={cn(
          'group/vote flex w-[4.75rem] shrink-0 flex-col items-center justify-center gap-0.5 self-start rounded-2xl px-2 py-3 transition-all duration-200',
          'focus-visible:ring-4 focus-visible:ring-gold-200 focus-visible:outline-none',
          idea.voted
            ? 'bg-gold-500 text-brown-900 shadow-glow'
            : canVote
              ? 'cursor-pointer bg-white text-brown-800 ring-2 ring-gold-300 hover:-translate-y-0.5 hover:bg-gold-50 hover:shadow-glow hover:ring-gold-500 active:translate-y-0 active:scale-95'
              : 'bg-mist text-charcoal/60 ring-1 ring-line',
          justVoted && 'animate-vote-pop',
        )}
      >
        {vote.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : (
          <ThumbsUp
            className={cn(
              'h-5 w-5 transition-transform duration-200',
              idea.voted && 'fill-current',
              canVote && 'group-hover/vote:-translate-y-0.5 group-hover/vote:-rotate-12',
            )}
            aria-hidden
          />
        )}
        <span className="text-lg leading-none font-extrabold tabular-nums">{idea.voteCount}</span>
        <span
          className={cn(
            'mt-0.5 text-[11px] leading-none font-bold tracking-wide uppercase',
            idea.voted ? 'text-brown-900' : canVote ? 'text-gold-800' : 'text-charcoal/60',
          )}
        >
          {idea.voted
            ? t('votedButton')
            : canVote
              ? t('voteButton')
              : t('votesLabel', { count: idea.voteCount })}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <IdeaStatusBadge status={idea.status} />
          {category ? (
            <span className="text-xs font-medium text-charcoal/60">{category}</span>
          ) : null}
        </div>
        <h3 className="mt-2 text-lg leading-snug font-bold">{idea.title}</h3>
        <p
          className={cn(
            'mt-1.5 text-sm leading-relaxed text-charcoal/80',
            compact ? 'line-clamp-2' : 'line-clamp-4',
          )}
        >
          {idea.problem}
        </p>
        <p className="mt-3 text-xs text-charcoal/55">
          {idea.suggestedBy ? `${t('suggestedBy', { name: idea.suggestedBy })} · ` : ''}
          {format.dateTime(new Date(idea.createdAt), { dateStyle: 'medium' })}
          {' · '}
          {t('votes', { count: idea.voteCount })}
        </p>
        {failed ? (
          <p className="mt-2 text-xs font-medium text-red-600" role="alert">
            {t('voteError')}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function Board() {
  const t = useTranslations('marketplace.ideas');
  const tCommon = useTranslations('marketplace.common');
  const [sort, setSort] = useState<IdeaSort>('popular');
  const [status, setStatus] = useState<IdeaStatus | undefined>(undefined);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);
  const { data, isPending, isError, refetch, isFetching } = useIdeas({
    sort,
    status,
    q,
    limit: 60,
  });
  const filtered = !!(status || q);

  return (
    <div>
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-3 shadow-tile sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">{t('search')}</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-charcoal/40"
            aria-hidden
          />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('search')}
            maxLength={80}
            className="h-11 w-full rounded-xl bg-mist pr-3 pl-10 text-sm outline-none placeholder:text-charcoal/40 focus:ring-4 focus:ring-gold-100"
          />
        </label>
        <div
          className="inline-flex shrink-0 rounded-xl bg-mist p-1"
          role="group"
          aria-label={t('sort.label')}
        >
          {(['popular', 'newest'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sort === s}
              onClick={() => setSort(s)}
              className={cn(
                'rounded-lg px-3.5 py-2 text-sm font-semibold transition',
                sort === s
                  ? 'bg-white text-brown-900 shadow-tile'
                  : 'text-charcoal/70 hover:text-brown-900',
              )}
            >
              {t(`sort.${s}`)}
            </button>
          ))}
        </div>
      </div>

      <div
        className="scroll-fade -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:[mask-image:none]"
        role="group"
        aria-label={t('status.label')}
      >
        {[undefined, ...STATUSES].map((s) => (
          <button
            key={s ?? 'all'}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              'shrink-0 rounded-full px-4 py-2 text-sm font-medium ring-1 transition',
              status === s
                ? 'bg-brown-600 text-white ring-brown-600'
                : 'bg-white text-charcoal ring-line hover:ring-brown-200 hover:text-brown-900',
            )}
          >
            {s ? t(`status.${s}`) : t('status.all')}
          </button>
        ))}
      </div>

      <div className="mt-6" aria-busy={isFetching}>
        {isPending ? (
          <div className="space-y-4" aria-label={t('loading')}>
            {[0, 1, 2].map((i) => (
              <SiteSkeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon={<RefreshCw className="h-6 w-6" />}
            title={t('loadError')}
            description=""
            action={
              <SiteButton
                variant="outline"
                onClick={() => void refetch()}
                iconLeft={<RefreshCw className="h-4 w-4" aria-hidden />}
              >
                {tCommon('tryAgain')}
              </SiteButton>
            }
          />
        ) : data.length === 0 ? (
          <EmptyState
            icon={<Lightbulb className="h-6 w-6" />}
            title={filtered ? t('noMatch.title') : t('empty.title')}
            description={filtered ? t('noMatch.text') : t('empty.text')}
            action={
              <SiteButton href="#suggest" iconLeft={<MessageSquarePlus className="h-4 w-4" />}>
                {t('suggest')}
              </SiteButton>
            }
          />
        ) : (
          <ul className={cn('space-y-4 transition-opacity', isFetching && 'opacity-70')}>
            {data.map((idea, i) => (
              <Reveal as="li" key={idea.reference} delay={Math.min(i, 5) * 50}>
                <IdeaCard idea={idea} />
              </Reveal>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type Errors = Partial<Record<string, string>>;

function IdeaForm() {
  const t = useTranslations('marketplace');
  const { categories } = useMarketplace();
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const [honeypot, setHoneypot] = useState('');
  const empty = { title: '', problem: '', categoryCode: '', submitterName: '', submitterEmail: '' };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        title: z.string().trim().min(3, t('ideas.form.validation.title')).max(160),
        problem: z.string().trim().min(20, t('ideas.form.validation.problem')).max(2000),
        submitterEmail: z.string().trim().email(t('forms.validation.email')),
      }),
    [t],
  );
  const sorted = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );

  const set = (key: keyof typeof form, value: string) => {
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
      const ref = await submitIdea(
        {
          title: form.title.trim(),
          problem: form.problem.trim(),
          categoryCode: form.categoryCode || null,
          submitterName: form.submitterName.trim() || null,
          submitterEmail: form.submitterEmail.trim().toLowerCase(),
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
      <div className="animate-scale-in py-4 text-center" role="status">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60">
          <CheckCircle2 className="h-9 w-9 text-emerald-600" aria-hidden />
        </div>
        <h3 className="mt-5 text-xl font-bold">{t('ideas.form.received')}</h3>
        <p className="mx-auto mt-2 max-w-xs text-sm text-charcoal/70">
          {t('ideas.form.receivedText')}
        </p>
        <div className="mx-auto mt-5 inline-block rounded-2xl border border-line bg-mist px-5 py-3 text-left">
          <div className="text-[11px] font-semibold tracking-wider text-charcoal/50 uppercase">
            {t('forms.submitted.reference')}
          </div>
          <div className="font-mono text-lg font-bold tracking-wide text-brown-900">
            {reference}
          </div>
        </div>
        <div>
          <SiteButton
            className="mt-6"
            variant="outline"
            onClick={() => {
              setForm(empty);
              setReference(null);
              setOpenedAt(Date.now());
            }}
          >
            {t('ideas.form.another')}
          </SiteButton>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="relative space-y-4">
      <Honeypot value={honeypot} onChange={setHoneypot} />
      <SiteInput
        label={t('ideas.form.title')}
        hint={t('ideas.form.titleHint')}
        required
        value={form.title}
        onChange={(e) => set('title', e.target.value)}
        error={errors.title}
        maxLength={160}
      />
      <SiteTextarea
        label={t('ideas.form.problem')}
        hint={t('ideas.form.problemHint')}
        required
        rows={5}
        value={form.problem}
        onChange={(e) => set('problem', e.target.value)}
        error={errors.problem}
        maxLength={2000}
      />
      <SiteSelect
        label={t('ideas.form.category')}
        value={form.categoryCode}
        onChange={(e) => set('categoryCode', e.target.value)}
        error={errors.categoryCode}
      >
        <option value="">{t('ideas.form.categoryNone')}</option>
        {sorted.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </SiteSelect>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <SiteInput
          label={t('ideas.form.name')}
          hint={t('ideas.form.nameHint')}
          autoComplete="given-name"
          value={form.submitterName}
          onChange={(e) => set('submitterName', e.target.value)}
          error={errors.submitterName}
          maxLength={120}
        />
        <SiteInput
          label={t('ideas.form.email')}
          hint={t('ideas.form.emailHint')}
          required
          type="email"
          autoComplete="email"
          value={form.submitterEmail}
          onChange={(e) => set('submitterEmail', e.target.value)}
          error={errors.submitterEmail}
          maxLength={160}
        />
      </div>
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
        {t('ideas.form.submit')}
      </SiteButton>
    </form>
  );
}

/** Public "What should we build next?" board: browse, vote and suggest. */
export function IdeasPage() {
  const t = useTranslations('marketplace.ideas');
  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')}>
        <div className="mt-8 flex flex-wrap gap-3">
          <SiteButton
            href="#suggest"
            size="lg"
            iconLeft={<MessageSquarePlus className="h-5 w-5" />}
          >
            {t('suggest')}
          </SiteButton>
        </div>
      </PageHero>
      <section className="py-8 sm:py-20">
        {/* grid-cols-1 (minmax(0,1fr)): without it the phone column sizes to the
            filter chips' full width and the page scrolls sideways. */}
        <div className="container-x grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
          <Board />
          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <div
              id="suggest"
              className="scroll-mt-24 rounded-3xl border border-line bg-white p-6 shadow-tile sm:p-7"
            >
              <h2 className="flex items-center gap-2.5 text-xl font-bold">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold-500 text-brown-900">
                  <Lightbulb className="h-5 w-5" aria-hidden />
                </span>
                {t('form.heading')}
              </h2>
              <p className="mt-2 mb-5 text-sm text-charcoal/60">{t('form.intro')}</p>
              <IdeaForm />
            </div>
            <div className="rounded-3xl bg-cream p-6 ring-1 ring-line sm:p-7">
              <h2 className="text-base font-bold">{t('how.title')}</h2>
              <ol className="mt-4 space-y-3.5">
                {(['suggest', 'review', 'vote'] as const).map((k, i) => (
                  <li key={k} className="flex gap-3 text-sm leading-relaxed text-charcoal">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white font-display text-xs font-bold text-gold-700 ring-1 ring-line">
                      {i + 1}
                    </span>
                    <span>{t(`how.${k}`)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
