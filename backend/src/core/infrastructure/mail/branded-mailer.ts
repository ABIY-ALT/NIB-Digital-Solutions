import { Inject, Injectable } from '@nestjs/common';
import {
  MAIL_TRANSPORT,
  type MailDraft,
  type Mailer,
  type MailTransport,
} from '#core/application/ports/mail.port.js';
import { SETTINGS, type Settings } from '#core/application/ports/settings.port.js';

const escapeHtml = (text: string): string =>
  text.replaceAll(/[&<>"']/g, (c) => `&#${c.codePointAt(0)};`);

export interface MailBranding {
  companyName: string;
  footer: string;
  accentColor: string;
}

/** Plain-text version: every mail client can read it and it is what gets logged in development. */
export function renderMailText(draft: MailDraft, brand: MailBranding): string {
  return [
    draft.toName ? `Hello ${draft.toName},` : 'Hello,',
    '',
    ...draft.paragraphs.flatMap((p) => [p, '']),
    ...(draft.action ? [`${draft.action.label}: ${draft.action.url}`, ''] : []),
    ...(draft.note ? [draft.note, ''] : []),
    `— ${brand.companyName}`,
    ...(brand.footer ? ['', brand.footer] : []),
  ].join('\n');
}

/**
 * HTML version. Tables and inline styles only: that is what mail clients
 * (Outlook included) render reliably. All text is escaped.
 */
export function renderMailHtml(draft: MailDraft, brand: MailBranding): string {
  const paragraph = (text: string, style = ''): string =>
    `<p style="margin:0 0 14px;font-size:14px;line-height:22px;color:#323130;${style}">${escapeHtml(text).replaceAll('\n', '<br>')}</p>`;
  const button = draft.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr><td style="border-radius:4px;background:${brand.accentColor}"><a href="${escapeHtml(draft.action.url)}" style="display:inline-block;padding:10px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(draft.action.label)}</a></td></tr></table>`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f2f1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f2f1;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #edebe9;border-radius:8px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<tr><td style="padding:18px 28px;border-bottom:3px solid ${brand.accentColor};font-size:16px;font-weight:600;color:#323130">${escapeHtml(brand.companyName)}</td></tr>
<tr><td style="padding:24px 28px 10px">
<h1 style="margin:0 0 16px;font-size:18px;line-height:26px;color:#201f1e">${escapeHtml(draft.heading ?? draft.subject)}</h1>
${paragraph(draft.toName ? `Hello ${draft.toName},` : 'Hello,')}
${draft.paragraphs.map((p) => paragraph(p)).join('\n')}
${button}
${draft.note ? paragraph(draft.note, 'font-size:12px;line-height:18px;color:#605e5c;') : ''}
</td></tr>
<tr><td style="padding:14px 28px 20px;border-top:1px solid #edebe9;font-size:12px;line-height:18px;color:#8a8886">${escapeHtml(brand.footer).replaceAll('\n', '<br>')}</td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * Renders a MailDraft in the product layout and hands it to the transport.
 * Sender name, reply-to, footer and accent colour come from the runtime
 * settings, so an administrator changes them without a deployment.
 */
@Injectable()
export class BrandedMailer implements Mailer {
  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    @Inject(SETTINGS) private readonly settings: Settings,
  ) {}

  async send(draft: MailDraft): Promise<void> {
    const values = await this.settings.all();
    const text = (key: string): string => {
      const value = values[key];
      return typeof value === 'string' ? value : '';
    };
    const brand: MailBranding = {
      companyName: text('company.name'),
      footer: text('mail.footer'),
      accentColor: text('documents.accentColor') || '#8B4E20',
    };
    await this.transport.send({
      to: draft.to,
      toName: draft.toName,
      subject: draft.subject,
      text: renderMailText(draft, brand),
      html: renderMailHtml(draft, brand),
      fromName: text('mail.fromName') || undefined,
      replyTo: text('mail.replyTo') || undefined,
      attachments: draft.attachments,
    });
  }
}
