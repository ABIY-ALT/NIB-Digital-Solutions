import { Injectable } from '@nestjs/common';
import type { RetentionPolicy, RetentionRegistry } from '#core/application/ports/retention.port.js';

/** Process-wide list of retention policies contributed by feature modules. */
@Injectable()
export class InMemoryRetentionRegistry implements RetentionRegistry {
  private readonly policies = new Map<string, RetentionPolicy>();

  register(policy: RetentionPolicy): void {
    if (this.policies.has(policy.id)) {
      throw new Error(`Retention policy "${policy.id}" is already registered`);
    }
    this.policies.set(policy.id, policy);
  }

  list(): RetentionPolicy[] {
    return [...this.policies.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
}
