export interface OutputStreams {
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown };
}

export interface TableColumn<Row> {
  header: string;
  value: (row: Row) => unknown;
  align?: 'left' | 'right';
  /** Longer cells are cut with an ellipsis. */
  maxWidth?: number;
}

const ANSI = { bold: 1, dim: 2, red: 31, green: 32, yellow: 33, cyan: 36 } as const;
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b\[\d+m/g;
const visibleLength = (text: string): number => text.replace(ANSI_PATTERN, '').length;

/** JSON that survives BigInt, Date, Map and Buffer (never prints raw key material). */
export function toJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, v: unknown) => {
      if (typeof v === 'bigint') return v.toString();
      if (v instanceof Map) return Object.fromEntries(v as Map<string, unknown>);
      if (v instanceof Set) return [...(v as Set<unknown>)];
      return v;
    },
    2,
  );
}

export function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (value instanceof Date) return value.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.length ? value.map(formatCell).join(', ') : '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return value.toString();
  return toJson(value);
}

/**
 * Everything a command prints goes through here.
 *
 *   human mode   results and progress on stdout, warnings and errors on stderr
 *   --json       stdout carries exactly one JSON document; everything else goes
 *                to stderr, so `appcore … --json | jq` always works
 */
export class Output {
  constructor(
    private readonly streams: OutputStreams,
    readonly mode: { json: boolean; color: boolean },
  ) {}

  /** The command's result: JSON in --json mode, otherwise whatever `human` prints. */
  emit(data: unknown, human: () => void): void {
    if (this.mode.json) this.streams.stdout.write(`${toJson(data)}\n`);
    else human();
  }

  line(text = ''): void {
    this.progress(text);
  }

  heading(text: string): void {
    this.progress(`\n${this.paint(text, 'bold')}`);
  }

  success(text: string): void {
    this.progress(`${this.paint('✔', 'green')} ${text}`);
  }

  info(text: string): void {
    this.progress(this.paint(text, 'dim'));
  }

  warn(text: string): void {
    this.streams.stderr.write(`${this.paint('!', 'yellow')} ${text}\n`);
  }

  /** A dimmed hint next to an error (stderr). */
  note(text: string): void {
    this.streams.stderr.write(`${this.paint(text, 'dim')}
`);
  }

  error(text: string): void {
    this.streams.stderr.write(`${this.paint('✖', 'red')} ${text}\n`);
  }

  /** `label   value` pairs, labels aligned. */
  keyValues(pairs: ReadonlyArray<readonly [string, unknown]>): void {
    const width = Math.max(0, ...pairs.map(([label]) => label.length));
    for (const [label, value] of pairs) {
      this.progress(`  ${this.paint(label.padEnd(width), 'dim')}  ${formatCell(value)}`);
    }
  }

  table<Row>(columns: ReadonlyArray<TableColumn<Row>>, rows: readonly Row[]): void {
    if (rows.length === 0) {
      this.info('  (none)');
      return;
    }
    const cells = rows.map((row) =>
      columns.map((column) => {
        const text = formatCell(column.value(row));
        const max = column.maxWidth;
        return max && visibleLength(text) > max ? `${text.slice(0, max - 1)}…` : text;
      }),
    );
    const widths = columns.map((column, i) =>
      Math.max(column.header.length, ...cells.map((row) => visibleLength(row[i]!))),
    );
    const pad = (text: string, i: number): string => {
      const gap = ' '.repeat(Math.max(0, widths[i]! - visibleLength(text)));
      return columns[i]!.align === 'right' ? gap + text : text + gap;
    };
    const render = (row: string[]): string =>
      `  ${row
        .map((cell, i) => pad(cell, i))
        .join('  ')
        .trimEnd()}`;
    this.progress(this.paint(render(columns.map((c) => c.header)), 'bold'));
    this.progress(this.paint(render(widths.map((w) => '─'.repeat(w))), 'dim'));
    for (const row of cells) this.progress(render(row));
  }

  paint(text: string, style: keyof typeof ANSI): string {
    return this.mode.color ? `\u001b[${ANSI[style]}m${text}\u001b[0m` : text;
  }

  /** Human-readable text: stdout normally, stderr when stdout is reserved for JSON. */
  private progress(text: string): void {
    (this.mode.json ? this.streams.stderr : this.streams.stdout).write(`${text}\n`);
  }
}
