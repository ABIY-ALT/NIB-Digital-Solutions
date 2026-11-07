import { describe, expect, it, vi } from 'vitest';
import type { EventBus } from '#core/application/ports/event-bus.port.js';
import { ValidationError } from '#core/domain/errors/app-error.js';
import type { UserDirectoryFilter, UserRepository } from '#modules/users/domain/user.repository.js';
import { MarketplaceEvents } from '../domain/marketplace.constants.js';
import { assertAssignable, assigneePermission, publishIfReassigned } from './lead-assignment.js';

const SALES = '0192f0a0-0000-7000-8000-000000000001';
const VIEWER = '0192f0a0-0000-7000-8000-000000000002';

/** A directory where only SALES may update leads. */
function directory() {
  const findActiveUserIds = vi.fn((filter: UserDirectoryFilter) =>
    Promise.resolve((filter.ids ?? [SALES, VIEWER]).filter((id) => id === SALES)),
  );
  return { users: { findActiveUserIds } as unknown as UserRepository, findActiveUserIds };
}

describe('lead assignment', () => {
  it('requires the update permission of the lead type', () => {
    expect(assigneePermission('demo')).toBe('demo-requests:update');
    expect(assigneePermission('inquiry')).toBe('product-inquiries:update');
  });

  it('accepts an active staff member who may work on the lead', async () => {
    const { users, findActiveUserIds } = directory();
    await expect(assertAssignable(users, SALES, 'demo')).resolves.toBeUndefined();
    expect(findActiveUserIds).toHaveBeenCalledWith(
      { ids: [SALES], allPermissions: ['demo-requests:update'] },
      1,
    );
  });

  it('refuses people without the permission and free text', async () => {
    const { users } = directory();
    await expect(assertAssignable(users, VIEWER, 'inquiry')).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(assertAssignable(users, 'Hiwot', 'demo')).rejects.toBeInstanceOf(ValidationError);
  });

  describe('assignment notice', () => {
    const lead = {
      id: 'lead-1',
      reference: 'DEMO-ABC123',
      name: 'Abebe Kebede',
      organization: 'Addis Academy',
      productSlug: 'school-management',
      assignedTo: SALES,
    };
    const bus = () => {
      const publish = vi.fn(() => Promise.resolve());
      return { events: { publish } as unknown as EventBus, publish };
    };

    it('is published when the owner changes', async () => {
      const { events, publish } = bus();
      await publishIfReassigned(events, 'demo', lead, null, VIEWER);
      expect(publish).toHaveBeenCalledWith({
        name: MarketplaceEvents.LeadAssigned,
        payload: expect.objectContaining({ assigneeId: SALES, assignedBy: VIEWER, kind: 'demo' }),
      });
    });

    it('is not published when nothing changed, the lead is unassigned or the owner is legacy text', async () => {
      const { events, publish } = bus();
      await publishIfReassigned(events, 'demo', lead, SALES, VIEWER);
      await publishIfReassigned(events, 'demo', { ...lead, assignedTo: null }, SALES, VIEWER);
      await publishIfReassigned(events, 'demo', { ...lead, assignedTo: 'Hiwot' }, null, VIEWER);
      expect(publish).not.toHaveBeenCalled();
    });
  });
});
