import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
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
import { AuthenticatedOnly } from '#modules/authorization/presentation/authorization.decorators.js';
import { DocumentsService } from '../application/documents.service.js';

// ── Contract ─────────────────────────────────────────────────────────────────

const SourceKey = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,63}$/)
  .max(64);
const RecordId = z.string().trim().min(1).max(128);

export const DocumentFileDto = apiSchema(
  'DocumentFile',
  z.object({
    filename: z.string(),
    contentType: z.string(),
    /** The file, base64-encoded (documents are small; the BFF streams it to the browser). */
    content: z.string(),
    size: z.int(),
  }),
);

export const DocumentSourceDto = apiSchema(
  'DocumentSource',
  z.object({ key: z.string(), canSend: z.boolean() }),
);

export const SentDocumentDto = apiSchema(
  'SentDocument',
  z.object({ to: z.string(), subject: z.string(), filename: z.string(), size: z.int() }),
);

const SendDocumentSchema = z.strictObject({
  to: z.email().max(254),
  toName: z.string().trim().max(120).optional(),
  subject: z.string().trim().max(160).optional(),
  message: z.string().trim().max(2000).optional(),
});

const reference = (req: { params: Record<string, unknown> }): string =>
  `${String(req.params.source)}/${String(req.params.id)}`;

/**
 * Records as PDF documents. Authorization is per record type: the document
 * source registered by the owning module names the permissions (see
 * core/application/ports/document.port.ts).
 */
@ApiTags('Documents')
@ApiAuth()
@ApiStandardErrors()
@AuthenticatedOnly()
@Controller({ path: 'documents', version: '1' })
export class DocumentsController extends BaseController {
  constructor(private readonly documents: DocumentsService) {
    super();
  }

  @Get()
  @ApiOperation({ summary: 'Record types the caller may print' })
  @ApiEnvelope(200, 'Sources', DocumentSourceDto, true)
  list(
    @CurrentPrincipal() principal: Principal,
  ): ApiResult<Array<ApiDto<typeof DocumentSourceDto>>> {
    return this.ok(this.documents.available(principal));
  }

  @Get(':source/:id/pdf')
  @Audit({
    action: 'DOCUMENT_DOWNLOAD',
    category: 'DATA_ACCESS',
    resourceType: 'Document',
    resourceId: reference,
  })
  @ApiOperation({ summary: 'A record as a PDF document' })
  @ApiEnvelope(200, 'Document', DocumentFileDto)
  async pdf(
    @CurrentPrincipal() principal: Principal,
    @Param('source', zod(SourceKey)) source: string,
    @Param('id', zod(RecordId)) id: string,
  ): Promise<ApiResult<ApiDto<typeof DocumentFileDto>>> {
    const file = await this.documents.render(principal, source, id);
    return this.ok({
      filename: file.filename,
      contentType: file.contentType,
      content: file.content.toString('base64'),
      size: file.content.byteLength,
    });
  }

  @Post(':source/:id/send')
  @HttpCode(200)
  @Audit({
    action: 'DOCUMENT_SEND',
    category: 'DATA_ACCESS',
    resourceType: 'Document',
    resourceId: reference,
    // Who received the record is the point of this audit entry.
    metadata: (req) => ({ to: (req.body as { to?: string } | undefined)?.to }),
  })
  @ApiOperation({ summary: 'E-mail a record as a PDF attachment (needs documents:send)' })
  @ApiZodBody(SendDocumentSchema)
  @ApiEnvelope(200, 'Sent', SentDocumentDto)
  async send(
    @CurrentPrincipal() principal: Principal,
    @Param('source', zod(SourceKey)) source: string,
    @Param('id', zod(RecordId)) id: string,
    @Body(zod(SendDocumentSchema)) body: z.infer<typeof SendDocumentSchema>,
  ): Promise<ApiResult<ApiDto<typeof SentDocumentDto>>> {
    return this.ok(await this.documents.send(principal, source, id, body), `Sent to ${body.to}.`);
  }
}
