'use client';

import { Check, MessageSquareQuote, ShieldCheck, Undo2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { describeError } from '@/shared/errors/error-messages';
import { formatDateTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ChangeDiff, type ChangeDiffLabels } from '@/shared/ui/change-diff';
import { Alert, ErrorState, Skeleton } from '@/shared/ui/feedback';
import { Label, Textarea } from '@/shared/ui/input';
import { Avatar } from '@/shared/ui/menu';
import { Drawer, DrawerContent } from '@/shared/ui/overlay';
import { RelativeTime } from '@/shared/ui/relative-time';
import { toast } from '@/shared/ui/toaster';
import { useApproval, useDecideApproval, type Decision } from '../hooks/use-approvals';
import type { ApprovalRequest } from '../types';
import { ApprovalStatusBadge } from './approval-status';

export function useDiffLabels(): ChangeDiffLabels {
  const t = useTranslations('approvals.diff');
  return {
    field: t('field'),
    before: t('before'),
    after: t('after'),
    empty: t('empty'),
    created: t('created'),
    deleted: t('deleted'),
    onlyChanges: t('onlyChanges'),
    allFields: t('allFields'),
    unchanged: (count) => t('unchanged', { count }),
    added: t('added'),
    removed: t('removed'),
  };
}

/** Request details with the reviewer's diff and the decision controls (side drawer). */
export function ApprovalDetailDrawer({
  id,
  onOpenChange,
}: Readonly<{
  id: string | null;
  onOpenChange: (open: boolean) => void;
}>) {
  const t = useTranslations('approvals');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const { data, isPending, error, refetch } = useApproval(id);

  let body: ReactNode = null;
  if (isPending && id) {
    body = (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  } else if (error) {
    body = (
      <ErrorState
        title={te('title')}
        description={describeError(error, te).message}
        correlationId={describeError(error, te).correlationId}
        referenceLabel={tc('reference')}
        action={
          <Button variant="outline" onClick={() => refetch()}>
            {tc('retry')}
          </Button>
        }
      />
    );
  } else if (data) {
    body = <ApprovalBody request={data} />;
  }

  return (
    <Drawer open={!!id} onOpenChange={onOpenChange}>
      <DrawerContent
        className="max-w-2xl"
        title={data?.summary ?? t('detail.title')}
        description={data ? `${data.action} · ${data.resourceType}` : undefined}
        footer={
          data ? <DecisionBar request={data} onDone={() => onOpenChange(false)} /> : undefined
        }
      >
        {body}
      </DrawerContent>
    </Drawer>
  );
}

function Person({ name, caption }: Readonly<{ name: string; caption: React.ReactNode }>) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={name} size={32} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </div>
    </div>
  );
}

function ApprovalBody({ request: r }: Readonly<{ request: ApprovalRequest }>) {
  const t = useTranslations('approvals');
  const locale = useLocale();
  const diffLabels = useDiffLabels();
  const tf = useTranslations('approvals.fields');
  const pending = r.status === 'PENDING';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <ApprovalStatusBadge status={r.status} />
        <code className="rounded-item bg-muted px-1.5 py-0.5 text-[11px]">{r.action}</code>
        {pending ? (
          <span className="text-xs text-muted-foreground">
            {t('detail.expires')}{' '}
            <RelativeTime value={r.expiresAt} locale={locale} className="font-semibold" />
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 rounded-surface border border-border p-4 sm:grid-cols-2">
        <Person
          name={r.maker.name}
          caption={
            <>
              {t('detail.requested')} · <RelativeTime value={r.createdAt} locale={locale} />
            </>
          }
        />
        {r.checker ? (
          <Person
            name={r.checker.name}
            caption={
              <>
                {t(`detail.decided.${r.status === 'REJECTED' ? 'rejected' : 'approved'}`)}
                {r.decidedAt ? (
                  <>
                    {' '}
                    · <RelativeTime value={r.decidedAt} locale={locale} />
                  </>
                ) : null}
              </>
            }
          />
        ) : (
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <span className="flex size-8 items-center justify-center rounded-full border border-dashed border-border-strong">
              <ShieldCheck className="size-4" aria-hidden />
            </span>
            {pending ? t('detail.awaitingChecker') : t('detail.noChecker')}
          </div>
        )}
      </div>

      {r.makerComment ? (
        <blockquote className="flex gap-2.5 rounded-surface bg-muted/60 p-3 text-sm">
          <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden />
          <div>
            <p className="text-xs font-semibold text-muted-foreground">{t('detail.reason')}</p>
            <p className="mt-0.5">{r.makerComment}</p>
          </div>
        </blockquote>
      ) : null}

      {r.status === 'FAILED' ? (
        <Alert tone="danger" title={t('detail.failed')}>
          {r.errorMessage}
        </Alert>
      ) : null}
      {r.checkerComment ? (
        <Alert
          tone={r.status === 'REJECTED' ? 'warning' : 'info'}
          title={t('detail.checkerComment')}
        >
          {r.checkerComment}
        </Alert>
      ) : null}
      {pending && r.canCancel ? <Alert tone="info" title={t('detail.fourEyes')} /> : null}

      <section>
        <h3 className="mb-2 text-sm font-semibold">{t('detail.changes')}</h3>
        <ChangeDiff
          before={r.before}
          after={r.after}
          labels={diffLabels}
          fieldLabel={(f) => (tf.has(f) ? tf(f) : f)}
        />
      </section>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <dt className="text-muted-foreground">{t('detail.submittedAt')}</dt>
        <dd className="tabular">{formatDateTime(r.createdAt, locale)}</dd>
        <dt className="text-muted-foreground">{t('detail.expiresAt')}</dt>
        <dd className="tabular">{formatDateTime(r.expiresAt, locale)}</dd>
        <dt className="text-muted-foreground">{t('detail.checkers')}</dt>
        <dd className="flex flex-wrap gap-1">
          {r.checkerPermissions.map((p) => (
            <code key={p} className="rounded-item bg-muted px-1 text-[10px]">
              {p}
            </code>
          ))}
        </dd>
        <dt className="text-muted-foreground">{t('detail.reference')}</dt>
        <dd className="font-mono text-[11px] break-all">{r.id}</dd>
      </dl>
    </div>
  );
}

function decisionFor(kind: Decision['kind'], id: string, comment: string): Decision {
  if (kind === 'reject') return { kind, id, comment: comment.trim() };
  if (kind === 'approve') return { kind, id, comment: comment.trim() || null };
  return { kind, id };
}

/** Approve (optional comment) · Reject (reason required) · Withdraw (maker). */
function DecisionBar({
  request: r,
  onDone,
}: Readonly<{ request: ApprovalRequest; onDone: () => void }>) {
  const t = useTranslations('approvals');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const decide = useDecideApproval();
  const [comment, setComment] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const run = (kind: 'approve' | 'reject' | 'cancel') => {
    if (kind === 'reject' && comment.trim().length < 3) {
      setRejecting(true);
      setInvalid(true);
      return;
    }
    decide.mutate(decisionFor(kind, r.id, comment), {
      onSuccess: (updated) => {
        if (updated.status === 'FAILED') {
          toast.error(t('toast.failed'), { description: updated.errorMessage ?? undefined });
        } else {
          toast.success(t(`toast.${kind}`), { description: r.summary });
        }
        onDone();
      },
      onError: (error) => toast.error(describeError(error, te).message),
    });
  };

  if (r.canDecide) {
    return (
      <div className="w-full space-y-2.5">
        <div className="space-y-1">
          <Label htmlFor="approval-comment" className="text-xs">
            {rejecting ? t('decision.reasonRequired') : t('decision.comment')}
          </Label>
          <Textarea
            id="approval-comment"
            value={comment}
            aria-invalid={invalid || undefined}
            onChange={(e) => {
              setComment(e.target.value);
              setInvalid(false);
            }}
            rows={2}
            maxLength={1000}
            placeholder={t('decision.placeholder')}
          />
          {invalid ? <p className="text-xs text-danger">{t('decision.reasonHint')}</p> : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onDone} disabled={decide.isPending}>
            {tc('close')}
          </Button>
          <Button
            variant="outline"
            className="text-danger hover:bg-danger-soft"
            onClick={() => run('reject')}
            loading={decide.isPending && decide.variables?.kind === 'reject'}
            disabled={decide.isPending}
          >
            <X /> {t('decision.reject')}
          </Button>
          <Button
            onClick={() => run('approve')}
            loading={decide.isPending && decide.variables?.kind === 'approve'}
            disabled={decide.isPending}
          >
            <Check /> {t('decision.approve')}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <>
      <Button variant="outline" onClick={onDone}>
        {tc('close')}
      </Button>
      {r.canCancel ? (
        <Button
          variant="outline"
          className="text-danger hover:bg-danger-soft"
          onClick={() => run('cancel')}
          loading={decide.isPending}
        >
          <Undo2 /> {t('decision.withdraw')}
        </Button>
      ) : null}
    </>
  );
}
