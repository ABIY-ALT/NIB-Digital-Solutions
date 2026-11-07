'use client';

import { ShoppingCart, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { PendingApprovalBadge } from '@/features/approvals/components/approval-status';
import { usePendingApprovals } from '@/features/approvals/hooks/use-approvals';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { describeError } from '@/shared/errors/error-messages';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { formatDate } from '@/shared/lib/format';
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
  digitalProductsExportPath,
  useDeleteDigitalProduct,
  useDigitalProducts,
} from '../hooks/use-digital-products';
import { digitalProductsResource } from '../resource';
import type { DigitalProduct } from '../types';

/** Digital products (generated): list → search → row actions → form surface (modal or side panel). */
export function DigitalProductsPage() {
  const t = useTranslations('digitalProducts');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const labels = useDataTableLabels();
  const tools = useTableToolLabels();
  const { can } = usePermissions();
  const { params, update } = useListParams(digitalProductsResource.listDefaults);
  const { data, isPending, isFetching, error, refetch } = useDigitalProducts(params);
  const pending =
    usePendingApprovals(
      'DigitalProduct',
      (data?.items ?? []).map((e) => e.id),
    ).data ?? {};
  const remove = useDeleteDigitalProduct({ meta: { notify: { error: true } } });
  const feedback = useSaveFeedback();
  // Products have rich page content: create and edit them on their own page.
  const router = useRouter();
  const edit = (e: DigitalProduct) => router.push(`/digital-products/${e.id}`);
  const [confirming, setConfirming] = useState<DigitalProduct | null>(null);
  const [reason, setReason] = useState('');

  const columns: DataTableColumn<DigitalProduct>[] = [
    {
      id: 'slug',
      header: t('fields.slug'),
      sortable: true,
      hideable: false,
      cell: (e) => (
        <span className="flex items-center gap-2 font-medium">
          {e.slug}
          {pending[e.id] ? <PendingApprovalBadge approvalId={pending[e.id]!} /> : null}
        </span>
      ),
    },
    {
      id: 'name',
      header: t('fields.name'),
      sortable: true,
      cell: (e) => e.name ?? '—',
    },
    {
      id: 'tagline',
      header: t('fields.tagline'),
      sortable: true,
      hideOnMobile: true,
      cell: (e) => e.tagline ?? '—',
    },
    {
      id: 'categoryCode',
      header: t('fields.categoryCode'),
      sortable: true,
      hideOnMobile: true,
      cell: (e) => e.categoryCode ?? '—',
    },
    {
      id: 'status',
      header: t('fields.status'),
      sortable: true,
      hideOnMobile: true,
      cell: (e) => e.status ?? '—',
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

  const rowActions = (e: DigitalProduct) => {
    const actions: RowAction[] = [
      {
        id: 'edit',
        label: t('actions.edit'),
        icon: <Pencil />,
        onSelect: () => edit(e),
        hidden: !can('digital-products:update'),
      },
      {
        id: 'delete',
        label: t('actions.delete'),
        icon: <Trash2 />,
        danger: true,
        divider: true,
        onSelect: () => setConfirming(e),
        hidden: !can('digital-products:delete'),
      },
    ];
    return <RowActionsMenu actions={actions} label={t('actions.menu')} />;
  };

  return (
    <>
      <PageHeader icon={<ShoppingCart />} title={t('title')} description={t('description')} />
      <DataTable
        tableId="digital-products"
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
        onRowClick={can('digital-products:update') ? (e) => edit(e) : undefined}
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
                {can('digital-products:create') ? (
                  <Button
                    size="sm"
                    className="h-[30px] px-3"
                    onClick={() => router.push('/digital-products/new')}
                  >
                    <Plus /> {t('new')}
                  </Button>
                ) : null}
                <DataTableExport
                  endpoint={digitalProductsExportPath}
                  params={params}
                  tableId="digital-products"
                  columnIds={[
                    'slug',
                    'name',
                    'tagline',
                    'categoryCode',
                    'status',
                    'availability',
                    'featured',
                    'customizable',
                    'icon',
                    'accent',
                    'updatedAt',
                  ]}
                  fileName="digital-products"
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

      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(null);
            setReason('');
          }
        }}
        title={t('delete.title')}
        description={t('delete.description', { name: confirming?.slug ?? '' })}
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
          action="digital-products.delete"
          reason={reason}
          onReasonChange={setReason}
        />
      </ConfirmDialog>
    </>
  );
}
