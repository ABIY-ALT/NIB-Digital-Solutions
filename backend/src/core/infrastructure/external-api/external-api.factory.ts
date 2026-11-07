import { Injectable } from '@nestjs/common';
import {
  HttpExternalApiClient,
  type ExternalApiClientOptions,
} from './http-external-api.client.js';

/**
 * Creates and caches one external API client per downstream system, so the
 * circuit breaker state is shared by every adapter talking to that system.
 */
@Injectable()
export class ExternalApiClientFactory {
  private readonly clients = new Map<string, HttpExternalApiClient>();

  create(options: ExternalApiClientOptions): HttpExternalApiClient {
    const existing = this.clients.get(options.name);
    if (existing) return existing;
    const client = new HttpExternalApiClient(options);
    this.clients.set(options.name, client);
    return client;
  }

  /** Circuit states for health / diagnostics endpoints. */
  circuitStates(): Record<string, string> {
    return Object.fromEntries([...this.clients].map(([name, c]) => [name, c.circuitState]));
  }
}
