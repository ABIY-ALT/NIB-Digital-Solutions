import { MemoryKeyValueStore } from '#core/infrastructure/kv/memory-key-value.store.js';
import { describeKeyValueStore } from './support/kv-store-contract.js';

// Unit test (npm test): no database needed. The PostgreSQL store runs the same
// contract against a real database in kv-store.e2e-spec.ts.
describeKeyValueStore('MemoryKeyValueStore', () => new MemoryKeyValueStore('unit:'));
