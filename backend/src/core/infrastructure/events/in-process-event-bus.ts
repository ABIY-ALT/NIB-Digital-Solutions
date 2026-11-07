import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AppEvent, EventBus, EventHandler } from '#core/application/ports/event-bus.port.js';
import {
  REQUEST_CONTEXT,
  type RequestContextAccessor,
} from '#core/application/ports/request-context.port.js';
import { METRICS, type Metrics } from '../telemetry/metrics.js';

/**
 * In-process EventBus. Handlers run concurrently after `publish` resolves the
 * subscriber list; a failing handler is logged and counted but never affects
 * the producer or the other handlers (at-most-once, best effort).
 */
@Injectable()
export class InProcessEventBus implements EventBus {
  private readonly logger = new Logger('EventBus');
  private readonly handlers = new Map<string, Set<EventHandler>>();

  constructor(
    @Inject(REQUEST_CONTEXT) private readonly context: RequestContextAccessor,
    @Inject(METRICS) private readonly metrics: Metrics,
  ) {}

  subscribe<TPayload extends object>(name: string, handler: EventHandler<TPayload>): () => void {
    const set = this.handlers.get(name) ?? new Set<EventHandler>();
    set.add(handler as unknown as EventHandler);
    this.handlers.set(name, set);
    return () => set.delete(handler as unknown as EventHandler);
  }

  async publish<TPayload extends object>(event: AppEvent<TPayload>): Promise<void> {
    const full: Required<AppEvent<TPayload>> = {
      name: event.name,
      payload: event.payload,
      occurredAt: event.occurredAt ?? new Date(),
      correlationId: event.correlationId ?? this.context.current()?.correlationId ?? null,
      actorId: event.actorId ?? this.context.actorId(),
    };
    const targets = [...(this.handlers.get(event.name) ?? []), ...(this.handlers.get('*') ?? [])];
    this.metrics.increment('app_events_published', { event: event.name });
    await Promise.all(
      targets.map(async (handler) => {
        try {
          await handler(full as unknown as Required<AppEvent>);
        } catch (error) {
          this.metrics.increment('app_event_handler_failures', { event: event.name });
          this.logger.error(
            { err: error, event: event.name, correlationId: full.correlationId },
            'Event handler failed',
          );
        }
      }),
    );
  }
}
