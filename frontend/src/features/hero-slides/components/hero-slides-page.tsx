'use client';

import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  GripVertical,
  Images,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { PendingApprovalBadge } from '@/features/approvals/components/approval-status';
import { usePendingApprovals } from '@/features/approvals/hooks/use-approvals';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { describeError } from '@/shared/errors/error-messages';
import { useEditor } from '@/shared/hooks/use-editor';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Switch } from '@/shared/ui/choice';
import { Alert, EmptyState, ErrorState, Skeleton } from '@/shared/ui/feedback';
import { ConfirmDialog } from '@/shared/ui/overlay';
import { PageHeader } from '@/shared/ui/page-header';
import { toast } from '@/shared/ui/toaster';
import {
  heroImageUrl,
  useDeleteHeroSlide,
  useOrderedHeroSlides,
  useReorderHeroSlides,
  useSaveHeroSlide,
} from '../hooks/use-hero-slides';
import type { HeroSlide } from '../types';
import { HeroSettingsCard } from './hero-settings-card';

const HeroSlideFormDialog = dynamic(() =>
  import('./hero-slide-form-dialog').then((m) => m.HeroSlideFormDialog),
);

/**
 * Hero carousel management: the slides in display order (drag, or move with the
 * arrow buttons), each with its images, optional text and a "shown" switch;
 * plus the carousel settings. Every change reaches the homepage immediately.
 */
export function HeroSlidesPage() {
  const t = useTranslations('heroSlides');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { can } = usePermissions();
  const canCreate = can('hero-slides:create');
  const canUpdate = can('hero-slides:update');
  const canDelete = can('hero-slides:delete');

  const { data, isPending, error, refetch } = useOrderedHeroSlides();
  const reorder = useReorderHeroSlides();
  const save = useSaveHeroSlide({ meta: { notify: { error: true } } });
  const remove = useDeleteHeroSlide({ meta: { notify: { error: true } } });
  const feedback = useSaveFeedback();
  const editor = useEditor<HeroSlide>();
  const pending =
    usePendingApprovals(
      'HeroSlide',
      (data ?? []).map((e) => e.id),
    ).data ?? {};

  // Local order while dragging / saving; falls back to the server order.
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<HeroSlide | null>(null);
  const [reason, setReason] = useState('');
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (!reorder.isPending && !dragId) setOrder(null);
  }, [data, reorder.isPending, dragId]);

  const slides = useMemo(() => {
    const list = data ?? [];
    if (!order) return list;
    const byId = new Map(list.map((s) => [s.id, s]));
    return order.map((id) => byId.get(id)).filter((s): s is HeroSlide => !!s);
  }, [data, order]);
  const activeCount = slides.filter((s) => s.active).length;

  function commit(ids: string[], movedId?: string) {
    const before = (data ?? []).map((s) => s.id);
    if (ids.join() === before.join()) return setOrder(null);
    setOrder(ids);
    reorder.mutate(ids, {
      onSuccess: () => {
        if (movedId)
          setAnnouncement(t('slides.moved', { n: ids.indexOf(movedId) + 1, total: ids.length }));
        toast.success(t('slides.orderSaved'));
      },
      onError: () => setOrder(null),
    });
  }

  function move(id: string, delta: number) {
    const ids = slides.map((s) => s.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    commit(ids, id);
  }

  // Native drag and drop: the list reorders live under the pointer, saved on drop.
  const onDragOver = (e: DragEvent, overId: string) => {
    if (!dragId) return;
    e.preventDefault();
    if (overId === dragId) return;
    const ids = slides.map((s) => s.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(overId);
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    setOrder(ids);
  };
  const onDrop = () => {
    if (!dragId) return;
    const moved = dragId;
    setDragId(null);
    commit(
      slides.map((s) => s.id),
      moved,
    );
  };

  return (
    <>
      <PageHeader
        icon={<Images />}
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <Button variant="outline" onClick={() => window.open('/', '_blank', 'noopener')}>
              <ExternalLink /> {t('viewSite')}
            </Button>
            {canCreate ? (
              <Button onClick={editor.create}>
                <Plus /> {t('new')}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>{t('slides.title')}</CardTitle>
            <CardDescription>
              {data ? t('slides.summary', { active: activeCount, total: slides.length }) : null}
              {canUpdate && slides.length > 1 ? ` · ${t('slides.hint')}` : null}
            </CardDescription>
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
            ) : isPending ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
            ) : slides.length === 0 ? (
              <EmptyState
                icon={<Images />}
                title={t('slides.emptyTitle')}
                description={t('slides.emptyText')}
                action={
                  canCreate ? (
                    <Button onClick={editor.create}>
                      <Plus /> {t('new')}
                    </Button>
                  ) : null
                }
              />
            ) : (
              <>
                {activeCount === 0 ? (
                  <Alert tone="warning" className="mb-4">
                    {t('slides.noneActive')}
                  </Alert>
                ) : null}
                <ol className="space-y-3" aria-label={t('slides.title')}>
                  {slides.map((slide, index) => (
                    <li
                      key={slide.id}
                      draggable={canUpdate && !reorder.isPending}
                      onDragStart={(e) => {
                        setDragId(slide.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', slide.id);
                      }}
                      onDragOver={(e) => onDragOver(e, slide.id)}
                      onDrop={onDrop}
                      onDragEnd={() => {
                        if (dragId) {
                          setDragId(null);
                          setOrder(null);
                        }
                      }}
                      className={cn(
                        'flex flex-col gap-4 rounded-surface border border-border bg-surface p-3 transition sm:flex-row sm:items-center',
                        dragId === slide.id && 'opacity-50 ring-2 ring-primary',
                        !slide.active && 'bg-surface-muted',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {canUpdate ? (
                          <span
                            className="hidden cursor-grab text-subtle-foreground active:cursor-grabbing sm:block"
                            title={t('slides.drag', { n: index + 1 })}
                            aria-hidden
                          >
                            <GripVertical className="size-5" />
                          </span>
                        ) : null}
                        <span className="w-6 text-center text-sm font-semibold tabular-nums text-muted-foreground">
                          {index + 1}
                        </span>
                        <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-control border border-border bg-muted sm:w-48">
                          {/* eslint-disable-next-line @next/next/no-img-element -- uploaded media */}
                          <img
                            src={heroImageUrl(slide.desktopImageId)}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className={cn(
                              'h-full w-full object-cover',
                              !slide.active && 'opacity-60',
                            )}
                          />
                          {slide.mobileImageId ? (
                            <span
                              className="absolute right-1 bottom-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white"
                              title={t('slides.mobileBadge')}
                            >
                              <Smartphone className="size-3" aria-hidden />
                              <span className="sr-only">{t('slides.mobileBadge')}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold">
                            {slide.title ?? (
                              <span className="font-normal text-muted-foreground italic">
                                {t('slides.imageOnly')}
                              </span>
                            )}
                          </p>
                          <Badge tone={slide.active ? 'success' : 'neutral'} dot>
                            {slide.active ? t('slides.active') : t('slides.inactive')}
                          </Badge>
                          {pending[slide.id] ? (
                            <PendingApprovalBadge approvalId={pending[slide.id]!} />
                          ) : null}
                        </div>
                        {slide.description ? (
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {slide.description}
                          </p>
                        ) : null}
                        {slide.ctaLabel && slide.ctaHref ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {t('slides.button', { label: slide.ctaLabel, href: slide.ctaHref })}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1 self-end sm:self-center">
                        {canUpdate ? (
                          <>
                            <label className="me-2 flex items-center gap-2 text-sm">
                              <Switch
                                checked={slide.active}
                                disabled={save.isPending}
                                aria-label={`${t('slides.show')}: ${slide.title ?? t('slides.position', { n: index + 1 })}`}
                                onCheckedChange={(active) =>
                                  void save
                                    .mutateAsync({
                                      id: slide.id,
                                      input: { active, version: slide.version },
                                    })
                                    .then((r) => feedback(r, t('toast.updated')))
                                    .catch(() => undefined)
                                }
                              />
                            </label>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`${t('slides.moveUp')}: ${t('slides.position', { n: index + 1 })}`}
                              disabled={index === 0 || reorder.isPending}
                              onClick={() => move(slide.id, -1)}
                            >
                              <ArrowUp />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`${t('slides.moveDown')}: ${t('slides.position', { n: index + 1 })}`}
                              disabled={index === slides.length - 1 || reorder.isPending}
                              onClick={() => move(slide.id, 1)}
                            >
                              <ArrowDown />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`${t('actions.edit')}: ${t('slides.position', { n: index + 1 })}`}
                              onClick={() => editor.edit(slide)}
                            >
                              <Pencil />
                            </Button>
                          </>
                        ) : null}
                        {canDelete ? (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-danger"
                            aria-label={`${t('actions.delete')}: ${t('slides.position', { n: index + 1 })}`}
                            onClick={() => setConfirming(slide)}
                          >
                            <Trash2 />
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
            <p className="sr-only" aria-live="polite">
              {announcement}
            </p>
          </CardContent>
        </Card>

        <HeroSettingsCard />
      </div>

      <HeroSlideFormDialog
        open={editor.open}
        entity={editor.record}
        onOpenChange={editor.onOpenChange}
      />

      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(null);
            setReason('');
          }
        }}
        title={t('delete.title')}
        description={t('delete.description', {
          name:
            confirming?.title ??
            t('delete.unnamed', { n: slides.findIndex((s) => s.id === confirming?.id) + 1 }),
        })}
        confirmLabel={t('actions.delete')}
        cancelLabel={tc('cancel')}
        loading={remove.isPending}
        onConfirm={() =>
          confirming &&
          remove.mutate(
            { id: confirming.id, reason },
            {
              onSuccess: (result) => {
                feedback(result, t('toast.deleted'));
                setConfirming(null);
                setReason('');
              },
              onError: () => setConfirming(null),
            },
          )
        }
      >
        <ApprovalNotice action="hero-slides.delete" reason={reason} onReasonChange={setReason} />
      </ConfirmDialog>
    </>
  );
}
