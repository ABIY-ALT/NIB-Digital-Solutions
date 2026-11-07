'use client';

import { AlertTriangle, CheckCircle2, Download, FileUp, Upload, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { ZodType } from 'zod';
import { describeError } from '@/shared/errors/error-messages';
import type { ImportSummary } from '@/shared/data/resource';
import { cn } from '@/shared/lib/cn';
import { downloadCsv, parseCsv, toCsv } from '@/shared/lib/csv';
import { useTranslations } from 'next-intl';
import { Button } from './button';
import { Switch } from './choice';
import { Alert } from './feedback';
import { FileUpload, type FileUploadLabels } from './file-upload';
import { Dialog, DialogContent, DialogFooter } from './overlay';

export interface ImportColumn {
  /** Field name sent to the BFF (also accepted as a header in the file). */
  key: string;
  /** Human header used in the template and the review table. */
  label: string;
  required?: boolean;
  /** Example value written into the template's sample row. */
  example?: string;
  /** Other header spellings accepted in uploaded files. */
  aliases?: string[];
}

export interface ImportLabels {
  steps: [string, string, string];
  intro: string;
  template: string;
  file: FileUploadLabels;
  emptyFile: string;
  missingColumns: (columns: string) => string;
  tooManyRows: (max: number) => string;
  rows: (count: number) => string;
  valid: (count: number) => string;
  invalid: (count: number) => string;
  onlyIssues: string;
  line: string;
  status: string;
  ready: string;
  importRows: (count: number) => string;
  importing: string;
  created: (count: number) => string;
  failed: (count: number) => string;
  allImported: string;
  errorReport: string;
  errorColumn: string;
  back: string;
  close: string;
  another: string;
}

export interface ImportDialogProps<TRow> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  columns: ImportColumn[];
  /** Client-side preview validation (the BFF validates again). */
  schema: ZodType<TRow>;
  onImport: (rows: Array<Record<string, string>>, batchId: string) => Promise<ImportSummary>;
  /** Template/report file-name stem. */
  fileName: string;
  maxRows?: number;
  maxSizeBytes?: number;
  labels: ImportLabels;
}

interface ParsedRow {
  line: number;
  values: Record<string, string>;
  errors: string[];
}

const normalise = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

/**
 * Generic CSV import wizard:  1 Upload (with template) → 2 Review (row-level
 * validation) → 3 Result (per-row outcome + downloadable error report).
 * Only valid rows are sent; the server re-validates and creates each row with
 * an idempotency key, so a retried import never duplicates records.
 */
export function ImportDialog<TRow>({
  open,
  onOpenChange,
  title,
  description,
  columns,
  schema,
  onImport,
  fileName,
  maxRows = 500,
  maxSizeBytes = 2 * 1024 * 1024,
  labels,
}: Readonly<ImportDialogProps<TRow>>) {
  const te = useTranslations('errors');
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [files, setFiles] = useState<File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [sent, setSent] = useState<ParsedRow[]>([]);

  const reset = () => {
    setStep(0);
    setFiles([]);
    setProblem(null);
    setRows([]);
    setSummary(null);
    setSent([]);
    setOnlyIssues(false);
  };

  const downloadTemplate = () =>
    downloadCsv(
      `${fileName}-template`,
      toCsv(
        [Object.fromEntries(columns.map((c) => [c.key, c.example ?? '']))],
        columns.map((c) => ({ header: c.key, value: (r: Record<string, string>) => r[c.key] })),
      ),
    );

  const readFile = async (selected: File[]) => {
    setFiles(selected);
    setProblem(null);
    const file = selected[0];
    if (!file) return;
    const table = parseCsv(await file.text());
    if (table.length < 2) return setProblem(labels.emptyFile);
    const header = table[0]!.map(normalise);
    const indexOf = (c: ImportColumn) =>
      header.findIndex((h) => [c.key, c.label, ...(c.aliases ?? [])].map(normalise).includes(h));
    const missing = columns.filter((c) => c.required && indexOf(c) < 0);
    if (missing.length)
      return setProblem(labels.missingColumns(missing.map((c) => c.key).join(', ')));
    const body = table.slice(1);
    if (body.length > maxRows) return setProblem(labels.tooManyRows(maxRows));

    const positions = columns.map((c) => [c.key, indexOf(c)] as const);
    setRows(
      body.map((cells, i) => {
        const values = Object.fromEntries(
          positions.filter(([, p]) => p >= 0).map(([k, p]) => [k, (cells[p] ?? '').trim()]),
        );
        const result = schema.safeParse(values);
        return {
          line: i + 2,
          values,
          errors: result.success
            ? []
            : result.error.issues.map((iss) => `${iss.path.join('.') || '—'}: ${iss.message}`),
        };
      }),
    );
    setStep(1);
  };

  const validRows = rows.filter((r) => r.errors.length === 0);
  const shown = onlyIssues ? rows.filter((r) => r.errors.length) : rows;
  const preview = columns.slice(0, 3);

  const submit = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const result = await onImport(
        validRows.map((r) => r.values),
        crypto.randomUUID(),
      );
      setSent(validRows);
      setSummary(result);
      setStep(2);
    } catch (error) {
      setProblem(describeError(error, te).message);
    } finally {
      setBusy(false);
    }
  };

  const failures = summary?.results.filter((r) => r.status === 'failed') ?? [];
  const downloadErrors = () => {
    const invalid = rows
      .filter((r) => r.errors.length)
      .map((r) => ({ values: r.values, error: r.errors.join('; ') }));
    const rejected = failures.map((f) => ({
      values: sent[f.index]?.values ?? {},
      error: [f.error?.message, ...(f.error?.details ?? []).map((d) => `${d.field}: ${d.message}`)]
        .filter(Boolean)
        .join('; '),
    }));
    downloadCsv(
      `${fileName}-import-errors`,
      toCsv(
        [...invalid, ...rejected],
        [
          ...columns.map((c) => ({
            header: c.key,
            value: (r: { values: Record<string, string> }) => r.values[c.key],
          })),
          { header: labels.errorColumn, value: (r) => r.error },
        ],
      ),
    );
  };

  const finish = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent
        size="lg"
        icon={<FileUp />}
        title={title}
        description={description}
        bodyClassName="flex flex-col overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-5 max-sm:px-4">
          <ImportProgress steps={labels.steps} step={step} />

          {problem ? <Alert tone="danger" title={problem} /> : null}

          {step === 0 ? (
            <UploadStep
              columns={columns}
              files={files}
              maxSizeBytes={maxSizeBytes}
              labels={labels}
              onTemplate={downloadTemplate}
              onFiles={(f) => void readFile(f)}
            />
          ) : null}

          {step === 1 ? (
            <ReviewStep
              rows={rows}
              shown={shown}
              validCount={validRows.length}
              preview={preview}
              onlyIssues={onlyIssues}
              onOnlyIssuesChange={setOnlyIssues}
              labels={labels}
            />
          ) : null}

          {step === 2 && summary ? (
            <ResultStep
              summary={summary}
              failures={failures}
              sent={sent}
              firstColumn={columns[0]!.key}
              labels={labels}
            />
          ) : null}
        </div>

        <DialogFooter>
          <ImportActions
            step={step}
            busy={busy}
            validCount={validRows.length}
            invalidCount={rows.length - validRows.length}
            failedCount={failures.length}
            labels={labels}
            onBack={reset}
            onReport={downloadErrors}
            onSubmit={() => void submit()}
            onAnother={reset}
            onFinish={finish}
            onClose={() => onOpenChange(false)}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Colour of a step's number: done, current or still to come. */
function stepCircleClass(i: number, step: number): string {
  if (i < step) return 'bg-secondary text-secondary-foreground';
  return i === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground';
}

function ImportProgress({ steps, step }: Readonly<{ steps: readonly string[]; step: number }>) {
  return (
    <ol className="flex items-center gap-2 text-xs font-semibold" aria-label="Progress">
      {steps.map((s, i) => (
        <li
          key={s}
          className="flex items-center gap-2"
          aria-current={i === step ? 'step' : undefined}
        >
          {i > 0 ? (
            <span className={cn('h-px w-6', i <= step ? 'bg-primary' : 'bg-border')} aria-hidden />
          ) : null}
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-full text-[11px]',
              stepCircleClass(i, step),
            )}
          >
            {i + 1}
          </span>
          <span className={cn(i === step ? 'text-foreground' : 'text-muted-foreground')}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** Step 1: the template, the expected columns and the file picker. */
function UploadStep({
  columns,
  files,
  maxSizeBytes,
  labels,
  onTemplate,
  onFiles,
}: Readonly<{
  columns: ImportColumn[];
  files: File[];
  maxSizeBytes: number;
  labels: ImportLabels;
  onTemplate: () => void;
  onFiles: (files: File[]) => void;
}>) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-surface-muted px-3.5 py-3">
        <p className="max-w-md text-xs text-muted-foreground">{labels.intro}</p>
        <Button variant="outline" size="sm" className="bg-surface" onClick={onTemplate}>
          <Download /> {labels.template}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {columns.map((c) => (
          <code
            key={c.key}
            className={cn(
              'rounded-item border px-1.5 py-0.5 font-mono text-[11px]',
              c.required
                ? 'border-primary/40 bg-primary-softer text-primary-text'
                : 'border-border text-muted-foreground',
            )}
          >
            {c.key}
            {c.required ? '*' : ''}
          </code>
        ))}
      </div>
      <FileUpload
        value={files}
        onChange={onFiles}
        accept=".csv,text/csv"
        maxSizeBytes={maxSizeBytes}
        labels={labels.file}
      />
    </>
  );
}

/** Step 2: counts and the row-by-row validation of the file. */
function ReviewStep({
  rows,
  shown,
  validCount,
  preview,
  onlyIssues,
  onOnlyIssuesChange,
  labels,
}: Readonly<{
  rows: ParsedRow[];
  shown: ParsedRow[];
  validCount: number;
  preview: ImportColumn[];
  onlyIssues: boolean;
  onOnlyIssuesChange: (on: boolean) => void;
  labels: ImportLabels;
}>) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-pill bg-muted px-2.5 py-1 font-semibold">
          {labels.rows(rows.length)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-pill bg-success-soft px-2.5 py-1 font-semibold text-success">
          <CheckCircle2 className="size-3.5" aria-hidden /> {labels.valid(validCount)}
        </span>
        {rows.length - validCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-pill bg-danger-soft px-2.5 py-1 font-semibold text-danger">
            <XCircle className="size-3.5" aria-hidden /> {labels.invalid(rows.length - validCount)}
          </span>
        ) : null}
        <label className="ms-auto inline-flex items-center gap-2 text-muted-foreground">
          <Switch checked={onlyIssues} onCheckedChange={onOnlyIssuesChange} /> {labels.onlyIssues}
        </label>
      </div>
      <div className="scrollbar-thin max-h-[45vh] overflow-auto rounded-control border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start font-semibold">{labels.line}</th>
              {preview.map((c) => (
                <th key={c.key} className="px-3 py-2 text-start font-semibold">
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2 text-start font-semibold">{labels.status}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={r.line}
                className={cn('border-t border-border', r.errors.length && 'bg-danger-soft/40')}
              >
                <td className="px-3 py-1.5 tabular text-muted-foreground">{r.line}</td>
                {preview.map((c) => (
                  <td key={c.key} className="max-w-40 truncate px-3 py-1.5">
                    {r.values[c.key] || '—'}
                  </td>
                ))}
                <td className="px-3 py-1.5">
                  {r.errors.length ? (
                    <ul className="space-y-0.5 text-danger">
                      {r.errors.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-medium text-success">
                      <CheckCircle2 className="size-3.5" aria-hidden /> {labels.ready}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Step 3: what was created and which rows the server rejected. */
function ResultStep({
  summary,
  failures,
  sent,
  firstColumn,
  labels,
}: Readonly<{
  summary: ImportSummary;
  failures: ImportSummary['results'];
  sent: ParsedRow[];
  firstColumn: string;
  labels: ImportLabels;
}>) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-control border border-success/40 bg-success-soft p-4">
          <CheckCircle2 className="size-6 text-success" aria-hidden />
          <p className="text-sm font-semibold">{labels.created(summary.created)}</p>
        </div>
        <div
          className={cn(
            'flex items-center gap-3 rounded-control border p-4',
            failures.length ? 'border-danger/40 bg-danger-soft' : 'border-border bg-surface-muted',
          )}
        >
          {failures.length ? (
            <AlertTriangle className="size-6 text-danger" aria-hidden />
          ) : (
            <CheckCircle2 className="size-6 text-muted-foreground" aria-hidden />
          )}
          <p className="text-sm font-semibold">
            {failures.length ? labels.failed(failures.length) : labels.allImported}
          </p>
        </div>
      </div>
      {failures.length ? (
        <ul className="scrollbar-thin max-h-[35vh] divide-y divide-border overflow-y-auto rounded-control border border-border text-xs">
          {failures.map((f) => (
            <li key={f.index} className="flex gap-3 px-3 py-2">
              <span className="tabular text-muted-foreground">
                {labels.line} {sent[f.index]?.line}
              </span>
              <span className="font-medium">{sent[f.index]?.values[firstColumn]}</span>
              <span className="text-danger">{f.error?.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** The footer buttons of the current step. */
function ImportActions({
  step,
  busy,
  validCount,
  invalidCount,
  failedCount,
  labels,
  onBack,
  onReport,
  onSubmit,
  onAnother,
  onFinish,
  onClose,
}: Readonly<{
  step: 0 | 1 | 2;
  busy: boolean;
  validCount: number;
  invalidCount: number;
  failedCount: number;
  labels: ImportLabels;
  onBack: () => void;
  onReport: () => void;
  onSubmit: () => void;
  onAnother: () => void;
  onFinish: () => void;
  onClose: () => void;
}>) {
  if (step === 1) {
    return (
      <>
        <Button variant="outline" className="me-auto" onClick={onBack} disabled={busy}>
          {labels.back}
        </Button>
        {invalidCount > 0 ? (
          <Button variant="outline" onClick={onReport}>
            <Download /> {labels.errorReport}
          </Button>
        ) : null}
        <Button onClick={onSubmit} disabled={validCount === 0} loading={busy}>
          {busy ? null : <Upload />}
          {busy ? labels.importing : labels.importRows(validCount)}
        </Button>
      </>
    );
  }
  if (step === 2) {
    return (
      <>
        {failedCount || invalidCount > 0 ? (
          <Button variant="outline" className="me-auto" onClick={onReport}>
            <Download /> {labels.errorReport}
          </Button>
        ) : null}
        <Button variant="outline" onClick={onAnother}>
          {labels.another}
        </Button>
        <Button onClick={onFinish}>{labels.close}</Button>
      </>
    );
  }
  return (
    <Button variant="outline" onClick={onClose}>
      {labels.close}
    </Button>
  );
}
