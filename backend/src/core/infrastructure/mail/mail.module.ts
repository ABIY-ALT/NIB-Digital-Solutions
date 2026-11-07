import { Global, Module } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { MAIL_TRANSPORT, MAILER } from '#core/application/ports/mail.port.js';
import { BrandedMailer } from './branded-mailer.js';
import { LoggingMailTransport } from './logging-mail.transport.js';
import { SmtpMailTransport } from './smtp-mail.transport.js';

/**
 * Outbound e-mail for every feature: inject MAILER to send a message in the
 * product layout. The transport is chosen by MAIL_TRANSPORT ("log" in
 * development, "smtp" in production); bind another adapter here for a
 * provider API.
 */
@Global()
@Module({
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.mail.transport === 'smtp'
          ? new SmtpMailTransport(config)
          : new LoggingMailTransport(config),
    },
    { provide: MAILER, useClass: BrandedMailer },
  ],
  exports: [MAIL_TRANSPORT, MAILER],
})
export class MailModule {}
