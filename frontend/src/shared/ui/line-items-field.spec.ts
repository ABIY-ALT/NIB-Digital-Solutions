import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import shared from '@/shared/i18n/en.json';
import { lineAmount, lineTotals } from '@/shared/lib/line-items';
import { LineItemsField, type LineItemsFieldProps } from './line-items-field';

interface Values {
  items: Array<{ description: string; quantity: number | null; price: number | null }>;
}

function Harness({
  items,
  ...props
}: { items: Values['items'] } & Partial<LineItemsFieldProps<Values, 'items'>>) {
  const form = useForm<Values>({ defaultValues: { items } });
  return createElement(FormProvider<Values>, {
    ...form,
    children: createElement(LineItemsField<Values, 'items'>, {
      name: 'items',
      label: 'Items',
      newRow: () => ({ description: '', quantity: 1, price: null }),
      columns: [
        { key: 'description', label: 'Description', type: 'text', width: '3fr' },
        { key: 'quantity', label: 'Qty', type: 'number', align: 'end' },
        { key: 'price', label: 'Price', type: 'number', align: 'end' },
        {
          key: 'amount',
          label: 'Amount',
          type: 'computed',
          compute: (row) => lineAmount(row).toFixed(2),
        },
      ],
      summary: (rows) => [
        { label: 'Total', value: lineTotals(rows).total.toFixed(2), emphasis: true },
      ],
      ...props,
    }),
  });
}

const render = (node: ReactElement) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale: 'en', messages: shared, children: node }),
  );

const rows = [
  { description: 'Cards', quantity: 2, price: 1250 },
  { description: 'Support', quantity: 6, price: 480.5 },
];

describe('LineItemsField', () => {
  it('renders one group per row with bound inputs, computed amounts and the total', () => {
    const html = render(createElement(Harness, { items: rows }));
    expect(html.match(/<fieldset /g)).toHaveLength(2);
    expect(html).toContain('name="items.0.description"');
    expect(html).toContain('name="items.1.price"');
    expect(html).toContain('value="480.5"');
    expect(html).toContain('2500.00');
    expect(html).toContain('2883.00');
    expect(html).toContain('5383.00');
    expect(html).toContain('aria-label="Remove row 2"');
    expect(html).toContain('Add row');
  });

  it('shows an empty state and leaves empty number cells blank', () => {
    expect(render(createElement(Harness, { items: [] }))).toContain('No rows yet.');
    const html = render(
      createElement(Harness, { items: [{ description: '', quantity: null, price: null }] }),
    );
    expect(html).toContain('name="items.0.quantity"');
    expect(html).not.toContain('value="null"');
  });

  it('locks removal at the minimum and adding at the maximum', () => {
    const html = render(createElement(Harness, { items: rows, minRows: 2, maxRows: 2 }));
    // Two remove buttons and the add button are all disabled.
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });

  it('disables every control when the field is disabled', () => {
    const html = render(createElement(Harness, { items: rows, disabled: true }));
    // 2 rows × 3 inputs + 2 remove buttons + add.
    expect(html.match(/disabled=""/g)).toHaveLength(9);
  });
});
