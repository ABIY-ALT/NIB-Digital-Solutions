import { EN, taxonomyIndex } from '../taxonomy';
import type {
  AssistantAction,
  AssistantReply,
  ChatTurn,
  MarketplaceProduct,
  Taxonomy,
  TaxonomyEntry,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// On-device grounded catalog assistant. Used when the hosted (Claude) assistant
// is not configured or unavailable. Every sentence is assembled from the
// public catalog; it never generates capabilities. When the catalog does not
// cover a question it says so and routes the visitor to the team.
// ─────────────────────────────────────────────────────────────────────────────

export interface AssistantContext {
  products: MarketplaceProduct[];
  /** Industries and business needs of the catalog (managed reference data). */
  taxonomy: Taxonomy;
  focusSlug?: string;
  history?: ChatTurn[];
}

const STOP = new Set(
  'a an the and or but if of to in on for with by from at as is are was were be been do does did can could would should will shall may might have has had i me my we our us you your it its this that these those which who what whats when where why how there here any some all about into than then them they their please tell show give need want looking look help know like also just more most other such only own same so very much many one product products solution solutions system systems platform platforms nib bank'.split(
    ' ',
  ),
);

const ALIASES: Record<string, string[]> = {
  'school-management-system': [
    'school',
    'student',
    'parent',
    'academic',
    'teacher',
    'kindergarten',
    'report card',
    'grade',
  ],
  'building-management-system': [
    'building',
    'property',
    'tenant',
    'rent',
    'landlord',
    'apartment',
    'condominium',
    'lease',
    'facility',
  ],
  'digital-event-ticketing': [
    'event',
    'concert',
    'festival',
    'organizer',
    'organiser',
    'gate scanning',
    'event ticket',
  ],
  'micro-lending-platform': [
    'micro lending',
    'microlending',
    'micro loan',
    'microloan',
    'quick loan',
    'small loan',
    'micro-lending',
  ],
  'nibtera-gebeya-bnpl': [
    'bnpl',
    'gebeya',
    'nibtera',
    'buy now',
    'pay later',
    'installment',
    'instalment',
  ],
  'doctor-appointment-system': [
    'doctor',
    'clinic',
    'hospital',
    'appointment',
    'patient',
    'medical',
  ],
  'bus-ticket-sales-platform': [
    'bus',
    'passenger',
    'route',
    'seat booking',
    'terminal',
    'intercity',
    'bus ticket',
  ],
  'online-chereta': ['chereta', 'auction', 'tender', 'bid', 'bidding', 'bidder'],
  'merchant-application': [
    'merchant app',
    'merchant application',
    'qr payment',
    'cashier',
    'accept payment',
    'payment acceptance',
  ],
  'sme-lending-solution': [
    'sme lending',
    'sme loan',
    'working capital',
    'business loan',
    'sme financing',
  ],
  'saccos-automation': ['sacco', 'saccos', 'cooperative', 'co-operative', 'coop'],
  'loan-origination-system': [
    'loan origination',
    'origination',
    'los',
    'credit workflow',
    'credit appraisal',
    'approval matrix',
  ],
  'digital-marketplace': ['marketplace', 'multi-vendor', 'multivendor', 'vendor'],
  'guess-low-win-big': ['guess low', 'guess', 'campaign', 'promotion', 'prize', 'lowest unique'],
};

const TOPICS = {
  pricing: [
    'price',
    'pricing',
    'cost',
    'how much',
    'subscription',
    'license fee',
    'licence',
    'quote',
  ],
  integration: [
    'integrat',
    'api',
    'apis',
    'connect',
    'core banking',
    'existing system',
    'third party',
    'erp',
    'interface',
  ],
  customization: [
    'customize',
    'customise',
    'customization',
    'customisation',
    'tailor',
    'branding',
    'own brand',
    'white label',
    'modify',
    'adapt',
  ],
  mobile: ['mobile', 'app', 'apps', 'android', 'ios', 'iphone', 'smartphone', 'ussd'],
  deployment: [
    'deploy',
    'deployment',
    'on-premise',
    'on premise',
    'onpremise',
    'cloud',
    'hosting',
    'hosted',
    'server',
    'hybrid',
    'saas',
    'install',
  ],
  compare: ['compare', 'comparison', 'difference', 'differ', 'vs', 'versus', 'better', 'which one'],
  features: [
    'feature',
    'features',
    'module',
    'modules',
    'capabilit',
    'what does',
    'what can',
    'function',
    'how does',
    'how it works',
    'explain',
  ],
  benefits: ['benefit', 'benefits', 'value', 'why should', 'advantage', 'roi'],
  demo: ['demo', 'demonstration', 'trial', 'see it', 'presentation', 'walkthrough', 'video'],
  availability: ['available', 'availability', 'launch', 'pilot', 'when can', 'ready', 'release'],
  audience: ['who is it for', 'who should', 'target', 'suitable for', 'fit for', 'right for'],
  catalog: [
    'what products',
    'all products',
    'list',
    'catalog',
    'catalogue',
    'what do you have',
    'what do you offer',
    'portfolio',
    'everything you',
  ],
  greeting: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'selam', 'salam'],
  thanks: ['thank', 'thanks', 'appreciate', 'great', 'perfect'],
} as const;

type Topic = keyof typeof TOPICS;

const norm = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
const stem = (w: string) =>
  w.length > 4 && w.endsWith('ies')
    ? w.slice(0, -3) + 'y'
    : w.length > 3 && w.endsWith('s') && !w.endsWith('ss')
      ? w.slice(0, -1)
      : w;
const tokens = (s: string) =>
  norm(s)
    .trim()
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
/** Word-aware phrase match on a normalised query: short words must match whole, longer ones as word prefixes. */
const has = (q: string, phrase: string) => {
  const p = phrase.trim().toLowerCase();
  return p.length <= 3 ? q.includes(` ${p} `) : q.includes(` ${p}`);
};

function detectTopics(q: string): Set<Topic> {
  const out = new Set<Topic>();
  for (const [topic, words] of Object.entries(TOPICS) as [Topic, readonly string[]][]) {
    if (words.some((w) => has(q, w))) out.add(topic);
  }
  return out;
}

function corpus(p: MarketplaceProduct) {
  const c = p.content;
  return norm(
    [
      p.name,
      p.tagline,
      p.summary,
      p.overview,
      p.problem,
      p.keyFeatures.join(' '),
      c.modules.map((m) => `${m.name} ${m.description} ${m.features.join(' ')}`).join(' '),
      c.benefits.map((b) => `${b.title} ${b.description}`).join(' '),
      c.targetCustomers.map((t) => `${t.title} ${t.description}`).join(' '),
      c.integrations.join(' '),
      c.integrationNotes,
      c.faqs.map((f) => `${f.question} ${f.answer}`).join(' '),
    ].join(' '),
  );
}

function scoreProducts(
  q: string,
  qTokens: string[],
  products: MarketplaceProduct[],
  taxonomy: Taxonomy,
) {
  const index = taxonomyIndex(taxonomy);
  const keywords = (e: TaxonomyEntry | undefined) => e?.keywords ?? [];
  return products
    .map((p) => {
      let score = 0;
      let explicit = false;
      for (const alias of ALIASES[p.slug] ?? [])
        if (has(q, alias)) {
          score += 12;
          explicit = true;
        }
      if (q.includes(p.name.toLowerCase())) {
        score += 20;
        explicit = true;
      }
      const nameTokens = new Set(tokens(p.name));
      const industryWords = new Set(
        p.industries.flatMap((id) => keywords(index.industry(id))).flatMap(tokens),
      );
      const needWords = new Set(p.needs.flatMap((id) => keywords(index.need(id))).flatMap(tokens));
      const text = corpus(p);
      for (const t of qTokens) {
        if (nameTokens.has(t)) score += 5;
        if (industryWords.has(t)) score += 4;
        if (needWords.has(t)) score += 3;
        if (text.includes(` ${t}`)) score += 1;
      }
      return { p, score, explicit };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

function bestMatch<T>(qTokens: string[], items: T[], text: (t: T) => string, min = 0.5): T | null {
  if (!qTokens.length) return null;
  let best: { item: T; ratio: number } | null = null;
  for (const item of items) {
    const it = new Set(tokens(text(item)));
    const hits = qTokens.filter((t) => it.has(t)).length;
    const ratio = hits / Math.min(qTokens.length, Math.max(3, it.size));
    if (hits >= 2 && ratio >= min && (!best || ratio > best.ratio)) best = { item, ratio };
  }
  return best?.item ?? null;
}

const bullet = (s: string) => `- ${s}`;
const view = (p: MarketplaceProduct): AssistantAction => ({
  kind: 'view',
  slug: p.slug,
  label: `View ${p.name}`,
});
const demo = (p: MarketplaceProduct): AssistantAction => ({
  kind: 'demo',
  slug: p.slug,
  label: 'Request a demo',
});
const inquiry = (p?: MarketplaceProduct, label = 'Talk to the product team'): AssistantAction => ({
  kind: 'inquiry',
  slug: p?.slug,
  label,
});
const catalogAction: AssistantAction = { kind: 'catalog', label: 'Browse all products' };

function reply(
  text: string,
  products: MarketplaceProduct[],
  extra: Partial<AssistantReply> = {},
): AssistantReply {
  const primary = products[0];
  return {
    text,
    products: products.map((p) => p.slug),
    actions: extra.actions ?? (primary ? [view(primary), demo(primary)] : [catalogAction]),
    sources: extra.sources ?? products.map((p) => p.name),
    grounded: extra.grounded ?? true,
  };
}

function listProducts(
  intro: string,
  list: MarketplaceProduct[],
  outro = 'Would you like details on one of these, or to request a demo?',
) {
  const lines = list.slice(0, 6).map((p) => bullet(`**${p.name}** — ${p.summary}`));
  return reply([intro, ...lines, '', outro].join('\n'), list.slice(0, 6), {
    actions: [...list.slice(0, 2).map(view), catalogAction],
  });
}

function notFound(subject?: MarketplaceProduct, detail?: string): AssistantReply {
  const text = subject
    ? `I couldn't find ${detail ? `**${detail}**` : 'that'} in the approved documentation for **${subject.name}**, so I can't confirm it. Rather than guess, I'd suggest asking our product team — they can confirm what's supported and whether it can be added as a customization.`
    : "I don't have approved information to answer that. I can help you explore our products by industry, business need or feature — or connect you with our Digital Solutions team for a detailed answer.";
  return {
    text,
    products: subject ? [subject.slug] : [],
    actions: subject
      ? [inquiry(subject, 'Ask the product team'), view(subject)]
      : [inquiry(undefined), catalogAction],
    sources: [],
    grounded: false,
  };
}

function describe(p: MarketplaceProduct, topics: Set<Topic>): AssistantReply {
  const c = p.content;
  const parts: string[] = [];
  const sources: string[] = [];
  if (topics.has('integration')) {
    parts.push(
      `**${p.name} — integration**`,
      c.integrationNotes || "Integration details for this product haven't been published yet.",
    );
    if (c.integrations.length)
      parts.push('', 'Documented integrations:', ...c.integrations.map(bullet));
    parts.push(
      '',
      'Exact integration scope with your systems is confirmed by the product team during scoping.',
    );
    sources.push(`${p.name} · Deployment & integration`);
  }
  if (topics.has('deployment')) {
    parts.push(
      `**${p.name}** can be deployed as: ${p.deployment.map((d) => EN.deployment[d]).join(', ')}.`,
    );
    sources.push(`${p.name} · Deployment`);
  }
  if (topics.has('mobile')) {
    const mobile = p.platforms.filter((x) => x !== 'web');
    parts.push(
      mobile.length
        ? `**${p.name}** is available on ${p.platforms.map((x) => EN.platform[x]).join(', ')}.`
        : `**${p.name}** is a web application; a dedicated mobile app isn't listed in its documentation.`,
    );
    sources.push(`${p.name} · Platforms`);
  }
  if (topics.has('customization')) {
    parts.push(
      p.customizable
        ? `Yes — **${p.name}** can be configured and customized to your workflows. Customization scope, effort and timelines are agreed with the product team; a *Customized demo* is a good way to start.`
        : `Customization for **${p.name}** isn't listed in its documentation. The product team can advise on what's possible.`,
    );
    sources.push(`${p.name} · Overview`);
  }
  if (topics.has('availability')) {
    parts.push(
      `**${p.name}** status: ${EN.availability[p.availability]}.${p.availability === 'pilot' ? ' You can request a demo to discuss joining the pilot.' : ''}`,
    );
    sources.push(`${p.name} · Availability`);
  }
  if (topics.has('benefits')) {
    parts.push(
      `**Key benefits of ${p.name}:**`,
      ...c.benefits.map((b) => bullet(`**${b.title}** — ${b.description}`)),
    );
    sources.push(`${p.name} · Key benefits`);
  }
  if (topics.has('audience')) {
    parts.push(
      `**${p.name}** is designed for:`,
      ...c.targetCustomers.map((t) => bullet(`**${t.title}** — ${t.description}`)),
    );
    sources.push(`${p.name} · Target customers`);
  }
  if (topics.has('demo')) {
    parts.push(
      c.demo
        ? `There's a ${c.demo.duration} demo of **${p.name}** you can watch on its product page, and you can book a live demo (online, onsite, recorded or customized).`
        : `A recorded demo of **${p.name}** isn't published yet, but you can book a live demo with our product specialists.`,
    );
    sources.push(`${p.name} · Demo`);
  }
  if (!parts.length || topics.has('features')) {
    parts.unshift(
      `**${p.name}** — ${p.tagline}`,
      '',
      p.overview,
      '',
      '**Modules:**',
      ...c.modules.map((m) => bullet(`**${m.name}** — ${m.description}`)),
    );
    sources.unshift(`${p.name} · Overview & modules`);
  }
  return reply(parts.join('\n'), [p], { sources });
}

function compare(a: MarketplaceProduct, b: MarketplaceProduct): AssistantReply {
  const row = (p: MarketplaceProduct) =>
    [
      `**${p.name}**`,
      bullet(`Purpose: ${p.summary}`),
      bullet(`Best for: ${p.content.targetCustomers.map((t) => t.title).join(', ')}`),
      bullet(`Key features: ${p.keyFeatures.join('; ')}`),
      bullet(`Platforms: ${p.platforms.map((x) => EN.platform[x]).join(', ')}`),
      bullet(`Deployment: ${p.deployment.map((d) => EN.deployment[d]).join(', ')}`),
      bullet(`Status: ${EN.availability[p.availability]}`),
    ].join('\n');
  return reply(
    `Here's how they compare:\n\n${row(a)}\n\n${row(b)}\n\nIf you share your use case, the team can recommend the better fit — or combine both.`,
    [a, b],
    {
      actions: [view(a), view(b), demo(a)],
    },
  );
}

const PRICING_TEXT =
  "Pricing isn't published on the website because it depends on the modules you need, the number of users or transactions, the deployment option and any customization. Our team will prepare a tailored proposal — request pricing and we'll get back to you.";

export function answer(question: string, ctx: AssistantContext): AssistantReply {
  const q = norm(question);
  const qTokens = tokens(question);
  const products = ctx.products;
  const topics = detectTopics(q);
  const focus = ctx.focusSlug ? products.find((p) => p.slug === ctx.focusSlug) : undefined;

  if (
    !qTokens.length ||
    ((topics.has('greeting') || topics.has('thanks')) && qTokens.length <= 3)
  ) {
    if (topics.has('thanks'))
      return reply(
        "You're welcome! Anything else I can help you find? I can also book a demo for you.",
        focus ? [focus] : [],
      );
    return reply(
      focus
        ? `Hi! Ask me anything about **${focus.name}** — features, modules, deployment, integration or how to get a demo.`
        : "Hi! I'm the NIB Digital Solutions Assistant. Tell me about your business or what you'd like to automate, and I'll recommend the right products.",
      focus ? [focus] : [],
    );
  }

  const ranked = scoreProducts(q, qTokens, products, ctx.taxonomy);
  const explicit = ranked.filter((r) => r.explicit).map((r) => r.p);

  // Follow-up questions ("does it integrate?") refer to the product discussed last.
  let subject: MarketplaceProduct | undefined = explicit[0] ?? focus;
  if (!subject && ctx.history?.length && /\b(it|this|that|they)\b/.test(q)) {
    const lastAssistant = [...ctx.history].reverse().find((t) => t.role === 'assistant');
    subject = products.find((p) => lastAssistant?.text.includes(`**${p.name}**`));
  }

  if (topics.has('pricing')) {
    return {
      text: PRICING_TEXT,
      products: subject ? [subject.slug] : [],
      actions: [inquiry(subject, 'Request pricing'), ...(subject ? [demo(subject)] : [])],
      sources: ['Commercial policy'],
      grounded: true,
    };
  }

  if (topics.has('compare') && explicit.length >= 2) return compare(explicit[0]!, explicit[1]!);

  if (topics.has('catalog') && !explicit.length) {
    return listProducts(
      `We currently offer ${products.length} digital solutions. Here are a few highlights:`,
      [...products].sort((a, b) => Number(b.featured) - Number(a.featured)),
    );
  }

  if (subject && (explicit.length || focus)) {
    const p = subject;
    const faq = bestMatch(qTokens, p.content.faqs, (f) => f.question, 0.4);
    if (faq) return reply(faq.answer, [p], { sources: [`${p.name} · FAQ: ${faq.question}`] });

    const structural: Topic[] = [
      'integration',
      'deployment',
      'mobile',
      'customization',
      'availability',
      'benefits',
      'audience',
      'demo',
      'features',
    ];
    if (structural.some((t) => topics.has(t))) return describe(p, topics);

    // Yes/no capability question: every content word must appear in the approved text.
    if (/^ (does|do|can|is|are|will|has|have|support)/.test(q) || q.includes('support')) {
      const aliasWords = new Set((ALIASES[p.slug] ?? []).flatMap(tokens).concat(tokens(p.name)));
      const text = corpus(p);
      const missing = qTokens.filter((t) => !aliasWords.has(t) && !text.includes(` ${t}`));
      if (missing.length) return notFound(p, missing.slice(0, 3).join(', '));
      const mod = p.content.modules.find((m) =>
        qTokens.some((t) => norm(`${m.name} ${m.features.join(' ')}`).includes(` ${t}`)),
      );
      if (mod) {
        return reply(
          `Yes — according to the product documentation, **${p.name}** covers this in its **${mod.name}** module:\n${mod.features.map(bullet).join('\n')}`,
          [p],
          {
            sources: [`${p.name} · ${mod.name}`],
          },
        );
      }
    }
    return describe(p, topics);
  }

  if (topics.has('mobile')) {
    return listProducts(
      'These solutions include mobile apps (Android/iOS) or USSD access:',
      products.filter((p) => p.platforms.some((x) => x !== 'web')),
    );
  }
  if (topics.has('integration')) {
    return reply(
      "Our solutions are built to work with NIB digital channels (mobile banking, internet banking and the payment gateway). Several products also integrate with core banking and other systems through APIs — for example the Micro Lending Platform, SME Lending Solution and Loan Origination System. The exact integration with your existing systems is scoped with our product team.\n\nTell me which product you're interested in and I'll share its documented integrations.",
      products.filter((p) => p.content.integrations.some((i) => /api/i.test(i))),
      { actions: [inquiry(undefined, 'Ask about integration'), catalogAction] },
    );
  }
  if (topics.has('customization')) {
    return reply(
      'Most of our products can be configured and customized to your workflows, branding and reporting needs. The scope and timeline of a customization is agreed with the product team — choosing a *Customized demo* is the best way to start that conversation.',
      [],
      { actions: [inquiry(undefined, 'Discuss customization'), catalogAction] },
    );
  }
  if (topics.has('deployment')) {
    return listProducts(
      'All products are available on NIB Cloud. These can also be deployed on-premise at your institution:',
      products.filter((p) => p.deployment.includes('on_premise')),
      'Hybrid options are available for several products; the product team confirms the right model for your requirements.',
    );
  }

  // Industry / business-need recommendations: whichever matches more keywords wins (ties go to industry).
  const hits = (words: string[]) => words.filter((k) => has(q, k)).length;
  const best = (entries: TaxonomyEntry[]) =>
    entries.map((e) => ({ e, n: hits(e.keywords) })).sort((a, b) => b.n - a.n)[0] ?? {
      e: undefined,
      n: 0,
    };
  const industry = best(ctx.taxonomy.industries);
  const need = best(ctx.taxonomy.needs);
  if (need.e && need.n > industry.n) {
    const id = need.e.id;
    const list = products.filter((p) => p.needs.includes(id));
    if (list.length) return listProducts(`To **${need.e.name.toLowerCase()}**, I'd look at:`, list);
  }
  if (industry.e && industry.n > 0) {
    const id = industry.e.id;
    const list = products.filter((p) => p.industries.includes(id));
    if (list.length)
      return listProducts(`For **${industry.e.name}**, these solutions are a good fit:`, list);
  }

  if (ranked.length && ranked[0]!.score >= 4) {
    const top = ranked.slice(0, 3).map((r) => r.p);
    if (top.length === 1) return describe(top[0]!, topics);
    return listProducts('Based on what you described, these products look relevant:', top);
  }

  return notFound();
}
