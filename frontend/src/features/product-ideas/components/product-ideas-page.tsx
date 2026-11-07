'use client';

import { Handshake, Pencil, Plus, Trash2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { PendingApprovalBadge } from '@/features/approvals/components/approval-status';
import { usePendingApprovals } from '@/features/approvals/hooks/use-approvals';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { describeError } from '@/shared/errors/error-messages';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useEditor } from '@/shared/hooks/use-editor';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
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
import { ErrorState } from '@/shared/ui/feedback';
import { ConfirmDialog } from '@/shared/ui/overlay';
import { PageHeader } from '@/shared/ui/page-header';
import { RefreshButton, RowActionsMenu, type RowAction } from '@/shared/ui/row-actions';
import {
  productIdeasExportPath,
  useDeleteProductIdea,
  useProductIdeas,
} from '../hooks/use-product-ideas';
import { productIdeasResource } from '../resource';
import type { ProductIdea } from '../types';

const ProductIdeaFormDialog = dynamic(() =>
  import('./product-idea-form-dialog').then((m) => m.ProductIdeaFormDialog),
);

/** Product ideas (generated): list → search → row actions → form surface (modal or side panel). */
/** Badge colour per moderation status (public ones stand out). */
const IDEA_STATUS_TONE: Record<ProductIdea['status'], BadgeTone> = {
  submitted: 'warning',
  under_review: 'info',
  approved: 'success',
  in_development: 'primary',
  completed: 'secondary',
  rejected: 'neutral',
};

export function ProductIdeasPage() {
  const t = useTranslations('productIdeas');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const labels = useDataTableLabels();
  const tools = useTableToolLabels();
  const { can } = usePermissions();
  const { params, update } = useListParams(productIdeasResource.listDefaults);
  const { data, isPending, isFetching, error, refetch } = useProductIdeas(params);
  const pending =
    usePendingApprovals(
      'ProductIdea',
      (data?.items ?? []).map((e) => e.id),
    ).data ?? {};
  const remove = useDeleteProductIdea({ meta: { notify: { error: true } } });
  const feedback = useSaveFeedback();
  const editor = useEditor<ProductIdea>();
  const [confirming, setConfirming] = useState<ProductIdea | null>(null);
  const [reason, setReason] = useState('');

  const columns: DataTableColumn<ProductIdea>[] = [
    {
      id: 'reference',
      header: t('fields.reference'),
      sortable: true,
      hideable: false,
      cell: (e) => (
        <span className="flex items-center gap-2 font-medium">
          {e.reference}
          {pending[e.id] ? <PendingApprovalBadge approvalId={pending[e.id]!} /> : null}
        </span>
      ),
    },
    {
      id: 'title',
      header: t('fields.title'),
      sortable: true,
      cell: (e) => e.title ?? '—',
    },
    {
      id: 'categoryCode',
      header: t('fields.categoryCode'),
      sortable: true,
      hideOnMobile: true,
      cell: (e) => e.categoryCode ?? '—',
    },
    {
      id: 'submitterName',
      header: t('fields.submitterName'),
      sortable: true,
      hideOnMobile: true,
      cell: (e) => e.submitterName ?? '—',
    },
    {
      id: 'submitterEmail',
      header: t('fields.submitterEmail'),
      sortable: true,
      hideOnMobile: true,
      cell: (e) => e.submitterEmail ?? '—',
    },
    {
      id: 'status',
      header: t('fields.status'),
      sortable: true,
      cell: (e) => (
        <Badge tone={IDEA_STATUS_TONE[e.status]} dot>
          {t(`statuses.${e.status}`)}
        </Badge>
      ),
    },
    {
      id: 'voteCount',
      header: t('fields.voteCount'),
      sortable: true,
      width: 90,
      cell: (e) => <span className="tabular font-semibold">{e.voteCount}</span>,
    },
    {
      id: 'updatedAt',
      header: t('columns.updated'),
      sortable: true,
      hideOnMobile: true,
      width: 130,
      cell: (e) => (
        <span className="tabular text-muted-foreground">{formatDate(e.updatedAt, locale)}</span>
      ),
    },
  ];

  const rowActions = (e: ProductIdea) => {
    const actions: RowAction[] = [
      {
        id: 'edit',
        label: t('actions.edit'),
        icon: <Pencil />,
        onSelect: () => editor.edit(e),
        hidden: !can('product-ideas:update'),
      },
      {
        id: 'delete',
        label: t('actions.delete'),
        icon: <Trash2 />,
        danger: true,
        divider: true,
        onSelect: () => setConfirming(e),
        hidden: !can('product-ideas:delete'),
      },
    ];
    return <RowActionsMenu actions={actions} label={t('actions.menu')} />;
  };

  return (
    <>
      <PageHeader icon={<Handshake />} title={t('title')} description={t('description')} />
      <DataTable
        tableId="product-ideas"
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
        onRowClick={can('product-ideas:update') ? (e) => editor.edit(e) : undefined}
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
                {can('product-ideas:create') ? (
                  <Button size="sm" className="h-[30px] px-3" onClick={editor.create}>
                    <Plus /> {t('new')}
                  </Button>
                ) : null}
                <DataTableExport
                  endpoint={productIdeasExportPath}
                  params={params}
                  tableId="product-ideas"
                  columnIds={[
                    'reference',
                    'title',
                    'categoryCode',
                    'submitterName',
                    'submitterEmail',
                    'status',
                    'voteCount',
                    'updatedAt',
                  ]}
                  fileName="product-ideas"
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

      <ProductIdeaFormDialog
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
        <ApprovalNotice action="product-ideas.delete" reason={reason} onReasonChange={setReason} />
      </ConfirmDialog>
    </>
  );
}
