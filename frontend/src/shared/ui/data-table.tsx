'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns3,
  X,
} from 'lucide-react';
import { DropdownMenu as MenuPrimitive } from 'radix-ui';
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTablePrefs } from '@/shared/stores/table-prefs-store';
import type { PaginationMeta, SortState } from '@/shared/types';
import { cn } from '@/shared/lib/cn';
import { Button } from './button';
import { Checkbox } from './choice';
import { EmptyState, Skeleton } from './feedback';
import { Pagination } from './pagination';
import { useUiSettings } from './ui-settings';

/**
 * AppCore data table, modelled on the NIB Internet Banking table:
 *   toolbar (actions · filters · search)  →  table (muted header, row dividers,
 *   hover, selected row accent, sticky inline actions)  →  pagination bar.
 * Server-driven: sorting, search, filters and paging are controlled props.
 *
 * Optional enterprise features:
 *   • selection — checkbox column, page-level select-all and a bulk-action bar;
 *   • tableId   — enables the "Columns" menu; hidden columns persist per browser;
 *   • expansion — master–detail: a chevron column expands a row to show its
 *                 detail (child records, a summary) under it. See DataTableExpansion
 *                 and data-table-detail.tsx (DetailPanel, SubTable).
 */

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  width?: number | string;
  align?: 'start' | 'center' | 'end';
  className?: string;
  /** Hide on small screens. */
  hideOnMobile?: boolean;
  /** Can users hide it from the Columns menu? (default true; key columns should say false) */
  hideable?: boolean;
  /** Columns-menu label when `header` is not plain text. */
  menuLabel?: string;
}

export interface DataTableSelection<T> {
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  isSelectable?: (row: T) => boolean;
  /** Buttons shown in the bulk-action bar while rows are selected. */
  bulkActions?: ReactNode;
}

/**
 * Master–detail rows. The detail is mounted only while its row is expanded, so
 * a component that loads data there fetches lazily, per row.
 *
 *   expansion={{ render: (order) => <OrderLines orderId={order.id} /> }}
 *
 * State is kept by the table unless `expandedIds` + `onChange` are given
 * (controlled: keep it in the URL, expand a row from outside, …). `mode`,
 * `expandAll` and `expandOnRowClick` default to the product's
 * `ui.tables.expansion` in app.config.
 */
export interface DataTableExpansion<T> {
  /** Content shown under an expanded row. */
  render: (row: T) => ReactNode;
  /** Rows without detail get no chevron (default: every row). */
  canExpand?: (row: T) => boolean;
  /** "multiple": any number open · "single": opening one closes the others. Default: app.config `ui.tables.expansion.mode`. */
  mode?: 'single' | 'multiple';
  /** Controlled state. */
  expandedIds?: readonly string[];
  onChange?: (ids: string[]) => void;
  /** Uncontrolled: rows open at first render. */
  defaultExpandedIds?: readonly string[];
  /** Header button that expands / collapses every row of the page (multiple mode). Default: `ui.tables.expansion.expandAll`. */
  expandAll?: boolean;
  /** Clicking anywhere on the row toggles it (ignored when `onRowClick` is set). Default: `ui.tables.expansion.expandOnRowClick`. */
  expandOnRowClick?: boolean;
}

export interface DataTableLabels {
  actions: string;
  loading: string;
  emptyTitle: string;
  emptyDescription?: string;
  showing: (from: number, to: number, total: number) => string;
  perPage: string;
  first: string;
  previous: string;
  next: string;
  last: string;
  page: (page: number) => string;
  sortBy: (column: string) => string;
  selectRow?: string;
  selectAll?: string;
  selected?: (count: number) => string;
  clearSelection?: string;
  columns?: string;
  expandRow?: string;
  collapseRow?: string;
  expandAll?: string;
  collapseAll?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;
  labels: DataTableLabels;
  caption?: string;
  loading?: boolean;
  /** Error content rendered in place of rows. */
  error?: ReactNode;
  toolbar?: ReactNode;
  sort?: SortState[];
  onSortChange?: (sort: SortState[]) => void;
  onRowClick?: (row: T) => void;
  selectedId?: string | null;
  rowActions?: (row: T) => ReactNode;
  /** The server's meta.pagination for `data` — lists are always paged by the server. */
  pagination?: PaginationMeta;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  /** Rows-per-page choices for this table (default: app.config `ui.pagination.pageSizeOptions`). */
  pageSizeOptions?: number[];
  emptyAction?: ReactNode;
  /** Replaces the default empty state (e.g. "All caught up" for an inbox). */
  emptyState?: ReactNode;
  /** Virtualize rows (large client-side lists); value = max body height in px. */
  virtualizeHeight?: number;
  skeletonRows?: number;
  selection?: DataTableSelection<T>;
  /** Stable id: enables the Columns menu and persists hidden columns. */
  tableId?: string;
  /** Master–detail: rows expand to show their detail. Not combined with `virtualizeHeight`. */
  expansion?: DataTableExpansion<T>;
}

const alignClass = { start: 'text-start', center: 'text-center', end: 'text-end' } as const;

type ResolvedExpansion<T> = DataTableExpansion<T> &
  Required<Pick<DataTableExpansion<T>, 'mode' | 'expandAll' | 'expandOnRowClick'>>;

export function DataTable<T>(props: Readonly<DataTableProps<T>>) {
  const {
    columns: allColumns,
    data,
    getRowId,
    labels,
    loading,
    error,
    toolbar,
    sort = [],
    onSortChange,
    onRowClick,
    selectedId,
    rowActions,
    pagination,
    caption,
    virtualizeHeight,
    skeletonRows = 8,
    selection,
    tableId,
  } = props;
  const expansion = useExpansion(props.expansion, virtualizeHeight);
  const hidden = useHiddenColumns(tableId);
  const columns = allColumns.filter((c) => !hidden.includes(c.id));
  const totalCols = columns.length + [rowActions, selection, expansion].filter(Boolean).length;
  const detailId = useId();
  const page = usePageExpansion(expansion, data, getRowId);
  // Selection is page-scoped for "select all" but survives paging (ids are kept by the caller).
  const picked = pageSelection(selection, data, getRowId);
  const hasTopBar = !!toolbar || !!tableId || picked.selectedCount > 0;
  const current = (id: string) => sort.find((s) => s.field === id);

  const toggleSort = (id: string) => {
    const s = current(id);
    if (!onSortChange) return;
    if (!s) onSortChange([{ field: id, direction: 'asc' }]);
    else if (s.direction === 'asc') onSortChange([{ field: id, direction: 'desc' }]);
    else onSortChange([]);
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const { rows, padTop, padBottom } = useVirtualRows(data, virtualizeHeight, scrollRef);

  const renderRows = () =>
    rows.map(({ row }) => {
      const id = getRowId(row);
      const canExpand = !!expansion && (expansion.canExpand?.(row) ?? true);
      return (
        <DataRow
          key={id}
          row={row}
          columns={columns}
          labels={labels}
          selection={selection}
          expansion={expansion}
          canExpand={canExpand}
          open={canExpand && page.expanded.has(id)}
          panelId={`${detailId}-${id}`}
          selected={selectedId === id}
          checked={picked.selectedSet.has(id)}
          totalCols={totalCols}
          onRowClick={onRowClick}
          rowActions={rowActions}
          onCheck={(on) => picked.toggleRow(id, on)}
          onToggle={() => page.expanded.toggle(id)}
        />
      );
    });

  return (
    <div className="flex flex-col">
      <TableTopBar
        selection={selection}
        selectedCount={picked.selectedCount}
        labels={labels}
        toolbar={toolbar}
        tableId={tableId}
        columns={allColumns}
        hidden={hidden}
      />

      <div
        ref={scrollRef}
        className={cn(
          'scrollbar-thin overflow-x-auto border border-border bg-surface',
          hasTopBar ? 'border-t-0' : 'rounded-t-surface',
          !pagination && 'rounded-b-surface',
          virtualizeHeight && 'overflow-y-auto',
        )}
        style={virtualizeHeight ? { maxHeight: virtualizeHeight } : undefined}
      >
        <table
          className="w-full min-w-max border-collapse text-sm"
          aria-busy={loading || undefined}
        >
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="sticky top-0 z-[1]">
            <tr>
              {selection ? (
                <th scope="col" className="w-10 border-b border-border bg-muted py-2.5 ps-4 pe-1">
                  <Checkbox
                    aria-label={labels.selectAll ?? 'Select all rows on this page'}
                    disabled={picked.selectable.length === 0}
                    checked={selectAllState(picked.pageSelected, picked.selectable.length)}
                    onCheckedChange={picked.toggleAll}
                  />
                </th>
              ) : null}
              {expansion ? (
                <ExpandAllHeader
                  enabled={expansion.mode !== 'single' && expansion.expandAll !== false}
                  expanded={page.allExpanded}
                  disabled={page.expandable.length === 0}
                  labels={labels}
                  onToggle={page.toggleAll}
                />
              ) : null}
              {columns.map((col) => (
                <ColumnHeader
                  key={col.id}
                  col={col}
                  sort={current(col.id)}
                  sortable={!!col.sortable && !!onSortChange}
                  sortBy={labels.sortBy}
                  onSort={() => toggleSort(col.id)}
                />
              ))}
              {rowActions ? (
                <th
                  scope="col"
                  className="sticky end-0 z-[2] w-16 border-b border-border bg-muted px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground shadow-[-1px_0_0_var(--border)]"
                >
                  {labels.actions}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            <TableBody
              loading={loading}
              error={error}
              isEmpty={data.length === 0}
              empty={
                props.emptyState ?? (
                  <EmptyState
                    title={labels.emptyTitle}
                    description={labels.emptyDescription}
                    action={props.emptyAction}
                  />
                )
              }
              totalCols={totalCols}
              skeletonRows={skeletonRows}
              padTop={padTop}
              padBottom={padBottom}
              renderRows={renderRows}
            />
          </tbody>
        </table>
      </div>

      {pagination ? (
        <Pagination
          pagination={pagination}
          labels={labels}
          onPageChange={props.onPageChange}
          onPageSizeChange={props.onPageSizeChange}
          pageSizeOptions={props.pageSizeOptions}
          className="rounded-b-surface border border-t-0 border-border bg-surface"
        />
      ) : null}
    </div>
  );
}

/** The expansion props with the product defaults filled in; none for virtualized tables. */
function useExpansion<T>(
  expansion: DataTableExpansion<T> | undefined,
  virtualizeHeight: number | undefined,
): ResolvedExpansion<T> | undefined {
  const defaults = useUiSettings().tables.expansion;
  // Virtualized rows have a fixed height, so they cannot grow a detail under them.
  if (!expansion || virtualizeHeight) return undefined;
  return {
    ...expansion,
    mode: expansion.mode ?? defaults.mode,
    expandAll: expansion.expandAll ?? defaults.expandAll,
    expandOnRowClick: expansion.expandOnRowClick ?? defaults.expandOnRowClick,
  };
}

/** Expansion state of the page: which rows can expand, and expand/collapse all of them. */
function usePageExpansion<T>(
  expansion: ResolvedExpansion<T> | undefined,
  data: T[],
  getRowId: (row: T) => string,
) {
  const expanded = useExpandedRows(expansion);
  const expandable = expansion
    ? data.filter((r) => expansion.canExpand?.(r) ?? true).map(getRowId)
    : [];
  const pageExpanded = expandable.filter((id) => expanded.has(id)).length;
  const allExpanded = expandable.length > 0 && pageExpanded === expandable.length;
  const toggleAll = () => {
    const others = expanded.ids.filter((id) => !expandable.includes(id));
    expanded.set(allExpanded ? others : [...others, ...expandable]);
  };
  return { expanded, expandable, allExpanded, toggleAll };
}

/** Selection on this page: "select all" covers its rows; ids selected on other pages are kept. */
function pageSelection<T>(
  selection: DataTableSelection<T> | undefined,
  data: T[],
  getRowId: (row: T) => string,
) {
  const selectable = selection
    ? data.filter((r) => selection.isSelectable?.(r) ?? true).map(getRowId)
    : [];
  const selectedSet = new Set(selection?.selectedIds ?? []);
  const pageSelected = selectable.filter((id) => selectedSet.has(id)).length;
  const toggleAll = () => {
    if (!selection) return;
    const others = selection.selectedIds.filter((id) => !selectable.includes(id));
    selection.onChange(pageSelected === selectable.length ? others : [...others, ...selectable]);
  };
  const toggleRow = (id: string, on: boolean) => {
    if (!selection) return;
    selection.onChange(
      on ? [...selection.selectedIds, id] : selection.selectedIds.filter((x) => x !== id),
    );
  };
  return {
    selectable,
    selectedSet,
    pageSelected,
    selectedCount: selection?.selectedIds.length ?? 0,
    toggleAll,
    toggleRow,
  };
}

/** The rows to render: all of them, or (virtualized) those in view and the spacing around them. */
function useVirtualRows<T>(
  data: T[],
  virtualizeHeight: number | undefined,
  scrollRef: RefObject<HTMLDivElement | null>,
) {
  const virtualizer = useVirtualizer({
    count: virtualizeHeight ? data.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 41,
    overscan: 10,
    // Lets the server (and the first client render) emit the rows that fit the viewport,
    // so prefetched data is visible before the scroll container is measured.
    initialRect: { width: 0, height: virtualizeHeight ?? 0 },
  });
  if (!virtualizeHeight) {
    return { rows: data.map((row, index) => ({ row, index })), padTop: 0, padBottom: 0 };
  }
  const virtualRows = virtualizer.getVirtualItems();
  return {
    rows: virtualRows.map((v) => ({ row: data[v.index]!, index: v.index })),
    padTop: virtualRows[0]?.start ?? 0,
    padBottom: virtualRows.length ? virtualizer.getTotalSize() - (virtualRows.at(-1)?.end ?? 0) : 0,
  };
}

/** State of the page's select-all checkbox. */
function selectAllState(selected: number, selectable: number): boolean | 'indeterminate' {
  if (selectable > 0 && selected === selectable) return true;
  return selected > 0 ? 'indeterminate' : false;
}

/** Above the table: the bulk-action bar while rows are selected, else the toolbar and Columns menu. */
function TableTopBar<T>({
  selection,
  selectedCount,
  labels,
  toolbar,
  tableId,
  columns,
  hidden,
}: Readonly<{
  selection?: DataTableSelection<T>;
  selectedCount: number;
  labels: DataTableLabels;
  toolbar?: ReactNode;
  tableId?: string;
  columns: DataTableColumn<T>[];
  hidden: string[];
}>) {
  if (selection && selectedCount > 0) {
    return (
      <section
        aria-label={labels.selected?.(selectedCount)}
        className="flex min-h-[51px] flex-wrap items-center gap-3 rounded-t-surface border border-primary/40 bg-primary-softer px-4 py-2.5"
      >
        <span className="text-sm font-semibold text-primary-text" aria-live="polite">
          {labels.selected?.(selectedCount) ?? selectedCount}
        </span>
        <div className="h-5 w-px bg-primary/30" aria-hidden />
        <div className="flex flex-wrap items-center gap-2">{selection.bulkActions}</div>
        <Button
          variant="ghost"
          size="sm"
          className="ms-auto h-[30px]"
          onClick={() => selection.onChange([])}
        >
          <X /> {labels.clearSelection}
        </Button>
      </section>
    );
  }
  if (!toolbar && !tableId) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-t-surface border border-border bg-surface px-4 py-2.5">
      {toolbar}
      {tableId ? (
        <ColumnsMenu
          tableId={tableId}
          columns={columns}
          hidden={hidden}
          label={labels.columns ?? 'Columns'}
        />
      ) : null}
    </div>
  );
}

/** aria-sort of a column header: the direction when sorted, "none" when it can be. */
function ariaSort(sort: SortState | undefined, sortable: boolean) {
  if (sort) return sort.direction === 'asc' ? 'ascending' : 'descending';
  return sortable ? 'none' : undefined;
}

function SortIcon({ direction }: Readonly<{ direction?: SortState['direction'] }>) {
  if (!direction) return <ArrowUpDown className="size-3 opacity-50" />;
  return direction === 'asc' ? (
    <ArrowUp className="size-3 text-primary-text" />
  ) : (
    <ArrowDown className="size-3 text-primary-text" />
  );
}

function ColumnHeader<T>({
  col,
  sort,
  sortable,
  sortBy,
  onSort,
}: Readonly<{
  col: DataTableColumn<T>;
  sort?: SortState;
  sortable: boolean;
  sortBy: DataTableLabels['sortBy'];
  onSort: () => void;
}>) {
  return (
    <th
      scope="col"
      style={col.width ? { width: col.width } : undefined}
      aria-sort={ariaSort(sort, sortable)}
      className={cn(
        'border-b border-border bg-muted px-[var(--cell-padding-x)] py-2.5 text-xs font-semibold whitespace-nowrap text-muted-foreground select-none',
        alignClass[col.align ?? 'start'],
        col.hideOnMobile && 'hidden md:table-cell',
      )}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className="inline-flex items-center gap-1 rounded-item outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={sortBy(typeof col.header === 'string' ? col.header : col.id)}
        >
          {col.header}
          <SortIcon direction={sort?.direction} />
        </button>
      ) : (
        col.header
      )}
    </th>
  );
}

/** Header of the disclosure column, with the expand / collapse-all button when enabled. */
function ExpandAllHeader({
  enabled,
  expanded,
  disabled,
  labels,
  onToggle,
}: Readonly<{
  enabled: boolean;
  expanded: boolean;
  disabled: boolean;
  labels: DataTableLabels;
  onToggle: () => void;
}>) {
  return (
    <th scope="col" className="w-9 border-b border-border bg-muted py-1.5 ps-2 pe-0">
      {enabled ? (
        <ExpandButton
          expanded={expanded}
          disabled={disabled}
          label={
            expanded
              ? (labels.collapseAll ?? 'Collapse all rows')
              : (labels.expandAll ?? 'Expand all rows')
          }
          onClick={onToggle}
          all
        />
      ) : null}
    </th>
  );
}

/** The body: skeleton rows while loading, then the error, the empty state or the rows. */
function TableBody({
  loading,
  error,
  isEmpty,
  empty,
  totalCols,
  skeletonRows,
  padTop,
  padBottom,
  renderRows,
}: Readonly<{
  loading?: boolean;
  error?: ReactNode;
  isEmpty: boolean;
  empty: ReactNode;
  totalCols: number;
  skeletonRows: number;
  /** Space above and below the rendered rows (virtualized tables). */
  padTop: number;
  padBottom: number;
  renderRows: () => ReactNode;
}>) {
  if (loading) {
    return Array.from({ length: skeletonRows }, (_, i) => (
      <tr key={`sk-${i}`} className="border-b border-border last:border-0">
        {Array.from({ length: totalCols }, (__, j) => (
          <td key={j} className="px-[var(--cell-padding-x)] py-[var(--row-padding-y)]">
            <Skeleton className="h-3.5" style={{ width: `${50 + ((i * 7 + j * 13) % 45)}%` }} />
          </td>
        ))}
      </tr>
    ));
  }
  if (error) {
    return (
      <tr>
        <td colSpan={totalCols}>{error}</td>
      </tr>
    );
  }
  if (isEmpty) {
    return (
      <tr>
        <td colSpan={totalCols}>{empty}</td>
      </tr>
    );
  }
  // The spacer rows only hold scroll height: they have no cells and no meaning.
  return (
    <>
      {padTop > 0 ? <tr role="none" style={{ height: padTop }} /> : null}
      {renderRows()}
      {padBottom > 0 ? <tr role="none" style={{ height: padBottom }} /> : null}
    </>
  );
}

const rowClass = (state: {
  clickable: boolean;
  open: boolean;
  selected: boolean;
  checked: boolean;
}) =>
  cn(
    'group border-b border-border transition-colors last:border-0 hover:bg-hover',
    state.clickable && 'cursor-pointer',
    state.open && 'bg-surface-muted',
    state.selected && 'bg-primary-softer shadow-[inset_3px_0_0_var(--brand-primary)]',
    state.checked && !state.selected && 'bg-primary-softer/60',
  );

/** A row's click handler: the caller's row click, else toggling its detail, else none. */
function rowClick<T>(
  row: T,
  onRowClick: ((row: T) => void) | undefined,
  toggle: (() => void) | undefined,
) {
  return onRowClick ? () => onRowClick(row) : toggle;
}

/** One record: its cells, and its detail row while expanded. */
function DataRow<T>({
  row,
  columns,
  labels,
  selection,
  expansion,
  canExpand,
  open,
  panelId,
  selected,
  checked,
  totalCols,
  onRowClick,
  rowActions,
  onCheck,
  onToggle,
}: Readonly<{
  row: T;
  columns: DataTableColumn<T>[];
  labels: DataTableLabels;
  selection?: DataTableSelection<T>;
  expansion?: ResolvedExpansion<T>;
  canExpand: boolean;
  open: boolean;
  panelId: string;
  selected: boolean;
  checked: boolean;
  totalCols: number;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  onCheck: (on: boolean) => void;
  onToggle: () => void;
}>) {
  const rowToggles = canExpand && !onRowClick && !!expansion?.expandOnRowClick;
  return (
    <>
      <tr
        aria-selected={selected || checked || undefined}
        onClick={rowClick(row, onRowClick, rowToggles ? onToggle : undefined)}
        className={rowClass({ clickable: !!onRowClick || rowToggles, open, selected, checked })}
      >
        {selection ? (
          <td className="w-10 ps-4 pe-1 align-middle" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              aria-label={labels.selectRow ?? 'Select row'}
              disabled={!(selection.isSelectable?.(row) ?? true)}
              checked={checked}
              onCheckedChange={(v) => onCheck(v === true)}
            />
          </td>
        ) : null}
        {expansion ? (
          <ExpandCell
            canExpand={canExpand}
            open={open}
            panelId={panelId}
            labels={labels}
            onToggle={onToggle}
          />
        ) : null}
        {columns.map((col) => (
          <td
            key={col.id}
            className={cn(
              'px-[var(--cell-padding-x)] py-[var(--row-padding-y)] align-middle text-foreground',
              alignClass[col.align ?? 'start'],
              col.hideOnMobile && 'hidden md:table-cell',
              col.className,
            )}
          >
            {col.cell(row)}
          </td>
        ))}
        {rowActions ? (
          <td
            className={cn(
              'sticky end-0 bg-surface px-2 py-1 shadow-[-1px_0_0_var(--border)] group-hover:bg-hover',
              selected && 'bg-primary-softer',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center gap-0.5">{rowActions(row)}</div>
          </td>
        ) : null}
      </tr>
      {open && expansion ? (
        <tr id={panelId} className="border-b border-border last:border-0">
          {/* The leading accent ties the detail to the row above it. */}
          <td
            colSpan={totalCols}
            className="bg-surface-muted p-0 shadow-[inset_3px_0_0_var(--brand-primary)]"
          >
            {expansion.render(row)}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** The disclosure cell of a row (empty for rows without detail). */
function ExpandCell({
  canExpand,
  open,
  panelId,
  labels,
  onToggle,
}: Readonly<{
  canExpand: boolean;
  open: boolean;
  panelId: string;
  labels: DataTableLabels;
  onToggle: () => void;
}>) {
  return (
    <td className="w-9 ps-2 pe-0 align-middle" onClick={(e) => e.stopPropagation()}>
      {canExpand ? (
        <ExpandButton
          expanded={open}
          controls={panelId}
          label={open ? (labels.collapseRow ?? 'Collapse row') : (labels.expandRow ?? 'Expand row')}
          onClick={onToggle}
        />
      ) : null}
    </td>
  );
}

/** Expanded row ids: controlled by the caller, or kept here. */
function useExpandedRows<T>(expansion: DataTableExpansion<T> | undefined) {
  const [internal, setInternal] = useState<readonly string[]>(
    () => expansion?.defaultExpandedIds ?? [],
  );
  const ids = expansion?.expandedIds ?? internal;
  const set = (next: string[]) => {
    if (expansion?.expandedIds === undefined) setInternal(next);
    expansion?.onChange?.(next);
  };
  return {
    ids,
    has: (id: string) => ids.includes(id),
    set,
    toggle: (id: string) => {
      if (ids.includes(id)) set(ids.filter((x) => x !== id));
      else set(expansion?.mode === 'single' ? [id] : [...ids, id]);
    },
  };
}

/** Chevron of a row; for the whole page, the expand-all or collapse-all pair. */
function expandIcon(all: boolean | undefined, expanded: boolean) {
  if (!all) return ChevronRight;
  return expanded ? ChevronsDownUp : ChevronsUpDown;
}

/** Disclosure button of a row (chevron turns when open) or of the whole page (`all`). */
function ExpandButton({
  expanded,
  label,
  controls,
  disabled,
  all,
  onClick,
}: Readonly<{
  expanded: boolean;
  label: string;
  controls?: string;
  disabled?: boolean;
  all?: boolean;
  onClick: () => void;
}>) {
  const Icon = expandIcon(all, expanded);
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={expanded ? controls : undefined}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-7 items-center justify-center rounded-item text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon
        aria-hidden
        className={cn(
          'size-4 transition-transform',
          !all && (expanded ? 'rotate-90' : 'rtl:rotate-180'),
        )}
      />
    </button>
  );
}

const NO_HIDDEN_COLUMNS: string[] = [];

/** Hidden columns for a table (persisted per browser); empty until rehydrated to keep SSR markup stable. */
function useHiddenColumns(tableId?: string): string[] {
  const hidden = useTablePrefs((s) => (tableId ? s.hidden[tableId] : undefined));
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!tableId) return;
    void Promise.resolve(useTablePrefs.persist.rehydrate()).then(() => setHydrated(true));
  }, [tableId]);
  return hydrated && hidden ? hidden : NO_HIDDEN_COLUMNS;
}

function ColumnsMenu<T>({
  tableId,
  columns,
  hidden,
  label,
}: Readonly<{
  tableId: string;
  columns: DataTableColumn<T>[];
  hidden: string[];
  label: string;
}>) {
  const setHidden = useTablePrefs((s) => s.setHidden);
  const hideable = columns.filter((c) => c.hideable !== false);
  if (hideable.length === 0) return null;
  const visibleCount = columns.length - hidden.length;
  return (
    <MenuPrimitive.Root modal={false}>
      <MenuPrimitive.Trigger asChild>
        <Button variant="outline" size="sm" className="h-[30px] gap-1.5 px-2.5" title={label}>
          <Columns3 aria-hidden />
          <span className="max-sm:sr-only">{label}</span>
        </Button>
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-52 rounded-surface border border-border bg-surface p-1 shadow-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <MenuPrimitive.Label className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
            {label}
          </MenuPrimitive.Label>
          {hideable.map((c) => {
            const shown = !hidden.includes(c.id);
            return (
              <MenuPrimitive.CheckboxItem
                key={c.id}
                checked={shown}
                disabled={shown && visibleCount <= 1} // keep at least one column
                onSelect={(e) => e.preventDefault()} // stay open while toggling several
                onCheckedChange={(on) =>
                  setHidden(tableId, on ? hidden.filter((h) => h !== c.id) : [...hidden, c.id])
                }
                className="group/item flex cursor-pointer items-center gap-2.5 rounded-item py-1.5 ps-2.5 pe-3 text-[13px] outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-hover"
              >
                <span className="flex size-4 items-center justify-center rounded-[min(var(--radius-item),4px)] border border-border-strong group-data-[state=checked]/item:border-primary group-data-[state=checked]/item:bg-primary">
                  <MenuPrimitive.ItemIndicator>
                    <Check className="size-3 text-primary-foreground" strokeWidth={3} />
                  </MenuPrimitive.ItemIndicator>
                </span>
                {c.menuLabel ?? (typeof c.header === 'string' ? c.header : c.id)}
              </MenuPrimitive.CheckboxItem>
            );
          })}
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

/** Toolbar layout: [actions] | [filters] ······ [search] */
export function DataTableToolbar({
  actions,
  filters,
  search,
}: Readonly<{
  actions?: ReactNode;
  filters?: ReactNode;
  search?: ReactNode;
}>) {
  return (
    <>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      {actions && filters ? <div className="h-5 w-px bg-border" aria-hidden /> : null}
      {filters ? <div className="flex flex-wrap items-center gap-3">{filters}</div> : null}
      {search ? <div className="ms-auto w-full sm:w-auto">{search}</div> : null}
    </>
  );
}

/** Toolbar search box (submit or live, per app.config `ui.search`). */
export { TableSearch, type TableSearchProps } from './table-search';
