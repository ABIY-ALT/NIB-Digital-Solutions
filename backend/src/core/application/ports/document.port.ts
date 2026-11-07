import type { Principal } from '../security/principal.js';

/**
 * Printable documents (PDF). A feature describes WHAT is on the document; the
 * renderer decides how it looks (company header, fonts, money and date
 * formats, footer — all from the runtime settings).
 *
 * Any module can make its records printable and e-mailable by registering a
 * DocumentSource at startup:
 *
 *   onModuleInit() { this.documents.register(this); }
 *
 * GET  /documents/{source}/{id}/pdf   then returns the PDF, and
 * POST /documents/{source}/{id}/send  e-mails it as an attachment.
 */
export type DocumentCell = string | number | null;

export interface DocumentField {
  label: string;
  value: DocumentCell;
  /** How to print a value: money and dates follow the product formats. */
  format?: DocumentFormat;
}

export type DocumentFormat = 'text' | 'number' | 'money' | 'date' | 'datetime';

export interface DocumentColumn {
  key: string;
  label: string;
  align?: 'start' | 'end';
  /** Share of the table width (default 1). */
  weight?: number;
  format?: DocumentFormat;
}

export type DocumentSection =
  /** Label / value pairs in two columns. */
  | { kind: 'fields'; title?: string; fields: DocumentField[] }
  /** Line items, with optional totals under the last column. */
  | {
      kind: 'table';
      title?: string;
      columns: DocumentColumn[];
      rows: Array<Record<string, DocumentCell>>;
      totals?: Array<DocumentField & { emphasis?: boolean }>;
      /** Shown instead of an empty table. */
      emptyText?: string;
    }
  | { kind: 'text'; title?: string; text: string };

export interface DocumentModel {
  /** Kind of document, e.g. "Role definition", "Payment receipt". */
  title: string;
  /** Reference printed next to the title, e.g. a role code or receipt number. */
  number?: string | null;
  /** Summary shown right under the header. */
  fields?: DocumentField[];
  sections: DocumentSection[];
  /** File name without extension (letters, digits, dash). */
  filename: string;
  /** ISO currency of money values; defaults to the product currency. */
  currency?: string;
}

export interface DocumentSource {
  /** Registry key, e.g. "roles". */
  readonly key: string;
  /**
   * The caller needs AT LEAST ONE of these permissions. Row-level checks
   * (branch, owner) belong in `build`.
   */
  readonly permissions: readonly string[];
  /** Throws NotFoundError when the record does not exist (or is not visible). */
  build(principal: Principal, id: string): Promise<DocumentModel>;
}

export interface DocumentSourceRegistry {
  register(source: DocumentSource): void;
  get(key: string): DocumentSource | undefined;
  list(): DocumentSource[];
}

export const DOCUMENT_SOURCES = Symbol('DocumentSourceRegistry');

export interface RenderedDocument {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface DocumentRenderer {
  render(model: DocumentModel): Promise<RenderedDocument>;
}

export const DOCUMENT_RENDERER = Symbol('DocumentRenderer');
