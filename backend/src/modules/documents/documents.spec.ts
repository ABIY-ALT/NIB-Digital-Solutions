import type { DocumentModel, DocumentSource } from '#core/application/ports/document.port.js';
import type { MailDraft, MailMessage } from '#core/application/ports/mail.port.js';
import type { Settings, SettingValue } from '#core/application/ports/settings.port.js';
import type { Principal } from '#core/application/security/principal.js';
import { ForbiddenError, NotFoundError } from '#core/domain/errors/app-error.js';
import { InMemoryDocumentSourceRegistry } from '#core/infrastructure/documents/document-source-registry.js';
import {
  formatCell,
  PdfkitDocumentRenderer,
} from '#core/infrastructure/documents/pdfkit-document.renderer.js';
import {
  BrandedMailer,
  renderMailHtml,
  renderMailText,
} from '#core/infrastructure/mail/branded-mailer.js';
import { mailAddress } from '#core/infrastructure/mail/smtp-mail.transport.js';
import { AuthorizationService } from '#modules/authorization/application/authorization.service.js';
import { DocumentsService } from './application/documents.service.js';

const principal = (permissions: string[]): Principal => ({
  userId: 'u1',
  username: 'abebe',
  sessionId: 's1',
  roles: [],
  permissions,
  attributes: {},
  mfaVerified: true,
  authMethod: 'password',
});

const settings = (values: Record<string, SettingValue> = {}): Settings =>
  ({
    all: () =>
      Promise.resolve({
        'company.name': 'Nib International Bank',
        'company.address': 'Addis Ababa',
        'mail.fromName': 'NIB AppCore',
        'mail.replyTo': 'support@nib.et',
        'mail.footer': 'Automated message.',
        'documents.footer': 'Computer generated.',
        'documents.pageSize': 'A4',
        'documents.accentColor': '#8B4E20',
        ...values,
      }),
  }) as unknown as Settings;

const invoice: DocumentModel = {
  title: 'Payment receipt',
  number: 'RCPT/2026 0042',
  filename: 'Receipt RCPT/2026 0042',
  fields: [
    { label: 'Customer', value: 'Abebe Kebede' },
    { label: 'Date', value: '2026-03-09T22:30:00Z', format: 'date' },
    { label: 'Reference', value: null },
  ],
  sections: [
    {
      kind: 'table',
      title: 'Items',
      columns: [
        { key: 'item', label: 'Item', weight: 3 },
        { key: 'qty', label: 'Qty', align: 'end', format: 'number' },
        { key: 'total', label: 'Total', align: 'end', format: 'money' },
      ],
      // Enough rows to need a second page (the header row repeats there).
      rows: Array.from({ length: 70 }, (_, i) => ({
        item: `Service ${i + 1}`,
        qty: 2,
        total: 1250,
      })),
      totals: [
        { label: 'Subtotal', value: 87_500 },
        { label: 'Total', value: 100_625, emphasis: true },
      ],
    },
    { kind: 'text', title: 'Notes', text: 'Thank you.' },
  ],
};

describe('PdfkitDocumentRenderer', () => {
  it('renders a multi-page PDF with a safe file name', async () => {
    const file = await new PdfkitDocumentRenderer(settings()).render(invoice);
    expect(file.contentType).toBe('application/pdf');
    expect(file.filename).toBe('Receipt-RCPT-2026-0042.pdf');
    expect(file.content.subarray(0, 5).toString()).toBe('%PDF-');
    expect(file.content.subarray(-6).toString()).toContain('%%EOF');
    const pages = file.content.toString('latin1').match(/\/Type \/Page\b/g) ?? [];
    expect(pages.length).toBeGreaterThan(1);
  });

  it('survives an unreadable logo and an empty table', async () => {
    const renderer = new PdfkitDocumentRenderer(
      settings({ 'company.logo': 'data:image/png;base64,AAAA' }),
    );
    const file = await renderer.render({
      title: 'Role definition',
      filename: 'role',
      sections: [{ kind: 'table', columns: [{ key: 'a', label: 'A' }], rows: [] }],
    });
    expect(file.content.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('prints values in the product formats', () => {
    const look = {
      currency: 'ETB',
      formats: {
        currencyCode: 'ETB',
        currencyPosition: 'before' as const,
        decimalSeparator: '.',
        thousandSeparator: ',',
        decimals: 2,
        dateFormat: 'DD/MM/YYYY' as const,
        timeZone: 'Africa/Addis_Ababa',
      },
    };
    expect(formatCell(1250, 'money', look)).toBe('ETB 1,250.00');
    expect(formatCell(1250, 'number', look)).toBe('1,250');
    expect(formatCell('2026-03-09T22:30:00Z', 'date', look)).toBe('10/03/2026');
    expect(formatCell(null, 'money', look)).toBe('—');
    expect(formatCell('free text', 'date', look)).toBe('free text');
  });
});

describe('BrandedMailer', () => {
  const draft: MailDraft = {
    to: 'a@b.et',
    toName: 'Abebe <b>',
    subject: 'Reset your password',
    paragraphs: ['Line one', '<script>alert(1)</script>'],
    action: { label: 'Choose a new password', url: 'https://app/reset-password?token=abc&x=1' },
    note: 'Expires in 30 minutes.',
  };
  const brand = { companyName: 'Nib', footer: 'Automated.', accentColor: '#8B4E20' };

  it('escapes everything it puts in the HTML', () => {
    const html = renderMailHtml(draft, brand);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('Abebe <b>');
    expect(html).toContain('href="https://app/reset-password?token=abc&#38;x=1"');
  });

  it('writes the action as a link in the text version', () => {
    expect(renderMailText(draft, brand)).toContain(
      'Choose a new password: https://app/reset-password?token=abc&x=1',
    );
  });

  it('takes sender name, reply-to and footer from the settings', async () => {
    const sent: MailMessage[] = [];
    const transport = { name: 'test', send: (m: MailMessage) => (sent.push(m), Promise.resolve()) };
    await new BrandedMailer(transport, settings()).send(draft);
    expect(sent[0]).toMatchObject({
      to: 'a@b.et',
      fromName: 'NIB AppCore',
      replyTo: 'support@nib.et',
    });
    expect(sent[0]!.text).toContain('Automated message.');
  });

  it('reads the address out of a "Name <address>" sender', () => {
    expect(mailAddress('NIB AppCore <no-reply@nib.et>')).toBe('no-reply@nib.et');
    expect(mailAddress('no-reply@nib.et')).toBe('no-reply@nib.et');
  });
});

describe('DocumentsService', () => {
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const authz = new AuthorizationService(audit);
  const registry = new InMemoryDocumentSourceRegistry();
  const build = vi.fn((_p: Principal, id: string) =>
    id === 'missing'
      ? Promise.reject(new NotFoundError('Role', id))
      : Promise.resolve({ ...invoice, sections: [] }),
  );
  const source: DocumentSource = { key: 'roles', permissions: ['roles:read'], build };
  registry.register(source);
  const sent: MailDraft[] = [];
  const mailer = { send: (d: MailDraft) => (sent.push(d), Promise.resolve()) };
  const service = new DocumentsService(
    registry,
    new PdfkitDocumentRenderer(settings()),
    mailer,
    authz,
  );

  beforeEach(() => {
    sent.length = 0;
    audit.record.mockClear();
  });

  it('renders for a caller holding one of the source permissions', async () => {
    const file = await service.render(principal(['roles:read']), 'roles', 'r1');
    expect(file.filename).toMatch(/\.pdf$/);
  });

  it('denies (and audits) callers without the source permission', async () => {
    await expect(service.render(principal(['users:read']), 'roles', 'r1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTHZ_DENIED' }));
  });

  it('fails for unknown sources and records', async () => {
    await expect(service.render(principal(['*']), 'nope', 'r1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.render(principal(['*']), 'roles', 'missing')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('e-mails the PDF only with documents:send', async () => {
    const input = { to: 'auditor@nib.et', message: 'For the quarterly review.' };
    await expect(
      service.send(principal(['roles:read']), 'roles', 'r1', input),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(sent).toHaveLength(0);

    const result = await service.send(
      principal(['roles:read', 'documents:send']),
      'roles',
      'r1',
      input,
    );
    expect(result).toMatchObject({
      to: 'auditor@nib.et',
      subject: 'Payment receipt RCPT/2026 0042',
    });
    expect(sent[0]!.attachments![0]).toMatchObject({ contentType: 'application/pdf' });
    expect(sent[0]!.paragraphs[0]).toBe('For the quarterly review.');
    expect(sent[0]!.paragraphs.at(-1)).toBe('Sent by abebe.');
  });

  it('lists the sources a caller may print', () => {
    expect(service.available(principal([]))).toEqual([]);
    expect(service.available(principal(['roles:read', 'documents:send']))).toEqual([
      { key: 'roles', canSend: true },
    ]);
  });
});
