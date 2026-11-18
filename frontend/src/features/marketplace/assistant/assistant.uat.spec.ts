import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EN } from '../taxonomy';
import { seedTaxonomy } from '../testing/seed-taxonomy';
import type { AssistantReply, ChatTurn, MarketplaceProduct, TaxonomyEntry } from '../types';
import { answer } from './engine';

// ─────────────────────────────────────────────────────────────────────────────
// UAT — Digital Solutions Assistant, on-device mode (no AI key configured).
//
// Each case is what a tester does on the public website and the result that
// must be seen. The catalog is the one the website ships with (the backend
// seed), and the preset questions are read from the site's English messages,
// so the cases follow the texts visitors actually click.
//
// Every answer, in every case, must also pass the acceptance rules in
// `accept()`: never empty, only real products and links, never a price.
// The browser behaviour (chat widget, buttons, privacy) is covered by
// components/site/assistant.uat.spec.tsx.
// ─────────────────────────────────────────────────────────────────────────────

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const seed = JSON.parse(read('../../../../../backend/prisma/seed-marketplace.json')) as {
  products: Omit<MarketplaceProduct, 'id' | 'updatedAt'>[];
};
const products: MarketplaceProduct[] = seed.products.map(
  (p, i) => ({ ...p, id: `p${i}`, updatedAt: p.createdAt }) as MarketplaceProduct,
);
const taxonomy = seedTaxonomy();
const ui = (
  JSON.parse(read('../i18n/en.json')) as {
    marketplace: {
      assistant: {
        suggestions: Record<string, string>;
        productSuggestions: Record<string, string>;
      };
      catalog: { browse: { askPrompt: string } };
    };
  }
).marketplace;
const fill = (template: string, name: string) => template.replace('{name}', name);
const slugs = new Set(products.map((p) => p.slug));
const product = (slug: string) => products.find((p) => p.slug === slug)!;

/** The acceptance rules every answer must meet. */
function accept(r: AssistantReply) {
  expect(r.text.trim().length).toBeGreaterThan(0);
  for (const slug of r.products) expect(slugs).toContain(slug);
  expect(r.actions.length).toBeLessThanOrEqual(3);
  for (const a of r.actions) {
    expect(a.label.trim().length).toBeGreaterThan(0);
    if (a.kind === 'view') expect(slugs).toContain(a.slug);
  }
  // Prices are never quoted.
  expect(r.text).not.toMatch(/\b(?:ETB|birr|br\.?)\s?\d|\d[\d,.]*\s?(?:ETB|birr)\b/i);
}

/** Asks the questions in turn (as the chat does) on an optional product page; returns the last answer. */
function ask(questions: string | string[], on?: string): AssistantReply {
  const history: ChatTurn[] = [];
  let last: AssistantReply | undefined;
  for (const q of [questions].flat()) {
    last = answer(q, { products, taxonomy, focusSlug: on, history: [...history] });
    accept(last);
    history.push({ role: 'user', text: q }, { role: 'assistant', text: last.text });
  }
  return last!;
}

const productsIn = (entry: TaxonomyEntry, kind: 'industries' | 'needs') =>
  products.filter((p) => p[kind].includes(entry.id));

describe('UAT-A · Home page suggestion chips', () => {
  const s = ui.assistant.suggestions;

  it('UAT-A01 · "schools" chip recommends the School Management System', () => {
    expect(ask(s['schools']!).products[0]).toBe('school-management-system');
  });
  it('UAT-A02 · "building" chip recommends the Building Management System', () => {
    expect(ask(s['building']!).products[0]).toBe('building-management-system');
  });
  it('UAT-A03 · "lending" chip lists the lending solutions', () => {
    expect(ask(s['lending']!).products).toEqual(
      expect.arrayContaining([
        'micro-lending-platform',
        'sme-lending-solution',
        'loan-origination-system',
      ]),
    );
  });
  it('UAT-A04 · "customize" chip explains customization and offers the team', () => {
    const r = ask(s['customize']!);
    expect(r.text).toMatch(/customiz/i);
    expect(r.actions.some((a) => a.kind === 'inquiry')).toBe(true);
  });
  it('UAT-A05 · "mobile" chip lists only products with an app or USSD', () => {
    const r = ask(s['mobile']!);
    expect(r.products.length).toBeGreaterThan(0);
    for (const slug of r.products)
      expect(product(slug).platforms.some((x) => x !== 'web')).toBe(true);
  });
  it('UAT-A06 · "integrate" chip explains integration without inventing scope', () => {
    const r = ask(s['integrate']!);
    expect(r.text).toMatch(/integrat/i);
    expect(r.text).toMatch(/product team/);
  });
});

describe('UAT-B · Product page suggestion chips (every product)', () => {
  const s = ui.assistant.productSuggestions;
  for (const p of products) {
    describe(p.name, () => {
      it(`UAT-B01 · "${fill(s['what']!, p.name)}" describes the product`, () => {
        const r = ask(fill(s['what']!, p.name), p.slug);
        expect(r.products[0]).toBe(p.slug);
        expect(r.text).toContain(p.overview);
      });
      it('UAT-B02 · "Which modules are included?" lists every module', () => {
        const r = ask(s['modules']!, p.slug);
        for (const m of p.content.modules) expect(r.text).toContain(m.name);
      });
      it('UAT-B03 · "Can it integrate…?" lists the documented integrations', () => {
        const r = ask(s['integrate']!, p.slug);
        for (const i of p.content.integrations) expect(r.text).toContain(i);
        expect(r.grounded).toBe(true);
      });
      it('UAT-B04 · "Is there a mobile app?" answers from the listed platforms', () => {
        // From the platform list or the product's own FAQ; either names every mobile platform.
        const r = ask(s['mobile']!, p.slug);
        const mobile = p.platforms.filter((x) => x !== 'web');
        if (mobile.length) for (const x of mobile) expect(r.text).toContain(EN.platform[x]);
        else expect(r.text).toMatch(/web application/);
      });
      it('UAT-B05 · "Can it be customized?" answers from the product record', () => {
        const r = ask(s['customize']!, p.slug);
        expect(r.text).toMatch(
          p.customizable ? /can be configured and customized/ : /isn't listed/,
        );
      });
      it('UAT-B06 · "How do I get a demo?" offers a demo of this product', () => {
        const r = ask(s['demo']!, p.slug);
        expect(r.actions.some((a) => a.kind === 'demo' && a.slug === p.slug)).toBe(true);
      });
    });
  }
});

describe('UAT-C · Catalog page "Which product fits …?" (every industry and business need)', () => {
  const cases = [
    ...taxonomy.industries.map((e) => ({ e, kind: 'industries' as const })),
    ...taxonomy.needs.map((e) => ({ e, kind: 'needs' as const })),
  ];
  for (const { e, kind } of cases) {
    it(`UAT-C · "${fill(ui.catalog.browse.askPrompt, e.name)}" lists the products filed under it`, () => {
      const expected = productsIn(e, kind).map((p) => p.slug);
      const r = ask(fill(ui.catalog.browse.askPrompt, e.name));
      if (!expected.length) return;
      expect(r.products.length).toBe(Math.min(6, expected.length));
      for (const slug of r.products) expect(expected).toContain(slug);
    });
  }
});

describe('UAT-D · Recommendations from a business description', () => {
  const cases: [string, string, string][] = [
    ['UAT-D01', 'I run a hospital, what can you offer?', 'doctor-appointment-system'],
    ['UAT-D02', 'I own a bus company', 'bus-ticket-sales-platform'],
    ['UAT-D03', "I'm a landlord with 3 apartments", 'building-management-system'],
    ['UAT-D04', 'I want to sell tickets for a concert', 'digital-event-ticketing'],
    ['UAT-D05', 'Do you have something for a cooperative?', 'saccos-automation'],
    [
      'UAT-D06',
      'I need software for my clinic to manage appointments',
      'doctor-appointment-system',
    ],
    ['UAT-D07', 'I have a restaurant', 'merchant-application'],
    [
      'UAT-D08',
      'Hello, I need help to manage my tenants and collect rent',
      'building-management-system',
    ],
    ['UAT-D09', 'Which product supports QR payments?', 'merchant-application'],
    ['UAT-D10', 'Do you have products for hotels?', 'merchant-application'],
  ];
  for (const [id, q, slug] of cases)
    it(`${id} · "${q}" → ${slug}`, () => {
      expect(ask(q).products[0]).toBe(slug);
    });

  it('UAT-D11 · several named needs recommend every matching product', () => {
    expect(ask('What do you offer for schools and hospitals?').products).toEqual(
      expect.arrayContaining(['school-management-system', 'doctor-appointment-system']),
    );
  });
  it('UAT-D12 · a small shop gets retail products', () => {
    expect(ask('Which product is best for a small shop?').products).toContain(
      'merchant-application',
    );
  });
  it('UAT-D13 · an unknown business type gets general business products, honestly framed', () => {
    const r = ask('I have a bakery');
    expect(r.text).toMatch(/don't have a solution built specifically/);
    expect(r.products.length).toBeGreaterThan(0);
  });
});

describe('UAT-E · Product questions answered from the documentation only', () => {
  it('UAT-E01 · a product FAQ is answered with its approved answer', () => {
    const r = ask('Can I import student data from Excel?');
    expect(r.text).toContain('imported from Excel or CSV');
  });
  it('UAT-E02 · a FAQ of another product is found without naming the product', () => {
    expect(ask('Can one ticket be used twice?').products).toEqual(['digital-event-ticketing']);
    expect(ask('Can merchants join the marketplace?').products).toEqual(['nibtera-gebeya-bnpl']);
  });
  it('UAT-E03 · a documented capability is confirmed with the module that provides it', () => {
    const r = ask('Can parents see their child grades?');
    expect(r.text).toMatch(/Parent & Student App/);
    expect(r.grounded).toBe(true);
  });
  it('UAT-E04 · a documented integration is confirmed', () => {
    const r = ask('Does it support SMS?', 'school-management-system');
    expect(r.text).toMatch(/SMS notifications/);
  });
  it('UAT-E05 · an undocumented capability is never confirmed', () => {
    for (const [q, on] of [
      ['Does the bus ticket platform support GPS tracking with drones?', undefined],
      ['Is there GPS tracking?', 'bus-ticket-sales-platform'],
      ['Does the school system track sales?', undefined],
      ['Does the bus platform support Amharic?', undefined],
    ] as const) {
      const r = ask(q, on);
      expect(r.grounded, q).toBe(false);
      expect(r.text, q).toMatch(/can't confirm/);
      expect(
        r.actions.some((a) => a.kind === 'inquiry'),
        q,
      ).toBe(true);
    }
  });
  it('UAT-E06 · an undocumented integration is never confirmed', () => {
    const r = ask('Do you integrate with telebirr?');
    expect(r.grounded).toBe(false);
    expect(r.text).toMatch(/telebirr/);
    expect(ask('Does it integrate with telebirr?', 'merchant-application').grounded).toBe(false);
  });
  it('UAT-E07 · a product without a mobile app says so', () => {
    expect(ask('Can I use it on my phone?', 'loan-origination-system').text).toMatch(
      /web application/,
    );
  });
  it('UAT-E08 · a pilot product says it is in pilot', () => {
    expect(ask('Is the doctor appointment system available now?').text).toMatch(/Pilot/);
  });
  it('UAT-E09 · security lists only documented security features', () => {
    const r = ask('How secure is the loan origination system?');
    expect(r.text).toMatch(/Active Directory \/ SSO/);
    expect(ask('What about security?', 'building-management-system').grounded).toBe(false);
  });
  it('UAT-E10 · two products are compared side by side', () => {
    const r = ask('What is the difference between micro lending and SME lending?');
    expect(r.products).toEqual(['micro-lending-platform', 'sme-lending-solution']);
    expect(r.text).toMatch(/Purpose:[\s\S]*Purpose:/);
  });
});

describe('UAT-F · Catalog questions', () => {
  it('UAT-F01 · how many products', () => {
    expect(ask('How many products do you have?').text).toContain(
      `${products.length} digital solutions`,
    );
  });
  it('UAT-F02 · products on USSD / iPhone', () => {
    for (const [q, platform] of [
      ['Which products have USSD?', 'ussd'],
      ['Which products are available on iPhone?', 'ios'],
    ] as const) {
      const r = ask(q);
      expect(r.products.length).toBeGreaterThan(0);
      for (const slug of r.products) expect(product(slug).platforms).toContain(platform);
    }
  });
  it('UAT-F03 · products in pilot', () => {
    const r = ask('Which products are in pilot?');
    expect(r.products.length).toBeGreaterThan(0);
    for (const slug of r.products) expect(product(slug).availability).toBe('pilot');
  });
  it('UAT-F04 · products coming soon (none in the catalog) points to the ideas board', () => {
    expect(ask('What is coming soon?').text).toMatch(/What Should We Build Next/);
  });
  it('UAT-F05 · on-premise and hybrid deployment', () => {
    for (const slug of ask('Which products can be deployed on premise?').products)
      expect(product(slug).deployment).toContain('on_premise');
    for (const slug of ask('Is there a hybrid deployment option?').products)
      expect(product(slug).deployment).toContain('hybrid');
  });
  it('UAT-F06 · products with a demo video', () => {
    const r = ask('Which products have a demo video?');
    for (const slug of r.products) expect(product(slug).content.demo).not.toBeNull();
  });
  it('UAT-F07 · a category of business ("What do you have for retail?") lists that industry', () => {
    expect(ask('What do you have for retail?').products).toContain('merchant-application');
  });
});

describe('UAT-G · Conversation', () => {
  it('UAT-G01 · follow-up questions refer to the product discussed', () => {
    const r = ask(['Tell me about the bus ticket platform', 'What are the benefits?']);
    expect(r.products).toEqual(['bus-ticket-sales-platform']);
    expect(r.text).toMatch(/Key benefits/);
    expect(ask(['Tell me about chereta', 'And the modules?']).text).toMatch(/Bidding/);
    expect(ask(['Tell me about the bus ticket platform', 'Does it work with USSD?']).text).toMatch(
      /USSD/,
    );
  });
  it('UAT-G02 · "tell me more" continues with the same product', () => {
    expect(ask(['What products do you have for schools?', 'Tell me more']).products).toEqual([
      'school-management-system',
    ]);
  });
  it('UAT-G03 · "compare it with …" compares with the product discussed', () => {
    expect(
      ask(['Tell me about SME lending', 'Compare it with the micro lending platform']).products,
    ).toEqual(['sme-lending-solution', 'micro-lending-platform']);
  });
  it('UAT-G04 · an unclear "it" after a list asks which product, then answers for the choice', () => {
    const which = ask(['What do you have for retail?', 'Does it support USSD?']);
    expect(which.text).toMatch(/^Which product do you mean/);
    const r = ask(['What do you have for retail?', 'Does it support USSD?', 'the second one']);
    expect(r.products).toEqual([which.products[1]]);
  });
});

describe('UAT-H · Commercial questions', () => {
  it('UAT-H01 · prices are never quoted; a pricing request is offered', () => {
    for (const [q, on] of [
      ['How much does the SACCOS system cost?', undefined],
      ['How much is it?', 'building-management-system'],
      ['Is it free?', undefined],
      ['ዋጋው ስንት ነው?', undefined],
    ] as const) {
      const r = ask(q, on);
      expect(r.text, q).toMatch(/Pricing isn't published/);
      expect(r.actions[0], q).toMatchObject({ kind: 'inquiry', label: 'Request pricing' });
    }
  });
  it('UAT-H02 · booking a demo', () => {
    expect(ask('I want to book a demo').actions[0]!.kind).toBe('demo');
    expect(ask('I want a demo of the school system').actions[0]).toMatchObject({
      kind: 'demo',
      slug: 'school-management-system',
    });
  });
  it('UAT-H03 · a free trial is not promised', () => {
    expect(ask('Do you offer a free trial?').text).toMatch(/can't confirm a free trial/);
  });
  it('UAT-H04 · implementation time is not promised', () => {
    expect(ask('How long does implementation take?').text).toMatch(/timelines aren't published/);
  });
  it('UAT-H05 · training and support are not promised', () => {
    const r = ask('Do you provide training and support?');
    expect(r.grounded).toBe(false);
    expect(r.actions[0]!.kind).toBe('inquiry');
  });
  it('UAT-H06 · contacting the team and getting started', () => {
    expect(ask('How can I contact you?').actions[0]!.kind).toBe('inquiry');
    expect(ask('How do I get started?').actions[0]!.kind).toBe('demo');
  });
});

describe('UAT-I · Safety and scope', () => {
  it('UAT-I01 · account and card numbers, PINs and passwords are refused', () => {
    for (const q of [
      'my account number is 1000123456789',
      'my card is 4111 1111 1111 1111',
      'my pin is 1234',
      'my password is Secret#2026',
    ]) {
      const r = ask(q);
      expect(r.text, q).toMatch(/don't share/);
      expect(r.products, q).toEqual([]);
    }
  });
  it('UAT-I02 · asking about OTPs or passwords is not mistaken for sharing one', () => {
    expect(ask('Is the OTP sent by SMS?').text).not.toMatch(/don't share/);
    expect(ask('Does it support password reset?').text).not.toMatch(/don't share/);
  });
  it('UAT-I03 · a phone number or e-mail is redirected to the contact form', () => {
    expect(ask('call me on 0911223344').text).toMatch(/contact form/);
    expect(ask('my email is visitor@example.com').text).toMatch(/contact form/);
  });
  it('UAT-I04 · personal banking is out of scope', () => {
    for (const q of [
      'How do I open a bank account?',
      'What is the exchange rate today?',
      'I lost my card',
    ])
      expect(ask(q).text, q).toMatch(/personal banking/);
  });
  it('UAT-I05 · unrelated questions are not answered with a guess', () => {
    expect(ask('What is the weather on Mars?').grounded).toBe(false);
    expect(ask('Do you have a payroll system?').grounded).toBe(false);
  });
});

describe('UAT-J · Language, typos and small talk', () => {
  it('UAT-J01 · misspelt product names are understood', () => {
    expect(ask('schol managment sytem').products[0]).toBe('school-management-system');
    expect(ask('buiding managment').products[0]).toBe('building-management-system');
    expect(ask('doctr apointment').products[0]).toBe('doctor-appointment-system');
  });
  it('UAT-J02 · ordinary words are not "corrected"', () => {
    expect(ask('I think so').text).not.toMatch(/welcome/i);
  });
  it('UAT-J03 · common Amharic words are understood', () => {
    expect(ask('ለትምህርት ቤቶች ምን አላችሁ?').products[0]).toBe('school-management-system');
    expect(ask('ሰላም').text).toMatch(/^Hi!/);
  });
  it('UAT-J04 · Amharic it cannot read gets an honest answer', () => {
    expect(ask('ምን ትመክሩኛላችሁ').grounded).toBe(false);
  });
  it('UAT-J05 · greeting, thanks, goodbye and acknowledgement', () => {
    expect(ask('hello').text).toMatch(/Digital Solutions Assistant/);
    expect(ask('thanks!').text).toMatch(/welcome/);
    expect(ask('bye').text).toMatch(/Thank you for visiting/);
    expect(ask('ok').text).toMatch(/anything else/);
  });
  it('UAT-J06 · "who are you" / "what can you do"', () => {
    expect(ask('Who are you?').text).toMatch(/automated/);
    expect(ask('What can you do?').text).toMatch(/Compare two products/);
  });
});

describe('UAT-K · Performance', () => {
  it('UAT-K01 · every answer is computed in well under a second', () => {
    const questions = [
      ...Object.values(ui.assistant.suggestions),
      'schol managment sytem',
      'What do you offer for schools and hospitals?',
      'Do you integrate with telebirr?',
      'Which products have USSD?',
    ];
    for (const q of questions) {
      const started = performance.now();
      ask(q);
      expect(performance.now() - started, q).toBeLessThan(250);
    }
  });
});
