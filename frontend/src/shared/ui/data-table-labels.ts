'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { DataTableLabels } from './data-table';
import type { ExportLabels } from './data-table-export';
import type { FilterLabels } from './data-table-filters';
import type { ImportLabels } from './import-dialog';

/** Translated labels for DataTable (shared `table` namespace). */
export function useDataTableLabels(): DataTableLabels {
  const t = useTranslations('table');
  return useMemo(
    () => ({
      actions: t('actions'),
      loading: t('loading'),
      emptyTitle: t('emptyTitle'),
      emptyDescription: t('emptyDescription'),
      showing: (from, to, total) => t('showing', { from, to, total }),
      perPage: t('perPage'),
      first: t('first'),
      previous: t('previous'),
      next: t('next'),
      last: t('last'),
      page: (page) => t('page', { page }),
      sortBy: (column) => t('sortBy', { column }),
      selectRow: t('selectRow'),
      selectAll: t('selectAll'),
      selected: (count) => t('selected', { count }),
      clearSelection: t('clearSelection'),
      columns: t('columns'),
      expandRow: t('expandRow'),
      collapseRow: t('collapseRow'),
      expandAll: t('expandAll'),
      collapseAll: t('collapseAll'),
    }),
    [t],
  );
}

/** Translated labels for the table tools: filters, export and import (shared `table` namespace). */
export function useTableToolLabels(): {
  filters: FilterLabels;
  export: ExportLabels;
  import: ImportLabels;
} {
  const t = useTranslations('table');
  return useMemo(
    () => ({
      filters: {
        yes: t('filters.yes'),
        no: t('filters.no'),
        clear: t('filters.clear'),
        apply: t('filters.apply'),
        reset: t('filters.reset'),
        searchOptions: t('filters.searchOptions'),
        noOptions: t('filters.noOptions'),
        from: t('filters.from'),
        to: t('filters.to'),
        presets: {
          today: t('filters.presets.today'),
          last7: t('filters.presets.last7'),
          last30: t('filters.presets.last30'),
          thisMonth: t('filters.presets.thisMonth'),
          lastMonth: t('filters.presets.lastMonth'),
        },
        remove: (filter) => t('filters.remove', { filter }),
      },
      export: {
        export: t('export.export'),
        exporting: t('export.exporting'),
        allRows: t('export.allRows'),
        allRowsHint: t('export.allRowsHint'),
        selectedRows: (count) => t('export.selectedRows', { count }),
        formats: { csv: t('export.csv'), xlsx: t('export.xlsx') },
        done: (rows, fileName) => t('export.done', { rows, fileName }),
        truncated: (rows) => t('export.truncated', { rows }),
      },
      import: {
        steps: [t('import.stepUpload'), t('import.stepReview'), t('import.stepResult')],
        intro: t('import.intro'),
        template: t('import.template'),
        file: {
          prompt: t('import.filePrompt'),
          browse: t('import.fileBrowse'),
          hint: t('import.fileHint'),
          remove: t('import.fileRemove'),
          tooLarge: (name, max) => t('import.fileTooLarge', { name, max }),
          badType: (name) => t('import.fileBadType', { name }),
          tooMany: (max) => t('import.fileTooMany', { max }),
        },
        emptyFile: t('import.emptyFile'),
        missingColumns: (columns) => t('import.missingColumns', { columns }),
        tooManyRows: (max) => t('import.tooManyRows', { max }),
        rows: (count) => t('import.rows', { count }),
        valid: (count) => t('import.valid', { count }),
        invalid: (count) => t('import.invalid', { count }),
        onlyIssues: t('import.onlyIssues'),
        line: t('import.line'),
        status: t('import.status'),
        ready: t('import.ready'),
        importRows: (count) => t('import.importRows', { count }),
        importing: t('import.importing'),
        created: (count) => t('import.created', { count }),
        failed: (count) => t('import.failed', { count }),
        allImported: t('import.allImported'),
        errorReport: t('import.errorReport'),
        errorColumn: t('import.errorColumn'),
        back: t('import.back'),
        close: t('import.close'),
        another: t('import.another'),
      },
    }),
    [t],
  );
}
