import { roundMoney } from './money';

/**
 * Totals of a master–detail form (invoice, order, journal): each line is
 * quantity × price, then a discount and a tax on the whole. Every figure is
 * rounded to the currency's decimals, so what the form shows is what a
 * document prints and what the server should recompute and store.
 */
export interface LineAmount {
  quantity?: number | null;
  price?: number | null;
}

export interface TotalsOptions {
  /** Percentage taken off the subtotal (0–100). */
  discountRate?: number | null;
  /** Percentage added to the discounted amount (e.g. 15 for VAT). */
  taxRate?: number | null;
  /** Decimals of the currency (default 2). */
  decimals?: number;
}

export interface LineTotals {
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
}

const num = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** quantity × price of one line (empty cells count as 0). */
export function lineAmount(line: LineAmount, decimals = 2): number {
  return roundMoney(num(line.quantity) * num(line.price), decimals);
}

export function lineTotals(lines: readonly LineAmount[], options: TotalsOptions = {}): LineTotals {
  const decimals = options.decimals ?? 2;
  const subtotal = roundMoney(
    lines.reduce((sum, line) => sum + lineAmount(line, decimals), 0),
    decimals,
  );
  const discount = roundMoney((subtotal * num(options.discountRate)) / 100, decimals);
  const taxable = roundMoney(subtotal - discount, decimals);
  const tax = roundMoney((taxable * num(options.taxRate)) / 100, decimals);
  return { subtotal, discount, taxable, tax, total: roundMoney(taxable + tax, decimals) };
}
