import type { OptionSource } from '#core/application/ports/option-source.port.js';
import { InMemoryOptionSourceRegistry } from './option-source-registry.js';

describe('InMemoryOptionSourceRegistry', () => {
  const source = (key: string): OptionSource => ({
    key,
    permissions: [],
    find: () => Promise.reject(new Error('unused')),
  });

  it('registers, looks up and lists sources by key', () => {
    const registry = new InMemoryOptionSourceRegistry();
    registry.register(source('users'));
    registry.register(source('roles'));
    expect(registry.get('roles')?.key).toBe('roles');
    expect(registry.get('nope')).toBeUndefined();
    expect(registry.list().map((s) => s.key)).toEqual(['roles', 'users']);
  });

  it('rejects duplicate and malformed keys', () => {
    const registry = new InMemoryOptionSourceRegistry();
    registry.register(source('roles'));
    expect(() => registry.register(source('roles'))).toThrow(/already registered/);
    expect(() => registry.register(source('Bad Key'))).toThrow(/Invalid/);
  });
});
