import { Inject, Injectable } from '@nestjs/common';
import {
  DOCUMENT_RENDERER,
  DOCUMENT_SOURCES,
  type DocumentRenderer,
  type DocumentSource,
  type DocumentSourceRegistry,
  type RenderedDocument,
} from '#core/application/ports/document.port.js';
import { MAILER, type Mailer } from '#core/application/ports/mail.port.js';
import type { Principal } from '#core/application/security/principal.js';
import { ForbiddenError, NotFoundError } from '#core/domain/errors/app-error.js';
import { AuthorizationService } from '#modules/authorization/application/authorization.service.js';

export const SEND_PERMISSION = 'documents:send';

export interface SendDocumentInput {
  to: string;
  toName?: string;
  subject?: string;
  message?: string;
}

export interface SentDocument {
  to: string;
  subject: string;
  filename: string;
  /** Size of the attachment in bytes. */
  size: number;
}

/**
 * Turns a record into a PDF, and e-mails it. The record type is a registered
 * DocumentSource; its permissions are enforced here (denials are audited) and
 * e-mailing a document outside the product additionally needs `documents:send`.
 */
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DOCUMENT_SOURCES) private readonly sources: DocumentSourceRegistry,
    @Inject(DOCUMENT_RENDERER) private readonly renderer: DocumentRenderer,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly authz: AuthorizationService,
  ) {}

  async render(principal: Principal, sourceKey: string, id: string): Promise<RenderedDocument> {
    const source = this.source(principal, sourceKey);
    return this.renderer.render(await source.build(principal, id));
  }

  async send(
    principal: Principal,
    sourceKey: string,
    id: string,
    input: SendDocumentInput,
  ): Promise<SentDocument> {
    const source = this.source(principal, sourceKey);
    this.authz.assert(principal, SEND_PERMISSION, { type: 'Document', id: `${sourceKey}/${id}` });

    const model = await source.build(principal, id);
    const document = await this.renderer.render(model);
    const reference = model.number ? `${model.title} ${model.number}` : model.title;
    const subject = input.subject?.trim() || reference;
    await this.mailer.send({
      to: input.to,
      toName: input.toName,
      subject,
      heading: reference,
      paragraphs: [
        ...(input.message?.trim() ? [input.message.trim()] : []),
        `Please find attached: ${document.filename}.`,
        `Sent by ${principal.username}.`,
      ],
      attachments: [document],
    });
    return {
      to: input.to,
      subject,
      filename: document.filename,
      size: document.content.byteLength,
    };
  }

  /** Record types the caller may print (for discovery). */
  available(principal: Principal): Array<{ key: string; canSend: boolean }> {
    const canSend = this.authz.hasPermission(principal, SEND_PERMISSION);
    return this.sources
      .list()
      .filter((s) => this.allowed(principal, s))
      .map((s) => ({ key: s.key, canSend }));
  }

  private source(principal: Principal, key: string): DocumentSource {
    const source = this.sources.get(key);
    if (!source) throw new NotFoundError('Document source', key);
    if (!this.allowed(principal, source)) {
      this.authz.recordDenial(principal, source.permissions.join('|'), {
        type: 'DocumentSource',
        id: key,
      });
      throw new ForbiddenError();
    }
    return source;
  }

  private allowed(principal: Principal, source: DocumentSource): boolean {
    return (
      source.permissions.length === 0 ||
      source.permissions.some((p) => this.authz.hasPermission(principal, p))
    );
  }
}
