import { NextResponse } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import type { AccessRequirement } from '@/features/auth/permissions';
import { buildXlsx, type XlsxCell } from '@/infrastructure/export/xlsx';
import { logger } from '@/infrastructure/logging/logger';
import { rateLimit } from '@/infrastructure/security/rate-limit';
import type { ImportRowResult, ImportSummary, Resource } from '@/shared/data/resource';

export type { ImportRowResult, ImportSummary };
import { ApiClientError, isApiClientError } from '@/shared/errors/api-client-error';
import { csvCell } from '@/shared/lib/csv';
import { toListQuery, type ListParams } from '@/shared/types';
import { apiRoute, listParamsOf, parseWith, readJson } from './api-route';

/**
 * Data transfer for any resource: server-side EXPORT (CSV streamed / XLSX) and
 * bulk IMPORT (validated, idempotent, per-row results). Both are BFF routes, so
 * they inherit session, CSRF, correlation ids, permission checks and logging.
 */

type Translate = (key: string) => string;
const req = (r: AccessRequirement | string) => (typeof r === 'string' ? { permission: r } : r);

// ── Export ──────────────────────────────────────────────────────────────────

export type ExportFormat = 'csv' | 'xlsx';

export interface ExportColumn<T> {
  /** Same id as the DataTable column, so the export follows the visible columns. */
  id: string;
  /** Translation key for the header, e.g. 'users.columns.name'. */
  header: string;
  value: (row: T, t: Translate) => XlsxCell;
}

export interface ExportConfig<T> {
  access: AccessRequirement | string;
  columns: ExportColumn<T>[];
  /** File name stem ("users" → users-2026-09-28.xlsx). */
  fileName: string;
  /** Hard cap per export (protects the backend and the browser). */
  maxRows?: number;
  /** Backend page size used while paging (≤ the endpoint's maxPageSize). */
  batchSize?: number;
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * GET {apiPath}/export?format=csv|xlsx&columns=a,b&<list params>
 * Exports ALL rows matching the current filters/search/sort (capped at maxRows),
 * or only selected rows via `filter[id]=in:…`.
 */
export function resourceExportRoute<T>(resource: Resource<T>, config: ExportConfig<T>) {
  const { maxRows = 10_000, batchSize = 100 } = config;

  return apiRoute(
    { requires: req(config.access) },
    async ({ req: request, api, user, correlationId }) => {
      const limit = rateLimit(`export:${user.id}`, 10, 60);
      if (!limit.allowed) {
        throw new ApiClientError({
          code: 'RATE_LIMITED',
          message: 'Too many exports. Please wait a moment.',
          status: 429,
          retryAfterSeconds: limit.retryAfterSeconds,
        });
      }
      const url = new URL(request.url);
      const format = (url.searchParams.get('format') ?? 'csv') as ExportFormat;
      if (!(format in CONTENT_TYPES))
        throw new ApiClientError({
          code: 'VALIDATION_FAILED',
          message: 'Unsupported export format.',
          status: 400,
        });

      const requested = url.searchParams.get('columns')?.split(',').filter(Boolean);
      const columns = requested?.length
        ? requested
            .map((id) => config.columns.find((c) => c.id === id))
            .filter((c): c is ExportColumn<T> => !!c)
        : config.columns;
      if (columns.length === 0)
        throw new ApiClientError({
          code: 'VALIDATION_FAILED',
          message: 'No exportable columns selected.',
          status: 400,
        });

      const t = (await getTranslations()) as unknown as Translate;
      const locale = await getLocale();
      const base: ListParams = {
        ...listParamsOf(request, resource.listDefaults),
        pageSize: batchSize,
      };
      const fetchPage = (page: number) =>
        api.get<T[]>(resource.backendPath, { query: toListQuery({ ...base, page }) });

      // First page BEFORE responding: permission/validation errors still return a JSON envelope.
      const first = await fetchPage(1);
      const total = first.meta?.pagination?.totalItems ?? first.data.length;
      const totalPages = Math.min(
        first.meta?.pagination?.totalPages ?? 1,
        Math.ceil(maxRows / batchSize),
      );
      const truncated = total > maxRows;
      const headers = columns.map((c) => t(c.header));
      const toCells = (row: T) => columns.map((c) => c.value(row, t));
      const stamp = new Date().toISOString().slice(0, 10);
      const fileName = `${config.fileName}-${stamp}.${format}`;
      const exported = Math.min(total, maxRows);

      logger.info(
        {
          correlationId,
          userId: user.id,
          resource: resource.name,
          format,
          rows: exported,
          truncated,
          columns: columns.map((c) => c.id),
          locale,
        },
        'Data export',
      );

      const responseHeaders = {
        'content-type': CONTENT_TYPES[format],
        'content-disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'cache-control': 'no-store',
        'x-correlation-id': correlationId,
        'x-export-rows': String(exported),
        'x-export-truncated': String(truncated),
      };

      if (format === 'xlsx') {
        const rows = first.data.map(toCells);
        for (let page = 2; page <= totalPages; page++)
          rows.push(...(await fetchPage(page)).data.map(toCells));
        const bytes = buildXlsx(headers, rows.slice(0, maxRows), config.fileName);
        return new NextResponse(new Blob([bytes as BlobPart]), { headers: responseHeaders });
      }

      // CSV: stream page by page (constant memory), UTF-8 BOM so Excel reads Amharic correctly.
      const encoder = new TextEncoder();
      const line = (cells: XlsxCell[]) => encoder.encode(`${cells.map(csvCell).join(',')}\r\n`);
      let page = 1;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('﻿'));
          controller.enqueue(line(headers));
          first.data.forEach((row) => controller.enqueue(line(toCells(row))));
        },
        async pull(controller) {
          page += 1;
          if (page > totalPages) return controller.close();
          try {
            (await fetchPage(page)).data.forEach((row) => controller.enqueue(line(toCells(row))));
          } catch (err) {
            logger.error(
              { correlationId, page, err: err instanceof Error ? err.message : String(err) },
              'Export stream failed',
            );
            controller.error(err);
          }
        },
      });
      return new NextResponse(stream, { headers: responseHeaders });
    },
  );
}

// ── Import ──────────────────────────────────────────────────────────────────

export interface ImportConfig<TRow, TBody> {
  access: AccessRequirement | string;
  /** Validates ONE row (never trust the client's own validation). */
  rowSchema: Parameters<typeof parseWith<TRow>>[0];
  /** Row → backend create body (e.g. split lists, add generated secrets). */
  toBody?: (row: TRow) => TBody | Promise<TBody>;
  maxRows?: number;
  /** Parallel backend calls (keep it small: imports must not starve other users). */
  concurrency?: number;
}

async function mapPool<T, R>(
  items: T[],
  size: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

/**
 * POST {apiPath}/import  { batchId, rows: [...] }
 * Each row is validated, then created through the backend with the idempotency
 * key `<batchId>:<index>` — a retried upload never creates duplicates.
 */
export function resourceImportRoute<T extends { id?: string }, TRow, TBody = TRow>(
  resource: Resource<T>,
  config: ImportConfig<TRow, TBody>,
) {
  const { maxRows = 500, concurrency = 4 } = config;
  const envelope = z.object({
    batchId: z.uuid(),
    rows: z.array(z.record(z.string(), z.unknown())).min(1).max(maxRows),
  });

  return apiRoute<ImportSummary>(
    { requires: req(config.access) },
    async ({ req: request, api, user, correlationId }) => {
      const limit = rateLimit(`import:${user.id}`, 5, 60);
      if (!limit.allowed) {
        throw new ApiClientError({
          code: 'RATE_LIMITED',
          message: 'Too many imports. Please wait a moment.',
          status: 429,
          retryAfterSeconds: limit.retryAfterSeconds,
        });
      }
      const { batchId, rows } = await readJson(request, parseWith(envelope));
      const parseRow = parseWith(config.rowSchema);

      const results = await mapPool(
        rows,
        concurrency,
        async (raw, index): Promise<ImportRowResult> => {
          try {
            const row = parseRow(raw);
            const body = config.toBody ? await config.toBody(row) : row;
            const created = await api.post<T>(resource.backendPath, body, {
              idempotencyKey: `${batchId}:${index}`,
            });
            return { index, status: 'created', id: created.data.id };
          } catch (err) {
            const e = isApiClientError(err) ? err : null;
            return {
              index,
              status: 'failed',
              error: {
                code: e?.code ?? 'INTERNAL_ERROR',
                message: e?.message ?? 'Unexpected error',
                details: e?.fieldIssues.map((i) => ({ field: i.field ?? '', message: i.message })),
              },
            };
          }
        },
      );

      const created = results.filter((r) => r.status === 'created').length;
      logger.info(
        {
          correlationId,
          userId: user.id,
          resource: resource.name,
          batchId,
          total: rows.length,
          created,
          failed: rows.length - created,
        },
        'Data import',
      );
      return {
        data: { total: rows.length, created, failed: rows.length - created, results },
        message: 'Import finished.',
      };
    },
  );
}
