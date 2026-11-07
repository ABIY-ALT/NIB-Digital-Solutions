'use client';

import { ExternalLink, Headset, Trash2 } from 'lucide-react';
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
import { formatDateTime } from '@/shared/lib/format';
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
  productQuestionsExportPath,
  useDeleteProductQuestion,
  useProductQuestions,
} from '../hooks/use-product-questions';
import { productQuestionsResource } from '../resource';
import type { ProductQuestion } from '../types';
import { QuestionStatusBadge } from './question-status';

/** Questions customers asked about products ("Ask the developer"): newest activity first. */
export function ProductQuestionsPage() {
  const t = useTranslations('productQuestions');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const labels = useDataTableLabels();
  const tools = useTableToolLabels();
  const { can } = usePermissions();
  const { params, update } = useListParams(productQuestionsResource.listDefaults);
  const { data, isPending, isFetching, error, refetch } = useProductQuestions(params);
  const pending =
    usePendingApprovals(
      'ProductQuestion',
      (data?.items ?? []).map((e) => e.id),
    ).data ?? {};
  const remove = useDeleteProductQuestion({ meta: { notify: { error: true } } });
  const feedback = useSaveFeedback();
  const [confirming, setConfirming] = useState<ProductQuestion | null>(null);
  const [reason, setReason] = useState('');
  const open = (e: ProductQuestion) => router.push(`/product-questions/${e.id}`);

  const columns: DataTableColumn<ProductQuestion>[] = [
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
      cell: (e) => <QuestionStatusBadge status={e.status} />,
    },
    {
      id: 'question',
      header: t('fields.question'),
      cell: (e) => (
        <span className="line-clamp-1 max-w-md text-muted-foreground">{e.question}</span>
      ),
    },
    {
      id: 'productSlug',
      header: t('fields.productSlug'),
      sortable: true,
      hideOnMobile: true,
      cell: (e) => e.productSlug,
    },
    {
      id: 'customerName',
      header: t('fields.customerName'),
      sortable: true,
      hideOnMobile: true,
      cell: (e) => e.customerName,
    },
    {
      id: 'lastMessageAt',
      header: t('fields.lastMessageAt'),
      sortable: true,
      hideOnMobile: true,
      width: 150,
      cell: (e) => (
        <span className="tabular text-muted-foreground">
          {e.lastMessageAt ? formatDateTime(e.lastMessageAt, locale) : '—'}
        </span>
      ),
    },
  ];

  const rowActions = (e: ProductQuestion) => {
    const actions: RowAction[] = [
      { id: 'open', label: t('actions.open'), icon: <ExternalLink />, onSelect: () => open(e) },
      {
        id: 'delete',
        label: t('actions.delete'),
        icon: <Trash2 />,
        danger: true,
        divider: true,
        onSelect: () => setConfirming(e),
        hidden: !can('product-questions:delete'),
      },
    ];
    return <RowActionsMenu actions={actions} label={t('actions.menu')} />;
  };

  return (
    <>
      <PageHeader icon={<Headset />} title={t('title')} description={t('description')} />
      <DataTable
        tableId="product-questions"
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
        onRowClick={open}
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
                  endpoint={productQuestionsExportPath}
                  params={params}
                  tableId="product-questions"
                  columnIds={[
                    'reference',
                    'productSlug',
                    'customerName',
                    'customerEmail',
                    'status',
                    'lastMessageAt',
                    'createdAt',
                  ]}
                  fileName="product-questions"
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
        onOpenChange={(o) => {
          if (!o) {
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
          action="product-questions.delete"
          reason={reason}
          onReasonChange={setReason}
        />
      </ConfirmDialog>
    </>
  );
}
