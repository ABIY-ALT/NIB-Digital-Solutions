import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Principal } from '#core/application/security/principal.js';
import { BaseController } from '#core/presentation/base.controller.js';
import {
  ApiAuth,
  ApiEnvelope,
  ApiStandardErrors,
} from '#core/presentation/decorators/api-docs.decorators.js';
import { CurrentPrincipal } from '#core/presentation/decorators/current-principal.decorator.js';
import type { ApiResult } from '#core/presentation/http/api-response.js';
import { apiSchema, type ApiDto } from '#core/presentation/openapi/api-schema.js';
import { zod } from '#core/presentation/pipes/zod-validation.pipe.js';
import { AuthenticatedOnly } from '#modules/authorization/presentation/authorization.decorators.js';
import { OptionsService } from '../application/options.service.js';

export const RecordOptionDto = apiSchema(
  'RecordOption',
  z.object({
    value: z.string(),
    label: z.string(),
    description: z.string().nullable(),
    hint: z.string().nullable(),
    group: z.string().nullable(),
    disabled: z.boolean(),
  }),
);
type RecordOption = ApiDto<typeof RecordOptionDto>;

export const OptionSourceInfoDto = apiSchema(
  'OptionSourceInfo',
  z.object({ key: z.string(), requiresVariant: z.boolean() }),
);

/** "roles", or "refdata.branches" (source + variant). */
export const OptionSourceKey = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9-]{1,63}(\.[a-z0-9][a-z0-9-]{0,63})?$/);

const MAX_PAGE_SIZE = 100;
const MAX_VALUES = 200;

const OptionsQuery = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
  search: z.string().trim().max(100).optional(),
  values: z
    .string()
    .max(10_000)
    .transform((v) =>
      [
        ...new Set(
          v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ].slice(0, MAX_VALUES),
    )
    .optional(),
  parent: z.string().trim().max(64).optional(),
  locale: z.string().trim().max(10).optional(),
});

/**
 * Record pickers: one endpoint for every "choose a record" field in the UI.
 * Modules register sources (roles, users, refdata.<list>, …); this controller
 * pages, searches and resolves selected values for any of them.
 */
@ApiTags('Options')
@ApiAuth()
@ApiStandardErrors()
@Controller({ path: 'options', version: '1' })
export class OptionsController extends BaseController {
  constructor(private readonly options: OptionsService) {
    super();
  }

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Option sources available to the caller' })
  @ApiEnvelope(200, 'Sources', { type: 'array', items: OptionSourceInfoDto.ref })
  sources(
    @CurrentPrincipal() principal: Principal,
  ): ApiResult<Array<ApiDto<typeof OptionSourceInfoDto>>> {
    return this.ok(this.options.available(principal));
  }

  @Get(':source')
  @AuthenticatedOnly()
  @ApiOperation({
    summary: 'Searchable, paginated options of a record source (permission checked per source)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'values',
    required: false,
    type: String,
    description: 'Comma-separated values to resolve (labels for current selections).',
  })
  @ApiQuery({ name: 'parent', required: false, type: String })
  @ApiQuery({ name: 'locale', required: false, type: String })
  @ApiEnvelope(200, 'Options', RecordOptionDto, true)
  async find(
    @CurrentPrincipal() principal: Principal,
    @Param('source', zod(OptionSourceKey)) source: string,
    @Query(zod(OptionsQuery)) query: z.infer<typeof OptionsQuery>,
  ): Promise<ApiResult<RecordOption[]>> {
    const page = await this.options.find(principal, source, {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search || undefined,
      values: query.values,
      parent: query.parent || undefined,
      locale: query.locale,
    });
    return this.paginated(page);
  }
}
