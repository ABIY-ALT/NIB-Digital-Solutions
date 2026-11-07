import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { AppEvents, type PasswordExpiringEvent } from '#core/application/events/app-events.js';
import { CACHE_PORT, type CachePort } from '#core/application/ports/cache.port.js';
import { EVENT_BUS, type EventBus } from '#core/application/ports/event-bus.port.js';
import { JOB_SCHEDULER, type JobScheduler } from '#core/application/ports/job-scheduler.port.js';
import { daysUntil, type SecurityPolicy } from '../domain/password-policy.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';
import { SECURITY_POLICY } from './password-policy.service.js';

/**
 * Daily job: warns users whose password expires within the warning window
 * (once per user per expiry date), so nobody is surprised at sign-in.
 */
@Injectable()
export class PasswordExpiryReminder implements OnModuleInit {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SECURITY_POLICY) private readonly policy: SecurityPolicy,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(CACHE_PORT) private readonly cache: CachePort,
    @Inject(JOB_SCHEDULER) private readonly scheduler: JobScheduler,
  ) {}

  onModuleInit(): void {
    const { maxAgeDays, expiryWarningDays } = this.policy.password;
    if (maxAgeDays <= 0 || expiryWarningDays <= 0) return;
    this.scheduler.register({
      name: 'password-expiry-reminder',
      everyMs: 12 * 3_600_000,
      initialDelayMs: 2 * 60_000,
      run: () => this.run(),
    });
  }

  async run(now = new Date()): Promise<number> {
    const { maxAgeDays, expiryWarningDays } = this.policy.password;
    const day = 86_400_000;
    // Changed between (maxAge) and (maxAge - warning) days ago → expires within the window.
    const from = new Date(now.getTime() - maxAgeDays * day);
    const to = new Date(now.getTime() - (maxAgeDays - expiryWarningDays) * day);
    const due = await this.users.findPasswordsChangedBetween(from, to, 1_000);
    let sent = 0;
    for (const user of due) {
      const expiresAt = new Date(user.passwordChangedAt.getTime() + maxAgeDays * day);
      const key = `pwd-expiry-reminder:${user.id}:${expiresAt.toISOString().slice(0, 10)}`;
      if (await this.cache.get(key)) continue;
      await this.events.publish<PasswordExpiringEvent>({
        name: AppEvents.PasswordExpiring,
        payload: {
          userId: user.id,
          expiresAt: expiresAt.toISOString(),
          daysLeft: Math.max(0, daysUntil(expiresAt, now)),
        },
        actorId: null,
      });
      await this.cache.set(key, true, (expiryWarningDays + 1) * 86_400);
      sent += 1;
    }
    return sent;
  }
}
