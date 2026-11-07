'use client';

import {
  KeyRound,
  LockOpen,
  LogOut,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  Users as UsersIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { PendingApprovalBadge } from '@/features/approvals/components/approval-status';
import { usePendingApprovals } from '@/features/approvals/hooks/use-approvals';
import { useLookup } from '@/features/reference-data/hooks/use-reference-data';
import { useEditor } from '@/shared/hooks/use-editor';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { useCurrentUser, usePermissions } from '@/features/auth/components/permissions-provider';
import { describeError } from '@/shared/errors/error-messages';
import { useListParams } from '@/shared/hooks/use-list-params';
import { formatDateTime, initials } from '@/shared/lib/format';
import { Tag } from '@/shared/ui/badge';
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
import type { FilterDef } from '@/shared/lib/table-filters';
import { ErrorState } from '@/shared/ui/feedback';
import { ConfirmDialog } from '@/shared/ui/overlay';
import { PageHeader } from '@/shared/ui/page-header';
import { RefreshButton, RowActionsMenu, type RowAction } from '@/shared/ui/row-actions';
import { toast } from '@/shared/ui/toaster';
import {
  useDeleteUser,
  useImportUsers,
  usersExportPath,
  useRestoreUser,
  useTerminateUserSessions,
  useUnlockUser,
  useUsers,
} from '../hooks/use-users';
import { usersResource } from '../resource';
import { importUserSchema } from '../schemas';
import { USER_STATUSES, type User } from '../types';
import dynamic from 'next/dynamic';

// Dialogs are split out of the page chunk and fetched in parallel after hydration.
const ResetPasswordDialog = dynamic(() =>
  import('./reset-password-dialog').then((m) => m.ResetPasswordDialog),
);
const UserFormDialog = dynamic(() => import('./user-form-dialog').then((m) => m.UserFormDialog));
import { UserStatusBadge } from './user-status-badge';

type Translate = ((key: string) => string) & { has: (key: string) => boolean };

function userColumns(
  t: Translate,
  locale: string,
  /** User id → pending approval id. */
  pending: Record<string, string>,
): DataTableColumn<User>[] {
  return [
    {
      id: 'fullName',
      header: t('columns.name'),
      sortable: true,
      hideable: false,
      cell: (u) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary-soft text-xs font-semibold text-secondary"
            aria-hidden
          >
            {initials(u.fullName)}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate font-medium">
              {u.fullName}
              {pending[u.id] ? <PendingApprovalBadge approvalId={pending[u.id]!} /> : null}
            </p>
            <p className="truncate text-xs text-muted-foreground">@{u.username}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'email',
      header: t('columns.email'),
      sortable: true,
      hideOnMobile: true,
      cell: (u) => <span className="text-muted-foreground">{u.email}</span>,
    },
    {
      id: 'branchCode',
      header: t('columns.branch'),
      hideOnMobile: true,
      cell: (u) => (u.branchCode ? <Tag>{u.branchCode}</Tag> : '—'),
    },
    {
      id: 'roles',
      header: t('columns.roles'),
      hideOnMobile: true,
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <Tag key={r}>{t.has(`roles.${r}`) ? t(`roles.${r}`) : r}</Tag>
          ))}
        </div>
      ),
    },
    {
      id: 'status',
      header: t('columns.status'),
      sortable: true,
      cell: (u) => <UserStatusBadge status={u.status} />,
    },
    {
      id: 'lastLoginAt',
      header: t('columns.lastLogin'),
      sortable: true,
      hideOnMobile: true,
      cell: (u) => (
        <span className="tabular whitespace-nowrap text-muted-foreground">
          {formatDateTime(u.lastLoginAt, locale)}
        </span>
      ),
    },
  ];
}

export function UsersPage() {
  const t = useTranslations('users');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const labels = useDataTableLabels();
  const { can } = usePermissions();
  const currentUserId = useCurrentUser()?.id;
  const { params, update } = useListParams(usersResource.listDefaults);
  const { data, isPending, isFetching, error, refetch } = useUsers(params);
  // Errors are toasted centrally (meta.notify); success messages stay contextual below.
  const notifyErrors = { meta: { notify: { error: true } } };
  const remove = useDeleteUser(notifyErrors);
  const restore = useRestoreUser(notifyErrors);
  const unlock = useUnlockUser(notifyErrors);
  const endSessions = useTerminateUserSessions(notifyErrors);
  const [resetting, setResetting] = useState<User | null>(null);
  const [endingSessions, setEndingSessions] = useState<User | null>(null);

  const editor = useEditor<User>();
  const [confirming, setConfirming] = useState<User | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const feedback = useSaveFeedback();
  const pending =
    usePendingApprovals(
      'User',
      (data?.items ?? []).map((u) => u.id),
    ).data ?? {};
  const [importOpen, setImportOpen] = useState(false);
  const importUsers = useImportUsers();
  const tools = useTableToolLabels();

  const branches = useLookup('branches', { includeInactive: true });
  /** Declarative filters → `filter[field]=…` in the URL and the backend query. */
  const filterDefs: FilterDef[] = [
    {
      id: 'status',
      label: t('filters.status'),
      type: 'multiselect',
      options: USER_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
    },
    {
      id: 'mfaEnabled',
      label: t('filters.mfa'),
      type: 'boolean',
      trueLabel: t('filters.mfaOn'),
      falseLabel: t('filters.mfaOff'),
    },
    {
      id: 'branchCode',
      label: t('filters.branch'),
      type: 'multiselect',
      // Options come from the "branches" reference list (translated, effective only).
      options: (branches.data ?? []).map((b) => ({
        value: b.code,
        label: `${b.label} · ${b.code}`,
      })),
    },
    { id: 'createdAt', label: t('filters.created'), type: 'dateRange' },
  ];
  const bulkEndSessions = useTerminateUserSessions();
  const [bulkBusy, setBulkBusy] = useState(false);

  /** Bulk sign-out: one request per user, summarised in a single toast. */
  const endSessionsForSelected = async () => {
    setBulkBusy(true);
    const results = await Promise.allSettled(
      checkedIds.map((id) => bulkEndSessions.mutateAsync(id)),
    );
    setBulkBusy(false);
    const failed = results.filter((r) => r.status === 'rejected').length;
    const done = results.length - failed;
    if (done) toast.success(t('bulk.sessionsEnded', { count: done }));
    if (failed) toast.error(t('bulk.failed', { count: failed }));
    setCheckedIds([]);
  };

  /** One export menu for the toolbar and the bulk bar ("All matching rows" / "Selected rows"). */
  const exportMenu = (
    <DataTableExport
      endpoint={usersExportPath}
      params={params}
      tableId="users"
      columnIds={[
        'fullName',
        'username',
        'email',
        'phoneNumber',
        'branchCode',
        'roles',
        'status',
        'mfaEnabled',
        'lastLoginAt',
        'createdAt',
      ]}
      selectedIds={checkedIds}
      fileName="users"
      labels={tools.export}
    />
  );

  const columns = userColumns(t, locale, pending);

  const rowActions = (u: User) => {
    const self = u.id === currentUserId;
    const actions: RowAction[] = u.deletedAt
      ? [
          {
            id: 'restore',
            label: t('actions.restore'),
            description: t('actions.restoreHint'),
            icon: <RotateCcw />,
            hidden: !can('users:restore'),
            onSelect: () =>
              restore.mutate(u.id, { onSuccess: () => toast.success(t('toast.restored')) }),
          },
        ]
      : [
          {
            id: 'edit',
            label: t('actions.edit'),
            icon: <Pencil />,
            hidden: !can('users:update'),
            onSelect: () => editor.edit(u),
          },
          {
            id: 'unlock',
            label: t('actions.unlock'),
            description: t('actions.unlockHint'),
            icon: <LockOpen />,
            hidden: !can('users:update') || u.status !== 'LOCKED',
            onSelect: () =>
              unlock.mutate(u.id, {
                onSuccess: () => toast.success(t('toast.unlocked', { name: u.fullName })),
              }),
          },
          {
            id: 'reset',
            label: t('actions.resetPassword'),
            description: self ? t('actions.selfHint') : t('actions.resetHint'),
            icon: <KeyRound />,
            hidden: !can('users:reset-password'),
            disabled: self,
            divider: true,
            onSelect: () => setResetting(u),
          },
          {
            id: 'sessions',
            label: t('actions.endSessions'),
            description: t('actions.endSessionsHint'),
            icon: <LogOut />,
            hidden: !can('users:update'),
            onSelect: () => setEndingSessions(u),
          },
          {
            id: 'delete',
            label: t('actions.delete'),
            description: self ? t('actions.selfHint') : t('actions.deleteHint'),
            icon: <Trash2 />,
            hidden: !can('users:delete'),
            disabled: self,
            danger: true,
            divider: true,
            onSelect: () => setConfirming(u),
          },
        ];
    return <RowActionsMenu actions={actions} label={t('actions.more', { name: u.fullName })} />;
  };

  return (
    <>
      <PageHeader icon={<UsersIcon />} title={t('title')} description={t('description')} />

      <DataTable
        caption={t('title')}
        columns={columns}
        data={data?.items ?? []}
        getRowId={(u) => u.id}
        labels={labels}
        loading={isPending}
        selectedId={selectedId}
        tableId="users"
        selection={{
          selectedIds: checkedIds,
          onChange: setCheckedIds,
          // Your own account and deleted accounts are excluded from bulk actions.
          isSelectable: (u) => u.id !== currentUserId && !u.deletedAt,
          bulkActions: (
            <>
              {can('users:update') ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-[30px] bg-surface"
                  loading={bulkBusy}
                  onClick={endSessionsForSelected}
                >
                  <LogOut /> {t('actions.endSessions')}
                </Button>
              ) : null}
              {exportMenu}
            </>
          ),
        }}
        onRowClick={(u) => setSelectedId(u.id)}
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
        sort={params.sort}
        onSortChange={(sort) => update({ sort })}
        pagination={data?.pagination}
        onPageChange={(page) => update({ page }, false)}
        onPageSizeChange={(pageSize) => update({ pageSize })}
        rowActions={rowActions}
        toolbar={
          <DataTableToolbar
            actions={
              <>
                {can('users:create') ? (
                  <Button size="sm" className="h-[30px] px-3" onClick={editor.create}>
                    <Plus /> {t('newUser')}
                  </Button>
                ) : null}
                {can('users:create') ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-[30px] px-3"
                    onClick={() => setImportOpen(true)}
                  >
                    <Upload /> {t('import.action')}
                  </Button>
                ) : null}
                {exportMenu}
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

      <UserFormDialog open={editor.open} onOpenChange={editor.onOpenChange} user={editor.record} />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title={t('import.title')}
        description={t('import.description')}
        fileName="users"
        schema={importUserSchema(t)}
        columns={[
          { key: 'username', label: t('fields.username'), required: true, example: 'abebe.kebede' },
          {
            key: 'fullName',
            label: t('fields.fullName'),
            required: true,
            example: 'Abebe Kebede',
            aliases: ['name', 'full name'],
          },
          {
            key: 'email',
            label: t('fields.email'),
            required: true,
            example: 'abebe.kebede@nib.et',
          },
          {
            key: 'phoneNumber',
            label: t('fields.phone'),
            example: '+251911000000',
            aliases: ['phone'],
          },
          { key: 'branchCode', label: t('fields.branch'), example: 'ADD01', aliases: ['branch'] },
          { key: 'roles', label: t('fields.roles'), required: true, example: 'USER' },
        ]}
        onImport={(rows, batchId) => importUsers.mutateAsync({ rows, batchId })}
        labels={tools.import}
      />
      <ResetPasswordDialog user={resetting} onOpenChange={(open) => !open && setResetting(null)} />
      <ConfirmDialog
        open={!!endingSessions}
        onOpenChange={(open) => !open && setEndingSessions(null)}
        tone="primary"
        title={t('endSessions.title')}
        description={t('endSessions.description', { name: endingSessions?.fullName ?? '' })}
        confirmLabel={t('actions.endSessions')}
        cancelLabel={tc('cancel')}
        loading={endSessions.isPending}
        onConfirm={() =>
          endingSessions &&
          endSessions.mutate(endingSessions.id, {
            onSuccess: (r) => {
              toast.success(t('toast.sessionsEnded', { count: r.terminated }));
              setEndingSessions(null);
            },
            onError: () => setEndingSessions(null),
          })
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
        description={t('delete.description', { name: confirming?.fullName ?? '' })}
        confirmLabel={tc('delete')}
        cancelLabel={tc('cancel')}
        loading={remove.isPending}
        onConfirm={() =>
          confirming &&
          remove.mutate(
            { id: confirming.id, version: confirming.version, reason },
            {
              onSuccess: (result) => {
                feedback(result, t('toast.deleted', { name: confirming.fullName }));
                setConfirming(null);
                setReason('');
              },
              onError: () => setConfirming(null),
            },
          )
        }
      >
        <ApprovalNotice action="users.delete" reason={reason} onReasonChange={setReason} />
      </ConfirmDialog>
    </>
  );
}
