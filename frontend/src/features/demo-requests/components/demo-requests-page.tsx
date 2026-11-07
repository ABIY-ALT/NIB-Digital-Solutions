'use client';

import { Handshake, Pencil, Trash2 } from 'lucide-react';
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
  demoRequestsExportPath,
  useDeleteDemoRequest,
  useDemoRequests,
} from '../hooks/use-demo-requests';
import { demoRequestsResource } from '../resource';
import type { DemoRequest } from '../types';

/** Demo requests (generated): list → search → row actions → form surface (modal or side panel). */
export function DemoRequestsPage() {
  const t = useTranslations('demoRequests');
  const tl = useTranslations('marketplaceAdmin.leads');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const labels = useDataTableLabels();
  const tools = useTableToolLabels();
  const { can } = usePermissions();
  const { params, update } = useListParams(demoRequestsResource.listDefaults);
  const { data, isPending, isFetching, error, refetch } = useDemoRequests(params);
  const pending =
    usePendingApprovals(
      'DemoRequest',
      (data?.items ?? []).map((e) => e.id),
    ).data ?? {};
  const remove = useDeleteDemoRequest({ meta: { notify: { error: true } } });
  const feedback = useSaveFeedback();
  // Leads come in from the website; staff work them in the detail panel (no manual create form).
  const [selected, setSelected] = useState<DemoRequest | null>(null);
  const allProducts = useAllDigitalProducts().data;
  const productNames = useMemo(
    () => Object.fromEntries((allProducts ?? []).map((p) => [p.slug, p.name])),
    [allProducts],
  );
  const filterDefs = useLeadFilterDefs('demo', productNames);
  const ownerName = useLeadOwners(
    'demo',
    (data?.items ?? []).map((e) => e.assignedTo),
  );
  const [confirming, setConfirming] = useState<DemoRequest | null>(null);
  const [reason, setReason] = useState('');

  const columns: DataTableColumn<DemoRequest>[] = [
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
      id: 'fullName',
      header: t('fields.fullName'),
      sortable: true,
      cell: (e) => e.fullName ?? '—',
    },
    {
      id: 'organization',
      header: t('fields.organization'),
      sortable: true,
      hideOnMobile: true,
      cell: (e) => e.organization ?? '—',
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

  const rowActions = (e: DemoRequest) => {
    const actions: RowAction[] = [
      {
        id: 'edit',
        label: t('actions.edit'),
        icon: <Pencil />,
        onSelect: () => setSelected(e),
        hidden: !can('demo-requests:update'),
      },
      {
        id: 'delete',
        label: t('actions.delete'),
        icon: <Trash2 />,
        danger: true,
        divider: true,
        onSelect: () => setConfirming(e),
        hidden: !can('demo-requests:delete'),
      },
    ];
    return <RowActionsMenu actions={actions} label={t('actions.menu')} />;
  };

  return (
    <>
      <PageHeader icon={<Handshake />} title={t('title')} description={t('description')} />
      <DataTable
        tableId="demo-requests"
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
        onRowClick={can('demo-requests:update') ? (e) => setSelected(e) : undefined}
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
                  endpoint={demoRequestsExportPath}
                  params={params}
                  tableId="demo-requests"
                  columnIds={[
                    'reference',
                    'fullName',
                    'organization',
                    'jobTitle',
                    'email',
                    'phone',
                    'productSlug',
                    'demoType',
                    'preferredDate',
                    'preferredTime',
                    'source',
                    'status',
                    'assignedTo',
                    'followUpDate',
                    'updatedAt',
                  ]}
                  fileName="demo-requests"
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
        lead={selected ? { kind: 'demo', record: selected } : null}
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
        <ApprovalNotice action="demo-requests.delete" reason={reason} onReasonChange={setReason} />
      </ConfirmDialog>
    </>
  );
}
