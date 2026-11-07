import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  APPROVAL_GATE,
  type ApprovalGate,
  type ApprovalTicket,
} from '#core/application/ports/approval.port.js';
import type { Principal } from '#core/application/security/principal.js';
import type { PageRequest } from '#core/domain/pagination.js';
import { BaseController } from '#core/presentation/base.controller.js';
import {
  ApiAuth,
  ApiEnvelope,
  ApiStandardErrors,
} from '#core/presentation/decorators/api-docs.decorators.js';
import {
  ApiChangeReason,
  ChangeReason,
} from '#core/presentation/decorators/change-reason.decorator.js';
import { CurrentPrincipal } from '#core/presentation/decorators/current-principal.decorator.js';
import { Audit } from '#core/presentation/decorators/metadata.decorators.js';
import type { ApiResult } from '#core/presentation/http/api-response.js';
import {
  apiSchema,
  isoDateTime,
  nullableIsoDateTime,
  type ApiDto,
} from '#core/presentation/openapi/api-schema.js';
import {
  ApiListQuery,
  ListQuery,
  type ListQuerySpec,
} from '#core/presentation/pagination/list-query.js';
import { ApiZodBody, zod } from '#core/presentation/pipes/zod-validation.pipe.js';
import {
  AuthenticatedOnly,
  RequirePermissions,
} from '#modules/authorization/presentation/authorization.decorators.js';
import { ReferenceDataUseCases } from '../application/reference-data.use-cases.js';
import type { ReferenceDataItem, ReferenceDataType } from '../domain/reference-data.js';

// ── Contract ─────────────────────────────────────────────────────────────────

const attributeDefinition = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  type: z.enum(['text', 'number', 'boolean', 'date', 'select']),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
});
const attributeValue = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);

export const ReferenceDataTypeDto = apiSchema(
  'ReferenceDataType',
  z.object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    isSystem: z.boolean(),
    attributes: z.array(attributeDefinition),
    parentTypeCode: z.string().nullable(),
    itemCount: z.int(),
    activeCount: z.int(),
    createdAt: isoDateTime(),
    updatedAt: isoDateTime(),
    version: z.int(),
  }),
);
type TypeDto = ApiDto<typeof ReferenceDataTypeDto>;

export const ReferenceDataItemDto = apiSchema(
  'ReferenceDataItem',
  z.object({
    id: z.uuid(),
    typeCode: z.string(),
    code: z.string(),
    label: z.string(),
    labels: z.record(z.string(), z.string()),
    description: z.string().nullable(),
    sortOrder: z.int(),
    active: z.boolean(),
    effective: z.boolean(),
    validFrom: nullableIsoDateTime(),
    validTo: nullableIsoDateTime(),
    parentCode: z.string().nullable(),
    attributes: z.record(z.string(), attributeValue),
    createdAt: isoDateTime(),
    updatedAt: isoDateTime(),
    version: z.int(),
  }),
);
type ItemDto = ApiDto<typeof ReferenceDataItemDto>;

export const LookupOptionDto = apiSchema(
  'LookupOption',
  z.object({
    code: z.string(),
    label: z.string(),
    description: z.string().nullable(),
    parentCode: z.string().nullable(),
    attributes: z.record(z.string(), attributeValue),
    active: z.boolean(),
  }),
);

const typeDto = (t: ReferenceDataType): TypeDto => ({
  id: t.id,
  code: t.code,
  name: t.name,
  description: t.description,
  isSystem: t.isSystem,
  attributes: [...t.attributes],
  parentTypeCode: t.parentTypeCode,
  itemCount: t.itemCount,
  activeCount: t.activeCount,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
  version: t.version,
});

const itemDto = (i: ReferenceDataItem): ItemDto => ({
  id: i.id,
  typeCode: i.typeCode,
  code: i.code,
  label: i.label,
  labels: { ...i.labels },
  description: i.description,
  sortOrder: i.sortOrder,
  active: i.active,
  effective: i.isEffective(new Date()),
  validFrom: i.validFrom?.toISOString() ?? null,
  validTo: i.validTo?.toISOString() ?? null,
  parentCode: i.parentCode,
  attributes: { ...i.attributes },
  createdAt: i.createdAt.toISOString(),
  updatedAt: i.updatedAt.toISOString(),
  version: i.version,
});

// ── Requests ─────────────────────────────────────────────────────────────────

const TYPE_LIST: ListQuerySpec = {
  sortable: ['code', 'name', 'createdAt'],
  filterable: ['isSystem'],
  searchable: true,
};
const ITEM_LIST: ListQuerySpec = {
  sortable: ['code', 'label', 'sortOrder', 'createdAt', 'updatedAt'],
  filterable: ['active', 'parentCode', 'code'],
  searchable: true,
  maxPageSize: 200,
};

const TypeCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9-]{1,63}$/);

const CreateTypeSchema = z.strictObject({
  code: TypeCode,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullish(),
  attributes: z.array(attributeDefinition).max(30).default([]),
  parentTypeCode: TypeCode.nullish(),
});
const UpdateTypeSchema = z.strictObject({
  version: z.int().min(1),
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullish(),
  attributes: z.array(attributeDefinition).max(30).optional(),
  parentTypeCode: TypeCode.nullish(),
});

const isoDate = z.iso.datetime({ offset: true }).or(z.iso.date());
const itemFields = {
  label: z.string().trim().min(1).max(160),
  labels: z.record(z.string(), z.string().trim().max(160)).optional(),
  description: z.string().trim().max(500).nullish(),
  sortOrder: z.int().min(0).max(100_000).optional(),
  active: z.boolean().optional(),
  validFrom: isoDate.nullish(),
  validTo: isoDate.nullish(),
  parentCode: z.string().trim().max(64).nullish(),
  attributes: z.record(z.string(), attributeValue).optional(),
};
const CreateItemSchema = z.strictObject({ code: z.string().trim().min(1).max(64), ...itemFields });
const UpdateItemSchema = z.strictObject({
  version: z.int().min(1),
  ...itemFields,
  label: itemFields.label.optional(),
});

const LookupQuery = z.object({
  locale: z.string().trim().max(10).optional(),
  parent: z.string().trim().max(64).optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

/** ISO date → Date; null clears the date and undefined leaves it unchanged. */
function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value ? new Date(value) : null;
}

const toDates = <T extends { validFrom?: string | null; validTo?: string | null }>(body: T) => ({
  ...body,
  validFrom: toDate(body.validFrom),
  validTo: toDate(body.validTo),
});

/**
 * Reference data: list administration (types + items) and the lookup API that
 * powers dropdowns across products.
 */
@ApiTags('Reference data')
@ApiAuth()
@ApiStandardErrors()
@Controller({ path: 'reference-data', version: '1' })
export class ReferenceDataController extends BaseController {
  constructor(
    private readonly refdata: ReferenceDataUseCases,
    @Inject(APPROVAL_GATE) private readonly approvals: ApprovalGate,
  ) {
    super();
  }

  // ── Lookups (any signed-in user) ──────────────────────────────────────────

  @Get('lookups/:type')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Options of a list for dropdowns (translated, effective items)' })
  @ApiEnvelope(200, 'Options', { type: 'array', items: LookupOptionDto.ref })
  async lookup(
    @Param('type', zod(TypeCode)) type: string,
    @Query(zod(LookupQuery)) query: z.infer<typeof LookupQuery>,
  ): Promise<ApiResult<Array<ApiDto<typeof LookupOptionDto>>>> {
    return this.ok(
      await this.refdata.lookup(type, {
        locale: query.locale,
        parentCode: query.parent,
        includeInactive: query.includeInactive,
      }),
    );
  }

  // ── Types ─────────────────────────────────────────────────────────────────

  @Get('types')
  @RequirePermissions('reference-data:read')
  @ApiOperation({ summary: 'Reference data lists' })
  @ApiListQuery(TYPE_LIST)
  @ApiEnvelope(200, 'Lists', ReferenceDataTypeDto, true)
  async listTypes(@ListQuery(TYPE_LIST) request: PageRequest): Promise<ApiResult<TypeDto[]>> {
    return this.paginated(await this.refdata.listTypes(request), typeDto);
  }

  @Get('types/:type')
  @RequirePermissions('reference-data:read')
  @ApiOperation({ summary: 'One list with its attribute definitions' })
  @ApiEnvelope(200, 'List', ReferenceDataTypeDto)
  async getType(@Param('type', zod(TypeCode)) type: string): Promise<ApiResult<TypeDto>> {
    return this.ok(typeDto(await this.refdata.getType(type)));
  }

  @Post('types')
  @HttpCode(201)
  @RequirePermissions('reference-data:manage')
  @Audit({
    action: 'REFDATA_TYPE_CREATE',
    category: 'DATA_CHANGE',
    resourceType: 'ReferenceDataType',
  })
  @ApiOperation({ summary: 'Create a list (with custom item attributes)' })
  @ApiZodBody(CreateTypeSchema)
  @ApiEnvelope(201, 'Created', ReferenceDataTypeDto)
  async createType(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(CreateTypeSchema)) body: z.infer<typeof CreateTypeSchema>,
  ): Promise<ApiResult<TypeDto>> {
    return this.ok(typeDto(await this.refdata.createType(principal, body)), 'List created.');
  }

  @Patch('types/:type')
  @RequirePermissions('reference-data:manage')
  @Audit({
    action: 'REFDATA_TYPE_UPDATE',
    category: 'DATA_CHANGE',
    resourceType: 'ReferenceDataType',
  })
  @ApiOperation({ summary: 'Update a list (requires the current version)' })
  @ApiZodBody(UpdateTypeSchema)
  @ApiEnvelope(200, 'Updated', ReferenceDataTypeDto)
  async updateType(
    @CurrentPrincipal() principal: Principal,
    @Param('type', zod(TypeCode)) type: string,
    @Body(zod(UpdateTypeSchema)) { version, ...changes }: z.infer<typeof UpdateTypeSchema>,
  ): Promise<ApiResult<TypeDto>> {
    return this.ok(
      typeDto(await this.refdata.updateType(principal, type, version, changes)),
      'List updated.',
    );
  }

  @Delete('types/:type')
  @RequirePermissions('reference-data:manage')
  @Audit({
    action: 'REFDATA_TYPE_DELETE',
    category: 'DATA_CHANGE',
    resourceType: 'ReferenceDataType',
  })
  @ApiOperation({ summary: 'Delete an empty, non-system list' })
  @ApiEnvelope(200, 'Deleted', ReferenceDataTypeDto)
  async deleteType(
    @CurrentPrincipal() principal: Principal,
    @Param('type', zod(TypeCode)) type: string,
  ): Promise<ApiResult<TypeDto>> {
    return this.ok(typeDto(await this.refdata.deleteType(principal, type)), 'List deleted.');
  }

  // ── Items ─────────────────────────────────────────────────────────────────

  @Get('types/:type/items')
  @RequirePermissions('reference-data:read')
  @ApiOperation({ summary: 'Items of a list (paginated, searchable)' })
  @ApiListQuery(ITEM_LIST)
  @ApiEnvelope(200, 'Items', ReferenceDataItemDto, true)
  async listItems(
    @Param('type', zod(TypeCode)) type: string,
    @ListQuery(ITEM_LIST) request: PageRequest,
  ): Promise<ApiResult<ItemDto[]>> {
    return this.paginated((await this.refdata.listItems(type, request)).page, itemDto);
  }

  @Post('types/:type/items')
  @HttpCode(201)
  @RequirePermissions('reference-data:manage')
  @Audit({
    action: 'REFDATA_ITEM_CREATE',
    category: 'DATA_CHANGE',
    resourceType: 'ReferenceDataItem',
  })
  @ApiOperation({ summary: 'Add an item; 202 when it needs approval' })
  @ApiZodBody(CreateItemSchema)
  @ApiChangeReason()
  @ApiEnvelope(201, 'Created', ReferenceDataItemDto)
  async createItem(
    @CurrentPrincipal() principal: Principal,
    @Param('type', zod(TypeCode)) type: string,
    @Body(zod(CreateItemSchema)) body: z.infer<typeof CreateItemSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ItemDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'reference-data.items.create',
      principal,
      payload: { typeCode: type, ...body },
      comment: reason,
      execute: () => this.refdata.createItem(principal, type, toDates(body)),
    });
    return this.gated(outcome, itemDto, 'Item added.');
  }

  @Patch('items/:id')
  @RequirePermissions('reference-data:manage')
  @Audit({
    action: 'REFDATA_ITEM_UPDATE',
    category: 'DATA_CHANGE',
    resourceType: 'ReferenceDataItem',
  })
  @ApiOperation({ summary: 'Update an item (codes are permanent); 202 when it needs approval' })
  @ApiZodBody(UpdateItemSchema)
  @ApiChangeReason()
  @ApiEnvelope(200, 'Updated', ReferenceDataItemDto)
  async updateItem(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @Body(zod(UpdateItemSchema)) body: z.infer<typeof UpdateItemSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ItemDto | ApprovalTicket>> {
    const { version, ...changes } = body;
    const outcome = await this.approvals.submit({
      action: 'reference-data.items.update',
      principal,
      payload: { id, ...body },
      comment: reason,
      execute: () => this.refdata.updateItem(principal, id, version, toDates(changes)),
    });
    return this.gated(outcome, itemDto, 'Item updated.');
  }

  @Delete('items/:id')
  @RequirePermissions('reference-data:manage')
  @Audit({
    action: 'REFDATA_ITEM_DELETE',
    category: 'DATA_CHANGE',
    resourceType: 'ReferenceDataItem',
  })
  @ApiOperation({
    summary: 'Delete an item (its code is never reused); 202 when it needs approval',
  })
  @ApiChangeReason()
  @ApiEnvelope(200, 'Deleted', ReferenceDataItemDto)
  async deleteItem(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ItemDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'reference-data.items.delete',
      principal,
      payload: { id },
      comment: reason,
      execute: () => this.refdata.deleteItem(principal, id),
    });
    return this.gated(outcome, itemDto, 'Item deleted.');
  }
}
