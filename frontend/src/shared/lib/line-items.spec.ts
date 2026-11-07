import { describe, expect, it } from 'vitest';
import { lineAmount, lineTotals } from './line-items';
import { formatAmount, formatMoneyWith, moneyFormatFrom, roundMoney } from './money';

describe('line item totals', () => {
  it('multiplies quantity by price and treats empty cells as zero', () => {
    expect(lineAmount({ quantity: 3, price: 19.99 })).toBe(59.97);
    expect(lineAmount({ quantity: null, price: 10 })).toBe(0);
    expect(lineAmount({ quantity: 2 })).toBe(0);
    expect(lineAmount({ quantity: Number.NaN, price: 5 })).toBe(0);
  });

  it('applies the discount before the tax and rounds every figure', () => {
    const totals = lineTotals(
      [
        { quantity: 2, price: 1250 },
        { quantity: 6, price: 480.5 },
        { quantity: 1, price: 0.335 },
      ],
      { discountRate: 10, taxRate: 15 },
    );
    expect(totals).toEqual({
      subtotal: 5383.34,
      discount: 538.33,
      taxable: 4845.01,
      tax: 726.75,
      total: 5571.76,
    });
  });

  it('follows the decimals of the currency', () => {
    expect(lineTotals([{ quantity: 3, price: 0.4 }], { taxRate: 15, decimals: 0 })).toMatchObject({
      subtotal: 1,
      tax: 0,
      total: 1,
    });
  });

  it('is zero for no lines', () => {
    expect(lineTotals([]).total).toBe(0);
  });
});

describe('money format', () => {
  it('rounds half up without binary drift', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(10.4, 0)).toBe(10);
  });

  it('formats with the product settings and falls back to defaults', () => {
    expect(formatMoneyWith(1234567.5)).toBe('ETB 1,234,567.50');
    expect(moneyFormatFrom(undefined).currencyCode).toBe('ETB');
    const format = moneyFormatFrom({
      'format.currencyCode': 'USD',
      'format.currencyPosition': 'after',
      'format.decimalSeparator': ',',
      'format.thousandSeparator': 'dot',
      'format.decimals': 3,
    });
    expect(formatMoneyWith(-1234.5, format)).toBe('-1.234,500 USD');
    expect(formatMoneyWith(5, format, '')).toBe('5,000');
  });

  it('never prints a negative zero or a non-number', () => {
    expect(formatAmount(-0.001, undefined, 2)).toBe('0.00');
    expect(formatAmount(Number.NaN)).toBe('');
  });
});
