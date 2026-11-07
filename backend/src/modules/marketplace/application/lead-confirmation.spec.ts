import { describe, expect, it, vi } from 'vitest';
import type { EventBus } from '#core/application/ports/event-bus.port.js';
import type { MailDraft } from '#core/application/ports/mail.port.js';
import type { Settings, SettingValue } from '#core/application/ports/settings.port.js';
import type { AppConfig } from '#config/app-config.js';
import type { LeadSubmittedEvent } from '../domain/marketplace.constants.js';
import type { CatalogService } from './catalog.service.js';
import type { SendQuota } from './marketplace.ports.js';
import {
  confirmationDraft,
  LeadConfirmationSubscriber,
  MAX_CONFIRMATIONS_PER_ADDRESS,
} from './lead-confirmation.js';

const demo: LeadSubmittedEvent = {
  kind: 'demo',
  id: 'lead-1',
  reference: 'DEMO-261104-WX52D',
  name: 'Abebe Kebede',
  organization: 'Addis Academy',
  productSlug: 'school-management-system',
  type: 'online',
  email: 'abebe@example.com',
  preferredDate: '2026-11-12',
  preferredTime: '10:00',
  contactMethod: null,
};
const inquiry: LeadSubmittedEvent = {
  ...demo,
  kind: 'inquiry',
  reference: 'INQ-261104-K7M2P',
  productSlug: null,
  type: 'technical_consultation',
  preferredDate: null,
  preferredTime: null,
  contactMethod: 'whatsapp',
};
const ctx = {
  productName: 'School Management System',
  siteUrl: 'https://digital.nibbanksc.com',
  contactEmail: 'digitalsolutions@nibbanksc.com',
  contactPhone: '+251 11 550 3288',
};
const body = (d: MailDraft) => d.paragraphs.join('\n');

describe('customer confirmation e-mail', () => {
  it('confirms a demo request with the reference, the slot and the next steps', () => {
    const d = confirmationDraft(demo, ctx);
    expect(d.to).toBe('abebe@example.com');
    expect(d.subject).toBe('We received your demo request DEMO-261104-WX52D');
    expect(body(d)).toContain('an online demo of School Management System');
    expect(body(d)).toContain('Thursday 12 November 2026 at 10:00');
    expect(body(d)).toContain('Your reference number is DEMO-261104-WX52D');
    expect(body(d)).toContain('never ask you for account numbers, passwords, PINs');
    expect(body(d)).toContain('digitalsolutions@nibbanksc.com or +251 11 550 3288');
    expect(d.action).toEqual({
      label: 'View School Management System',
      url: 'https://digital.nibbanksc.com/products/school-management-system',
    });
  });

  it('confirms a general inquiry with the contact channel and no product link', () => {
    const d = confirmationDraft(inquiry, { ...ctx, productName: null, contactPhone: '' });
    expect(d.subject).toBe('We received your inquiry INQ-261104-K7M2P');
    expect(body(d)).toContain('your technical consultation inquiry.');
    expect(body(d)).toContain('within one business day by WhatsApp');
    // Only the e-mail is known: no "… or <phone>".
    expect(body(d)).toContain('team at digitalsolutions@nibbanksc.com.');
    expect(d.action).toBeUndefined();
  });

  describe('sending', () => {
    function setup(values: Record<string, SettingValue> = {}) {
      const all: Record<string, SettingValue> = {
        'marketplace.confirmationEmail': true,
        'company.email': 'info@nib.et',
        ...values,
      };
      const send = vi.fn((_d: MailDraft) => Promise.resolve());
      let count = 0;
      const subscriber = new LeadConfirmationSubscriber(
        { subscribe: vi.fn(() => () => undefined) } as unknown as EventBus,
        { send },
        {
          boolean: (key: string) => Promise.resolve(all[key] === true),
          all: () => Promise.resolve(all),
          define: vi.fn(),
        } as unknown as Settings,
        {
          take: (_key: string, limit: number) => Promise.resolve(++count <= limit),
        } satisfies SendQuota,
        { app: { publicUrl: 'https://digital.nibbanksc.com' } } as AppConfig,
        {
          product: () => Promise.reject(new Error('not published')),
        } as unknown as CatalogService,
      );
      return { subscriber, send };
    }

    it('sends with the company e-mail as contact, at most a few per address and day', async () => {
      const { subscriber, send } = setup();
      for (let i = 0; i < MAX_CONFIRMATIONS_PER_ADDRESS + 2; i++) await subscriber.confirm(demo);
      expect(send).toHaveBeenCalledTimes(MAX_CONFIRMATIONS_PER_ADDRESS);
      const draft = send.mock.calls[0]![0];
      expect(body(draft)).toContain('info@nib.et');
      // The product is not published any more: no link, the code is named instead.
      expect(draft.action).toBeUndefined();
    });

    it('sends nothing when switched off', async () => {
      const { subscriber, send } = setup({ 'marketplace.confirmationEmail': false });
      expect(await subscriber.confirm(demo)).toBe(false);
      expect(send).not.toHaveBeenCalled();
    });
  });
});
