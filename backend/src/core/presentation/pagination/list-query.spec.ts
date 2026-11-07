import { ValidationError } from '#core/domain/errors/app-error.js';
import { parseListQuery } from './list-query.js';

const spec = {
  sortable: ['createdAt', 'username'],
  filterable: ['status', 'createdAt'],
  searchable: true,
};

describe('parseListQuery', () => {
  it('applies defaults', () => {
    expect(parseListQuery({}, spec)).toEqual({
      page: 1,
      pageSize: 20,
      sort: [],
      search: undefined,
      filters: [],
    });
  });

  it('parses sort, search and filters', () => {
    const r = parseListQuery(
      {
        page: '2',
        pageSize: '50',
        sort: '-createdAt,username:asc',
        search: ' abe ',
        'filter[status]': 'in:ACTIVE,LOCKED',
        'filter[createdAt]': 'gte:2025-01-01',
      },
      spec,
    );
    expect(r.page).toBe(2);
    expect(r.pageSize).toBe(50);
    expect(r.sort).toEqual([
      { field: 'createdAt', direction: 'desc' },
      { field: 'username', direction: 'asc' },
    ]);
    expect(r.search).toBe('abe');
    expect(r.filters).toEqual([
      { field: 'status', operator: 'in', value: ['ACTIVE', 'LOCKED'] },
      { field: 'createdAt', operator: 'gte', value: '2025-01-01' },
    ]);
  });

  it('expands between:from,to into gte/lte (open-ended allowed)', () => {
    const spec = { sortable: [], filterable: ['createdAt'] };
    expect(
      parseListQuery({ 'filter[createdAt]': 'between:2026-01-01,2026-01-31' }, spec).filters,
    ).toEqual([
      { field: 'createdAt', operator: 'gte', value: '2026-01-01' },
      { field: 'createdAt', operator: 'lte', value: '2026-01-31' },
    ]);
    expect(parseListQuery({ 'filter[createdAt]': 'between:,2026-01-31' }, spec).filters).toEqual([
      { field: 'createdAt', operator: 'lte', value: '2026-01-31' },
    ]);
    expect(() => parseListQuery({ 'filter[createdAt]': 'between:,' }, spec)).toThrow();
  });

  it('treats a value with a colon but no known operator as eq', () => {
    const r = parseListQuery({ 'filter[status]': 'ACTIVE' }, spec);
    expect(r.filters[0]).toEqual({ field: 'status', operator: 'eq', value: 'ACTIVE' });
  });

  it('rejects unknown sort/filter fields and oversized pages', () => {
    expect(() => parseListQuery({ sort: 'password' }, spec)).toThrow(ValidationError);
    expect(() => parseListQuery({ 'filter[passwordHash]': 'x' }, spec)).toThrow(ValidationError);
    expect(() => parseListQuery({ pageSize: '1000' }, spec)).toThrow(ValidationError);
  });

  it('reports bad sort directions, unsupported or long searches and long filter values', () => {
    const issues = (query: Record<string, unknown>, given = spec) => {
      try {
        parseListQuery(query, given);
        return [];
      } catch (error) {
        return (error as ValidationError).details as Array<{ field: string; message: string }>;
      }
    };
    expect(issues({ sort: 'username:sideways' })).toEqual([
      { field: 'sort', message: 'invalid direction "sideways"' },
    ]);
    expect(issues({ search: 'x' }, { ...spec, searchable: false })).toEqual([
      { field: 'search', message: 'search is not supported here' },
    ]);
    expect(issues({ search: 'x'.repeat(101) })).toEqual([
      { field: 'search', message: 'must be at most 100 characters' },
    ]);
    expect(issues({ 'filter[status]': `eq:${'x'.repeat(201)}` })).toEqual([
      { field: 'filter[status]', message: 'value too long' },
    ]);
  });

  it('accepts qs-style nested filters', () => {
    expect(
      parseListQuery({ filter: { status: ['ACTIVE', 'LOCKED'], createdAt: undefined } }, spec)
        .filters,
    ).toEqual([{ field: 'status', operator: 'eq', value: 'ACTIVE' }]);
    expect(() => parseListQuery({ filter: { secret: 'x' } }, spec)).toThrow(ValidationError);
  });
});
