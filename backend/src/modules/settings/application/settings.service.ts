import { Inject, Injectable } from '@nestjs/common';
import { trackChange } from '#core/application/audit-changes.js';
import { CACHE_PORT, type CachePort } from '#core/application/ports/cache.port.js';
import {
  REQUEST_CONTEXT,
  type RequestContextAccessor,
} from '#core/application/ports/request-context.port.js';
import type {
  SettingDefinition,
  Settings,
  SettingValue,
} from '#core/application/ports/settings.port.js';
import { NotFoundError, ValidationError } from '#core/domain/errors/app-error.js';
import {
  assertDefinition,
  CORE_SETTINGS,
  normaliseSetting,
  validateSettings,
} from './setting-definitions.js';

export interface StoredSetting {
  key: string;
  value: SettingValue;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface SettingStore {
  findAll(): Promise<StoredSetting[]>;
  /** Writes the given values; a key in `remove` goes back to its default. */
  save(
    values: Record<string, SettingValue>,
    remove: readonly string[],
    actorId: string | null,
  ): Promise<void>;
}

export const SETTING_STORE = Symbol('SettingStore');

const CACHE_KEY = 'settings:values';
/** Other instances pick up a change within this time (this one sees it at once). */
const CACHE_TTL_SECONDS = 60;

/**
 * Runtime settings: the definitions registry plus the stored values. Reads go
 * through the cache; a save validates every value against its definition,
 * stores only what differs from the default and records the change for audit.
 */
@Injectable()
export class SettingsService implements Settings {
  private readonly registry = new Map<string, SettingDefinition>();

  constructor(
    @Inject(SETTING_STORE) private readonly store: SettingStore,
    @Inject(CACHE_PORT) private readonly cache: CachePort,
    @Inject(REQUEST_CONTEXT) private readonly context: RequestContextAccessor,
  ) {
    this.define(CORE_SETTINGS);
  }

  define(definitions: readonly SettingDefinition[]): void {
    for (const definition of definitions) {
      assertDefinition(definition);
      if (this.registry.has(definition.key)) {
        throw new Error(`Setting "${definition.key}" is already defined`);
      }
      this.registry.set(definition.key, definition);
    }
  }

  definitions(): SettingDefinition[] {
    return [...this.registry.values()];
  }

  async all(): Promise<Record<string, SettingValue>> {
    const stored = await this.cache.wrap(CACHE_KEY, CACHE_TTL_SECONDS, async () =>
      Object.fromEntries((await this.store.findAll()).map((s) => [s.key, s.value])),
    );
    return Object.fromEntries(
      this.definitions().map((d) => [d.key, d.key in stored ? stored[d.key]! : d.default]),
    );
  }

  async get(key: string): Promise<SettingValue> {
    if (!this.registry.has(key)) throw new NotFoundError('Setting', key);
    return (await this.all())[key] ?? null;
  }

  async string(key: string): Promise<string> {
    const value = await this.get(key);
    return value === null ? '' : String(value);
  }

  async number(key: string): Promise<number> {
    const value = await this.get(key);
    return typeof value === 'number' ? value : Number(value ?? 0);
  }

  async boolean(key: string): Promise<boolean> {
    return (await this.get(key)) === true;
  }

  /** Values every signed-in user may read (branding, formats). */
  async publicValues(): Promise<Record<string, SettingValue>> {
    const values = await this.all();
    return Object.fromEntries(
      this.definitions()
        .filter((d) => d.public)
        .map((d) => [d.key, values[d.key] ?? null]),
    );
  }

  /** Applies a partial update and returns every effective value. */
  async update(
    changes: Record<string, SettingValue>,
    actorId: string | null,
  ): Promise<Record<string, SettingValue>> {
    const issues = validateSettings(this.registry, changes);
    if (issues.length) throw new ValidationError(issues);

    const before = await this.all();
    const save: Record<string, SettingValue> = {};
    const remove: string[] = [];
    for (const [key, raw] of Object.entries(changes)) {
      const definition = this.registry.get(key)!;
      const value = normaliseSetting(definition, raw);
      if (value === before[key]) continue;
      // null always means "back to the default".
      if (value === null || value === definition.default) remove.push(key);
      else save[key] = value;
    }
    const changed = [...Object.keys(save), ...remove];
    if (changed.length === 0) return before;

    await this.store.save(save, remove, actorId);
    await this.cache.delete(CACHE_KEY);
    const after = await this.all();

    // One audit change per group, so the trail reads "Company: name, address".
    for (const group of new Set(changed.map((key) => this.registry.get(key)!.group))) {
      const keys = changed.filter((key) => this.registry.get(key)!.group === group);
      trackChange(this.context.current(), {
        resourceType: 'Setting',
        resourceId: group,
        before: snapshot(keys, before, this.registry),
        after: snapshot(keys, after, this.registry),
      });
    }
    return after;
  }
}

/** Images are recorded as "set" / "not set": the audit trail must stay small. */
function snapshot(
  keys: readonly string[],
  values: Record<string, SettingValue>,
  registry: ReadonlyMap<string, SettingDefinition>,
): Record<string, unknown> {
  return Object.fromEntries(
    keys.map((key) => {
      const value = values[key] ?? null;
      if (registry.get(key)?.type !== 'image') return [key, value];
      return [key, value ? '(image)' : null];
    }),
  );
}
