import { describe, expect, it } from 'vitest';
import { ReferenceDataItem, ReferenceDataType } from './reference-data.js';

const currencies = ReferenceDataType.create(
  {
    code: 'currencies',
    name: 'Currencies',
    attributes: [
      { key: 'symbol', label: 'Symbol', type: 'text', required: true },
      { key: 'decimals', label: 'Decimals', type: 'number', required: true },
      { key: 'kind', label: 'Kind', type: 'select', required: false, options: ['FIAT', 'METAL'] },
    ],
  },
  null,
);

describe('reference data', () => {
  it('validates and normalises item attributes against the list definition', () => {
    const item = ReferenceDataItem.create(
      currencies,
      {
        code: 'etb',
        label: 'Ethiopian Birr',
        attributes: { symbol: 'Br', decimals: '2', extra: 'x' },
      },
      null,
    );
    expect(item.code).toBe('ETB');
    expect(item.attributes).toEqual({ symbol: 'Br', decimals: 2 }); // unknown keys dropped
  });

  it('reports missing required and invalid attribute values', () => {
    expect(() =>
      ReferenceDataItem.create(
        currencies,
        { code: 'USD', label: 'Dollar', attributes: { decimals: 'x', kind: 'GAS' } },
        null,
      ),
    ).toThrowError(
      expect.objectContaining({
        details: expect.arrayContaining([
          expect.objectContaining({ field: 'attributes.symbol' }),
          expect.objectContaining({ field: 'attributes.decimals' }),
          expect.objectContaining({ field: 'attributes.kind' }),
        ]),
      }),
    );
  });

  it('keeps codes permanent and honours validity windows', () => {
    const item = ReferenceDataItem.create(
      currencies,
      {
        code: 'EUR',
        label: 'Euro',
        attributes: { symbol: '€', decimals: 2 },
        validFrom: new Date(Date.now() + 86_400_000),
      },
      null,
    );
    expect(item.isEffective(new Date())).toBe(false);
    expect(() => item.update(currencies, { code: 'EUX' }, null)).toThrow(/permanent/);
    expect(item.labelFor('am')).toBe('Euro');
  });

  it('rejects duplicate attribute keys and select lists without options', () => {
    expect(() =>
      ReferenceDataType.create(
        {
          code: 'bad-list',
          name: 'Bad',
          attributes: [
            { key: 'a', label: 'A', type: 'text', required: false },
            { key: 'a', label: 'A2', type: 'select', required: false },
          ],
        },
        null,
      ),
    ).toThrow();
  });

  it('converts boolean and date attributes, and checks dates and options', () => {
    const branches = ReferenceDataType.create(
      {
        code: 'branches',
        name: 'Branches',
        parentTypeCode: 'regions',
        attributes: [
          { key: 'open', label: 'Open', type: 'boolean', required: false },
          { key: 'since', label: 'Since', type: 'date', required: false },
          { key: 'note', label: 'Note', type: 'text', required: false },
        ],
      },
      null,
    );
    const item = ReferenceDataItem.create(
      branches,
      {
        code: 'hq',
        label: 'Head office',
        parentCode: ' aa ',
        attributes: { open: 'true', since: '2020-01-31', note: '  ground floor  ' },
      },
      null,
    );
    expect(item.attributes).toEqual({ open: true, since: '2020-01-31', note: 'ground floor' });
    expect(item.toSnapshot().parentCode).toBe('AA');

    item.update(branches, { attributes: { open: false }, parentCode: null }, 'u1');
    expect(item.attributes).toEqual({ open: false });
    expect(item.toSnapshot().parentCode).toBeNull();

    expect(() => item.update(branches, { attributes: { since: '31/01/2020' } }, null)).toThrowError(
      expect.objectContaining({
        details: [
          expect.objectContaining({
            field: 'attributes.since',
            message: expect.stringMatching(/date/),
          }),
        ],
      }),
    );
  });

  it('rejects bad codes, labels, locales, validity windows and parents', () => {
    expect(() =>
      ReferenceDataItem.create(
        currencies,
        {
          code: 'bad code!',
          label: ' ',
          labels: { am: 'ብር', 'not a locale': 'x', fr: ' ' },
          validFrom: new Date('2026-02-01'),
          validTo: new Date('2026-01-01'),
          parentCode: 'AA',
          attributes: { symbol: 'Br', decimals: 2 },
        },
        null,
      ),
    ).toThrowError(
      expect.objectContaining({
        details: expect.arrayContaining([
          expect.objectContaining({ field: 'code' }),
          expect.objectContaining({ field: 'label' }),
          expect.objectContaining({ field: 'labels' }),
          expect.objectContaining({ field: 'validTo' }),
          expect.objectContaining({ field: 'parentCode', message: 'This list has no parent list' }),
        ]),
      }),
    );
  });

  it('updates details and translations, dropping blank ones', () => {
    const item = ReferenceDataItem.create(
      currencies,
      { code: 'USD', label: 'Dollar', attributes: { symbol: '$', decimals: 2 } },
      null,
    );
    item.update(
      currencies,
      {
        code: 'usd',
        labels: { am: ' ዶላር ', fr: ' ' },
        description: '  US dollar ',
        sortOrder: 4,
        active: false,
      },
      'u1',
    );
    const snapshot = item.toSnapshot();
    expect(snapshot).toMatchObject({
      labels: { am: 'ዶላር' },
      description: 'US dollar',
      sortOrder: 4,
      active: false,
    });
    expect(item.labelFor('am')).toBe('ዶላር');
    expect(item.labelFor(null)).toBe('Dollar');
    item.update(currencies, { description: '' }, null);
    expect(item.toSnapshot().description).toBeNull();
  });
});
