import { Global, Module } from '@nestjs/common';
import { SESSION_TERMINATOR } from '#core/application/ports/session-terminator.port.js';
import { SESSION_STORE } from './application/ports/auth.ports.js';
import { KeyValueSessionStore } from './infrastructure/kv-session.store.js';

/**
 * Session storage, global so that any feature (e.g. users) can terminate
 * sessions through the SessionTerminator port without importing AuthModule.
 */
@Global()
@Module({
  providers: [
    KeyValueSessionStore,
    { provide: SESSION_STORE, useExisting: KeyValueSessionStore },
    { provide: SESSION_TERMINATOR, useExisting: KeyValueSessionStore },
  ],
  exports: [SESSION_STORE, SESSION_TERMINATOR],
})
export class SessionModule {}
