import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { AppEvents } from '#core/application/events/app-events.js';
import { EVENT_BUS, type EventBus } from '#core/application/ports/event-bus.port.js';
import {
  NOTIFIER,
  type NotificationDraft,
  type Notifier,
} from '#core/application/ports/notifier.port.js';
import { templates } from './notification-templates.js';

/**
 * Turns application events into notifications. Features publish facts; this is
 * the only place that decides who is told what (single responsibility).
 */
@Injectable()
export class NotificationSubscribers implements OnModuleInit, OnModuleDestroy {
  private readonly unsubscribe: Array<() => void> = [];

  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  onModuleInit(): void {
    const on = <T extends object>(name: string, build: (payload: T) => NotificationDraft | null) =>
      this.unsubscribe.push(
        this.events.subscribe<T>(name, async (event) => {
          const draft = build(event.payload);
          if (draft) await this.notifier.send(draft);
        }),
      );

    on(AppEvents.ApprovalSubmitted, templates.approvalRequested);
    on(AppEvents.ApprovalDecided, templates.approvalDecided);
    on(AppEvents.PasswordChanged, templates.passwordChanged);
    on(AppEvents.PasswordReset, templates.passwordReset);
    on(AppEvents.PasswordExpiring, templates.passwordExpiring);
    on(AppEvents.AccountLocked, templates.accountLocked);
    on(AppEvents.NewSignIn, templates.newSignIn);
    on(AppEvents.SessionEvicted, templates.sessionEvicted);
    on(AppEvents.MfaChanged, templates.mfaChanged);
    on(AppEvents.MfaRequired, templates.mfaRequired);
  }

  onModuleDestroy(): void {
    this.unsubscribe.forEach((off) => off());
  }
}
