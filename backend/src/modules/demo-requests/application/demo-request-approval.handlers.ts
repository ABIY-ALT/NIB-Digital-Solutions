import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  APPROVAL_GATE,
  type ApprovalGate,
  type ApprovalHandler,
} from '#core/application/ports/approval.port.js';
import type { DemoRequest } from '../domain/demo-request.entity.js';
import {
  CreateDemoRequestUseCase,
  DeleteDemoRequestUseCase,
  GetDemoRequestUseCase,
  UpdateDemoRequestUseCase,
  type CreateDemoRequestCommand,
  type UpdateDemoRequestCommand,
} from './demo-request.use-cases.js';

/** What a checker sees of a demo request (before / after). */
export const demoRequestView = (e: DemoRequest) => ({
  reference: e.reference,
  fullName: e.fullName,
  organization: e.organization,
  jobTitle: e.jobTitle,
  email: e.email,
  phone: e.phone,
  productSlug: e.productSlug,
  demoType: e.demoType,
  preferredDate: e.preferredDate?.toISOString() ?? null,
  preferredTime: e.preferredTime,
  requirements: e.requirements,
  source: e.source,
  status: e.status,
  assignedTo: e.assignedTo,
  followUpDate: e.followUpDate?.toISOString() ?? null,
});

type Payload<T> = Omit<T, 'principal'>;

/** Stored payloads are JSON: turn ISO strings back into dates. */
const revive = <T extends object>(p: T): T => ({
  ...p,
  ...('preferredDate' in p && typeof p.preferredDate === 'string'
    ? { preferredDate: new Date(p.preferredDate) }
    : {}),
  ...('followUpDate' in p && typeof p.followUpDate === 'string'
    ? { followUpDate: new Date(p.followUpDate) }
    : {}),
});

/**
 * Maker–checker handlers (generated). Put an action under four-eyes control
 * with configuration only: APPROVAL_ACTIONS=demo-requests.create,demo-requests.update,demo-requests.delete
 */
@Injectable()
export class DemoRequestApprovalHandlers implements OnModuleInit {
  constructor(
    @Inject(APPROVAL_GATE) private readonly gate: ApprovalGate,
    private readonly getDemoRequest: GetDemoRequestUseCase,
    private readonly createDemoRequest: CreateDemoRequestUseCase,
    private readonly updateDemoRequest: UpdateDemoRequestUseCase,
    private readonly deleteDemoRequest: DeleteDemoRequestUseCase,
  ) {}

  onModuleInit(): void {
    const create: ApprovalHandler<Payload<CreateDemoRequestCommand>> = {
      action: 'demo-requests.create',
      resourceType: 'DemoRequest',
      checkerPermissions: ['demo-requests:create'],
      describe: async (p, maker) => {
        const draft = await this.createDemoRequest.draft({ ...revive(p), principal: maker });
        return {
          resourceId: null,
          summary: `Create demo request ${draft.reference}`.trim(),
          before: null,
          after: demoRequestView(draft),
        };
      },
      execute: async (p, maker) =>
        demoRequestView(await this.createDemoRequest.execute({ ...revive(p), principal: maker })),
    };
    const update: ApprovalHandler<Payload<UpdateDemoRequestCommand>> = {
      action: 'demo-requests.update',
      resourceType: 'DemoRequest',
      checkerPermissions: ['demo-requests:update'],
      describe: async (p, maker) => {
        const before = demoRequestView(await this.getDemoRequest.execute(p.id));
        const current = await this.updateDemoRequest.apply({ ...revive(p), principal: maker });
        return {
          resourceId: p.id,
          summary: `Update demo request ${current.reference}`.trim(),
          before,
          after: demoRequestView(current),
        };
      },
      execute: async (p, maker) =>
        demoRequestView(await this.updateDemoRequest.execute({ ...revive(p), principal: maker })),
    };
    const remove: ApprovalHandler<{ id: string }> = {
      action: 'demo-requests.delete',
      resourceType: 'DemoRequest',
      checkerPermissions: ['demo-requests:delete'],
      describe: async ({ id }) => {
        const current = await this.getDemoRequest.execute(id);
        return {
          resourceId: id,
          summary: `Delete demo request ${current.reference}`.trim(),
          before: demoRequestView(current),
          after: null,
        };
      },
      execute: async ({ id }, maker) =>
        demoRequestView(await this.deleteDemoRequest.execute({ id, principal: maker })),
    };
    this.gate.register(create);
    this.gate.register(update);
    this.gate.register(remove);
  }
}
