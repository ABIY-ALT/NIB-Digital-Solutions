import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '#core/application/ports/event-bus.port.js';
import { NOTIFIER, type Notifier } from '#core/application/ports/notifier.port.js';
import { USER_REPOSITORY, type UserRepository } from '#modules/users/domain/user.repository.js';
import {
  MarketplaceEvents,
  type LeadAssignedEvent,
  type LeadSubmittedEvent,
} from '../domain/marketplace.constants.js';

/**
 * Tells the responsible team about new website leads: every active user who
 * can read demo requests (or inquiries) gets an in-app notification and an
 * e-mail, per their notification preferences. When a lead is given to a staff
 * member, that person is told (unless they took it themselves).
 */
@Injectable()
export class LeadNotificationsSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeadNotificationsSubscriber.name);
  private readonly unsubscribe: Array<() => void> = [];

  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  onModuleInit(): void {
    for (const name of [MarketplaceEvents.DemoRequested, MarketplaceEvents.InquiryReceived]) {
      this.unsubscribe.push(
        this.events.subscribe<LeadSubmittedEvent>(name, (e) => this.notify(e.payload)),
      );
    }
    this.unsubscribe.push(
      this.events.subscribe<LeadAssignedEvent>(MarketplaceEvents.LeadAssigned, (e) =>
        this.notifyAssignee(e.payload),
      ),
    );
  }

  onModuleDestroy(): void {
    this.unsubscribe.forEach((off) => off());
  }

  private async notify(lead: LeadSubmittedEvent): Promise<void> {
    const demo = lead.kind === 'demo';
    const permission = demo ? 'demo-requests:read' : 'product-inquiries:read';
    const recipientIds = await this.users.findActiveUserIds({ allPermissions: [permission] });
    if (!recipientIds.length) {
      this.logger.warn(
        { reference: lead.reference },
        `No active user holds ${permission}; lead not notified`,
      );
      return;
    }
    const who = lead.organization ? `${lead.name} (${lead.organization})` : lead.name;
    const product = lead.productSlug ?? 'general';
    await this.notifier.send({
      recipientIds,
      category: 'MARKETPLACE',
      severity: 'INFO',
      template: demo ? 'marketplace.demoRequested' : 'marketplace.inquiryReceived',
      params: { reference: lead.reference, name: who, product, type: lead.type },
      title: demo
        ? `New demo request ${lead.reference}: ${product}`
        : `New inquiry ${lead.reference}: ${product}`,
      body: demo
        ? `${who} requested a ${lead.type} demo of ${product}. Please contact them within one business day.`
        : `${who} sent a ${lead.type.replace(/_/g, ' ')} inquiry about ${product}. Please respond within one business day.`,
      link: demo
        ? `/demo-requests?search=${lead.reference}`
        : `/product-inquiries?search=${lead.reference}`,
      senderName: 'NIB Digital Solutions website',
      threadKey: `lead:${lead.id}`,
    });
  }

  private async notifyAssignee(lead: LeadAssignedEvent): Promise<void> {
    if (lead.assigneeId === lead.assignedBy) return;
    const demo = lead.kind === 'demo';
    const who = lead.organization ? `${lead.name} (${lead.organization})` : lead.name;
    const product = lead.productSlug ?? 'general';
    await this.notifier.send({
      recipientIds: [lead.assigneeId],
      category: 'MARKETPLACE',
      severity: 'INFO',
      template: demo ? 'marketplace.demoAssigned' : 'marketplace.inquiryAssigned',
      params: { reference: lead.reference, name: who, product },
      title: demo
        ? `Demo request ${lead.reference} assigned to you`
        : `Inquiry ${lead.reference} assigned to you`,
      body: demo
        ? `You now own the demo request from ${who} for ${product}. Please contact them within one business day.`
        : `You now own the inquiry from ${who} about ${product}. Please respond within one business day.`,
      link: demo
        ? `/demo-requests?search=${lead.reference}`
        : `/product-inquiries?search=${lead.reference}`,
      senderName: 'NIB Digital Solutions',
      threadKey: `lead:${lead.id}`,
    });
  }
}
