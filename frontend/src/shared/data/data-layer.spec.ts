import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@/shared/errors/api-client-error';
import { csvCell, toCsv } from '@/shared/lib/csv';
import { parseListParams, toSearchParams } from '@/shared/lib/list-params';
import { toListQuery } from '@/shared/types';
import { shouldRetry } from './query-client';
import { defineResource, normaliseParams, resourceUrl, toPaginated } from './resource';

const users = defineResource<{ id: string }>({
  name: 'users',
  apiPath: '/api/users/',
  backendPath: '/users',
  listDefaults: { pageSize: 20, sort: [{ field: 'createdAt', direction: 'desc' }] },
});

describe('parseListParams', () => {
  it('parses page, size, search, sort and filters', () => {
    const q = new URLSearchParams(
      'page=3&pageSize=50&search=abebe&sort=name:asc,createdAt:desc&filter[status]=ACTIVE',
    );
    expect(parseListParams(q)).toEqual({
      page: 3,
      pageSize: 50,
      search: 'abebe',
      sort: [
        { field: 'name', direction: 'asc' },
        { field: 'createdAt', direction: 'desc' },
      ],
      filters: { status: 'ACTIVE' },
    });
  });

  it('applies defaults and bounds untrusted input', () => {
    const p = parseListParams(new URLSearchParams('page=-4&pageSize=100000&sort=;drop:asc'), {
      ...users.listDefaults,
      maxPageSize: 100,
    });
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(100);
    expect(p.sort).toEqual(users.listDefaults.sort); // invalid field names are discarded
  });

  it('accepts Next.js searchParams objects', () => {
    expect(
      parseListParams(toSearchParams({ page: '2', 'filter[role]': ['ADMIN'] })).filters,
    ).toEqual({ role: 'ADMIN' });
  });
});

describe('resource definitions', () => {
  it('builds hierarchical query keys', () => {
    expect(users.keys.all).toEqual(['users']);
    expect(users.keys.detail('42')).toEqual(['users', 'detail', '42']);
    expect(users.keys.list({ page: 1, pageSize: 20 }).slice(0, 2)).toEqual(users.keys.lists());
  });

  it('normalises params so equivalent lists share one cache entry (server prefetch == browser)', () => {
    const fromBrowser = parseListParams(new URLSearchParams(''), users.listDefaults);
    const fromServer = parseListParams(toSearchParams({}), users.listDefaults);
    expect(users.keys.list(fromBrowser)).toEqual(users.keys.list(fromServer));
    expect(normaliseParams({ page: 1, search: '  ', filters: { status: '' } })).toEqual({
      page: 1,
      pageSize: undefined,
    });
  });

  it('round-trips list params through the backend query syntax', () => {
    const p = parseListParams(
      new URLSearchParams('sort=name:desc&filter[status]=LOCKED&search=x'),
      users.listDefaults,
    );
    expect(parseListParams(toListQuery(normaliseParams(p)), users.listDefaults)).toEqual(p);
  });

  it('maps envelopes to Paginated and builds safe URLs', () => {
    expect(toPaginated({ data: [{ id: 'a' }] }).pagination.totalItems).toBe(1);
    expect(resourceUrl(users, 'a/b', 'unlock')).toBe('/api/users/a%2Fb/unlock');
  });
});

describe('shouldRetry', () => {
  const err = (status: number, code = 'X') => new ApiClientError({ code, message: 'm', status });
  it('retries transient failures only', () => {
    expect(shouldRetry(0, err(503))).toBe(true);
    expect(shouldRetry(0, err(0, 'NETWORK_ERROR'))).toBe(true);
    expect(shouldRetry(0, err(429))).toBe(true);
    expect(shouldRetry(2, err(503))).toBe(false);
    expect(shouldRetry(0, err(400))).toBe(false);
    expect(shouldRetry(0, err(403))).toBe(false);
    expect(shouldRetry(0, err(0, 'ABORTED'))).toBe(false);
  });
});

describe('csv', () => {
  it('escapes RFC 4180 specials and neutralises spreadsheet formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+251911')).toBe("'+251911");
    expect(csvCell(-5)).toBe('-5'); // numbers are data, not formulas
    expect(toCsv([{ n: 'ሰላም' }], [{ header: 'Name', value: (r) => r.n }])).toBe('Name\r\nሰላም');
  });
});
