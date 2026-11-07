import { Injectable } from '@nestjs/common';
import type {
  OptionSource,
  OptionSourceRegistry,
} from '#core/application/ports/option-source.port.js';

const KEY = /^[a-z][a-z0-9-]{1,63}$/;

/** Process-wide list of record-picker sources contributed by feature modules. */
@Injectable()
export class InMemoryOptionSourceRegistry implements OptionSourceRegistry {
  private readonly sources = new Map<string, OptionSource>();

  register(source: OptionSource): void {
    if (!KEY.test(source.key)) throw new Error(`Invalid option source key "${source.key}"`);
    if (this.sources.has(source.key)) {
      throw new Error(`Option source "${source.key}" is already registered`);
    }
    this.sources.set(source.key, source);
  }

  get(key: string): OptionSource | undefined {
    return this.sources.get(key);
  }

  list(): OptionSource[] {
    return [...this.sources.values()].sort((a, b) => a.key.localeCompare(b.key));
  }
}
