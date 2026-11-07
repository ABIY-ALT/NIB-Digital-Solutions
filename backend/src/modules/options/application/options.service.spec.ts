import { pageOptions } from '#core/application/option-paging.js';
import {
  option,
  type OptionSource,
  type OptionSourceRegistry,
} from '#core/application/ports/option-source.port.js';
import type { Principal } from '#core/application/security/principal.js';
import { ForbiddenError, NotFoundError } from '#core/domain/errors/app-error.js';
import { AuthorizationService } from '#modules/authorization/application/authorization.service.js';
import { OptionsService } from './options.service.js';

const principal = (permissions: string[]): Principal => ({
  userId: 'u1',
  username: 'u1',
  sessionId: 's1',
  roles: [],
  permissions,
  attributes: {},
  mfaVerified: false,
  authMethod: 'password',
});

const branches = [
  option('HQ', 'Head Office'),
  option('ADD01', 'Bole Branch', { description: 'Addis Ababa' }),
  option('ADD02', 'Piassa Branch', { description: 'Addis Ababa' }),
  option('BHD01', 'Bahir Dar Branch'),
  option('OLD01', 'Old Branch', { disabled: true }),
];

describe('pageOptions', () => {
  it('pages in source order', () => {
    const page = pageOptions(branches, { page: 2, pageSize: 2 });
    expect(page.items.map((o) => o.value)).toEqual(['ADD02', 'BHD01']);
    expect(page).toMatchObject({ totalItems: 5, totalPages: 3, hasNextPage: true });
  });

  it('matches every word across label, value and description, label prefixes first', () => {
    expect(pageOptions(branches, { page: 1, pageSize: 10, search: 'addis pia' }).items).toEqual([
      branches[2],
    ]);
    const ranked = pageOptions(branches, { page: 1, pageSize: 10, search: 'b' }).items;
    expect(ranked.map((o) => o.value).slice(0, 2)).toEqual(['ADD01', 'BHD01']);
  });

  it('ignores accents and case', () => {
    const items = [option('X', 'Café Branch')];
    expect(pageOptions(items, { page: 1, pageSize: 5, search: 'CAFE' }).items).toHaveLength(1);
  });

  it('resolves values regardless of paging', () => {
    const page = pageOptions(branches, { page: 3, pageSize: 1, values: ['OLD01', 'HQ', 'NOPE'] });
    expect(page.items.map((o) => o.value)).toEqual(['HQ', 'OLD01']);
    expect(page.totalItems).toBe(2);
  });
});

describe('OptionsService', () => {
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const authz = new AuthorizationService(audit);
  const sources = new Map<string, OptionSource>();
  const registry: OptionSourceRegistry = {
    register: (s) => void sources.set(s.key, s),
    get: (key) => sources.get(key),
    list: () => [...sources.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
  const find = vi.fn(() => Promise.resolve(pageOptions(branches, { page: 1, pageSize: 20 })));
  const guarded: OptionSource = { key: 'roles', permissions: ['roles:read', 'users:create'], find };
  const variants: OptionSource = { key: 'refdata', permissions: [], requiresVariant: true, find };
  registry.register(guarded);
  registry.register(variants);
  const service = new OptionsService(registry, authz);
  const request = { page: 1, pageSize: 20 };

  beforeEach(() => find.mockClear());

  it('allows a caller holding any of the permissions', async () => {
    await service.find(principal(['users:create']), 'roles', request);
    expect(find).toHaveBeenCalledWith(expect.anything(), request, undefined);
  });

  it('denies (and audits) callers without a permission', async () => {
    await expect(service.find(principal(['audit:read']), 'roles', request)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTHZ_DENIED' }));
    expect(find).not.toHaveBeenCalled();
  });

  it('splits the variant and enforces requiresVariant', async () => {
    await service.find(principal([]), 'refdata.branches', request);
    expect(find).toHaveBeenCalledWith(expect.anything(), request, 'branches');
    await expect(service.find(principal([]), 'refdata', request)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.find(principal(['*']), 'roles.x', request)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.find(principal(['*']), 'nope', request)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('lists only the sources the caller may use', () => {
    expect(service.available(principal([])).map((s) => s.key)).toEqual(['refdata']);
    expect(service.available(principal(['roles:read'])).map((s) => s.key)).toEqual([
      'refdata',
      'roles',
    ]);
  });
});
