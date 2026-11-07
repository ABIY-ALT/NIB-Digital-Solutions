import type { CachePort } from '#core/application/ports/cache.port.js';
import type { RequestContextData } from '#core/application/ports/request-context.port.js';
import { formatsFrom, type SettingValue } from '#core/application/ports/settings.port.js';
import { formatDate, formatMoney, formatNumber } from '#core/application/formatting.js';
import { ValidationError } from '#core/domain/errors/app-error.js';
import { SettingsService, type SettingStore, type StoredSetting } from './settings.service.js';

function setup() {
  const rows = new Map<string, StoredSetting>();
  const store: SettingStore = {
    findAll: () => Promise.resolve([...rows.values()]),
    save: (values, remove, actorId) => {
      for (const [key, value] of Object.entries(values)) {
        rows.set(key, { key, value, updatedAt: new Date(), updatedBy: actorId });
      }
      remove.forEach((key) => rows.delete(key));
      return Promise.resolve();
    },
  };
  const cached = new Map<string, unknown>();
  const cache = {
    wrap: async <T>(key: string, _ttl: number, load: () => Promise<T>): Promise<T> => {
      if (!cached.has(key)) cached.set(key, await load());
      return cached.get(key) as T;
    },
    delete: (key: string) => {
      cached.delete(key);
      return Promise.resolve();
    },
  } as unknown as CachePort;
  const ctx = { correlationId: 'c', changes: [] } as unknown as RequestContextData;
  const context = { current: () => ctx, correlationId: () => 'c', actorId: () => 'u1' };
  return { service: new SettingsService(store, cache, context), rows, ctx };
}

describe('SettingsService', () => {
  it('returns defaults until a value is stored', async () => {
    const { service } = setup();
    expect(await service.string('company.name')).toBe('NIB International Bank');
    expect(await service.number('format.decimals')).toBe(2);
  });

  it('stores only what differs from the default and records the change', async () => {
    const { service, rows, ctx } = setup();
    await service.update({ 'company.name': '  Acme Bank ', 'format.decimals': 2 }, 'u1');
    expect([...rows.keys()]).toEqual(['company.name']);
    expect(await service.string('company.name')).toBe('Acme Bank');
    expect(ctx.changes).toEqual([
      expect.objectContaining({
        resourceType: 'Setting',
        resourceId: 'company',
        fields: [{ field: 'company.name', before: 'NIB International Bank', after: 'Acme Bank' }],
      }),
    ]);
  });

  it('goes back to the default when the default (or null) is saved', async () => {
    const { service, rows } = setup();
    await service.update({ 'format.decimals': 0 }, 'u1');
    expect(await service.number('format.decimals')).toBe(0);
    await service.update({ 'format.decimals': null }, 'u1');
    expect(rows.size).toBe(0);
    expect(await service.number('format.decimals')).toBe(2);
  });

  it('rejects unknown keys and invalid values with field issues', async () => {
    const { service, rows } = setup();
    const attempt = service.update(
      {
        'company.nope': 'x',
        'company.name': '',
        'company.email': 'not-an-email',
        'format.decimals': 9,
        'format.dateFormat': 'YY',
        'documents.accentColor': 'red',
        'company.logo': 'data:text/html;base64,AAAA',
      },
      'u1',
    );
    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    const issues = await attempt.then(
      () => [],
      (e: ValidationError) => e.details as { field: string }[],
    );
    expect(issues.map((i) => i.field).sort()).toEqual([
      'company.email',
      'company.logo',
      'company.name',
      'company.nope',
      'documents.accentColor',
      'format.dateFormat',
      'format.decimals',
    ]);
    expect(rows.size).toBe(0);
  });

  it('exposes only public settings to ordinary users', async () => {
    const { service } = setup();
    const keys = Object.keys(await service.publicValues());
    expect(keys).toContain('format.currencyCode');
    expect(keys).toContain('company.name');
    expect(keys).not.toContain('mail.replyTo');
    expect(keys).not.toContain('company.taxNumber');
  });

  it('lets a feature define its own settings once', async () => {
    const { service } = setup();
    const definition = {
      key: 'loans.maxTenorMonths',
      group: 'loans',
      type: 'number' as const,
      label: 'Longest tenor',
      default: 60,
      min: 1,
    };
    service.define([definition]);
    expect(await service.number('loans.maxTenorMonths')).toBe(60);
    expect(() => service.define([definition])).toThrow(/already defined/);
    expect(() => service.define([{ ...definition, key: 'other.x' }])).toThrow(
      /Invalid setting key/,
    );
  });
});

describe('formatting', () => {
  const values = (overrides: Record<string, SettingValue> = {}) => formatsFrom(overrides);

  it('formats money with the product settings', () => {
    expect(formatMoney(1234567.5, values())).toBe('ETB 1,234,567.50');
    expect(
      formatMoney(
        -1234.5,
        values({
          'format.currencyPosition': 'after',
          'format.decimalSeparator': ',',
          'format.thousandSeparator': 'space',
        }),
      ),
    ).toBe('-1 234,50 ETB');
    expect(formatMoney(10, values({ 'format.decimals': 0 }), 'USD')).toBe('USD 10');
  });

  it('never prints a negative zero', () => {
    expect(formatNumber(-0.001, values(), 2)).toBe('0.00');
  });

  it('formats dates in the product time zone', () => {
    const late = '2026-03-09T22:30:00Z'; // already 10 March in Addis Ababa (UTC+3)
    expect(formatDate(late, values())).toBe('10/03/2026');
    expect(formatDate(late, values({ 'format.dateFormat': 'YYYY-MM-DD' }), true)).toBe(
      '2026-03-10 01:30',
    );
    expect(formatDate('nope', values())).toBe('');
    expect(formatDate(late, values({ 'format.timeZone': 'Not/AZone' }))).toBe('09/03/2026');
  });
});
