'use client';

import { Headset, Pencil, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useAllDigitalProducts } from '@/features/digital-products/hooks/use-digital-products';
import { LeadDetail } from '@/features/marketplace-admin/components/lead-detail';
import {
  LeadStatusBadge,
  useLeadFilterDefs,
  useLeadOwners,
} from '@/features/marketplace-admin/components/lead-list';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { PendingApprovalBadge } from '@/features/approvals/components/approval-status';
import { usePendingApprovals } from '@/features/approvals/hooks/use-approvals';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { describeError } from '@/shared/errors/error-messages';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { formatDate } from '@/shared/lib/format';
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
  productInquiriesExportPath,
  useDeleteProductInquiry,
  useProductInquiries,
} from '../hooks/use-product-inquiries';
import { productInquiriesResource } from '../resource';
import type { ProductInquiry } from '../types';

/** Product inquiries (generated): list → search → row actions → form surface (modal or side panel). */
export function ProductInquiriesPage() {
  const t = useTranslations('productInquiries');
  const tl = useTranslations('marketplaceAdmin.leads');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const labels = useDataTableLabels();
  const tools = useTableToolLabels();
  const { can } = usePermissions();
  const { params, update } = useListParams(productInquiriesResource.listDefaults);
  const { data, isPending, isFetching, error, refetch } = useProductInquiries(params);
  const pending =
    usePendingApprovals(
      'ProductInquiry',
      (data?.items ?? []).map((e) => e.id),
    ).data ?? {};
  const remove = useDeleteProductInquiry({ meta: { notify: { error: true } } });
  const feedback = useSaveFeedback();
  // Leads come in from the website; staff work them in the detail panel (no manual create form).
  const [selected, setSelected] = useState<ProductInquiry | null>(null);
  const allProducts = useAllDigitalProducts().data;
  const productNames = useMemo(
    () => Object.fromEntries((allProducts ?? []).map((p) => [p.slug, p.name])),
    [allProducts],
  );
  const filterDefs = useLeadFilterDefs('inquiry', productNames);
  const ownerName = useLeadOwners(
    'inquiry',
    (data?.items ?? []).map((e) => e.assignedTo),
  );
  const [confirming, setConfirming] = useState<ProductInquiry | null>(null);
  const [reason, setReason] = useState('');

  const columns: DataTableColumn<ProductInquiry>[] = [
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
      id: 'customerName',
      header: t('fields.customerName'),
      sortable: true,
      cell: (e) => e.customerName ?? '—',
    },
    {
      id: 'company',
      header: t('fields.company'),
      sortable: true,
      hideOnMobile: true,
      cell: (e) => e.company ?? '—',
    },
    {
      id: 'productSlug',
      header: tl('product'),
      sortable: true,
      hideOnMobile: true,
      cell: (e) => (e.productSlug ? (productNames[e.productSlug] ?? e.productSlug) : tl('general')),
    },
    {
      id: 'status',
      header: tl('status'),
      sortable: true,
      cell: (e) => <LeadStatusBadge status={e.status} />,
    },
    {
      id: 'assignedTo',
      header: tl('owner'),
      hideOnMobile: true,
      cell: (e) =>
        ownerName(e.assignedTo) ?? (
          <span className="text-muted-foreground">{tl('unassigned')}</span>
        ),
    },
    {
      id: 'createdAt',
      header: tl('receivedOn'),
      sortable: true,
      hideOnMobile: true,
      width: 130,
      cell: (e) => (
        <span className="tabular text-muted-foreground">{formatDate(e.createdAt, locale)}</span>
      ),
    },
  ];

  const rowActions = (e: ProductInquiry) => {
    const actions: RowAction[] = [
      {
        id: 'edit',
        label: t('actions.edit'),
        icon: <Pencil />,
        onSelect: () => setSelected(e),
        hidden: !can('product-inquiries:update'),
      },
      {
        id: 'delete',
        label: t('actions.delete'),
        icon: <Trash2 />,
        danger: true,
        divider: true,
        onSelect: () => setConfirming(e),
        hidden: !can('product-inquiries:delete'),
      },
    ];
    return <RowActionsMenu actions={actions} label={t('actions.menu')} />;
  };

  return (
    <>
      <PageHeader icon={<Headset />} title={t('title')} description={t('description')} />
      <DataTable
        tableId="product-inquiries"
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
        onRowClick={can('product-inquiries:update') ? (e) => setSelected(e) : undefined}
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
                <DataTableExport
                  endpoint={productInquiriesExportPath}
                  params={params}
                  tableId="product-inquiries"
                  columnIds={[
                    'reference',
                    'customerName',
                    'company',
                    'email',
                    'phone',
                    'productSlug',
                    'inquiryType',
                    'contactMethod',
                    'source',
                    'status',
                    'assignedTo',
                    'respondedAt',
                    'updatedAt',
                  ]}
                  fileName="product-inquiries"
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

      <LeadDetail
        lead={selected ? { kind: 'inquiry', record: selected } : null}
        productNames={productNames}
        onOpenChange={(open) => !open && setSelected(null)}
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
          action="product-inquiries.delete"
          reason={reason}
          onReasonChange={setReason}
        />
      </ConfirmDialog>
    </>
  );
}
