import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '#core/application/ports/event-bus.port.js';
import { MAILER, type MailDraft, type Mailer } from '#core/application/ports/mail.port.js';
import {
  SETTINGS,
  type SettingDefinition,
  type Settings,
} from '#core/application/ports/settings.port.js';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { MarketplaceEvents, type LeadSubmittedEvent } from '../domain/marketplace.constants.js';
import { CatalogService } from './catalog.service.js';
import { SEND_QUOTA, type SendQuota } from './marketplace.ports.js';

/**
 * Confirmation e-mail to the customer after a website demo request or inquiry:
 * the reference number, what was asked for, what happens next and a security
 * reminder. Sent in the product's e-mail layout (MAILER); switched off or
 * given contact details under Administration › Settings › Digital Solutions.
 */

export const CONFIRMATION_SETTINGS: readonly SettingDefinition[] = [
  {
    key: 'marketplace.confirmationEmail',
    group: 'marketplace',
    type: 'boolean',
    label: 'Send customers a confirmation e-mail',
    description:
      'After a demo request or inquiry on the website, the customer receives an e-mail with the reference number and the next steps.',
    default: true,
  },
  {
    key: 'marketplace.contactEmail',
    group: 'marketplace',
    type: 'email',
    label: 'Team e-mail in confirmations',
    description: 'Shown to customers for questions. Empty: the company e-mail.',
    default: '',
  },
  {
    key: 'marketplace.contactPhone',
    group: 'marketplace',
    type: 'string',
    label: 'Team phone in confirmations',
    description: 'Shown to customers for questions. Empty: the company phone.',
    default: '',
    max: 40,
  },
];

/** Confirmations one e-mail address can receive per day (the forms must not become a spam relay). */
export const MAX_CONFIRMATIONS_PER_ADDRESS = 3;

const DEMO_TYPE: Record<string, string> = {
  online: 'an online',
  onsite: 'an on-site',
  recorded: 'a recorded',
  customized: 'a customized',
};
const CONTACT_METHOD: Record<string, string> = {
  email: 'e-mail',
  phone: 'phone',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2026-11-12" → "Thursday 12 November 2026" (fixed English wording, independent of the server's locale data). */
const longDate = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export interface ConfirmationContext {
  /** Display name of the product, when the lead is about one. */
  productName: string | null;
  /** Public address of the website (product links). */
  siteUrl: string;
  contactEmail: string;
  contactPhone: string;
}

/** The customer's confirmation message (pure: easy to test and to review). */
export function confirmationDraft(lead: LeadSubmittedEvent, ctx: ConfirmationContext): MailDraft {
  const demo = lead.kind === 'demo';
  const product = ctx.productName ?? (lead.productSlug ? lead.productSlug : null);
  const paragraphs = [`Dear ${lead.name},`];

  if (demo) {
    paragraphs.push(
      `Thank you for your interest in NIB Digital Solutions. We have received your request for ${DEMO_TYPE[lead.type] ?? 'a'} demo${product ? ` of ${product}` : ''}.`,
    );
    if (lead.preferredDate) {
      paragraphs.push(
        `Your preferred date: ${longDate(lead.preferredDate)}${lead.preferredTime ? ` at ${lead.preferredTime}` : ''}. We will confirm the exact time with you.`,
      );
    }
    paragraphs.push(
      'A member of our Digital Solutions team will contact you within one business day to arrange the demo.',
    );
  } else {
    const topic = lead.type.replace(/_/g, ' ');
    const via = lead.contactMethod ? CONTACT_METHOD[lead.contactMethod] : null;
    paragraphs.push(
      `Thank you for contacting NIB Digital Solutions. We have received your ${topic} inquiry${product ? ` about ${product}` : ''}.`,
      `Our team will respond within one business day${via ? ` by ${via}` : ''}.`,
    );
  }

  paragraphs.push(
    `Your reference number is ${lead.reference}. Please quote it whenever you contact us about this ${demo ? 'request' : 'inquiry'}.`,
    'For your security: NIB will never ask you for account numbers, passwords, PINs or one-time codes in connection with this request. Please do not share them with anyone.',
  );
  const contact = [ctx.contactEmail, ctx.contactPhone].filter(Boolean).join(' or ');
  if (contact) paragraphs.push(`Questions? Contact our Digital Solutions team at ${contact}.`);

  return {
    to: lead.email,
    toName: lead.name,
    subject: demo
      ? `We received your demo request ${lead.reference}`
      : `We received your inquiry ${lead.reference}`,
    heading: demo ? 'Your demo request is confirmed' : 'Your inquiry has been received',
    paragraphs,
    ...(lead.productSlug && ctx.productName
      ? {
          action: {
            label: `View ${ctx.productName}`,
            url: `${ctx.siteUrl}/products/${lead.productSlug}`,
          },
        }
      : {}),
    note: 'You received this e-mail because this address was entered on the NIB Digital Solutions website. If that was not you, you can ignore this message.',
  };
}

@Injectable()
export class LeadConfirmationSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeadConfirmationSubscriber.name);
  private readonly unsubscribe: Array<() => void> = [];

  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(SETTINGS) private readonly settings: Settings,
    @Inject(SEND_QUOTA) private readonly quota: SendQuota,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly catalog: CatalogService,
  ) {}

  onModuleInit(): void {
    this.settings.define(CONFIRMATION_SETTINGS);
    for (const name of [MarketplaceEvents.DemoRequested, MarketplaceEvents.InquiryReceived]) {
      this.unsubscribe.push(
        this.events.subscribe<LeadSubmittedEvent>(name, (e) => {
          // Not awaited: a slow mail server must not delay the visitor's confirmation screen.
          void this.confirm(e.payload).catch((error: unknown) =>
            this.logger.error(
              { err: error, reference: e.payload.reference },
              'Customer confirmation e-mail failed',
            ),
          );
        }),
      );
    }
  }

  onModuleDestroy(): void {
    this.unsubscribe.forEach((off) => off());
  }

  /** Sends the confirmation unless switched off or the address had too many today. */
  async confirm(lead: LeadSubmittedEvent): Promise<boolean> {
    if (!lead.email || !(await this.settings.boolean('marketplace.confirmationEmail')))
      return false;

    const address = createHash('sha256').update(lead.email.trim().toLowerCase()).digest('hex');
    const allowed = await this.quota.take(
      `marketplace:confirmations:${address}`,
      MAX_CONFIRMATIONS_PER_ADDRESS,
      86_400,
    );
    if (!allowed) {
      this.logger.warn(
        { reference: lead.reference },
        'Confirmation e-mail skipped: daily limit for this address reached',
      );
      return false;
    }

    const values = await this.settings.all();
    const text = (key: string) => {
      const value = values[key];
      return typeof value === 'string' ? value : '';
    };
    const productName = lead.productSlug
      ? await this.catalog.product(lead.productSlug).then(
          (p) => p.name,
          () => null,
        )
      : null;
    await this.mailer.send(
      confirmationDraft(lead, {
        productName,
        siteUrl: this.config.app.publicUrl,
        contactEmail: text('marketplace.contactEmail') || text('company.email'),
        contactPhone: text('marketplace.contactPhone') || text('company.phone'),
      }),
    );
    return true;
  }
}
