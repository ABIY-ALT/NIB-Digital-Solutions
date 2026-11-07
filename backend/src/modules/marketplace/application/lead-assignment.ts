import type { EventBus } from '#core/application/ports/event-bus.port.js';
import { ValidationError } from '#core/domain/errors/app-error.js';
import type { UserRepository } from '#modules/users/domain/user.repository.js';
import { MarketplaceEvents, type LeadAssignedEvent } from '../domain/marketplace.constants.js';

/**
 * Lead ownership rules, shared by the demo-requests and product-inquiries
 * modules: a lead is owned by a staff member (user id) who can work on it.
 */

export type LeadKind = LeadAssignedEvent['kind'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Who may own a lead of this kind: an active user holding `<resource>:update`. */
export const assigneePermission = (kind: LeadKind): string =>
  kind === 'demo' ? 'demo-requests:update' : 'product-inquiries:update';

/**
 * Throws a field validation error unless `assignee` is an active staff member
 * entitled to work on leads of this kind. Call it only when the owner changes,
 * so leads still carrying a legacy free-text owner can be edited otherwise.
 */
export async function assertAssignable(
  users: UserRepository,
  assignee: string,
  kind: LeadKind,
): Promise<void> {
  const issue = (message: string) => new ValidationError([{ field: 'assignedTo', message }]);
  if (!UUID.test(assignee)) throw issue('Choose a staff member from the list.');
  const [found] = await users.findActiveUserIds(
    { ids: [assignee], allPermissions: [assigneePermission(kind)] },
    1,
  );
  if (!found) {
    throw issue(
      kind === 'demo'
        ? 'This person cannot own demo requests (an active account that may update demo requests is required).'
        : 'This person cannot own inquiries (an active account that may update inquiries is required).',
    );
  }
}

/** What the assignment notice needs to know about the lead. */
export interface AssignedLead {
  id: string;
  reference: string;
  name: string;
  organization: string | null;
  productSlug: string | null;
  assignedTo: string | null;
}

/** Publishes LeadAssigned when the saved owner is a new, real user. */
export async function publishIfReassigned(
  events: EventBus,
  kind: LeadKind,
  lead: AssignedLead,
  previousAssignee: string | null,
  actorId: string | null,
): Promise<void> {
  const assigneeId = lead.assignedTo;
  if (!assigneeId || assigneeId === previousAssignee || !UUID.test(assigneeId)) return;
  await events.publish<LeadAssignedEvent>({
    name: MarketplaceEvents.LeadAssigned,
    payload: {
      kind,
      id: lead.id,
      reference: lead.reference,
      name: lead.name,
      organization: lead.organization,
      productSlug: lead.productSlug,
      assigneeId,
      assignedBy: actorId,
    },
  });
}
