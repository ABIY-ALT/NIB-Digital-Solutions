import { describe, expect, it } from 'vitest';
import { buildXlsx, columnName, crc32 } from '@/infrastructure/export/xlsx';
import { parseCsv, toCsv } from './csv';
import {
  datePreset,
  decodeFilter,
  describeFilter,
  encodeFilter,
  type FilterDef,
} from './table-filters';

const status: FilterDef = {
  id: 'status',
  label: 'Status',
  type: 'multiselect',
  options: [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'LOCKED', label: 'Locked' },
    { value: 'DISABLED', label: 'Disabled' },
  ],
};

describe('table filters ⇄ backend syntax', () => {
  it('encodes and decodes every filter type', () => {
    expect(encodeFilter(status, ['ACTIVE'])).toBe('ACTIVE');
    expect(encodeFilter(status, ['ACTIVE', 'LOCKED'])).toBe('in:ACTIVE,LOCKED');
    expect(decodeFilter(status, 'in:ACTIVE,LOCKED')).toEqual(['ACTIVE', 'LOCKED']);
    expect(encodeFilter(status, [])).toBeUndefined();

    const mfa: FilterDef = { id: 'mfaEnabled', label: 'MFA', type: 'boolean' };
    expect(encodeFilter(mfa, false)).toBe('false');
    expect(decodeFilter(mfa, 'true')).toBe(true);

    const branch: FilterDef = { id: 'branchCode', label: 'Branch', type: 'text' };
    expect(encodeFilter(branch, '  ADD ')).toBe('contains:ADD');
    expect(decodeFilter(branch, 'contains:ADD')).toBe('ADD');
  });

  it('round-trips date ranges as whole local days', () => {
    const created: FilterDef = { id: 'createdAt', label: 'Created', type: 'dateRange' };
    const raw = encodeFilter(created, { from: '2026-09-01', to: '2026-09-28' })!;
    expect(raw.startsWith('between:')).toBe(true);
    const [from, to] = raw.slice(8).split(',');
    expect(new Date(to!).getTime() - new Date(from!).getTime()).toBe(28 * 86_400_000 - 1);
    expect(decodeFilter(created, raw)).toEqual({ from: '2026-09-01', to: '2026-09-28' });
    expect(decodeFilter(created, encodeFilter(created, { to: '2026-09-28' }))).toEqual({
      from: undefined,
      to: '2026-09-28',
    });
  });

  it('summarises active filters and computes presets', () => {
    expect(
      describeFilter(status, ['ACTIVE', 'LOCKED', 'DISABLED'], 'en', { yes: 'Yes', no: 'No' }),
    ).toBe('Active, Locked +1');
    const now = new Date(2026, 8, 28);
    expect(datePreset('last7', now)).toEqual({ from: '2026-09-22', to: '2026-09-28' });
    expect(datePreset('lastMonth', now)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });
});

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, embedded newlines, BOM and CRLF', () => {
    const text = '﻿name,note\r\n"Kebede, Abebe","said ""hi""\nthen left"\r\n\r\nሰላም,x\r\n';
    expect(parseCsv(text)).toEqual([
      ['name', 'note'],
      ['Kebede, Abebe', 'said "hi"\nthen left'],
      ['ሰላም', 'x'],
    ]);
  });

  it('detects semicolon-separated files (Excel in many locales)', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('round-trips with toCsv', () => {
    const rows = [{ a: 'x,y', b: 'line1\nline2' }];
    const csv = toCsv(rows, [
      { header: 'a', value: (r) => r.a },
      { header: 'b', value: (r) => r.b },
    ]);
    expect(parseCsv(csv)).toEqual([
      ['a', 'b'],
      ['x,y', 'line1\nline2'],
    ]);
  });
});

describe('xlsx writer', () => {
  it('names columns like Excel', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });

  it('computes standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
  });

  it('produces a ZIP container with the workbook parts', () => {
    const bytes = buildXlsx(
      ['Name', 'Count'],
      [
        ['ሰላም <&>', 3],
        [null, true],
      ],
      'Users',
    );
    const text = new TextDecoder().decode(bytes);
    expect(bytes[0]).toBe(0x50); // "PK"
    expect(bytes[1]).toBe(0x4b);
    for (const part of [
      '[Content_Types].xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'xl/styles.xml',
    ])
      expect(text).toContain(part);
    expect(text).toContain('ሰላም &lt;&amp;&gt;');
    expect(text).toContain('<v>3</v>');
    expect(text).toContain('<autoFilter ref="A1:B3"/>');
  });
});
