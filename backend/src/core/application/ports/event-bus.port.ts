/**
 * Application events: facts that already happened ("approval.submitted",
 * "security.password-changed"). Producers publish them AFTER their transaction
 * commits; subscribers (notifications, integrations, projections) react
 * independently, so features never import each other to cooperate.
 *
 *   events.publish({ name: 'approval.submitted', payload: { approvalId } });
 *   events.subscribe('approval.submitted', (e) => notifyCheckers(e.payload));
 *
 * The default implementation dispatches in-process and isolates subscriber
 * failures. Bind an outbox / broker implementation to EVENT_BUS to go
 * cross-process without touching producers or subscribers.
 */
export interface AppEvent<TPayload extends object = Record<string, unknown>> {
  name: string;
  payload: TPayload;
  /** Set by the bus when omitted. */
  occurredAt?: Date;
  /** Set from the request context when omitted. */
  correlationId?: string | null;
  /** User who caused the event (null for system jobs). */
  actorId?: string | null;
}

export type EventHandler<TPayload extends object = Record<string, unknown>> = (
  event: Required<AppEvent<TPayload>>,
) => Promise<void> | void;

export interface EventBus {
  publish<TPayload extends object>(event: AppEvent<TPayload>): Promise<void>;
  /** Returns an unsubscribe function. `'*'` receives every event. */
  subscribe<TPayload extends object>(name: string, handler: EventHandler<TPayload>): () => void;
}

export const EVENT_BUS = Symbol('EventBus');
