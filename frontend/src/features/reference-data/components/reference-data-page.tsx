'use client';

import { Database, Eye, EyeOff, Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { PendingApprovalBadge } from '@/features/approvals/components/approval-status';
import { usePendingApprovals } from '@/features/approvals/hooks/use-approvals';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { describeError } from '@/shared/errors/error-messages';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { cn } from '@/shared/lib/cn';
import { formatDate } from '@/shared/lib/format';
import type { ListParams } from '@/shared/types';
import { Badge, type BadgeTone } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  DataTable,
  DataTableToolbar,
  TableSearch,
  type DataTableColumn,
} from '@/shared/ui/data-table';
import { useDataTableLabels, useTableToolLabels } from '@/shared/ui/data-table-labels';
import { DataTableFilters } from '@/shared/ui/data-table-filters';
import { EmptyState, ErrorState, Skeleton } from '@/shared/ui/feedback';
import { Input } from '@/shared/ui/input';
import { ConfirmDialog } from '@/shared/ui/overlay';
import { PageHeader } from '@/shared/ui/page-header';
import { RefreshButton, RowActionsMenu, type RowAction } from '@/shared/ui/row-actions';
import { toast } from '@/shared/ui/toaster';
import {
  useDeleteReferenceItem,
  useDeleteReferenceType,
  useReferenceItems,
  useReferenceTypes,
  useSaveReferenceItem,
} from '../hooks/use-reference-data';
import type { ReferenceDataItem, ReferenceDataType } from '../types';
import { ItemFormDialog } from './item-form-dialog';
import { TypeFormDialog } from './type-form-dialog';

const ITEM_DEFAULTS = {
  pageSize: 25,
  sort: [{ field: 'sortOrder' as const, direction: 'asc' as const }],
};

type ItemState = 'active' | 'inactive' | 'scheduled' | 'expired';
const STATE_TONE: Record<ItemState, BadgeTone> = {
  active: 'success',
  inactive: 'neutral',
  scheduled: 'info',
  expired: 'warning',
};
function itemState(i: ReferenceDataItem, now = Date.now()): ItemState {
  if (!i.active) return 'inactive';
  if (i.effective) return 'active';
  return i.validFrom && Date.parse(i.validFrom) > now ? 'scheduled' : 'expired';
}

function itemColumns({
  t,
  locale,
  pending,
  list,
}: {
  t: (key: string) => string;
  locale: string;
  /** Item id → pending approval id. */
  pending: Record<string, string>;
  list: ReferenceDataType | null;
}): DataTableColumn<ReferenceDataItem>[] {
  return [
    {
      id: 'code',
      header: t('fields.code'),
      sortable: true,
      width: 130,
      cell: (i) => <code className="font-mono text-xs font-semibold">{i.code}</code>,
    },
    {
      id: 'label',
      header: t('fields.label'),
      sortable: true,
      hideable: false,
      cell: (i) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-medium">
            {i.label}
            {pending[i.id] ? <PendingApprovalBadge approvalId={pending[i.id]!} /> : null}
          </p>
          {i.labels.am ? (
            <p lang="am" className="truncate text-xs text-muted-foreground">
              {i.labels.am}
            </p>
          ) : null}
        </div>
      ),
    },
    ...(list?.parentTypeCode
      ? [
          {
            id: 'parent',
            header: t('fields.parent'),
            width: 110,
            hideOnMobile: true,
            cell: (i: ReferenceDataItem) =>
              i.parentCode ? <Badge tone="outline">{i.parentCode}</Badge> : '—',
          },
        ]
      : []),
    ...(list?.attributes ?? []).slice(0, 3).map<DataTableColumn<ReferenceDataItem>>((a) => ({
      id: `attr-${a.key}`,
      header: a.label,
      hideOnMobile: true,
      cell: (i) => {
        const v = i.attributes[a.key];
        if (v === null || v === undefined || v === '')
          return <span className="text-subtle-foreground">—</span>;
        if (typeof v === 'boolean') return v ? t('yes') : t('no');
        return <span className="text-muted-foreground">{String(v)}</span>;
      },
    })),
    {
      id: 'state',
      header: t('fields.status'),
      width: 120,
      cell: (i) => {
        const state = itemState(i);
        return (
          <Badge tone={STATE_TONE[state]} dot>
            {t(`states.${state}`)}
          </Badge>
        );
      },
    },
    {
      id: 'updatedAt',
      header: t('fields.updated'),
      sortable: true,
      width: 120,
      hideOnMobile: true,
      cell: (i) => (
        <span className="tabular whitespace-nowrap text-muted-foreground">
          {formatDate(i.updatedAt, locale)}
        </span>
      ),
    },
  ];
}

/** The managed lists, with a quick filter; the selected one is highlighted. */
function ListNavigator({
  lists,
  loading,
  selectedCode,
  onSelect,
}: Readonly<{
  lists: readonly ReferenceDataType[];
  loading: boolean;
  selectedCode: string | null;
  onSelect: (code: string) => void;
}>) {
  const t = useTranslations('referenceData');
  const [filter, setFilter] = useState('');
  const visibleLists = useMemo(
    () =>
      lists.filter(
        (l) =>
          !filter ||
          l.name.toLowerCase().includes(filter.toLowerCase()) ||
          l.code.includes(filter.toLowerCase()),
      ),
    [filter, lists],
  );

  return (
    <aside className="rounded-surface border border-border bg-surface shadow-card lg:self-start">
      <div className="border-b border-border p-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('filterLists')}
          aria-label={t('filterLists')}
          startAdornment={<Search />}
        />
      </div>
      {loading ? (
        <div className="space-y-2 p-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : (
        <ul className="scrollbar-thin max-h-[60vh] overflow-y-auto p-1.5 max-lg:flex max-lg:gap-1 max-lg:overflow-x-auto">
          {visibleLists.map((l) => {
            const active = l.code === selectedCode;
            return (
              <li key={l.code} className="max-lg:shrink-0">
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSelect(l.code)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-control px-3 py-2 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                    active ? 'bg-primary-soft' : 'hover:bg-muted',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'flex items-center gap-1.5 truncate text-sm',
                        active ? 'font-bold' : 'font-medium',
                      )}
                    >
                      {l.isSystem ? (
                        <Lock
                          className="size-3 shrink-0 text-subtle-foreground"
                          aria-label={t('system')}
                        />
                      ) : null}
                      {l.name}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {l.code}
                    </span>
                  </span>
                  <span className="rounded-pill bg-muted px-1.5 text-[11px] font-semibold tabular text-muted-foreground">
                    {l.activeCount}/{l.itemCount}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

/** Name, code and attributes of the selected list, with its management buttons. */
function ListHeader({
  list,
  canManage,
  onEdit,
  onDelete,
}: Readonly<{
  list: ReferenceDataType;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}>) {
  const t = useTranslations('referenceData');
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-surface border border-border bg-surface p-4 shadow-card">
      <div className="min-w-0">
        <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {list.name}
          <code className="rounded-item bg-muted px-1.5 py-0.5 text-xs font-normal">
            {list.code}
          </code>
          {list.isSystem ? <Badge tone="secondary">{t('system')}</Badge> : null}
        </h2>
        {list.description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{list.description}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {list.parentTypeCode ? (
            <Badge tone="info">{t('parentOf', { list: list.parentTypeCode })}</Badge>
          ) : null}
          {list.attributes.map((a) => (
            <Badge key={a.key} tone="outline" title={t(`attributeTypes.${a.type}`)}>
              {a.label}
              {a.required ? '*' : ''}
            </Badge>
          ))}
        </div>
      </div>
      {canManage ? (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil /> {t('editList')}
          </Button>
          {!list.isSystem ? (
            <Button
              variant="outline"
              size="sm"
              className="text-danger hover:bg-danger-soft"
              disabled={list.itemCount > 0}
              title={list.itemCount > 0 ? t('deleteListBlocked') : undefined}
              onClick={onDelete}
            >
              <Trash2 /> {t('deleteList')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Add, refresh, the status filter and search above the items table. */
function ItemsToolbar({
  canManage,
  onAdd,
  refreshing,
  onRefresh,
  params,
  update,
}: Readonly<{
  canManage: boolean;
  onAdd: () => void;
  refreshing: boolean;
  onRefresh: () => void;
  params: ListParams;
  update: (patch: Partial<ListParams>) => void;
}>) {
  const t = useTranslations('referenceData');
  const tc = useTranslations('common');
  const tools = useTableToolLabels();
  return (
    <DataTableToolbar
      actions={
        <>
          {canManage ? (
            <Button size="sm" className="h-[30px] px-3" onClick={onAdd}>
              <Plus /> {t('addItem')}
            </Button>
          ) : null}
          <RefreshButton
            busy={refreshing}
            onClick={onRefresh}
            label={tc('refresh')}
            busyLabel={tc('refreshing')}
          />
        </>
      }
      filters={
        <DataTableFilters
          filters={[
            {
              id: 'active',
              label: t('fields.status'),
              type: 'boolean',
              trueLabel: t('states.active'),
              falseLabel: t('states.inactive'),
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
          placeholder={t('searchItems')}
          label={tc('search')}
        />
      }
    />
  );
}

/**
 * Reference data administration: the managed lists (currencies, branches,
 * countries, …) on the left, the selected list's items on the right. Items
 * can carry list-specific attributes, translations and validity dates; item
 * changes follow the maker–checker policy.
 */
export function ReferenceDataPage() {
  const t = useTranslations('referenceData');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const labels = useDataTableLabels();
  const { can } = usePermissions();
  const canManage = can('reference-data:manage');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const lists = useReferenceTypes();
  const selectedCode = sp.get('list') ?? lists.data?.[0]?.code ?? null;
  const selected = lists.data?.find((l) => l.code === selectedCode) ?? null;

  const { params, update } = useListParams(ITEM_DEFAULTS);
  const items = useReferenceItems(selectedCode, params);
  const pending =
    usePendingApprovals(
      'ReferenceDataItem',
      (items.data?.items ?? []).map((i) => i.id),
    ).data ?? {};
  const saveItem = useSaveReferenceItem();
  const deleteItem = useDeleteReferenceItem();
  const deleteType = useDeleteReferenceType({ meta: { notify: { error: true } } });
  const feedback = useSaveFeedback();

  const [typeForm, setTypeForm] = useState<{ type: ReferenceDataType | null } | null>(null);
  const [itemForm, setItemForm] = useState<{ item: ReferenceDataItem | null } | null>(null);
  const [deleting, setDeleting] = useState<ReferenceDataItem | null>(null);
  const [deletingType, setDeletingType] = useState(false);
  const [reason, setReason] = useState('');

  const selectList = (code: string) => {
    const next = new URLSearchParams();
    next.set('list', code);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const columns = itemColumns({ t, locale, pending, list: selected });

  const rowActions = (i: ReferenceDataItem) => {
    const actions: RowAction[] = [
      {
        id: 'edit',
        label: t('actions.edit'),
        icon: <Pencil />,
        onSelect: () => setItemForm({ item: i }),
        hidden: !canManage,
      },
      {
        id: 'toggle',
        label: i.active ? t('actions.deactivate') : t('actions.activate'),
        description: i.active ? t('actions.deactivateHint') : undefined,
        icon: i.active ? <EyeOff /> : <Eye />,
        hidden: !canManage,
        onSelect: () =>
          saveItem.mutate(
            {
              type: i.typeCode,
              id: i.id,
              input: { label: i.label, active: !i.active, version: i.version },
            },
            {
              onSuccess: (result) =>
                feedback(
                  result,
                  i.active
                    ? t('toast.deactivated', { code: i.code })
                    : t('toast.activated', { code: i.code }),
                ),
              onError: (error) => toast.error(describeError(error, te).message),
            },
          ),
      },
      {
        id: 'delete',
        label: t('actions.delete'),
        description: t('actions.deleteHint'),
        icon: <Trash2 />,
        danger: true,
        divider: true,
        hidden: !canManage,
        onSelect: () => setDeleting(i),
      },
    ];
    return <RowActionsMenu actions={actions} label={t('actions.menu', { code: i.code })} />;
  };

  return (
    <>
      <PageHeader
        icon={<Database />}
        title={t('title')}
        description={t('description')}
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setTypeForm({ type: null })}>
              <Plus /> {t('newList')}
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <ListNavigator
          lists={lists.data ?? []}
          loading={lists.isPending}
          selectedCode={selectedCode}
          onSelect={selectList}
        />

        <section className="min-w-0 space-y-4">
          {selected ? (
            <>
              <ListHeader
                list={selected}
                canManage={canManage}
                onEdit={() => setTypeForm({ type: selected })}
                onDelete={() => setDeletingType(true)}
              />
              <DataTable
                tableId={`reference-data-${selected.code}`}
                caption={selected.name}
                columns={columns}
                data={items.data?.items ?? []}
                getRowId={(i) => i.id}
                labels={labels}
                loading={items.isPending}
                sort={params.sort}
                onSortChange={(sort) => update({ sort })}
                pagination={items.data?.pagination}
                onPageChange={(page) => update({ page }, false)}
                onPageSizeChange={(pageSize) => update({ pageSize })}
                onRowClick={canManage ? (i) => setItemForm({ item: i }) : undefined}
                rowActions={canManage ? rowActions : undefined}
                emptyState={<EmptyState icon={<Database />} title={t('emptyItems')} />}
                error={
                  items.error ? (
                    <ErrorState
                      title={te('title')}
                      description={describeError(items.error, te).message}
                      correlationId={describeError(items.error, te).correlationId}
                      referenceLabel={tc('reference')}
                    />
                  ) : undefined
                }
                toolbar={
                  <ItemsToolbar
                    canManage={canManage}
                    onAdd={() => setItemForm({ item: null })}
                    refreshing={items.isFetching}
                    onRefresh={() => items.refetch()}
                    params={params}
                    update={update}
                  />
                }
              />
            </>
          ) : null}
          {!selected && !lists.isPending ? (
            <EmptyState icon={<Database />} title={t('noLists')} />
          ) : null}
        </section>
      </div>

      <TypeFormDialog
        open={!!typeForm}
        type={typeForm?.type ?? null}
        onOpenChange={(open) => !open && setTypeForm(null)}
        onSaved={(code) => selectList(code)}
      />
      {selected ? (
        <ItemFormDialog
          type={selected}
          item={itemForm?.item ?? null}
          open={!!itemForm}
          onOpenChange={(open) => !open && setItemForm(null)}
        />
      ) : null}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setReason('');
          }
        }}
        title={t('deleteItem.title')}
        description={t('deleteItem.description', {
          code: deleting?.code ?? '',
          label: deleting?.label ?? '',
        })}
        confirmLabel={t('actions.delete')}
        cancelLabel={tc('cancel')}
        loading={deleteItem.isPending}
        onConfirm={() =>
          deleting &&
          deleteItem.mutate(
            { id: deleting.id, reason },
            {
              onSuccess: (result) => {
                feedback(result, t('toast.itemDeleted', { code: deleting.code }));
                setDeleting(null);
                setReason('');
              },
              onError: (error) => {
                toast.error(describeError(error, te).message);
                setDeleting(null);
              },
            },
          )
        }
      >
        <ApprovalNotice
          action="reference-data.items.delete"
          reason={reason}
          onReasonChange={setReason}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={deletingType}
        onOpenChange={setDeletingType}
        title={t('deleteType.title')}
        description={t('deleteType.description', { name: selected?.name ?? '' })}
        confirmLabel={t('deleteList')}
        cancelLabel={tc('cancel')}
        loading={deleteType.isPending}
        onConfirm={() =>
          selected &&
          deleteType.mutate(selected.code, {
            onSuccess: () => {
              toast.success(t('toast.typeDeleted', { name: selected.name }));
              setDeletingType(false);
              router.replace(pathname);
            },
            onError: () => setDeletingType(false),
          })
        }
      />
    </>
  );
}
