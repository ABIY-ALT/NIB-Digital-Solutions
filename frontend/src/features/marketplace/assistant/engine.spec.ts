import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { seedTaxonomy } from '../testing/seed-taxonomy';
import type { AssistantReply, ChatTurn, MarketplaceProduct } from '../types';
import { answer } from './engine';

// The backend seed is the catalog the website ships with.
const seed = JSON.parse(
  readFileSync(
    new URL('../../../../../backend/prisma/seed-marketplace.json', import.meta.url),
    'utf8',
  ),
) as {
  products: Omit<MarketplaceProduct, 'id' | 'updatedAt'>[];
};
const products: MarketplaceProduct[] = seed.products.map(
  (p, i) => ({ ...p, id: `p${i}`, updatedAt: p.createdAt }) as MarketplaceProduct,
);
const taxonomy = seedTaxonomy();
const ask = (q: string, focusSlug?: string) => answer(q, { products, taxonomy, focusSlug });
/** Asks the questions in turn, like the chat widget does, and returns the last answer. */
const chat = (...questions: string[]): AssistantReply => {
  const history: ChatTurn[] = [];
  let last: AssistantReply | undefined;
  for (const q of questions) {
    last = answer(q, { products, taxonomy, history: [...history] });
    history.push({ role: 'user', text: q }, { role: 'assistant', text: last.text });
  }
  return last!;
};
const product = (slug: string) => products.find((p) => p.slug === slug)!;

describe('on-device grounded assistant', () => {
  it('knows the shipped industries and business needs', () => {
    expect(taxonomy.industries).toHaveLength(8);
    expect(taxonomy.needs).toHaveLength(7);
    expect(taxonomy.industries[0]).toMatchObject({ id: 'education', icon: 'GraduationCap' });
    expect(taxonomy.industries[0]!.keywords).toContain('school');
  });

  it('recommends the school product for schools', () => {
    expect(ask('What products do you have for schools?').products[0]).toBe(
      'school-management-system',
    );
  });

  it('finds building management', () => {
    expect(ask('Which product can automate building management?').products[0]).toBe(
      'building-management-system',
    );
  });

  it('lists lending solutions', () => {
    expect(ask('Do you have a digital lending solution?').products).toEqual(
      expect.arrayContaining([
        'micro-lending-platform',
        'sme-lending-solution',
        'loan-origination-system',
      ]),
    );
  });

  it('lists only products with mobile apps or USSD', () => {
    const r = ask('Which products support mobile applications?');
    expect(r.products.length).toBeGreaterThan(3);
    for (const slug of r.products)
      expect(products.find((p) => p.slug === slug)!.platforms.some((x) => x !== 'web')).toBe(true);
  });

  it('answers customization and integration questions without inventing scope', () => {
    expect(ask('Can your products be customized?').actions.some((a) => a.kind === 'inquiry')).toBe(
      true,
    );
    expect(ask('Can your products integrate with existing systems?').text).toMatch(/integrat/i);
  });

  it('refuses to confirm undocumented capabilities', () => {
    const r = ask('Does the bus ticket platform support GPS tracking with drones?');
    expect(r.grounded).toBe(false);
  });

  it('uses product FAQs on product pages and never quotes a price', () => {
    expect(ask('Is there a mobile app for parents?', 'school-management-system').text).toMatch(
      /Android and iOS/,
    );
    const pricing = ask('How much does the SACCOS system cost?');
    expect(pricing.text).not.toMatch(/ETB\s?\d/);
    expect(pricing.actions[0]!.kind).toBe('inquiry');
  });

  it('admits when nothing matches', () => {
    expect(ask('What is the weather on Mars?').grounded).toBe(false);
  });

  it('answers follow-up questions about the product discussed last', () => {
    const benefits = chat('Tell me about the bus ticket platform', 'What are the benefits?');
    expect(benefits.products).toEqual(['bus-ticket-sales-platform']);
    expect(benefits.text).toMatch(/Key benefits/);
    expect(chat('Tell me about chereta', 'Does it work with USSD?').products).toEqual([
      'online-chereta',
    ]);
    expect(
      chat('Tell me about SME lending', 'Compare it with the micro lending platform').products,
    ).toEqual(['sme-lending-solution', 'micro-lending-platform']);
  });

  it('asks which product is meant, then answers the earlier question for the choice', () => {
    const which = chat('What do you have for retail?', 'Does it support USSD?');
    expect(which.text).toMatch(/^Which product do you mean/);
    const second = which.products[1]!;
    const picked = chat('What do you have for retail?', 'Does it support USSD?', 'the second one');
    expect(picked.products).toEqual([second]);
    expect(picked.text).toContain('is available on');
  });

  it('understands misspelt product names without correcting ordinary words', () => {
    expect(ask('schol managment sytem').products[0]).toBe('school-management-system');
    expect(ask('doctr apointment').products[0]).toBe('doctor-appointment-system');
    expect(ask('I think so').text).not.toMatch(/welcome/i);
  });

  it('never accepts account numbers, PINs or contact details in the chat', () => {
    for (const q of ['my account number is 1000123456789', 'my pin is 1234']) {
      const r = ask(q);
      expect(r.text).toMatch(/don't share/);
      expect(r.products).toEqual([]);
    }
    expect(ask('call me on 0911223344').text).toMatch(/contact form/);
    expect(ask('Is the OTP sent by SMS?').text).not.toMatch(/don't share/);
  });

  it('keeps to digital products and explains what it is', () => {
    expect(ask('How do I open a bank account?').text).toMatch(/personal banking/);
    expect(ask('What is the exchange rate today?').products).toEqual([]);
    expect(ask('Who are you?').text).toMatch(/automated/);
    expect(ask('What can you do?').text).toMatch(/Compare two products/);
  });

  it('filters the catalog by platform, status and count', () => {
    const ussd = ask('Which products have USSD?');
    expect(ussd.products.length).toBeGreaterThan(0);
    for (const slug of ussd.products) expect(product(slug).platforms).toContain('ussd');
    const pilot = ask('Which products are in pilot?');
    expect(pilot.products.length).toBeGreaterThan(0);
    for (const slug of pilot.products) expect(product(slug).availability).toBe('pilot');
    expect(ask('How many products do you have?').text).toContain(
      `${products.length} digital solutions`,
    );
    expect(ask('What do you have for retail?').products).toContain('merchant-application');
  });

  it('answers capability questions from the documentation, and only from it', () => {
    const sms = ask('Does it support SMS?', 'school-management-system');
    expect(sms.grounded).toBe(true);
    expect(sms.text).toMatch(/SMS notifications/);
    expect(ask('Can parents see their child grades?').text).toMatch(/Parent & Student App/);
    expect(ask('Does the school system track sales?').grounded).toBe(false);
    expect(ask('Is there GPS tracking?', 'bus-ticket-sales-platform').grounded).toBe(false);
    const telebirr = ask('Do you integrate with telebirr?');
    expect(telebirr.grounded).toBe(false);
    expect(telebirr.text).toMatch(/telebirr/);
  });

  it('does not mistake a product name for a topic', () => {
    const r = ask('Tell me about the merchant app');
    expect(r.products).toEqual(['merchant-application']);
    expect(r.text).toMatch(/\*\*Modules:\*\*/);
  });

  it("answers from another product's FAQ when it asks exactly that", () => {
    expect(ask('Can merchants join the marketplace?').products).toEqual(['nibtera-gebeya-bnpl']);
    expect(ask('Can one ticket be used twice?').products).toEqual(['digital-event-ticketing']);
  });

  it('recommends every product the visitor names', () => {
    expect(ask('What do you offer for schools and hospitals?').products).toEqual(
      expect.arrayContaining(['school-management-system', 'doctor-appointment-system']),
    );
  });

  it('understands common Amharic words and says when it cannot', () => {
    expect(ask('ለትምህርት ቤቶች ምን አላችሁ?').products[0]).toBe('school-management-system');
    expect(ask('ዋጋው ስንት ነው?').actions[0]!.kind).toBe('inquiry');
    expect(ask('ምን ትመክሩኛላችሁ').grounded).toBe(false);
  });

  it('routes pricing on a product page to a pricing request', () => {
    const r = ask('How much is it?', 'building-management-system');
    expect(r.actions[0]).toMatchObject({ kind: 'inquiry', label: 'Request pricing' });
    expect(r.products).toEqual(['building-management-system']);
  });
});
