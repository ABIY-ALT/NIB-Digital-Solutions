import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  APPROVAL_GATE,
  type ApprovalGate,
  type ApprovalHandler,
} from '#core/application/ports/approval.port.js';
import type { ItemInput, ReferenceDataItem } from '../domain/reference-data.js';
import { ReferenceDataUseCases } from './reference-data.use-cases.js';

export const itemView = (i: ReferenceDataItem) => ({
  list: i.typeCode,
  code: i.code,
  label: i.label,
  labels: { ...i.labels },
  description: i.description,
  sortOrder: i.sortOrder,
  active: i.active,
  validFrom: i.validFrom?.toISOString() ?? null,
  validTo: i.validTo?.toISOString() ?? null,
  parentCode: i.parentCode,
  attributes: { ...i.attributes },
});

type Dates = { validFrom?: string | null; validTo?: string | null };
type CreatePayload = Omit<ItemInput, 'validFrom' | 'validTo'> &
  Dates & { typeCode: string; code: string; label: string };
type UpdatePayload = Omit<ItemInput, 'validFrom' | 'validTo'> &
  Dates & { id: string; version: number };

/** ISO date → Date; null clears the date and undefined leaves it unchanged. */
function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value ? new Date(value) : null;
}

/** JSON payload (ISO dates) → domain input (Date). */
const toInput = <T extends Dates>(p: T) => ({
  ...p,
  validFrom: toDate(p.validFrom),
  validTo: toDate(p.validTo),
});

/**
 * Maker–checker for reference data items (enable with APPROVAL_ACTIONS, e.g.
 * "reference-data.items.update"). Lists that drive pricing or compliance
 * usually need dual control; plain descriptive lists do not.
 */
@Injectable()
export class ReferenceDataApprovalHandlers implements OnModuleInit {
  constructor(
    @Inject(APPROVAL_GATE) private readonly gate: ApprovalGate,
    private readonly refdata: ReferenceDataUseCases,
  ) {}

  onModuleInit(): void {
    const checkerPermissions = ['reference-data:manage'];

    const create: ApprovalHandler<CreatePayload> = {
      action: 'reference-data.items.create',
      resourceType: 'ReferenceDataItem',
      checkerPermissions,
      describe: async ({ typeCode, ...p }, maker) => {
        const draft = await this.refdata.draftItem(maker, typeCode, toInput(p));
        return {
          resourceId: null,
          summary: `Add ${draft.code} – ${draft.label} to ${typeCode}`,
          before: null,
          after: itemView(draft),
        };
      },
      execute: async ({ typeCode, ...p }, maker) =>
        itemView(await this.refdata.createItem(maker, typeCode, toInput(p))),
    };

    const update: ApprovalHandler<UpdatePayload> = {
      action: 'reference-data.items.update',
      resourceType: 'ReferenceDataItem',
      checkerPermissions,
      describe: async ({ id, version, ...p }, maker) => {
        const item = await this.refdata.getItem(id);
        const before = itemView(item);
        await this.refdata.applyItemChanges(maker, item, version, toInput(p));
        return {
          resourceId: id,
          summary: `Update ${before.list} ${before.code} – ${before.label}`,
          before,
          after: itemView(item),
        };
      },
      execute: async ({ id, version, ...p }, maker) =>
        itemView(await this.refdata.updateItem(maker, id, version, toInput(p))),
    };

    const remove: ApprovalHandler<{ id: string }> = {
      action: 'reference-data.items.delete',
      resourceType: 'ReferenceDataItem',
      checkerPermissions,
      describe: async ({ id }) => {
        const before = itemView(await this.refdata.getItem(id));
        return {
          resourceId: id,
          summary: `Delete ${before.list} ${before.code} – ${before.label}`,
          before,
          after: null,
        };
      },
      execute: async ({ id }, maker) => itemView(await this.refdata.deleteItem(maker, id)),
    };

    this.gate.register(create);
    this.gate.register(update);
    this.gate.register(remove);
  }
}
