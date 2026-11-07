import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { SettingDefinition } from '#core/application/ports/settings.port.js';
import type { Principal } from '#core/application/security/principal.js';
import { BaseController } from '#core/presentation/base.controller.js';
import {
  ApiAuth,
  ApiEnvelope,
  ApiStandardErrors,
} from '#core/presentation/decorators/api-docs.decorators.js';
import { CurrentPrincipal } from '#core/presentation/decorators/current-principal.decorator.js';
import { Audit } from '#core/presentation/decorators/metadata.decorators.js';
import type { ApiResult } from '#core/presentation/http/api-response.js';
import { apiSchema, type ApiDto } from '#core/presentation/openapi/api-schema.js';
import { ApiZodBody, zod } from '#core/presentation/pipes/zod-validation.pipe.js';
import {
  AuthenticatedOnly,
  RequirePermissions,
} from '#modules/authorization/presentation/authorization.decorators.js';
import { SettingsService } from '../application/settings.service.js';

// ── Contract ─────────────────────────────────────────────────────────────────

const settingValue = z.union([z.string().max(300_000), z.number(), z.boolean(), z.null()]);
const settingValues = z.record(z.string().max(100), settingValue);

export const SettingDefinitionDto = apiSchema(
  'SettingDefinition',
  z.object({
    key: z.string(),
    group: z.string(),
    type: z.enum([
      'string',
      'text',
      'number',
      'boolean',
      'select',
      'email',
      'url',
      'color',
      'image',
    ]),
    label: z.string(),
    description: z.string().nullable(),
    default: settingValue,
    options: z.array(z.string()).nullable(),
    min: z.number().nullable(),
    max: z.number().nullable(),
    required: z.boolean(),
  }),
);

export const SettingsDto = apiSchema(
  'Settings',
  z.object({
    /** Tabs, in the order the settings were defined. */
    groups: z.array(z.string()),
    definitions: z.array(SettingDefinitionDto.zod),
    values: settingValues,
  }),
);
type SettingsBody = ApiDto<typeof SettingsDto>;

export const PublicSettingsDto = apiSchema('PublicSettings', z.object({ values: settingValues }));

const UpdateSettingsSchema = z.strictObject({
  values: settingValues.refine((v) => Object.keys(v).length > 0, 'Nothing to change'),
});

const definitionDto = (d: SettingDefinition): ApiDto<typeof SettingDefinitionDto> => ({
  key: d.key,
  group: d.group,
  type: d.type,
  label: d.label,
  description: d.description ?? null,
  default: d.default,
  options: d.options ? [...d.options] : null,
  min: d.min ?? null,
  max: d.max ?? null,
  required: d.required ?? false,
});

/** Runtime settings: company details, formats, mail and document texts. */
@ApiTags('Settings')
@ApiAuth()
@ApiStandardErrors()
@Controller({ path: 'settings', version: '1' })
export class SettingsController extends BaseController {
  constructor(private readonly settings: SettingsService) {
    super();
  }

  @Get()
  @RequirePermissions('settings:read')
  @ApiOperation({ summary: 'Every setting with its definition and effective value' })
  @ApiEnvelope(200, 'Settings', SettingsDto)
  async list(): Promise<ApiResult<SettingsBody>> {
    return this.ok(await this.body());
  }

  @Get('public')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Settings every signed-in user may read (branding, formats)' })
  @ApiEnvelope(200, 'Public settings', PublicSettingsDto)
  async publicValues(): Promise<ApiResult<ApiDto<typeof PublicSettingsDto>>> {
    return this.ok({ values: await this.settings.publicValues() });
  }

  @Patch()
  @RequirePermissions('settings:manage')
  @Audit({
    action: 'SETTINGS_UPDATE',
    category: 'DATA_CHANGE',
    resourceType: 'Setting',
    resourceId: () => null,
    metadata: (req) => ({
      keys: Object.keys((req.body as { values?: Record<string, unknown> }).values ?? {}),
    }),
  })
  @ApiOperation({ summary: 'Change settings (only the keys sent are touched)' })
  @ApiZodBody(UpdateSettingsSchema)
  @ApiEnvelope(200, 'Updated', SettingsDto)
  async update(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(UpdateSettingsSchema)) body: z.infer<typeof UpdateSettingsSchema>,
  ): Promise<ApiResult<SettingsBody>> {
    await this.settings.update(body.values, principal.userId);
    return this.ok(await this.body(), 'Settings saved.');
  }

  private async body(): Promise<SettingsBody> {
    const definitions = this.settings.definitions();
    return {
      groups: [...new Set(definitions.map((d) => d.group))],
      definitions: definitions.map(definitionDto),
      values: await this.settings.all(),
    };
  }
}
