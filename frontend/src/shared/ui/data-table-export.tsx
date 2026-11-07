'use client';

import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DropdownMenu as MenuPrimitive } from 'radix-ui';
import { Fragment, useState } from 'react';
import { downloadFromApi } from '@/infrastructure/api/download';
import { normaliseParams } from '@/shared/data/resource';
import { describeError } from '@/shared/errors/error-messages';
import { useTablePrefs } from '@/shared/stores/table-prefs-store';
import { toListQuery, type ListParams } from '@/shared/types';
import { Button } from './button';
import { toast } from './toaster';

export type ExportFormat = 'csv' | 'xlsx';

export interface ExportLabels {
  export: string;
  exporting: string;
  allRows: string;
  allRowsHint: string;
  selectedRows: (count: number) => string;
  formats: Record<ExportFormat, string>;
  done: (rows: number, fileName: string) => string;
  truncated: (rows: number) => string;
}

export interface DataTableExportProps {
  /** BFF export endpoint, e.g. `${usersResource.apiPath}/export`. */
  endpoint: string;
  /** Current list params (filters, search, sort) — the export matches the screen. */
  params: ListParams;
  /** All exportable column ids, in display order. */
  columnIds: string[];
  /** Hidden columns of this table are left out of the file. */
  tableId?: string;
  selectedIds?: readonly string[];
  formats?: ExportFormat[];
  fileName: string;
  labels: ExportLabels;
}

const ICONS = { csv: FileText, xlsx: FileSpreadsheet } as const;

/**
 * Export menu for data tables. Files are produced by the BFF (paged from the
 * backend, streamed, capped), so exports honour the same permissions,
 * filters and sort as the table and are logged with a correlation id.
 */
export function DataTableExport({
  endpoint,
  params,
  columnIds,
  tableId,
  selectedIds = [],
  formats = ['xlsx', 'csv'],
  fileName,
  labels,
}: Readonly<DataTableExportProps>) {
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const hidden = useTablePrefs((s) => (tableId ? s.hidden[tableId] : undefined));
  const [busy, setBusy] = useState(false);

  const run = async (format: ExportFormat, scope: 'all' | 'selected') => {
    const { page: _page, pageSize: _size, ...rest } = normaliseParams(params);
    const query = toListQuery(rest);
    if (scope === 'selected') query.set('filter[id]', `in:${selectedIds.join(',')}`);
    query.set('format', format);
    query.set('columns', columnIds.filter((id) => !hidden?.includes(id)).join(','));
    setBusy(true);
    try {
      const result = await downloadFromApi(endpoint, query, `${fileName}.${format}`);
      toast.success(labels.done(result.rows ?? 0, result.fileName), {
        description: result.truncated ? labels.truncated(result.rows ?? 0) : undefined,
      });
    } catch (error) {
      const { message, correlationId } = describeError(error, te);
      toast.error(message, {
        description: correlationId ? `${tc('reference')}: ${correlationId}` : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const groups: Array<{ scope: 'all' | 'selected'; title: string; hint?: string }> = [
    { scope: 'all', title: labels.allRows, hint: labels.allRowsHint },
    ...(selectedIds.length > 0
      ? [{ scope: 'selected' as const, title: labels.selectedRows(selectedIds.length) }]
      : []),
  ];

  return (
    <MenuPrimitive.Root modal={false}>
      <MenuPrimitive.Trigger asChild>
        <Button variant="outline" size="sm" className="h-[30px] gap-1.5 px-3" loading={busy}>
          {!busy ? <Download aria-hidden /> : null}
          {busy ? labels.exporting : labels.export}
          <ChevronDown className="opacity-60" aria-hidden />
        </Button>
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="z-50 w-64 rounded-surface border border-border bg-surface p-1 shadow-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          {groups.map((g, gi) => (
            <Fragment key={g.scope}>
              {gi > 0 ? <MenuPrimitive.Separator className="my-1 h-px bg-border" /> : null}
              <MenuPrimitive.Label className="px-2.5 pt-1.5 pb-1">
                <span className="block text-xs font-semibold text-muted-foreground">{g.title}</span>
                {g.hint ? (
                  <span className="block text-[11px] text-subtle-foreground">{g.hint}</span>
                ) : null}
              </MenuPrimitive.Label>
              {formats.map((f) => {
                const Icon = ICONS[f];
                return (
                  <MenuPrimitive.Item
                    key={f}
                    disabled={busy}
                    onSelect={() => void run(f, g.scope)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-item px-2.5 py-1.5 text-[13px] outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-hover"
                  >
                    <Icon
                      className={
                        f === 'xlsx' ? 'size-4 text-success' : 'size-4 text-muted-foreground'
                      }
                      aria-hidden
                    />
                    {labels.formats[f]}
                  </MenuPrimitive.Item>
                );
              })}
            </Fragment>
          ))}
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}
