'use client';

import { ArrowLeft, Headset, Mail, MessageSquare, Send } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { describeError } from '@/shared/errors/error-messages';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { cn } from '@/shared/lib/cn';
import { formatDateTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Select } from '@/shared/ui/choice';
import { ErrorState, Skeleton } from '@/shared/ui/feedback';
import { Label, Textarea } from '@/shared/ui/input';
import { PageHeader } from '@/shared/ui/page-header';
import { toast } from '@/shared/ui/toaster';
import {
  useQuestionConversation,
  useReplyToQuestion,
  useSaveProductQuestion,
} from '../hooks/use-product-questions';
import type { QuestionStatus } from '../types';
import { QUESTION_STATUSES, QuestionStatusBadge } from './question-status';

/**
 * One customer question: the whole conversation (customer, developer replies
 * from Telegram, staff replies), a staff reply box, the status, the routed
 * developers and the delivery log of every Telegram message and e-mail.
 */
export function QuestionDetail({ id }: { id: string }) {
  const t = useTranslations('productQuestions');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { can } = usePermissions();
  const { data, isPending, error, refetch } = useQuestionConversation(id);
  const reply = useReplyToQuestion(id);
  const save = useSaveProductQuestion({ meta: { notify: { error: true } } });
  const feedback = useSaveFeedback();
  const [body, setBody] = useState('');

  if (error)
    return (
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
    );
  if (isPending || !data) return <Skeleton className="h-96 w-full" />;

  const { question } = data;
  const canAnswer = can('product-questions:update') && question.status !== 'closed';

  return (
    <>
      <PageHeader
        icon={<Headset />}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {question.reference} <QuestionStatusBadge status={question.status} />
          </span>
        }
        description={`${data.productName} · ${question.customerName} <${question.customerEmail}>`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/product-questions">
              <ArrowLeft /> {t('back')}
            </Link>
          </Button>
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <CardTitle>{t('conversation')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="space-y-3">
              {data.messages.map((m) => {
                const customer = m.author === 'customer';
                return (
                  <li
                    key={m.id}
                    className={cn(
                      'max-w-[85%] rounded-surface border p-3',
                      customer
                        ? 'border-border bg-surface'
                        : 'ms-auto border-primary/30 bg-primary-softer',
                    )}
                  >
                    <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{m.authorName}</span>
                      <Badge tone="outline">{t(`authors.${m.author}`)}</Badge>
                      <span>{t(`channels.${m.channel}`)}</span>
                      <span className="tabular">· {formatDateTime(m.createdAt, locale)}</span>
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                  </li>
                );
              })}
            </ol>

            {canAnswer ? (
              <form
                className="space-y-2 border-t border-border pt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (body.trim().length < 2) return;
                  reply.mutate(body.trim(), {
                    onSuccess: () => {
                      setBody('');
                      toast.success(t('replied'));
                    },
                    onError: (err) => toast.error(describeError(err, te).message),
                  });
                }}
              >
                <Label htmlFor="staff-reply">{t('replyLabel')}</Label>
                <Textarea
                  id="staff-reply"
                  rows={4}
                  maxLength={4000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t('replyPlaceholder')}
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">{t('replyHint')}</p>
                  <Button type="submit" loading={reply.isPending} disabled={body.trim().length < 2}>
                    <Send /> {t('send')}
                  </Button>
                </div>
              </form>
            ) : question.status === 'closed' ? (
              <p className="border-t border-border pt-4 text-sm text-muted-foreground">
                {t('closedHint')}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{t('fields.status')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                aria-label={t('fields.status')}
                value={question.status}
                disabled={!can('product-questions:update') || save.isPending}
                onValueChange={(status) =>
                  void save
                    .mutateAsync({
                      id: question.id,
                      input: { status: status as QuestionStatus, version: question.version },
                    })
                    .then((r) => feedback(r, t('toast.updated')))
                    .catch(() => undefined)
                }
                options={QUESTION_STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))}
              />
              <dl className="space-y-1 text-xs text-muted-foreground">
                <div>
                  {t('fields.createdAt')}:{' '}
                  <span className="tabular">{formatDateTime(question.createdAt, locale)}</span>
                </div>
                {question.lastMessageAt ? (
                  <div>
                    {t('fields.lastMessageAt')}:{' '}
                    <span className="tabular">
                      {formatDateTime(question.lastMessageAt, locale)}
                    </span>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('developers')}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.developers.length ? (
                <ul className="space-y-2 text-sm">
                  {data.developers.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2">
                      <span>{d.name}</span>
                      <Badge tone={d.telegramLinked ? 'success' : 'warning'}>
                        {d.telegramLinked ? 'Telegram' : t('emailOnly')}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t('noDevelopers')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('deliveries')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {data.deliveries.map((d) => (
                  <li key={d.id} className="space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        {d.channel === 'telegram' ? (
                          <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
                        ) : (
                          <Mail className="size-4 text-muted-foreground" aria-hidden />
                        )}
                        {t(`purposes.${d.purpose}`)}
                      </span>
                      <Badge
                        tone={
                          d.status === 'sent'
                            ? 'success'
                            : d.status === 'failed'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {t(`delivery.${d.status}`)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground tabular">
                      {formatDateTime(d.sentAt ?? d.createdAt, locale)}
                      {d.attempts > 1 ? ` · ${t('attempts', { count: d.attempts })}` : ''}
                    </p>
                    {d.lastError && d.status !== 'sent' ? (
                      <p className="text-xs break-words text-danger">{d.lastError}</p>
                    ) : null}
                  </li>
                ))}
                {!data.deliveries.length ? <li className="text-muted-foreground">—</li> : null}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
