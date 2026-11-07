import { Injectable } from '@nestjs/common';
import type {
  DocumentSource,
  DocumentSourceRegistry,
} from '#core/application/ports/document.port.js';

const KEY = /^[a-z][a-z0-9-]{1,63}$/;

/** Process-wide list of printable record types contributed by feature modules. */
@Injectable()
export class InMemoryDocumentSourceRegistry implements DocumentSourceRegistry {
  private readonly sources = new Map<string, DocumentSource>();

  register(source: DocumentSource): void {
    if (!KEY.test(source.key)) throw new Error(`Invalid document source key "${source.key}"`);
    if (this.sources.has(source.key)) {
      throw new Error(`Document source "${source.key}" is already registered`);
    }
    this.sources.set(source.key, source);
  }

  get(key: string): DocumentSource | undefined {
    return this.sources.get(key);
  }

  list(): DocumentSource[] {
    return [...this.sources.values()].sort((a, b) => a.key.localeCompare(b.key));
  }
}
