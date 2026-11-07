import { describe, expect, it } from 'vitest';
import { parseListParams, withListDefaults } from '@/shared/lib/list-params';
import { pageNumbers, pageSizeChoices } from './pagination';

describe('pageNumbers', () => {
  it('lists every page when there are few', () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps first, last and the neighbours of the current page', () => {
    expect(pageNumbers(1, 50)).toEqual([1, 2, 'gap', 50]);
    expect(pageNumbers(25, 50)).toEqual([1, 'gap', 24, 25, 26, 'gap', 50]);
    expect(pageNumbers(50, 50)).toEqual([1, 'gap', 49, 50]);
  });

  it('widens with more siblings', () => {
    expect(pageNumbers(25, 50, 2)).toEqual([1, 'gap', 23, 24, 25, 26, 27, 'gap', 50]);
    expect(pageNumbers(25, 50, 0)).toEqual([1, 'gap', 25, 'gap', 50]);
  });
});

describe('pageSizeChoices', () => {
  it('always offers the size in use, sorted and without duplicates', () => {
    expect(pageSizeChoices([10, 20, 50], 20)).toEqual([10, 20, 50]);
    expect(pageSizeChoices([50, 10, 20], 25)).toEqual([10, 20, 25, 50]);
  });
});

describe('withListDefaults', () => {
  const product = { pageSize: 30, maxPageSize: 60 };

  it('uses the product page size and limit when the list sets none', () => {
    const defaults = withListDefaults(product);
    expect(parseListParams(new URLSearchParams(''), defaults).pageSize).toBe(30);
    expect(parseListParams(new URLSearchParams('pageSize=500'), defaults).pageSize).toBe(60);
  });

  it('lets a list override both', () => {
    const defaults = withListDefaults(product, { pageSize: 100, maxPageSize: 200 });
    expect(parseListParams(new URLSearchParams(''), defaults).pageSize).toBe(100);
    expect(parseListParams(new URLSearchParams('pageSize=500'), defaults).pageSize).toBe(200);
  });
});
