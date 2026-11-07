'use client';

import { Copy, Eye, Pencil, Plus, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { PendingApprovalBadge } from '@/features/approvals/components/approval-status';
import { usePendingApprovals } from '@/features/approvals/hooks/use-approvals';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { useEditor } from '@/shared/hooks/use-editor';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { describeError } from '@/shared/errors/error-messages';
import { useListParams } from '@/shared/hooks/use-list-params';
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
import { DataTableFilters } from '@/shared/ui/data-table-filters';
import { ImportDialog } from '@/shared/ui/import-dialog';
import { ErrorState } from '@/shared/ui/feedback';
import { ConfirmDialog } from '@/shared/ui/overlay';
import { PageHeader } from '@/shared/ui/page-header';
import { RefreshButton, RowActionsMenu, type RowAction } from '@/shared/ui/row-actions';
import { rolesExportPath, useDeleteRole, useImportRoles, useRoles } from '../hooks/use-roles';
import { importRoleSchema } from '../schemas';
import { rolesResource } from '../resource';
import type { Role } from '../types';
import dynamic from 'next/dynamic';
import type { RoleFormMode } from './role-form-dialog';
import { RolePermissionsDetail } from './role-permissions-detail';

// Dialogs (and the permission picker inside them) are split out of the page chunk.
const RoleDetailDialog = dynamic(() =>
  import('./role-detail-dialog').then((m) => m.RoleDetailDialog),
);
const RoleFormDialog = dynamic(() => import('./role-form-dialog').then((m) => m.RoleFormDialog));

function roleColumns(
  t: (key: string) => string,
  locale: string,
  /** Role id → pending approval id. */
  pending: Record<string, string>,
): DataTableColumn<Role>[] {
  return [
    {
      id: 'name',
      header: t('columns.role'),
      sortable: true,
      hideable: false,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <ShieldCheck className="size-[18px] shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate font-semibold">
              {r.name}
              {r.isSystem ? (
                <Badge tone="secondary" className="px-1.5 py-0 text-[10px]">
                  {t('system')}
                </Badge>
              ) : null}
              {pending[r.id] ? <PendingApprovalBadge approvalId={pending[r.id]!} /> : null}
            </p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{r.code}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'description',
      header: t('columns.description'),
      hideOnMobile: true,
      cell: (r) => (
        <span className="line-clamp-2 max-w-md text-[13px] text-muted-foreground">
          {r.description || '—'}
        </span>
      ),
    },
    {
      id: 'permissions',
      header: t('columns.permissions'),
      width: 130,
      cell: (r) =>
        r.permissions.includes('*') ? (
          <Badge tone="primary">{t('allPermissions')}</Badge>
        ) : (
          <Badge tone="neutral" className="min-w-7 justify-center tabular">
            {r.permissions.length}
          </Badge>
        ),
    },
    {
      id: 'users',
      header: t('columns.users'),
      width: 100,
      cell: (r) => <span className="tabular text-muted-foreground">{r.userCount}</span>,
    },
    {
      id: 'createdAt',
      header: t('columns.created'),
      sortable: true,
      hideOnMobile: true,
      width: 140,
      cell: (r) => (
        <span className="tabular whitespace-nowrap text-muted-foreground">
          {formatDate(r.createdAt, locale)}
        </span>
      ),
    },
  ];
}

/** Roles & permissions (IB list page): toolbar → data table → kebab row actions → dialogs. */
export function RolesPage() {
  const t = useTranslations('roles');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const labels = useDataTableLabels();
  const tools = useTableToolLabels();
  const [importOpen, setImportOpen] = useState(false);
  const importRoles = useImportRoles();
  const { can } = usePermissions();
  const { params, update } = useListParams(rolesResource.listDefaults);
  const { data, isPending, isFetching, error, refetch } = useRoles(params);
  const remove = useDeleteRole({ meta: { notify: { error: true } } });
  const editor = useEditor<Role, RoleFormMode>();
  const [viewing, setViewing] = useState<Role | null>(null);
  const [confirming, setConfirming] = useState<Role | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const feedback = useSaveFeedback();
  const pending =
    usePendingApprovals(
      'Role',
      (data?.items ?? []).map((r) => r.id),
    ).data ?? {};

  const openForm = (mode: RoleFormMode, role: Role | null = null) => {
    setViewing(null);
    editor.openAs(mode, role);
  };
  const deleteBlocker = (r: Role) => {
    if (r.isSystem) return t('actions.systemLocked');
    return r.userCount > 0 ? t('actions.inUse', { count: r.userCount }) : null;
  };

  const columns = roleColumns(t, locale, pending);

  const rowActions = (r: Role) => {
    const blocker = deleteBlocker(r);
    const actions: RowAction[] = [
      { id: 'view', label: t('actions.view'), icon: <Eye />, onSelect: () => setViewing(r) },
      {
        id: 'edit',
        label: t('actions.edit'),
        description: r.isSystem ? t('actions.systemEditHint') : undefined,
        icon: <Pencil />,
        onSelect: () => openForm('edit', r),
        hidden: !can('roles:update'),
      },
      {
        id: 'clone',
        label: t('actions.clone'),
        description: t('actions.cloneHint'),
        icon: <Copy />,
        onSelect: () => openForm('clone', r),
        hidden: !can('roles:create'),
        divider: true,
      },
      {
        id: 'delete',
        label: t('actions.delete'),
        description: blocker ?? t('actions.deleteHint'),
        icon: <Trash2 />,
        onSelect: () => setConfirming(r),
        hidden: !can('roles:delete'),
        disabled: !!blocker,
        danger: true,
        divider: true,
      },
    ];
    return <RowActionsMenu actions={actions} label={t('actions.menu', { name: r.name })} />;
  };

  return (
    <>
      <PageHeader icon={<ShieldCheck />} title={t('title')} description={t('description')} />
      <DataTable
        caption={t('title')}
        columns={columns}
        data={data?.items ?? []}
        getRowId={(r) => r.id}
        labels={labels}
        loading={isPending || (isFetching && !data)}
        selectedId={selectedId}
        tableId="roles"
        expansion={{
          render: (r) => <RolePermissionsDetail role={r} />,
          canExpand: (r) => r.permissions.length > 0,
        }}
        onRowClick={(r) => {
          setSelectedId(r.id);
          setViewing(r);
        }}
        sort={params.sort}
        onSortChange={(sort) => update({ sort })}
        pagination={data?.pagination}
        onPageChange={(page) => update({ page }, false)}
        onPageSizeChange={(pageSize) => update({ pageSize })}
        rowActions={rowActions}
        error={
          error ? (
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
          ) : undefined
        }
        toolbar={
          <DataTableToolbar
            actions={
              <>
                {can('roles:create') ? (
                  <Button size="sm" className="h-[30px] px-3" onClick={() => openForm('create')}>
                    <Plus /> {t('newRole')}
                  </Button>
                ) : null}
                {can('roles:create') ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-[30px] px-3"
                    onClick={() => setImportOpen(true)}
                  >
                    <Upload /> {t('import.action')}
                  </Button>
                ) : null}
                <DataTableExport
                  endpoint={rolesExportPath}
                  params={params}
                  tableId="roles"
                  columnIds={[
                    'name',
                    'code',
                    'description',
                    'permissions',
                    'users',
                    'type',
                    'createdAt',
                  ]}
                  fileName="roles"
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
                filters={[
                  {
                    id: 'isSystem',
                    label: t('columns.type'),
                    type: 'boolean',
                    trueLabel: t('system'),
                    falseLabel: t('custom'),
                  },
                ]}
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

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title={t('import.title')}
        description={t('import.description')}
        fileName="roles"
        schema={importRoleSchema}
        maxRows={200}
        columns={[
          { key: 'code', label: t('fields.code'), required: true, example: 'BRANCH_TELLER' },
          { key: 'name', label: t('fields.name'), required: true, example: 'Branch Teller' },
          { key: 'description', label: t('fields.description'), example: 'Front-office teller' },
          {
            key: 'permissions',
            label: t('fields.permissions'),
            example: 'users:read:branch;audit:read',
          },
        ]}
        onImport={(rows, batchId) => importRoles.mutateAsync({ rows, batchId })}
        labels={tools.import}
      />

      <RoleDetailDialog
        role={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        onEdit={can('roles:update') && viewing ? () => openForm('edit', viewing) : undefined}
        onClone={can('roles:create') && viewing ? () => openForm('clone', viewing) : undefined}
        onDelete={can('roles:delete') && viewing ? () => setConfirming(viewing) : undefined}
      />

      <RoleFormDialog
        open={editor.open}
        onOpenChange={editor.onOpenChange}
        mode={editor.mode}
        role={editor.record}
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
                feedback(result, t('toast.deleted', { name: confirming.name }));
                setConfirming(null);
                setViewing(null);
                setReason('');
              },
              onError: () => setConfirming(null),
            },
          )
        }
      >
        <ApprovalNotice action="roles.delete" reason={reason} onReasonChange={setReason} />
      </ConfirmDialog>
    </>
  );
}
