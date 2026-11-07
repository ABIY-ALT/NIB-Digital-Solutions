/**
 * CSV export helpers (RFC 4180) with OWASP CSV-injection protection: cells that
 * a spreadsheet would evaluate as a formula (= + - @ tab CR) are prefixed with
 * an apostrophe so exported data can never execute in Excel/Sheets.
 */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [
    columns.map((c) => csvCell(c.header)).join(','),
    ...rows.map((row) => columns.map((c) => csvCell(c.value(row))).join(',')),
  ];
  return lines.join('\r\n');
}

/** Triggers a browser download (UTF-8 with BOM so Excel shows Amharic correctly). */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: filename.endsWith('.csv') ? filename : `${filename}.csv`,
  });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Picks `,`, `;` or tab from the header line (Excel in many locales saves `;`). */
function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const counts = [',', ';', '\t'].map((d) => ({ d, n: firstLine.split(d).length - 1 }));
  const best = counts.toSorted((a, b) => b.n - a.n)[0]!;
  return best.n > 0 ? best.d : ',';
}

interface CsvState {
  rows: string[][];
  row: string[];
  field: string;
}

function endField(state: CsvState): void {
  state.row.push(state.field);
  state.field = '';
}

/** Closes the current row; rows with only blank fields are skipped. */
function endRow(state: CsvState): void {
  endField(state);
  if (state.row.some((c) => c.trim() !== '')) state.rows.push(state.row);
  state.row = [];
}

/**
 * Reads a quoted field from just after its opening quote (`""` is an escaped
 * quote); `end` is the index of the closing quote, or the text length when
 * the quote is never closed.
 */
function readQuoted(text: string, start: number): { value: string; end: number } {
  let value = '';
  let i = start;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch !== '"') value += ch;
    else if (text[i + 1] === '"') {
      value += '"';
      i++;
    } else return { value, end: i };
    i++;
  }
  return { value, end: i };
}

/**
 * RFC 4180 parser: quoted fields, escaped quotes, embedded newlines, CRLF/LF,
 * UTF-8 BOM, delimiter auto-detection. Blank lines are skipped.
 */
export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const sep = delimiter ?? detectDelimiter(text);
  const state: CsvState = { rows: [], row: [], field: '' };

  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    // A quote opens a quoted section only at the start of a field; elsewhere it is literal.
    if (ch === '"' && state.field === '') {
      const quoted = readQuoted(text, i + 1);
      state.field = quoted.value;
      i = quoted.end + 1; // past the closing quote
    } else if (ch === sep) {
      endField(state);
      i++;
    } else if (ch === '\n' || ch === '\r') {
      endRow(state);
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1; // CRLF is one line break
    } else {
      state.field += ch;
      i++;
    }
  }
  endRow(state);
  return state.rows;
}
