import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import type { MailMessage, MailTransport } from '#core/application/ports/mail.port.js';

/**
 * Development mail transport (MAIL_TRANSPORT=log): logs the message instead of
 * sending it. Outside production the text is logged too, so links in e-mails
 * (password reset) can be followed without a mail server.
 */
@Injectable()
export class LoggingMailTransport implements MailTransport {
  readonly name = 'log';
  private readonly logger = new Logger('Mail');

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  send(message: MailMessage): Promise<void> {
    this.logger.log(
      {
        from: this.config.mail.from,
        to: message.to,
        subject: message.subject,
        attachments: message.attachments?.map((a) => a.filename),
        ...(this.config.app.isProduction ? {} : { text: message.text }),
      },
      'E-mail (log transport, not sent)',
    );
    return Promise.resolve();
  }
}
