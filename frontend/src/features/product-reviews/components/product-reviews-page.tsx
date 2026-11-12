'use client';

import { Check, ExternalLink, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { PendingApprovalBadge } from '@/features/approvals/components/approval-status';
import { usePendingApprovals } from '@/features/approvals/hooks/use-approvals';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { useAllDigitalProducts } from '@/features/digital-products/hooks/use-digital-products';
import { describeError } from '@/shared/errors/error-messages';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useEditor } from '@/shared/hooks/use-editor';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { cn } from '@/shared/lib/cn';
import type { FilterDef } from '@/shared/lib/table-filters';
import { formatDate } from '@/shared/lib/format';
import { Badge, type BadgeTone } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  DataTable,
  DataTableToolbar,
  TableSearch,
  type DataTableColumn,
} from '@/shared/ui/data-table';
import { useDataTableLabels, useTableToolLabels } from '@/shared/ui/data-table-labels';
import { DataTableExport } from '@/shared/ui/data-table-export';
import { DataTableFilters } from '@/shared/ui/data-table-filters';
import { ErrorState } from '@/shared/ui/feedback';
import { ConfirmDialog } from '@/shared/ui/overlay';
import { PageHeader } from '@/shared/ui/page-header';
import { RefreshButton, RowActionsMenu, type RowAction } from '@/shared/ui/row-actions';
import {
  productReviewsExportPath,
  useDeleteProductReview,
  useProductReviews,
  useSaveProductReview,
} from '../hooks/use-product-reviews';
import { productReviewsResource } from '../resource';
import { RATINGS, REVIEW_STATUSES, type ReviewStatus } from '../schemas';
import type { ProductReview } from '../types';

const ProductReviewFormDialog = dynamic(() =>
  import('./product-review-form-dialog').then((m) => m.ProductReviewFormDialog),
);

const STATUS_TONE: Record<ReviewStatus, BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'neutral',
};

export function ReviewStatusBadge({ status }: { status: string }) {
  const t = useTranslations('productReviews.status');
  const known = (REVIEW_STATUSES as readonly string[]).includes(status);
  return (
    <Badge tone={known ? STATUS_TONE[status as ReviewStatus] : 'neutral'} dot>
      {known ? t(status) : status}
    </Badge>
  );
}

/** 1–5 stars as text-free icons, with an accessible label. */
function StarRating({ rating }: { rating: number }) {
  const t = useTranslations('productReviews');
  return (
    <span
      role="img"
      aria-label={t('stars', { count: rating })}
      className="inline-flex items-center gap-0.5"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(
            'size-3.5',
            i < rating ? 'fill-primary text-primary' : 'text-border-strong',
          )}
        />
      ))}
    </span>
  );
}

/**
 * Customer reviews from the website: the moderation queue (newest first).
 * Approve to publish a review on the product page (it then counts in the
 * product's rating), reject to hide it, and reply publicly.
 */
export function ProductReviewsPage() {
  const t = useTranslations('productReviews');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const labels = useDataTableLabels();
  const tools = useTableToolLabels();
  const { can } = usePermissions();
  const { params, update } = useListParams(productReviewsResource.listDefaults);
  const { data, isPending, isFetching, error, refetch } = useProductReviews(params);
  const pending =
    usePendingApprovals(
      'ProductReview',
      (data?.items ?? []).map((e) => e.id),
    ).data ?? {};
  const remove = useDeleteProductReview({ meta: { notify: { error: true } } });
  const save = useSaveProductReview({ meta: { notify: { error: true } } });
  const feedback = useSaveFeedback();
  const editor = useEditor<ProductReview>();
  const [confirming, setConfirming] = useState<ProductReview | null>(null);
  const [reason, setReason] = useState('');
  const products = useAllDigitalProducts().data;
  const productNames = useMemo(
    () => Object.fromEntries((products ?? []).map((p) => [p.slug, p.name])),
    [products],
  );

  const filterDefs: FilterDef[] = [
    {
      id: 'status',
      label: t('fields.status'),
      type: 'multiselect',
      options: REVIEW_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
    },
    {
      id: 'rating',
      label: t('fields.rating'),
      type: 'multiselect',
      options: RATINGS.map((r) => ({ value: r, label: t('stars', { count: Number(r) }) })),
    },
    {
      id: 'productSlug',
      label: t('fields.productSlug'),
      type: 'multiselect',
      options: Object.entries(productNames)
        .sort(([, a], [, b]) => a.localeCompare(b))
        .map(([value, label]) => ({ value, label })),
    },
  ];

  const setStatus = async (e: ProductReview, status: ReviewStatus) => {
    try {
      const result = await save.mutateAsync({ id: e.id, input: { status, version: e.version } });
      feedback(result, t(`toast.${status}`));
    } catch {
      // Shown by the mutation's error notification.
    }
  };

  const columns: DataTableColumn<ProductReview>[] = [
    {
      id: 'reference',
      header: t('fields.reference'),
      sortable: true,
      hideable: false,
      cell: (e) => (
        <span className="flex items-center gap-2 font-medium tabular">
          {e.reference}
          {pending[e.id] ? <PendingApprovalBadge approvalId={pending[e.id]!} /> : null}
        </span>
      ),
    },
    {
      id: 'status',
      header: t('fields.status'),
      sortable: true,
      width: 130,
      cell: (e) => <ReviewStatusBadge status={e.status} />,
    },
    {
      id: 'rating',
      header: t('fields.rating'),
      sortable: true,
      width: 110,
      cell: (e) => <StarRating rating={e.rating} />,
    },
    {
      id: 'productSlug',
      header: t('fields.productSlug'),
      sortable: true,
      cell: (e) => productNames[e.productSlug] ?? e.productSlug,
    },
    {
      id: 'title',
      header: t('columns.review'),
      hideOnMobile: true,
      cell: (e) => (
        <span className="block max-w-[28rem]">
          {e.title ? <span className="block truncate font-medium">{e.title}</span> : null}
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {e.body ?? (e.title ? null : t('columns.ratingOnly'))}
          </span>
        </span>
      ),
    },
    {
      id: 'reviewerName',
      header: t('fields.reviewerName'),
      sortable: true,
      hideOnMobile: true,
      cell: (e) => (
        <span className="block">
          <span className={e.reviewerName ? 'block' : 'block text-muted-foreground'}>
            {e.reviewerName ?? t('columns.noName')}
          </span>
          {e.reviewerRole ? (
            <span className="block text-xs text-muted-foreground">{e.reviewerRole}</span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'createdAt',
      header: t('columns.received'),
      sortable: true,
      hideOnMobile: true,
      width: 120,
      cell: (e) => (
        <span className="tabular text-muted-foreground">{formatDate(e.createdAt, locale)}</span>
      ),
    },
  ];

  const rowActions = (e: ProductReview) => {
    const canUpdate = can('product-reviews:update');
    const actions: RowAction[] = [
      {
        id: 'approve',
        label: t('actions.approve'),
        icon: <Check />,
        onSelect: () => void setStatus(e, 'approved'),
        hidden: !canUpdate || e.status === 'approved',
      },
      {
        id: 'reject',
        label: t('actions.reject'),
        icon: <X />,
        onSelect: () => void setStatus(e, 'rejected'),
        hidden: !canUpdate || e.status === 'rejected',
      },
      {
        id: 'edit',
        label: t('actions.edit'),
        icon: <Pencil />,
        onSelect: () => editor.edit(e),
        hidden: !canUpdate,
      },
      {
        id: 'view',
        label: t('actions.view'),
        icon: <ExternalLink />,
        onSelect: () => window.open(`/products/${e.productSlug}#reviews`, '_blank', 'noopener'),
        hidden: e.status !== 'approved',
      },
      {
        id: 'delete',
        label: t('actions.delete'),
        icon: <Trash2 />,
        danger: true,
        divider: true,
        onSelect: () => setConfirming(e),
        hidden: !can('product-reviews:delete'),
      },
    ];
    return <RowActionsMenu actions={actions} label={t('actions.menu')} />;
  };

  return (
    <>
      <PageHeader icon={<Star />} title={t('title')} description={t('description')} />
      <DataTable
        tableId="product-reviews"
        caption={t('title')}
        columns={columns}
        data={data?.items ?? []}
        getRowId={(e) => e.id}
        labels={labels}
        loading={isPending}
        sort={params.sort}
        onSortChange={(sort) => update({ sort })}
        pagination={data?.pagination}
        onPageChange={(page) => update({ page }, false)}
        onPageSizeChange={(pageSize) => update({ pageSize })}
        onRowClick={can('product-reviews:update') ? (e) => editor.edit(e) : undefined}
        rowActions={rowActions}
        error={
          error ? (
            <ErrorState
              title={te('title')}
              description={describeError(error, te).message}
              correlationId={describeError(error, te).correlationId}
              referenceLabel={tc('reference')}
            />
          ) : undefined
        }
        toolbar={
          <DataTableToolbar
            actions={
              <>
                {can('product-reviews:create') ? (
                  <Button size="sm" className="h-[30px] px-3" onClick={editor.create}>
                    <Plus /> {t('new')}
                  </Button>
                ) : null}
                <DataTableExport
                  endpoint={productReviewsExportPath}
                  params={params}
                  tableId="product-reviews"
                  columnIds={[
                    'reference',
                    'status',
                    'rating',
                    'productSlug',
                    'reviewerName',
                    'reviewerRole',
                    'reviewerEmail',
                    'createdAt',
                  ]}
                  fileName="product-reviews"
                  labels={tools.export}
                />
                <RefreshButton
                  busy={isFetching}
                  onClick={() => refetch()}
                  label={tc('refresh')}
                  busyLabel={tc('refreshing')}
                />
              </>
            }
            filters={
              <DataTableFilters
                filters={filterDefs}
                values={params.filters ?? {}}
                onChange={(filters) => update({ filters })}
                labels={tools.filters}
              />
            }
            search={
              <TableSearch
                value={params.search ?? ''}
                onChange={(search) => update({ search })}
                placeholder={t('searchPlaceholder')}
                label={tc('search')}
              />
            }
          />
        }
      />

      <ProductReviewFormDialog
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
        description={t('delete.description', { name: confirming?.reference ?? '' })}
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
        <ApprovalNotice
          action="product-reviews.delete"
          reason={reason}
          onReasonChange={setReason}
        />
      </ConfirmDialog>
    </>
  );
}
