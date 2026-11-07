import { Inject, Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { formatDate, formatMoney, formatNumber } from '#core/application/formatting.js';
import type {
  DocumentCell,
  DocumentColumn,
  DocumentField,
  DocumentFormat,
  DocumentModel,
  DocumentRenderer,
  DocumentSection,
  RenderedDocument,
} from '#core/application/ports/document.port.js';
import {
  formatsFrom,
  SETTINGS,
  type FormatSettings,
  type Settings,
  type SettingValue,
} from '#core/application/ports/settings.port.js';
import { trimWhere } from '#core/domain/strings.js';

const MARGIN = 48;
const INK = '#201f1e';
const MUTED = '#605e5c';
const RULE = '#d2d0ce';
const BAND = '#f3f2f1';
const FOOTER_HEIGHT = 44;

type Pdf = InstanceType<typeof PDFDocument>;

interface Look {
  formats: FormatSettings;
  currency: string;
  accent: string;
  company: { name: string; legalName: string; lines: string[]; logo: Buffer | null };
  footer: string;
  pageSize: 'A4' | 'LETTER';
  generatedAt: Date;
}

const safeFilename = (name: string): string => {
  const dashed = name.normalize('NFKD').replaceAll(/[^A-Za-z0-9._-]+/g, '-');
  return trimWhere(dashed, (c) => c === '-').slice(0, 80) || 'document';
};

/** PNG / JPEG data URL → bytes (pdfkit embeds both). */
function imageBytes(value: SettingValue | undefined): Buffer | null {
  if (typeof value !== 'string') return null;
  const match = /^data:image\/(png|jpeg);base64,(.+)$/.exec(value);
  return match ? Buffer.from(match[2]!, 'base64') : null;
}

/**
 * Renders a DocumentModel as a PDF with pdfkit (no browser, no native
 * dependencies). Layout: company header with logo, title and reference, a
 * summary block, then the sections; every page ends with the document footer
 * and "Page n of m". Money, numbers and dates follow the "format.*" settings.
 *
 * The built-in Helvetica covers Latin text only. To print Amharic, register a
 * font that has Ethiopic glyphs (doc.registerFont) and use it in `font()`.
 */
@Injectable()
export class PdfkitDocumentRenderer implements DocumentRenderer {
  constructor(@Inject(SETTINGS) private readonly settings: Settings) {}

  async render(model: DocumentModel): Promise<RenderedDocument> {
    const look = await this.look(model);
    const doc = new PDFDocument({
      size: look.pageSize,
      margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN + FOOTER_HEIGHT },
      bufferPages: true,
      info: { Title: model.title, Author: look.company.name, Creator: look.company.name },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<void>((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);
    });

    header(doc, model, look);
    if (model.fields?.length) fields(doc, model.fields, look);
    for (const section of model.sections) renderSection(doc, section, look);
    footers(doc, look);

    doc.end();
    await finished;
    return {
      filename: `${safeFilename(model.filename)}.pdf`,
      contentType: 'application/pdf',
      content: Buffer.concat(chunks),
    };
  }

  private async look(model: DocumentModel): Promise<Look> {
    const values = await this.settings.all();
    const text = (key: string): string => {
      const value = values[key];
      return typeof value === 'string' ? value : '';
    };
    const formats = formatsFrom(values);
    return {
      formats,
      currency: model.currency ?? formats.currencyCode,
      accent: text('documents.accentColor') || '#8B4E20',
      company: {
        name: text('company.name'),
        legalName: text('company.legalName'),
        lines: [
          text('company.address'),
          [text('company.phone'), text('company.email')].filter(Boolean).join('  ·  '),
          text('company.website'),
          text('company.taxNumber') && `TIN ${text('company.taxNumber')}`,
        ].filter((line): line is string => !!line),
        logo: imageBytes(values['company.logo']),
      },
      footer: text('documents.footer'),
      pageSize: text('documents.pageSize') === 'LETTER' ? 'LETTER' : 'A4',
      generatedAt: new Date(),
    };
  }
}

// ── Layout helpers ──────────────────────────────────────────────────────────

const width = (doc: Pdf): number => doc.page.width - MARGIN * 2;
const bottom = (doc: Pdf): number => doc.page.height - MARGIN - FOOTER_HEIGHT;

/** Starts a new page when `needed` points do not fit on this one. */
function ensureSpace(doc: Pdf, needed: number): void {
  if (doc.y + needed > bottom(doc)) doc.addPage();
}

export function formatCell(
  value: DocumentCell,
  format: DocumentFormat | undefined,
  look: Pick<Look, 'formats' | 'currency'>,
): string {
  if (value === null || value === '') return '—';
  switch (format) {
    case 'money':
      return typeof value === 'number' ? formatMoney(value, look.formats, look.currency) : value;
    case 'number':
      return typeof value === 'number' ? formatNumber(value, look.formats) : value;
    case 'date':
      return formatDate(String(value), look.formats) || String(value);
    case 'datetime':
      return formatDate(String(value), look.formats, true) || String(value);
    default:
      return String(value);
  }
}

function header(doc: Pdf, model: DocumentModel, look: Look): void {
  const top = MARGIN;
  let textX = MARGIN;
  if (look.company.logo) {
    try {
      doc.image(look.company.logo, MARGIN, top, { fit: [56, 56] });
      textX = MARGIN + 68;
    } catch {
      // An unreadable logo must not stop the document.
    }
  }
  const half = width(doc) / 2;
  doc.font('Helvetica-Bold').fontSize(14).fillColor(INK);
  doc.text(look.company.name, textX, top, { width: half - (textX - MARGIN) });
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  if (look.company.legalName && look.company.legalName !== look.company.name) {
    doc.text(look.company.legalName, { width: half - (textX - MARGIN) });
  }
  for (const line of look.company.lines) doc.text(line, { width: half - (textX - MARGIN) });
  const leftBottom = doc.y;

  const rightX = MARGIN + half;
  doc.font('Helvetica-Bold').fontSize(16).fillColor(look.accent);
  doc.text(model.title, rightX, top, { width: half, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  if (model.number) doc.text(model.number, rightX, doc.y + 2, { width: half, align: 'right' });
  doc.text(formatDate(look.generatedAt, look.formats, true), rightX, doc.y + 1, {
    width: half,
    align: 'right',
  });

  const y = Math.max(leftBottom, doc.y, top + (look.company.logo ? 56 : 0)) + 12;
  doc
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + width(doc), y)
    .lineWidth(2)
    .strokeColor(look.accent)
    .stroke();
  doc.x = MARGIN;
  doc.y = y + 16;
}

function sectionTitle(doc: Pdf, title: string | undefined, look: Look): void {
  if (!title) return;
  ensureSpace(doc, 40);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(look.accent);
  doc.text(title.toUpperCase(), MARGIN, doc.y, { width: width(doc), characterSpacing: 0.4 });
  doc.y += 6;
}

/** Label / value pairs, two per row. */
function fields(doc: Pdf, list: DocumentField[], look: Look): void {
  const gap = 20;
  const column = (width(doc) - gap) / 2;
  const labelWidth = Math.min(110, column * 0.42);
  for (let i = 0; i < list.length; i += 2) {
    const pair = list.slice(i, i + 2);
    doc.font('Helvetica').fontSize(9);
    const heights = pair.map((f) =>
      doc.heightOfString(formatCell(f.value, f.format, look), { width: column - labelWidth }),
    );
    const rowHeight = Math.max(...heights, 11) + 6;
    ensureSpace(doc, rowHeight);
    const y = doc.y;
    pair.forEach((f, index) => {
      const x = MARGIN + index * (column + gap);
      doc.font('Helvetica').fontSize(9).fillColor(MUTED);
      doc.text(f.label, x, y, { width: labelWidth - 8 });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
      doc.text(formatCell(f.value, f.format, look), x + labelWidth, y, {
        width: column - labelWidth,
      });
    });
    doc.x = MARGIN;
    doc.y = y + rowHeight;
  }
  doc.y += 8;
}

function renderSection(doc: Pdf, section: DocumentSection, look: Look): void {
  sectionTitle(doc, section.title, look);
  switch (section.kind) {
    case 'fields':
      fields(doc, section.fields, look);
      break;
    case 'text':
      doc.font('Helvetica').fontSize(9).fillColor(INK);
      doc.text(section.text, MARGIN, doc.y, { width: width(doc), lineGap: 2 });
      doc.y += 12;
      break;
    case 'table':
      table(doc, section, look);
      break;
  }
}

const PAD = 6;

function columnWidths(doc: Pdf, columns: DocumentColumn[]): number[] {
  const total = columns.reduce((sum, c) => sum + (c.weight ?? 1), 0);
  return columns.map((c) => (width(doc) * (c.weight ?? 1)) / total);
}

function tableHead(doc: Pdf, columns: DocumentColumn[], widths: number[]): void {
  const y = doc.y;
  doc.rect(MARGIN, y, width(doc), 20).fill(BAND);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
  let x = MARGIN;
  columns.forEach((c, i) => {
    doc.text(c.label.toUpperCase(), x + PAD, y + 6, {
      width: widths[i]! - PAD * 2,
      align: c.align === 'end' ? 'right' : 'left',
      lineBreak: false,
      ellipsis: true,
    });
    x += widths[i]!;
  });
  doc.x = MARGIN;
  doc.y = y + 20;
}

type TableSection = Extract<DocumentSection, { kind: 'table' }>;

function table(doc: Pdf, section: TableSection, look: Look): void {
  const { columns, rows } = section;
  const widths = columnWidths(doc, columns);
  ensureSpace(doc, 44);
  tableHead(doc, columns, widths);

  if (rows.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED);
    doc.text(section.emptyText ?? 'No entries.', MARGIN + PAD, doc.y + 6, { width: width(doc) });
    doc.y += 6;
  }

  for (const row of rows) {
    const cells = columns.map((c) => formatCell(row[c.key] ?? null, c.format, look));
    tableRow(doc, columns, widths, cells);
  }

  if (section.totals?.length) tableTotals(doc, section.totals, look);
  doc.y += 14;
}

/** One row; it moves to a new page (repeating the head) when it does not fit. */
function tableRow(doc: Pdf, columns: DocumentColumn[], widths: number[], cells: string[]): void {
  doc.font('Helvetica').fontSize(9);
  const height =
    Math.max(...cells.map((text, i) => doc.heightOfString(text, { width: widths[i]! - PAD * 2 }))) +
    PAD * 2 -
    2;
  if (doc.y + height > bottom(doc)) {
    doc.addPage();
    tableHead(doc, columns, widths);
  }
  const y = doc.y;
  let x = MARGIN;
  doc.font('Helvetica').fontSize(9).fillColor(INK);
  cells.forEach((text, i) => {
    doc.text(text, x + PAD, y + PAD - 1, {
      width: widths[i]! - PAD * 2,
      align: columns[i]!.align === 'end' ? 'right' : 'left',
    });
    x += widths[i]!;
  });
  doc
    .moveTo(MARGIN, y + height)
    .lineTo(MARGIN + width(doc), y + height)
    .lineWidth(0.5)
    .strokeColor(RULE)
    .stroke();
  doc.x = MARGIN;
  doc.y = y + height;
}

/** Right-aligned totals box under a table. */
function tableTotals(doc: Pdf, totals: NonNullable<TableSection['totals']>, look: Look): void {
  const boxWidth = Math.min(240, width(doc) * 0.5);
  const x = MARGIN + width(doc) - boxWidth;
  doc.y += 6;
  for (const total of totals) {
    ensureSpace(doc, 20);
    const y = doc.y;
    if (total.emphasis) doc.rect(x, y, boxWidth, 20).fill(BAND);
    doc
      .font(total.emphasis ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(total.emphasis ? 10 : 9)
      .fillColor(total.emphasis ? INK : MUTED);
    doc.text(total.label, x + PAD, y + 5, { width: boxWidth / 2 - PAD });
    doc.fillColor(INK);
    doc.text(formatCell(total.value, total.format ?? 'money', look), x + boxWidth / 2, y + 5, {
      width: boxWidth / 2 - PAD,
      align: 'right',
    });
    doc.x = MARGIN;
    doc.y = y + 20;
  }
}

/** Footer text and "Page n of m" on every page (drawn last, when the count is known). */
function footers(doc: Pdf, look: Look): void {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - MARGIN - FOOTER_HEIGHT + 14;
    // Writing below the bottom margin would otherwise start a new page.
    const margin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .moveTo(MARGIN, y - 8)
      .lineTo(MARGIN + width(doc), y - 8)
      .lineWidth(0.5)
      .strokeColor(RULE)
      .stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
    doc.text(look.footer, MARGIN, y, { width: width(doc) - 80, height: 28, ellipsis: true });
    doc.text(`Page ${i + 1} of ${range.count}`, MARGIN + width(doc) - 80, y, {
      width: 80,
      align: 'right',
      lineBreak: false,
    });
    doc.page.margins.bottom = margin;
  }
}
