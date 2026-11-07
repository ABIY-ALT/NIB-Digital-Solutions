import type { MailDraft } from '#core/application/ports/mail.port.js';
import type { TelegramButton, TelegramPayload } from './messaging.ports.js';

/** Escapes text for Telegram's HTML parse mode. */
export const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Wording of every message the Q&A workflow sends (pure functions: easy to
 * review and test). Customer e-mail addresses are masked in Telegram, which is
 * a third-party service; developers never need the full address to answer.
 */

export interface MessageContext {
  reference: string;
  questionId: string;
  productName: string;
  customerName: string;
  customerEmail: string;
  /** The text this notification is about (the question or a follow-up). */
  body: string;
  /** Public site address, e.g. https://digital.nibbanksc.com */
  siteUrl: string;
}

/** a***@example.com */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 1)}***@${domain}`;
}

/** Telegram rejects non-https button links (e.g. http://localhost in development). */
const linkButton = (text: string, url: string): TelegramButton[] =>
  url.startsWith('https://') ? [{ text, url }] : [];

export function developerNotification(
  ctx: MessageContext,
  chatId: string,
  kind: 'new' | 'followup',
): TelegramPayload {
  const heading =
    kind === 'new' ? '🆕 <b>NEW PRODUCT QUESTION</b>' : '💬 <b>CUSTOMER FOLLOW-UP</b>';
  const text = [
    heading,
    '',
    `<b>Product:</b> ${escapeHtml(ctx.productName)}`,
    `<b>Customer:</b> ${escapeHtml(ctx.customerName)}`,
    `<b>Email:</b> ${escapeHtml(maskEmail(ctx.customerEmail))}`,
    `<b>Reference:</b> ${escapeHtml(ctx.reference)}`,
    '',
    `<b>${kind === 'new' ? 'Question' : 'Message'}:</b>`,
    escapeHtml(ctx.body),
  ].join('\n');
  return {
    chatId,
    text,
    questionId: ctx.questionId,
    buttons: [
      [{ text: '✍️ Reply to Customer', callbackData: `r:${ctx.questionId}` }],
      [
        { text: '📄 View Question', callbackData: `v:${ctx.questionId}` },
        { text: '⏳ Mark as In Progress', callbackData: `p:${ctx.questionId}` },
      ],
      linkButton('Open in staff portal', `${ctx.siteUrl}/product-questions/${ctx.questionId}`),
    ].filter((row) => row.length),
  };
}

/** When the developer has not linked Telegram (or Telegram is off): the question by e-mail. */
export function developerEmail(
  ctx: MessageContext,
  developer: { name: string; email: string },
  kind: 'new' | 'followup',
): MailDraft {
  return {
    to: developer.email,
    toName: developer.name,
    subject: `${kind === 'new' ? 'New question' : 'Customer follow-up'} about ${ctx.productName} – ${ctx.reference}`,
    heading: kind === 'new' ? 'A customer asked a question' : 'A customer replied',
    paragraphs: [
      `Hello ${developer.name},`,
      `${ctx.customerName} wrote about ${ctx.productName} (reference ${ctx.reference}):`,
      ctx.body,
      'Answer it in the staff portal, or link your Telegram account to receive questions and reply directly in Telegram.',
    ],
    action: {
      label: 'Open the question',
      url: `${ctx.siteUrl}/product-questions/${ctx.questionId}`,
    },
  };
}

export function customerAcknowledgement(ctx: MessageContext, conversationUrl: string): MailDraft {
  return {
    to: ctx.customerEmail,
    toName: ctx.customerName,
    subject: `We received your ${ctx.productName} question – ${ctx.reference}`,
    heading: 'Your question has been received',
    paragraphs: [
      `Dear ${ctx.customerName},`,
      `Thank you for your question about ${ctx.productName}. It has been passed to the product's developer, and you will receive the answer by e-mail.`,
      'Your question:',
      ctx.body,
      `Your reference number is ${ctx.reference}. Use the button below at any time to see the conversation or ask a follow-up question.`,
      'For your security: NIB will never ask you for account numbers, passwords, PINs or one-time codes. Please do not share them.',
    ],
    action: { label: 'View your conversation', url: conversationUrl },
    note: 'You received this e-mail because this address was entered on the NIB Digital Solutions website. Keep the link private: it opens your conversation.',
  };
}

/** The developer's (or staff member's) answer, e-mailed to the customer. */
export function customerReply(
  ctx: MessageContext,
  customerQuestion: string,
  conversationUrl: string,
): MailDraft {
  const firstName = ctx.customerName.split(/\s+/)[0] ?? ctx.customerName;
  return {
    to: ctx.customerEmail,
    toName: ctx.customerName,
    subject: `Response to Your ${ctx.productName} Product Question – ${ctx.reference}`,
    heading: `Response to your ${ctx.productName} question`,
    paragraphs: [
      `Dear ${firstName},`,
      `Thank you for contacting us regarding ${ctx.productName}.`,
      'Your question:',
      customerQuestion,
      'Developer response:',
      ctx.body,
      `If you need further clarification, you can reply through our website using your reference number ${ctx.reference}.`,
      'Best regards,\nDigital Product Development Team',
    ],
    action: { label: 'Reply on our website', url: conversationUrl },
    note: 'Keep this link private: it opens your conversation.',
  };
}

/** The conversation as one Telegram message ("View Question"). */
export function conversationText(
  ctx: Omit<MessageContext, 'body' | 'siteUrl'> & { status: string },
  messages: { author: string; authorName: string; body: string; createdAt: Date }[],
): string {
  const lines = [
    `📄 <b>${escapeHtml(ctx.reference)}</b> · ${escapeHtml(ctx.productName)}`,
    `<b>Customer:</b> ${escapeHtml(ctx.customerName)} (${escapeHtml(maskEmail(ctx.customerEmail))})`,
    `<b>Status:</b> ${escapeHtml(ctx.status.replace('_', ' '))}`,
  ];
  for (const m of messages.slice(-12)) {
    const when = m.createdAt.toISOString().slice(0, 16).replace('T', ' ');
    const who = m.author === 'customer' ? '🙋 Customer' : `🛠 ${escapeHtml(m.authorName)}`;
    lines.push('', `<b>${who}</b> · <i>${when} UTC</i>`, escapeHtml(m.body));
  }
  return lines.join('\n');
}
