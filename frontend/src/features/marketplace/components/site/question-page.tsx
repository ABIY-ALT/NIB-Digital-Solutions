'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Code2, Lock, RefreshCw, Send, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { cn } from '@/shared/lib/cn';
import { fetchConversation, sendFollowUp, submissionError } from '../../client';
import type { PublicConversation } from '../../types';
import { EmptyState, SiteButton, SiteSkeleton, SiteTextarea } from './primitives';
import { PageHero } from './site-shell';

const STATUS_STYLE: Record<PublicConversation['status'], string> = {
  open: 'bg-gold-50 text-gold-800 ring-gold-200',
  in_progress: 'bg-brown-50 text-brown-700 ring-brown-200',
  answered: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
  closed: 'bg-slate-100 text-slate-600 ring-slate-200',
};

/**
 * A customer's conversation with a product developer. Opened from the private
 * link in the confirmation and answer e-mails (reference + token); follow-up
 * questions keep the same reference and are routed to the same developer.
 */
export function QuestionPage({ reference, token }: { reference: string; token: string | null }) {
  const t = useTranslations('marketplace.questions');
  const format = useFormatter();
  const client = useQueryClient();
  const key = ['marketplace', 'question', reference, token] as const;
  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchConversation(reference, token!, signal),
    enabled: !!token,
    refetchInterval: 60_000,
    retry: false,
  });
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const followUp = useMutation({
    mutationFn: (text: string) => sendFollowUp(reference, token!, text),
    onSuccess: (updated) => {
      client.setQueryData(key, updated);
      setBody('');
    },
    onError: (err) => setError(submissionError(err, t('failed')).message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const text = body.trim();
    if (text.length < 2) return setError(t('tooShort'));
    followUp.mutate(text);
  }

  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title', { reference })} lead={t('lead')} />
      <div className="container-x max-w-3xl py-12 sm:py-16">
        {!token || isError ? (
          <EmptyState
            icon={<Lock className="h-6 w-6" />}
            title={t('notFound.title')}
            description={t('notFound.text')}
            action={
              <SiteButton href="/products" variant="secondary">
                {t('notFound.action')}
              </SiteButton>
            }
          />
        ) : isPending ? (
          <div className="space-y-4">
            <SiteSkeleton className="h-24 w-full" />
            <SiteSkeleton className="ms-auto h-24 w-4/5" />
          </div>
        ) : (
          <>
            <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-5 shadow-tile">
              <div>
                <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  {t('product')}
                </p>
                <Link
                  href={`/products/${data.productSlug}`}
                  className="text-lg font-bold text-brown-900 hover:underline"
                >
                  {data.productName}
                </Link>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1',
                    STATUS_STYLE[data.status],
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                  {t(`status.${data.status}`)}
                </span>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="rounded-lg p-2 text-slate-500 hover:bg-mist hover:text-brown-900"
                  aria-label={t('refresh')}
                >
                  <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
                </button>
              </div>
            </div>

            <ol className="space-y-4" aria-label={t('conversation')}>
              {data.messages.map((m, i) => {
                const customer = m.author === 'customer';
                return (
                  <li
                    key={`${m.createdAt}-${i}`}
                    className={cn(
                      'max-w-[88%] animate-fade-up rounded-2xl border p-4 sm:p-5',
                      customer
                        ? 'border-line bg-white'
                        : 'ms-auto border-gold-200 bg-gradient-to-br from-gold-50 to-white',
                    )}
                  >
                    <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {customer ? (
                        <UserRound className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <Code2 className="h-3.5 w-3.5 text-gold-700" aria-hidden />
                      )}
                      <span className="font-semibold text-brown-900">{m.authorName}</span>
                      <span>· {t(`authors.${m.author}`)}</span>
                      <time dateTime={m.createdAt}>
                        ·{' '}
                        {format.dateTime(new Date(m.createdAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </time>
                    </p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-charcoal">
                      {m.body}
                    </p>
                  </li>
                );
              })}
            </ol>

            {data.status === 'closed' ? (
              <p className="mt-8 rounded-2xl bg-mist px-5 py-4 text-sm text-charcoal">
                {t('closed')}
              </p>
            ) : (
              <form onSubmit={submit} noValidate className="mt-10 space-y-4">
                <SiteTextarea
                  label={t('followUp')}
                  value={body}
                  maxLength={4000}
                  onChange={(e) => {
                    setBody(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder={t('followUpPlaceholder')}
                  error={error || undefined}
                  className="min-h-28"
                />
                <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Lock className="h-3.5 w-3.5" /> {t('private')}
                  </p>
                  <SiteButton
                    type="submit"
                    loading={followUp.isPending}
                    iconLeft={!followUp.isPending && <Send className="h-4 w-4" />}
                  >
                    {t('send')}
                  </SiteButton>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </>
  );
}
