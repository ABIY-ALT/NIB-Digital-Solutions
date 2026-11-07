import { Global, Module } from '@nestjs/common';
import { DOCUMENT_RENDERER, DOCUMENT_SOURCES } from '#core/application/ports/document.port.js';
import { InMemoryDocumentSourceRegistry } from '#core/infrastructure/documents/document-source-registry.js';
import { PdfkitDocumentRenderer } from '#core/infrastructure/documents/pdfkit-document.renderer.js';
import { DocumentsService } from './application/documents.service.js';
import { DocumentsController } from './presentation/documents.controller.js';

/**
 * Records as PDF documents: download, and e-mail as an attachment. Global so
 * any feature can register a DocumentSource (DOCUMENT_SOURCES) or render a
 * document itself (DOCUMENT_RENDERER), e.g. to attach it to its own e-mail.
 */
@Global()
@Module({
  controllers: [DocumentsController],
  providers: [
    { provide: DOCUMENT_SOURCES, useClass: InMemoryDocumentSourceRegistry },
    { provide: DOCUMENT_RENDERER, useClass: PdfkitDocumentRenderer },
    DocumentsService,
  ],
  exports: [DOCUMENT_SOURCES, DOCUMENT_RENDERER],
})
export class DocumentsModule {}
