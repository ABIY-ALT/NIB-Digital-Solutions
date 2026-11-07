'use client';

import { UserCog, Pencil, Plus, Trash2, Send, Unlink } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { toast } from '@/shared/ui/toaster';
import { TelegramLinkDialog } from './telegram-link-dialog';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { PendingApprovalBadge } from '@/features/approvals/components/approval-status';
import { usePendingApprovals } from '@/features/approvals/hooks/use-approvals';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { describeError } from '@/shared/errors/error-messages';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useEditor } from '@/shared/hooks/use-editor';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { formatDate } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
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
  productDevelopersExportPath,
  useDeleteProductDeveloper,
  useProductDevelopers,
} from '../hooks/use-product-developers';
import { productDevelopersResource } from '../resource';
import type { ProductDeveloper } from '../types';

const ProductDeveloperFormDialog = dynamic(() =>
  import('./product-developer-form-dialog').then((m) => m.ProductDeveloperFormDialog),
);

/** Product developers (generated): list → search → row actions → form surface (modal or side panel). */
export function ProductDevelopersPage() {
  const t = useTranslations('productDevelopers');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const labels = useDataTableLabels();
  const tools = useTableToolLabels();
  const { can } = usePermissions();
  const { params, update } = useListParams(productDevelopersResource.listDefaults);
  const { data, isPending, isFetching, error, refetch } = useProductDevelopers(params);
  const pending =
    usePendingApprovals(
      'ProductDeveloper',
      (data?.items ?? []).map((e) => e.id),
    ).data ?? {};
  const remove = useDeleteProductDeveloper({ meta: { notify: { error: true } } });
  const feedback = useSaveFeedback();
  const editor = useEditor<ProductDeveloper>();
  const [confirming, setConfirming] = useState<ProductDeveloper | null>(null);
  const [linking, setLinking] = useState<ProductDeveloper | null>(null);
  const qc = useQueryClient();
  const unlink = useMutation({
    mutationFn: async (id: string) =>
      (await apiFetch(`/api/product-developers/${id}/telegram-link`, { method: 'DELETE' })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: productDevelopersResource.keys.all }),
    meta: { notify: { error: true } },
  });
  const [reason, setReason] = useState('');

  const columns: DataTableColumn<ProductDeveloper>[] = [
    {
      id: 'name',
      header: t('fields.name'),
      sortable: true,
      hideable: false,
      cell: (e) => (
        <span className="flex items-center gap-2 font-medium">
          {e.name}
          {pending[e.id] ? <PendingApprovalBadge approvalId={pending[e.id]!} /> : null}
        </span>
      ),
    },
    {
      id: 'email',
      header: t('fields.email'),
      sortable: true,
      cell: (e) => e.email ?? '—',
    },
    {
      id: 'telegram',
      header: t('fields.telegram'),
      hideOnMobile: true,
      cell: (e) =>
        e.telegramLinked ? (
          <Badge tone="success" dot>
            {t('telegram.linked')}
            {e.telegramUsername ? ` · @${e.telegramUsername}` : ''}
          </Badge>
        ) : e.telegramUsername ? (
          <Badge tone="warning" dot>
            {t('telegram.waiting', { username: e.telegramUsername })}
          </Badge>
        ) : (
          <Badge tone="warning" dot>
            {t('telegram.notLinked')}
          </Badge>
        ),
    },
    {
      id: 'active',
      header: t('fields.active'),
      hideOnMobile: true,
      cell: (e) =>
        e.active ? <Badge tone="success">{tc('yes')}</Badge> : <Badge>{tc('no')}</Badge>,
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

  const rowActions = (e: ProductDeveloper) => {
    const actions: RowAction[] = [
      {
        id: 'edit',
        label: t('actions.edit'),
        icon: <Pencil />,
        onSelect: () => editor.edit(e),
        hidden: !can('product-developers:update'),
      },
      {
        id: 'telegram',
        label: e.telegramLinked ? t('telegram.relink') : t('telegram.connect'),
        icon: <Send />,
        onSelect: () => setLinking(e),
        hidden: !can('product-developers:update'),
      },
      {
        id: 'unlink',
        label: t('telegram.disconnect'),
        icon: <Unlink />,
        onSelect: () =>
          void unlink
            .mutateAsync(e.id)
            .then(() => toast.success(t('telegram.disconnected')))
            .catch(() => undefined),
        hidden: !can('product-developers:update') || !e.telegramLinked,
      },
      {
        id: 'delete',
        label: t('actions.delete'),
        icon: <Trash2 />,
        danger: true,
        divider: true,
        onSelect: () => setConfirming(e),
        hidden: !can('product-developers:delete'),
      },
    ];
    return <RowActionsMenu actions={actions} label={t('actions.menu')} />;
  };

  return (
    <>
      <TelegramLinkDialog
        developer={linking}
        onOpenChange={(open) => {
          if (!open) {
            setLinking(null);
            void refetch();
          }
        }}
      />
      <PageHeader icon={<UserCog />} title={t('title')} description={t('description')} />
      <DataTable
        tableId="product-developers"
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
        onRowClick={can('product-developers:update') ? (e) => editor.edit(e) : undefined}
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
                {can('product-developers:create') ? (
                  <Button size="sm" className="h-[30px] px-3" onClick={editor.create}>
                    <Plus /> {t('new')}
                  </Button>
                ) : null}
                <DataTableExport
                  endpoint={productDevelopersExportPath}
                  params={params}
                  tableId="product-developers"
                  columnIds={[
                    'name',
                    'email',
                    'telegramLinked',
                    'telegramUsername',
                    'active',
                    'updatedAt',
                  ]}
                  fileName="product-developers"
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

      <ProductDeveloperFormDialog
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
        description={t('delete.description', { name: confirming?.name ?? '' })}
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
          action="product-developers.delete"
          reason={reason}
          onReasonChange={setReason}
        />
      </ConfirmDialog>
    </>
  );
}
