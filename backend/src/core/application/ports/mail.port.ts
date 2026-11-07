/**
 * Outbound e-mail.
 *
 *   MAIL_TRANSPORT  the wire (SMTP, a provider API, or the development logger).
 *                   Swap it by binding another adapter; nothing else changes.
 *   MAILER          what features use: a message in plain parts (greeting,
 *                   paragraphs, one button, attachments) that is rendered in
 *                   the product's layout, with sender, reply-to and footer
 *                   taken from the runtime settings.
 *
 *   await this.mailer.send({
 *     to: user.email, toName: user.fullName,
 *     subject: 'Reset your password',
 *     paragraphs: ['We received a request to reset your password.'],
 *     action: { label: 'Choose a new password', url },
 *   });
 */
export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface MailMessage {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  html?: string;
  /** Display name of the sender; the address is MAIL_FROM. */
  fromName?: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}

export interface MailTransport {
  /** Name shown in logs and the compliance overview ("smtp", "log"). */
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MailTransport');

export interface MailDraft {
  to: string;
  toName?: string;
  subject: string;
  /** Heading inside the message. Defaults to the subject. */
  heading?: string;
  paragraphs: string[];
  /** One call-to-action button (also written out as a link in the text version). */
  action?: { label: string; url: string };
  /** Small print under the button (e.g. "This link expires in 30 minutes"). */
  note?: string;
  attachments?: MailAttachment[];
}

export interface Mailer {
  send(draft: MailDraft): Promise<void>;
}

export const MAILER = Symbol('Mailer');
