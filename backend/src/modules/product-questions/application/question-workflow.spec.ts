import { describe, expect, it } from 'vitest';
import type { AppConfig } from '#config/app-config.js';
import type { TransactionManager } from '#core/application/ports/transaction.port.js';
import { ConflictError, ForbiddenError, NotFoundError } from '#core/domain/errors/app-error.js';
import type { DigitalProduct } from '#modules/digital-products/domain/digital-product.entity.js';
import type { DigitalProductRepository } from '#modules/digital-products/domain/digital-product.repository.js';
import { ProductDeveloper } from '#modules/product-developers/domain/product-developer.entity.js';
import type { ProductDeveloperRepository } from '#modules/product-developers/domain/product-developer.repository.js';
import type { ProductQuestion, QuestionMessage } from '../domain/product-question.entity.js';
import type {
  NewMessage,
  ProductQuestionRepository,
} from '../domain/product-question.repository.js';
import type { OutboundPayload } from './messaging.ports.js';
import type { OutboxService } from './outbox.service.js';
import { maskEmail } from './question-messages.js';
import { QuestionWorkflow } from './question-workflow.js';

const config = {
  app: { publicUrl: 'https://digital.example' },
  marketplace: { privacySalt: 'test-salt-test-salt-test-salt' },
} as unknown as AppConfig;
const tx = { run: (fn: () => Promise<unknown>) => fn() } as TransactionManager;

function developer(name: string, chatId: string | null, active = true) {
  const d = ProductDeveloper.create(
    { name, email: `${name.toLowerCase()}@nib.example`, active },
    null,
  );
  if (chatId) d.linkTelegram(chatId, null);
  return d;
}

function setup(opts: { supportStatus?: string; backup?: boolean; third?: boolean } = {}) {
  const main = developer('Hana', '111');
  const backup = developer('Dawit', null); // not on Telegram: gets e-mail
  const other = developer('Selam', '333'); // a developer of another product
  const third = developer('Meron', '444'); // an optional third developer
  const devs = [main, backup, other, third];
  const backupId = opts.backup === false ? null : backup.id;
  const thirdId = opts.third ? third.id : null;
  const product = {
    slug: 'school-management-system',
    name: 'Askuala',
    developerId: main.id,
    backupDeveloperId: backupId,
    thirdDeveloperId: thirdId,
    developerIds: [main.id, backupId, thirdId].filter(Boolean),
    supportStatus: opts.supportStatus ?? 'active',
  } as unknown as DigitalProduct;

  const questions = new Map<string, ProductQuestion>();
  const messages: (NewMessage & { questionId: string })[] = [];
  const questionRepo = {
    save: (q: ProductQuestion) => (questions.set(q.id, q), Promise.resolve(q)),
    update: (q: ProductQuestion) => (questions.set(q.id, q), Promise.resolve(q)),
    getById: (id: string) => Promise.resolve(questions.get(id)!),
    findById: (id: string) => Promise.resolve(questions.get(id) ?? null),
    findByReference: (ref: string) =>
      Promise.resolve([...questions.values()].find((q) => q.reference === ref) ?? null),
    addMessage: (questionId: string, m: NewMessage): Promise<QuestionMessage> => {
      messages.push({ ...m, questionId });
      return Promise.resolve({ ...m, id: `m${messages.length}`, createdAt: new Date() });
    },
    messages: (questionId: string) =>
      Promise.resolve(
        messages
          .filter((m) => m.questionId === questionId)
          .map((m, i) => ({ ...m, id: `m${i}`, createdAt: new Date() })),
      ),
    countRecentByEmail: () => Promise.resolve(0),
    countRecentFromIp: () => Promise.resolve(0),
  } as unknown as ProductQuestionRepository;
  const productRepo = {
    findPublishedBySlug: (slug: string) => Promise.resolve(slug === product.slug ? product : null),
    findByUnique: () => Promise.resolve(product),
  } as unknown as DigitalProductRepository;
  const developerRepo = {
    findByIds: (ids: string[]) => Promise.resolve(devs.filter((d) => ids.includes(d.id))),
  } as unknown as ProductDeveloperRepository;
  const queued: { key: string; payload: OutboundPayload }[] = [];
  const outbox = {
    enqueue: (key: string, payload: OutboundPayload) => {
      if (queued.some((q) => q.key === key)) return Promise.resolve(null);
      queued.push({ key, payload });
      return Promise.resolve(key);
    },
    kick: () => undefined,
    deliveries: () => Promise.resolve([]),
  } as unknown as OutboxService;

  const workflow = new QuestionWorkflow(
    questionRepo,
    productRepo,
    developerRepo,
    tx,
    config,
    outbox,
  );
  return { workflow, queued, main, backup, other, third };
}

const ask = {
  productSlug: 'school-management-system',
  customerName: 'Abebe Kebede',
  customerEmail: 'abebe@example.com',
  question: 'How can schools register and manage student payments?',
  ipHash: 'ip',
};

describe('QuestionWorkflow', () => {
  it("routes a new question only to the product's developers (Telegram, else e-mail) and acknowledges the customer", async () => {
    const { workflow, queued, main, backup } = setup();
    const { question, conversationUrl } = await workflow.submit(ask);
    const telegram = queued.filter((q) => q.payload.channel === 'telegram');
    expect(telegram).toHaveLength(1);
    expect(telegram[0]!.payload.channel === 'telegram' && telegram[0]!.payload.message.chatId).toBe(
      main.telegramChatId,
    );
    expect(queued.some((q) => q.key.startsWith('mail-dev:') && q.key.endsWith(backup.id))).toBe(
      true,
    );
    expect(queued.some((q) => q.key === `mail-ack:${question.id}`)).toBe(true);
    expect(queued).toHaveLength(3); // never broadcast to other developers
    expect(conversationUrl).toMatch(
      /^https:\/\/digital\.example\/questions\/QST-\d{6}-[A-Z0-9]{5}\?t=/,
    );
  });

  it("never shows the customer's full e-mail address in Telegram", async () => {
    const { workflow, queued } = setup();
    await workflow.submit(ask);
    const msg = queued.find((q) => q.payload.channel === 'telegram')!.payload;
    expect(msg.channel === 'telegram' && msg.message.text).not.toContain('abebe@example.com');
    expect(maskEmail('abebe@example.com')).toBe('a***@example.com');
  });

  it('refuses questions when support is paused', async () => {
    const { workflow } = setup({ supportStatus: 'paused' });
    await expect(workflow.submit(ask)).rejects.toBeInstanceOf(ConflictError);
  });

  it('lets only the assigned developers act on a question', async () => {
    const { workflow, main, backup, other } = setup();
    const { question } = await workflow.submit(ask);
    await expect(workflow.authoriseDeveloper(main, question.id)).resolves.toBeDefined();
    await expect(workflow.authoriseDeveloper(backup, question.id)).resolves.toBeDefined();
    await expect(workflow.authoriseDeveloper(other, question.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    main.update({ active: false }, null);
    await expect(workflow.authoriseDeveloper(main, question.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('sends questions to a third developer too, and lets them answer', async () => {
    const { workflow, queued, third, other } = setup({ third: true });
    const { question } = await workflow.submit(ask);
    const telegram = queued.filter((q) => q.payload.channel === 'telegram');
    expect(
      telegram
        .map((q) => (q.payload.channel === 'telegram' ? q.payload.message.chatId : ''))
        .sort(),
    ).toEqual(['111', '444']);
    await expect(workflow.authoriseDeveloper(third, question.id)).resolves.toBeDefined();
    await expect(workflow.authoriseDeveloper(other, question.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("e-mails each answer once, with the customer's question and a reply link; status → answered", async () => {
    const { workflow, queued, main } = setup();
    const { question } = await workflow.submit(ask);
    const { message } = await workflow.answer(
      question.id,
      'Parents pay through NIB mobile banking.',
      {
        kind: 'developer',
        name: main.name,
        developerId: main.id,
        channel: 'telegram',
        actorId: null,
      },
    );
    const reply = queued.find((q) => q.key === `mail-reply:${message.id}`)!.payload;
    expect(reply.channel).toBe('email');
    if (reply.channel === 'email') {
      expect(reply.draft.subject).toBe(
        `Response to Your Askuala Product Question – ${question.reference}`,
      );
      expect(reply.draft.paragraphs.join('\n')).toContain(ask.question);
      expect(reply.draft.action?.url).toContain(`/questions/${question.reference}?t=`);
    }
    expect((await workflow.conversationForStaff(question.id)).question.status).toBe('answered');
  });

  it('opens a conversation only with the right private token', async () => {
    const { workflow } = setup();
    const { question, conversationUrl } = await workflow.submit(ask);
    const token = new URL(conversationUrl).searchParams.get('t')!;
    await expect(
      workflow.conversationForCustomer(question.reference, token),
    ).resolves.toBeDefined();
    await expect(
      workflow.conversationForCustomer(question.reference, 'x'.repeat(32)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('notifies the developers of a follow-up, but not on a closed conversation', async () => {
    const { workflow, queued } = setup();
    const { question, conversationUrl } = await workflow.submit(ask);
    const token = new URL(conversationUrl).searchParams.get('t')!;
    const before = queued.length;
    await workflow.followUp(question.reference, token, 'Can parents also pay by USSD?');
    expect(queued.length).toBe(before + 2); // main (Telegram) + backup (e-mail)
    await workflow.setStatus(question.id, 'closed', 'staff');
    await expect(
      workflow.followUp(question.reference, token, 'One more thing'),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
