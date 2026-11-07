import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import type { MailMessage, MailTransport } from '#core/application/ports/mail.port.js';
import { ExternalServiceError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';

/** The address part of `Name <address>` (or the value itself). */
export function mailAddress(from: string): string {
  const value = from.trimEnd();
  if (!value.endsWith('>')) return from.trim();
  const close = value.length - 1;
  const open = value.indexOf('<', value.lastIndexOf('>', close - 1) + 1);
  return open !== -1 && open < close - 1 ? value.slice(open + 1, close).trim() : from.trim();
}

/**
 * SMTP mail transport (MAIL_TRANSPORT=smtp): the bank's mail relay, Office 365,
 * Gmail, SES SMTP. Uses STARTTLS on 587 or implicit TLS on 465 (SMTP_SECURE).
 * Connections are pooled; credentials are optional for relays that trust the
 * server's address.
 */
@Injectable()
export class SmtpMailTransport implements MailTransport, OnModuleDestroy {
  readonly name = 'smtp';
  private transporter?: Transporter;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async send(message: MailMessage): Promise<void> {
    const address = mailAddress(this.config.mail.from);
    try {
      await this.connection().sendMail({
        from: message.fromName ? { name: message.fromName, address } : this.config.mail.from,
        to: message.toName ? { name: message.toName, address: message.to } : message.to,
        replyTo: message.replyTo || undefined,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
    } catch (error) {
      // The cause (host, credentials, recipient) is logged; callers get a safe message.
      throw new ExternalServiceError(ErrorCode.EXTERNAL_SERVICE_UNAVAILABLE, 'mail', error);
    }
  }

  onModuleDestroy(): void {
    this.transporter?.close();
  }

  private connection(): Transporter {
    const { smtp } = this.config.mail;
    this.transporter ??= createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      // Port 587: refuse to continue in clear text if the server offers no STARTTLS.
      requireTLS: !smtp.secure && smtp.requireTls,
      auth: smtp.user ? { user: smtp.user, pass: smtp.password ?? '' } : undefined,
      tls: { rejectUnauthorized: smtp.rejectUnauthorized },
      pool: true,
      connectionTimeout: smtp.timeoutMs,
      greetingTimeout: smtp.timeoutMs,
      socketTimeout: smtp.timeoutMs,
    });
    return this.transporter;
  }
}
