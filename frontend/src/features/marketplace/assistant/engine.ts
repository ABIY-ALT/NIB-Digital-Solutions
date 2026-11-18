import { EN, taxonomyIndex } from '../taxonomy';
import type {
  AssistantAction,
  AssistantReply,
  Availability,
  ChatTurn,
  MarketplaceProduct,
  Platform,
  Taxonomy,
  TaxonomyEntry,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// On-device grounded catalog assistant. Used when the hosted (Claude) assistant
// is not configured or unavailable. Every sentence is assembled from the
// public catalog; it never generates capabilities. When the catalog does not
// cover a question it says so and routes the visitor to the team.
//
// A question goes through, in order: sensitive-data guard → Amharic keywords
// and spelling fixes → small talk → which product it is about (named, the
// product page, or the one discussed last) → policy topics (pricing, personal
// banking) → catalog filters → product answers (FAQ, documented evidence,
// topics) → general topics → FAQs of every product → industry / business
// need → documented features → "I can't confirm that".
// ─────────────────────────────────────────────────────────────────────────────

export interface AssistantContext {
  products: MarketplaceProduct[];
  /** Industries and business needs of the catalog (managed reference data). */
  taxonomy: Taxonomy;
  focusSlug?: string;
  history?: ChatTurn[];
}

type Product = MarketplaceProduct;
type Faq = Product['content']['faqs'][number];
type Module = Product['content']['modules'][number];
type Benefit = Product['content']['benefits'][number];

// ── Vocabulary ───────────────────────────────────────────────────────────────

const STOP = new Set(
  'a an the and or but if of to in on for with by from at as is are was were be been do does did can could would should will shall may might have has had i me my we our us you your it its this that these those which who what whats when where why how there here any some all about into than then them they their please tell show give need want looking look help know like also just more most other such only own same so very much many one product products solution solutions system systems platform platforms nib bank don doesn isn aren didn won couldn wouldn shouldn haven hasn im ive up out off via per etc yet still even ever again already now today currently'.split(
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
    'microfinance',
    'mfi',
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

/**
 * Phrases that signal what a question is about. Matched word-aware on the
 * normalised question (see `has`); single words longer than three letters
 * also match as word prefixes ("integrat" → integrate, integration…).
 */
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
    'is it free',
    'are they free',
    'are your products free',
    'for free',
    'free of charge',
    'free version',
    'expensive',
    'cheap',
    'afford',
    'budget',
  ],
  integration: [
    'integrat',
    'api',
    'apis',
    'connect',
    'core banking',
    'existing system',
    'third party',
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
  mobile: [
    'mobile',
    'app',
    'apps',
    'android',
    'ios',
    'iphone',
    'smartphone',
    'ussd',
    'phone',
    'tablet',
  ],
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
  features: ['feature', 'features', 'capabilit'],
  /** "How does it work?": the overview, unless a more specific topic was asked. */
  explain: [
    'what does',
    'what can it',
    'what can the',
    'function',
    'how does',
    'how it works',
    'explain',
  ],
  modules: ['module', 'modules'],
  benefits: ['benefit', 'benefits', 'value', 'why should', 'advantage', 'roi'],
  demo: ['demo', 'demonstration', 'trial', 'see it', 'presentation', 'walkthrough', 'video'],
  availability: ['available', 'availability', 'launch', 'pilot', 'when can', 'ready', 'release'],
  audience: ['who is it for', 'who should', 'target', 'suitable for', 'fit for', 'right for'],
  security: [
    'secure',
    'security',
    'data protection',
    'privacy',
    'encrypt',
    'hack',
    'compliance',
    'compliant',
    'is it safe',
    'how safe',
    'access control',
    'audit',
  ],
  implementation: [
    'implement',
    'how long',
    'timeline',
    'go live',
    'go-live',
    'set up',
    'setup',
    'rollout',
    'roll out',
    'onboard',
    'migrat',
  ],
  start: [
    'get started',
    'how do i start',
    'how to start',
    'next step',
    'sign up',
    'how to buy',
    'how do i buy',
    'how can i buy',
    'purchase',
    'subscribe',
  ],
  support: [
    'training',
    'train our',
    'train my',
    'train the',
    'support team',
    'technical support',
    'customer support',
    'after sales',
    'after-sales',
    'helpdesk',
    'help desk',
    'sla',
  ],
  contact: [
    'contact',
    'get in touch',
    'reach you',
    'reach your',
    'call you',
    'phone number',
    'email address',
    'your email',
    'your address',
    'where are you located',
    'where is your office',
    'talk to someone',
    'talk to a person',
    'talk to your',
    'talk to sales',
    'speak to',
    'speak with',
    'sales team',
  ],
  count: [
    'how many product',
    'how many solution',
    'how many system',
    'how many platform',
    'number of product',
  ],
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
  /** Personal banking — outside this assistant's scope. */
  banking: [
    'open an account',
    'open a bank account',
    'open account',
    'opening an account',
    'exchange rate',
    'atm',
    'nearest branch',
    'branch near',
    'branch location',
    'transfer money',
    'send money',
    'money transfer',
    'lost my card',
    'lost card',
    'block my card',
    'card blocked',
    'forgot my password',
    'forgot password',
    'forgot my pin',
    'forgot pin',
    'reset my password',
    'reset password',
    'interest rate',
    'my balance',
    'account balance',
    'foreign currency',
    'remittance',
    'swift code',
    'cheque',
    'chequebook',
  ],
  // Small talk.
  greeting: [
    'hello',
    'hi',
    'hey',
    'good morning',
    'good afternoon',
    'good evening',
    'selam',
    'salam',
  ],
  thanks: ['thank', 'thanks', 'appreciate', 'great', 'perfect'],
  bye: ['bye', 'goodbye', 'good bye', 'see you', 'that s all', 'nothing else', 'have a nice day'],
  identity: [
    'who are you',
    'what are you',
    'are you human',
    'are you a bot',
    'are you a robot',
    'are you real',
    'are you ai',
    'are you a person',
    'your name',
    'chatgpt',
  ],
  help: [
    'what can you do',
    'how can you help',
    'what do you do',
    'how does this work',
    'what can i ask',
    'how do i use',
    'can you help',
    'help me',
  ],
  more: [
    'tell me more',
    'more detail',
    'more info',
    'more about',
    'go on',
    'continue',
    'elaborate',
    'explain more',
    'in detail',
  ],
  ack: [
    'ok',
    'okay',
    'cool',
    'got it',
    'i see',
    'alright',
    'nice',
    'sure',
    'fine',
    'awesome',
    'noted',
    'understood',
    'yes',
    'no',
  ],
} as const;

type Topic = keyof typeof TOPICS;

const SMALL_TALK = new Set<Topic>(['greeting', 'thanks', 'bye', 'identity', 'help', 'more', 'ack']);

/** Topics answered from a product's own documentation when the question is about one product. */
const STRUCTURAL: Topic[] = [
  'integration',
  'deployment',
  'mobile',
  'customization',
  'availability',
  'benefits',
  'audience',
  'demo',
  'features',
  'explain',
  'modules',
  'security',
  'implementation',
  'support',
];

/** Generic words that say nothing about *which* capability is asked for ("does it support…"). */
const FILLER_WORDS =
  'use used using usage work working support allow enable offer provide include handle let able possible feature option way something anything everything thing stuff kind type get make see show view look know find tell ask say go come put try send sent receive received create run keep check collect manage process set add give take want need like really well service software tool solution exist existing current available already exactly done made';

/** Close equivalents, so a capability phrased differently from the documentation is still found. */
const SYNONYMS: Record<string, string[]> = {
  online: ['digital', 'internet', 'web'],
  internet: ['online', 'digital', 'web'],
  phone: ['mobile', 'smartphone', 'app', 'android', 'ios', 'ussd'],
  pay: ['payment', 'paid'],
  payment: ['pay', 'paid'],
  paid: ['pay', 'payment'],
  message: ['messaging', 'sms', 'notification'],
  notify: ['notification', 'reminder', 'alert', 'sms'],
  notification: ['sms', 'reminder', 'alert'],
  text: ['sms'],
  report: ['reporting', 'dashboard', 'analytics'],
  dashboard: ['report', 'analytics'],
  analytics: ['report', 'dashboard'],
  book: ['booking'],
  reserve: ['booking', 'book'],
  reservation: ['booking'],
  bill: ['invoice', 'billing'],
  invoice: ['bill', 'billing'],
  employee: ['staff'],
  worker: ['staff'],
  child: ['student'],
  kid: ['student'],
  pupil: ['student'],
  loan: ['credit', 'lending', 'financing'],
  credit: ['loan', 'lending'],
  money: ['payment', 'fund'],
  sell: ['sale'],
  buy: ['purchase', 'order'],
  approve: ['approval'],
  hotel: ['hospitality'],
  lodge: ['hospitality'],
  guesthouse: ['hospitality'],
  cafe: ['restaurant'],
  restaurant: ['cafe'],
};

/**
 * Common Amharic words → the English catalog vocabulary. Answers stay in
 * English, like the product content. Spelling variants (ሀ/ሐ/ኀ, ሰ/ሠ, አ/ዐ,
 * ጸ/ፀ) are folded before matching, so one spelling per word is enough.
 */
const AMHARIC_WORDS: [string, string][] = [
  ['ትምህርት', 'school'],
  ['ተማሪ', 'student'],
  ['ወላጅ', 'parent'],
  ['መምህር', 'teacher'],
  ['ሕንፃ', 'building'],
  ['ኪራይ', 'rent'],
  ['ተከራይ', 'tenant'],
  ['አከራይ', 'landlord'],
  ['ብድር', 'loan'],
  ['ቁጠባ', 'savings'],
  ['ኅብረት ሥራ', 'cooperative'],
  ['ሆስፒታል', 'hospital'],
  ['ክሊኒክ', 'clinic'],
  ['ሐኪም', 'doctor'],
  ['ዶክተር', 'doctor'],
  ['ቀጠሮ', 'appointment'],
  ['ታካሚ', 'patient'],
  ['አውቶቡስ', 'bus'],
  ['አውቶብስ', 'bus'],
  ['ትኬት', 'ticket'],
  ['ቲኬት', 'ticket'],
  ['ጨረታ', 'chereta'],
  ['ዋጋ', 'price'],
  ['ስንት ነው', 'how much'],
  ['ክፍያ', 'payment'],
  ['ነጋዴ', 'merchant'],
  ['ሱቅ', 'shop'],
  ['ገበያ', 'marketplace'],
  ['ዝግጅት', 'event'],
  ['ኮንሰርት', 'concert'],
  ['ሞባይል', 'mobile'],
  ['መተግበሪያ', 'app'],
  ['ማሳያ', 'demo'],
  ['ሰላም', 'hello'],
  ['ጤና ይስጥልኝ', 'hello'],
  ['አመሰግናለሁ', 'thanks'],
  ['እናመሰግናለን', 'thanks'],
];

// ── Text helpers ─────────────────────────────────────────────────────────────

const norm = (s: string) =>
  ` ${s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const FILLER = new Set(FILLER_WORDS.split(' ').map(stem));
/** A generic word in any form: "included", "supported", "using"… */
const isFiller = (t: string) =>
  [
    t,
    t.replace(/ing$/, ''),
    t.replace(/ing$/, 'e'),
    t.replace(/ed$/, ''),
    t.replace(/d$/, ''),
  ].some((v) => FILLER.has(v));

/** Whether normalised text mentions a (stemmed) query word or one of its close equivalents. */
function mentions(text: string, word: string): boolean {
  return [word, ...(SYNONYMS[word] ?? [])].some((w) =>
    w.length <= 3
      ? text.includes(` ${w} `) || text.includes(` ${w}s `)
      : text.includes(` ${w.length > 5 ? w.slice(0, -1) : w}`),
  );
}

// ── Amharic ──────────────────────────────────────────────────────────────────

const ETHIOPIC = /[ሀ-፿]/;
/** First letter of each Ethiopic row that is pronounced like another row → that row. */
const ETHIOPIC_VARIANTS: Record<number, number> = {
  0x1210: 0x1200, // ሐ → ሀ
  0x1280: 0x1200, // ኀ → ሀ
  0x1220: 0x1230, // ሠ → ሰ
  0x12d0: 0x12a0, // ዐ → አ
  0x1340: 0x1338, // ፀ → ጸ
};
const foldEthiopic = (s: string) =>
  s.replace(/[ሐ-ሗሠ-ሧኀ-ኇዐ-዗ፀ-ፇ]/g, (c) => {
    const code = c.charCodeAt(0);
    const order = code % 8; // rows are eight letters wide and eight-aligned
    return String.fromCharCode(ETHIOPIC_VARIANTS[code - order]! + order);
  });
const AMHARIC = AMHARIC_WORDS.map(([am, en]) => [foldEthiopic(am), en] as const);

/** Adds the English equivalents of known Amharic words to the question. */
function translateAmharic(question: string) {
  if (!ETHIOPIC.test(question)) return { text: question, amharic: false, understood: false };
  const folded = foldEthiopic(question);
  const words = AMHARIC.filter(([am]) => folded.includes(am)).map(([, en]) => en);
  return { text: `${question} ${words.join(' ')}`, amharic: true, understood: words.length > 0 };
}

// ── Sensitive data ───────────────────────────────────────────────────────────

const PHONE = /^(?:251|0)?[79]\d{8}$/;
const SECRET_WITH_DIGITS = /\b(?:pin|password|passcode|otp|cvv|cvc)\b\W*(?:\w+\W+){0,2}\d{4,}/i;
const MY_SECRET = /\bmy (?:pin|password|passcode|otp)(?: code)? (?:is|was)\b/i;

/** Account or card numbers, PINs, passwords or one-time codes typed into the chat. */
function sharesSensitiveData(text: string): boolean {
  const joined = text.replace(/(\d)[\s-]+(?=\d)/g, '$1');
  const runs = joined.match(/\d+/g) ?? [];
  if (runs.some((r) => r.length >= 12 && !PHONE.test(r))) return true;
  if (SECRET_WITH_DIGITS.test(text) || MY_SECRET.test(text)) return true;
  return /\baccount\s*(?:number|no\.?|#)?\s*(?:is|:)?\s*\d{8,}/i.test(joined);
}

/** A phone number or e-mail address typed into the chat. */
function sharesContactDetails(text: string): boolean {
  const joined = text.replace(/(\d)[\s-]+(?=\d)/g, '$1');
  return (
    (joined.match(/\+?\d+/g) ?? []).some((r) => PHONE.test(r.replace(/^\+/, ''))) ||
    /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text)
  );
}

/**
 * Account or card numbers, secrets, phone numbers or e-mail addresses: such a
 * message is answered on the device and never sent to the server (nor later
 * as conversation history).
 */
export const containsPersonalData = (text: string) =>
  sharesSensitiveData(text) || sharesContactDetails(text);

// ── Catalog index (cached per catalog) ───────────────────────────────────────

interface CatalogIndex {
  taxonomy: Taxonomy;
  corpus: Map<string, string>;
  /** Every word the catalog or the assistant knows: never "corrected". */
  known: Set<string>;
  /**
   * Distinctive words a misspelling may be corrected to: product names and
   * aliases, industries and needs, topic words. Ordinary English is not
   * corrected, so "second" never becomes "seconds" nor "think" "thank".
   */
  targets: string[];
}

const indexes = new WeakMap<Product[], CatalogIndex>();

function corpusOf(p: Product) {
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

function catalogIndex(products: Product[], taxonomy: Taxonomy): CatalogIndex {
  const cached = indexes.get(products);
  if (cached && cached.taxonomy === taxonomy) return cached;
  const corpus = new Map(products.map((p) => [p.slug, corpusOf(p)]));
  const targets = new Set<string>();
  const add = (into: Set<string>) => (s: string) => {
    for (const w of norm(s).split(/[\s-]+/)) if (w.length >= 5) into.add(w);
  };
  const addTarget = add(targets);
  for (const p of products) {
    addTarget(p.name);
    (ALIASES[p.slug] ?? []).forEach(addTarget);
    p.content.modules.forEach((m) => addTarget(m.name));
  }
  for (const e of [...taxonomy.industries, ...taxonomy.needs]) {
    addTarget(e.name);
    e.keywords.forEach(addTarget);
  }
  for (const [topic, phrases] of Object.entries(TOPICS) as [Topic, readonly string[]][])
    if (!SMALL_TALK.has(topic)) phrases.forEach(addTarget);
  STOP.forEach(addTarget);
  const known = new Set(targets);
  for (const text of corpus.values()) add(known)(text);
  for (const phrases of Object.values(TOPICS)) phrases.forEach(add(known));
  const index = { taxonomy, corpus, known, targets: [...targets] };
  indexes.set(products, index);
  return index;
}

/** Optimal string alignment distance (a swap of two neighbouring letters is one edit). */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/** Fixes misspelt words ("schol managment") against the catalog's own vocabulary. */
function correctSpelling(text: string, idx: CatalogIndex): string {
  return text.replace(/[A-Za-z]{5,}/g, (word) => {
    const w = word.toLowerCase();
    if (idx.known.has(w) || idx.known.has(stem(w))) return word;
    const max = w.length >= 8 ? 2 : 1;
    let best: string | null = null;
    let bestDistance = max + 1;
    for (const v of idx.targets) {
      if (v[0] !== w[0] || Math.abs(v.length - w.length) > max) continue;
      const distance = editDistance(w, v);
      if (distance < bestDistance) {
        best = v;
        bestDistance = distance;
      }
    }
    return best ?? word;
  });
}

// ── Understanding the question ───────────────────────────────────────────────

function detectTopics(q: string) {
  const topics = new Set<Topic>();
  const words = new Set<string>();
  for (const [topic, phrases] of Object.entries(TOPICS) as [Topic, readonly string[]][]) {
    for (const phrase of phrases) {
      if (!has(q, phrase)) continue;
      topics.add(topic);
      for (const w of tokens(phrase)) words.add(w);
    }
  }
  return { topics, words };
}

/** A query word that only names the topic ("integrate", "deployed"), not the capability asked about. */
const isTopicWord = (t: string, words: Set<string>) =>
  words.has(t) || [...words].some((w) => w.length >= 4 && t.startsWith(w));

const SMALL_TALK_WORDS = new Set([
  ...[...SMALL_TALK].flatMap((t) => TOPICS[t].flatMap(tokens)),
  ...'assistant bot robot human person real name ai morning afternoon evening good day'.split(' '),
]);

interface Ranked {
  p: Product;
  score: number;
  explicit: boolean;
  /** The words that named the product, removed before detecting topics. */
  matched: string[];
}

function scoreProducts(
  q: string,
  qTokens: string[],
  products: Product[],
  taxonomy: Taxonomy,
  idx: CatalogIndex,
): Ranked[] {
  const index = taxonomyIndex(taxonomy);
  const keywords = (e: TaxonomyEntry | undefined) => e?.keywords ?? [];
  const asked = new Set(qTokens);
  return products
    .map((p) => {
      let score = 0;
      const matched: string[] = [];
      for (const alias of ALIASES[p.slug] ?? [])
        if (has(q, alias)) {
          score += 12;
          matched.push(alias);
        }
      const name = norm(p.name).trim();
      const nameTokens = tokens(p.name).filter((t) => t.length > 2);
      if (q.includes(` ${name}`)) {
        score += 20;
        matched.push(name);
      } else if (nameTokens.length && nameTokens.every((t) => asked.has(t))) {
        score += 15;
        matched.push(...nameTokens);
      }
      const nameWords = new Set(nameTokens);
      const industryWords = new Set(
        p.industries.flatMap((id) => keywords(index.industry(id))).flatMap(tokens),
      );
      const needWords = new Set(p.needs.flatMap((id) => keywords(index.need(id))).flatMap(tokens));
      const text = idx.corpus.get(p.slug) ?? '';
      for (const t of qTokens) {
        if (nameWords.has(t)) score += 5;
        if (industryWords.has(t)) score += 4;
        if (needWords.has(t)) score += 3;
        if (text.includes(` ${t}`)) score += 1;
      }
      return { p, score, explicit: matched.length > 0, matched };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** The question without the words that named a product ("merchant app" is not a question about apps). */
function withoutProductNames(q: string, ranked: Ranked[]): string {
  let s = q;
  for (const r of ranked)
    for (const phrase of r.matched)
      s = s.replace(
        new RegExp(` ${escapeRe(phrase)}${phrase.length <= 3 ? '(?= )' : '\\S*'}`, 'g'),
        ' ',
      );
  return ` ${s.replace(/\s+/g, ' ').trim()} `;
}

const productWords = (p: Product) =>
  new Set([...tokens(p.name), ...(ALIASES[p.slug] ?? []).flatMap(tokens)]);

/** Products named in a previous answer, in the order they appear. */
function mentioned(text: string, products: Product[]): Product[] {
  return products
    .map((p) => ({ p, at: text.indexOf(`**${p.name}**`) }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((m) => m.p);
}

const ORDINALS: [RegExp, number][] = [
  [/ (?:first|1st) /, 0],
  [/ (?:second|2nd) /, 1],
  [/ (?:third|3rd) /, 2],
  [/ (?:fourth|4th) /, 3],
  [/ last /, -1],
];

function ordinal(q: string, list: Product[]): Product | undefined {
  for (const [re, i] of ORDINALS) if (re.test(q)) return i < 0 ? list[list.length - 1] : list[i];
  return undefined;
}

function lastIndex(turns: ChatTurn[], role: ChatTurn['role']): number {
  for (let i = turns.length - 1; i >= 0; i--) if (turns[i]!.role === role) return i;
  return -1;
}

/** Leading greetings and fillers, so "Hi, I need…" reads as "I need…". */
const LEAD =
  /^ (?:(?:hello|hi|hey|selam|salam|dear|good morning|good afternoon|good evening|ok|okay|so|and|also|please|thanks|thank you|well)(?: there| team| all)? )+/;
const YES_NO = /^ (?:does|do|can|could|is|are|will|would|has|have|did|support|supports) /;
const RECOMMEND =
  /^ (?:(?:which|what) (?:product|solution|system|platform|software|app|tool|one|of your)|(?:what )?do you (?:have|offer|provide|sell)|is there|are there|have you got|any )| (?:recommend|suggest)/;
const OWNER =
  /^ (?:i|we) (?:have|run|own|manage|operate) (?:a|an|my|our|small|big|large) |^ (?:i m|i am|we re|we are) (?:a|an) | my (?:business|company|shop|store|organization|organisation|institution) /;
const NEED =
  /^ (?:i|we) (?:want|need|would like|d like|am looking|are looking|m looking|re looking|plan|wish) | looking for /;
const JUST_ASKING =
  / (?:want|like|need) to (?:know|ask|understand|learn|check|confirm|see|find out) /;
const LIST_QUESTION =
  /^ (?:which|what|list|show|any) (?:products|solutions|of your|other)|^ do you have (?:any|other)/;
const SINGULAR =
  / (?:it|its|this|this one|that one|the product|this product|that product|the system|the app|the platform) /;

// ── Replies ──────────────────────────────────────────────────────────────────

const bullet = (s: string) => `- ${s}`;
const view = (p: Product): AssistantAction => ({
  kind: 'view',
  slug: p.slug,
  label: `View ${p.name}`,
});
const demo = (p?: Product): AssistantAction => ({
  kind: 'demo',
  slug: p?.slug,
  label: 'Request a demo',
});
const inquiry = (p?: Product, label = 'Talk to the product team'): AssistantAction => ({
  kind: 'inquiry',
  slug: p?.slug,
  label,
});
const catalogAction: AssistantAction = { kind: 'catalog', label: 'Browse all products' };

function reply(
  text: string,
  products: Product[],
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
  list: Product[],
  outro = 'Would you like details on one of these, or to request a demo?',
) {
  const lines = list.slice(0, 6).map((p) => bullet(`**${p.name}** — ${p.summary}`));
  return reply([intro, ...lines, '', outro].join('\n'), list.slice(0, 6), {
    actions: [...list.slice(0, 2).map(view), catalogAction],
  });
}

function notFound(subject?: Product, detail?: string): AssistantReply {
  const text = subject
    ? `I couldn't find ${detail ? `**${detail}**` : 'that'} in the approved documentation for **${subject.name}**, so I can't confirm it. Rather than guess, I'd suggest asking our product team — they can confirm what's supported and whether it can be added as a customization.`
    : detail
      ? `I couldn't find **${detail}** in our approved product documentation, so I can't confirm it. Our Digital Solutions team can tell you what's possible — or I can help you explore our products by industry or business need.`
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

const said = (
  text: string,
  actions: AssistantAction[],
  extra: Partial<AssistantReply> = {},
): AssistantReply => ({ text, products: [], actions, sources: [], grounded: true, ...extra });

const PRICING_TEXT =
  "Pricing isn't published on the website because it depends on the modules you need, the number of users or transactions, the deployment option and any customization. Our team will prepare a tailored proposal — request pricing and we'll get back to you.";

const WHICH_ONE = 'Which product do you mean';

function whichOne(list: Product[]): AssistantReply {
  const names = list.slice(0, 4).map((p) => `**${p.name}**`);
  const joined =
    names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0];
  return {
    text: `${WHICH_ONE}: ${joined}? Tell me which one and I'll answer for that product.`,
    products: list.slice(0, 4).map((p) => p.slug),
    actions: [],
    sources: [],
    grounded: true,
  };
}

const faqReply = (p: Product, faq: Faq) =>
  reply(`**${p.name}** — *${faq.question}*\n${faq.answer}`, [p], {
    sources: [`${p.name} · FAQ: ${faq.question}`],
  });

type Evidence = { score: number; covered: number } & (
  | { kind: 'faq'; faq: Faq }
  | { kind: 'module'; module: Module }
  | { kind: 'feature'; text: string }
  | { kind: 'integration'; text: string }
  | { kind: 'benefit'; benefit: Benefit }
  | { kind: 'audience'; customer: Audience }
);
type Audience = Product['content']['targetCustomers'][number];

/**
 * The documentation snippet that covers the asked words best: FAQ, module,
 * key feature, integration, benefit, target customer — in that order on ties.
 * A word found only in a FAQ's answer counts half (the question is what the
 * FAQ is about). `covered` counts the asked words the snippet mentions at all.
 */
function evidence(p: Product, wanted: string[], preferModules = false): Evidence | null {
  const c = p.content;
  const found = (s: string) => {
    const text = norm(s);
    return wanted.filter((t) => mentions(text, t));
  };
  const plain = (s: string, bonus = 0) => {
    const n = found(s).length;
    return { score: n ? n + bonus : 0, covered: n };
  };
  const all: Evidence[] = [
    ...c.faqs.map((faq): Evidence => {
      const inQuestion = found(faq.question);
      const inAnswer = found(faq.answer).filter((t) => !inQuestion.includes(t));
      return {
        kind: 'faq',
        score: inQuestion.length + inAnswer.length / 2,
        covered: inQuestion.length + inAnswer.length,
        faq,
      };
    }),
    ...c.modules.map((module): Evidence => ({
      kind: 'module',
      ...plain(
        `${module.name} ${module.description} ${module.features.join(' ')}`,
        preferModules ? 0.5 : 0,
      ),
      module,
    })),
    ...p.keyFeatures.map((text): Evidence => ({ kind: 'feature', ...plain(text), text })),
    ...c.integrations.map((text): Evidence => ({ kind: 'integration', ...plain(text), text })),
    ...c.benefits.map((benefit): Evidence => ({
      kind: 'benefit',
      ...plain(`${benefit.title} ${benefit.description}`),
      benefit,
    })),
    ...c.targetCustomers.map((customer): Evidence => ({
      kind: 'audience',
      ...plain(`${customer.title} ${customer.description}`),
      customer,
    })),
  ];
  let best: Evidence | null = null;
  for (const e of all) if (e.score > 0 && (!best || e.score > best.score)) best = e;
  return best;
}

function evidenceReply(p: Product, ev: Evidence, yesNo: boolean): AssistantReply {
  const yes = yesNo ? 'Yes — ' : '';
  switch (ev.kind) {
    case 'faq':
      return faqReply(p, ev.faq);
    case 'module':
      return reply(
        `${yes}**${p.name}** covers this in its **${ev.module.name}** module:\n${ev.module.features.map(bullet).join('\n')}`,
        [p],
        { sources: [`${p.name} · ${ev.module.name}`] },
      );
    case 'feature':
      return reply(`${yes}**${p.name}** lists this among its key features: *${ev.text}*.`, [p], {
        sources: [`${p.name} · Key features`],
      });
    case 'integration':
      return reply(
        `${yes}**${ev.text}** is one of the documented integrations of **${p.name}**.${p.content.integrationNotes ? `\n\n${p.content.integrationNotes}` : ''}`,
        [p],
        { sources: [`${p.name} · Deployment & integration`] },
      );
    case 'benefit':
      return reply(
        `${yes}According to its documentation, **${p.name}** offers this — **${ev.benefit.title}**: ${ev.benefit.description}`,
        [p],
        { sources: [`${p.name} · Key benefits`] },
      );
    case 'audience':
      // A suggestion, not a confirmation: no "Yes".
      return reply(
        `**${p.name}** could fit — it's designed for customers like **${ev.customer.title}** (${ev.customer.description.replace(/\.$/, '')}).\n\n${p.summary}`,
        [p],
        { sources: [`${p.name} · Target customers`] },
      );
  }
}

function evidenceLabel(ev: Evidence): string {
  switch (ev.kind) {
    case 'faq':
      return `*${ev.faq.question}* ${ev.faq.answer}`;
    case 'module':
      return `${ev.module.name} module`;
    case 'feature':
      return ev.text;
    case 'integration':
      return `integrates with ${ev.text}`;
    case 'benefit':
      return ev.benefit.title;
    case 'audience':
      return `for ${ev.customer.title}`;
  }
}

const SECURITY_FEATURE =
  /role-based|access control|permission|audit|secur|encrypt|authenticat|\botp\b|single sign|\bsso\b|active directory|two-factor|\b2fa\b|verified|\bkyc\b/i;

function describe(
  p: Product,
  topics: Set<Topic>,
  opts: { recommend?: boolean; specific?: string[] } = {},
): AssistantReply {
  const c = p.content;
  const parts: string[] = [];
  const sources: string[] = [];
  let grounded = true;
  let actions: AssistantAction[] | undefined;
  if (topics.has('integration')) {
    const listed = norm(`${c.integrations.join(' ')} ${c.integrationNotes}`);
    const unknown = (opts.specific ?? []).filter((t) => !mentions(listed, t));
    if (unknown.length) {
      grounded = false;
      parts.push(
        `I couldn't find **${unknown.join(', ')}** among the documented integrations of **${p.name}** — the product team can confirm whether it's possible.`,
        '',
      );
    }
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
  if (topics.has('modules')) {
    parts.push(
      `**${p.name}** has ${c.modules.length} modules:`,
      ...c.modules.map((m) =>
        bullet(
          `**${m.name}** — ${m.description}${m.features.length ? ` (${m.features.join(', ')})` : ''}`,
        ),
      ),
    );
    sources.push(`${p.name} · Modules`);
  }
  if (topics.has('security')) {
    const items = [
      ...new Set(
        [...p.keyFeatures, ...c.modules.flatMap((m) => m.features), ...c.integrations].filter(
          (f) => SECURITY_FEATURE.test(f) && !/bid security/i.test(f),
        ),
      ),
    ];
    parts.push(
      items.length
        ? `Security-related capabilities documented for **${p.name}**:`
        : `The published documentation for **${p.name}** doesn't describe its security controls in detail, so I can't confirm specifics.`,
      ...items.map(bullet),
      '',
      'For questions about data protection, hosting and compliance, please ask our product team.',
    );
    if (!items.length) grounded = false;
    actions = [inquiry(p, 'Ask about security'), view(p)];
    sources.push(`${p.name} · Modules`);
  }
  if (topics.has('implementation')) {
    parts.push(
      `Implementation timelines for **${p.name}** aren't published — they depend on the modules you need, integrations with your systems, data migration and any customization. The product team agrees the plan and timeline with you during scoping.`,
    );
    const onboarding = c.faqs.filter((f) =>
      /onboard|migrat|import/i.test(`${f.question} ${f.answer}`),
    );
    if (onboarding.length)
      parts.push(
        '',
        'From the product FAQ:',
        ...onboarding.map((f) => bullet(`*${f.question}* ${f.answer}`)),
      );
    actions = [inquiry(p, 'Discuss implementation'), demo(p)];
  }
  if (topics.has('support')) {
    parts.push(
      `Training and support arrangements for **${p.name}** aren't described in its published documentation, so I can't confirm exactly what's included. The product team can explain onboarding, training and ongoing support.`,
    );
    grounded = false;
    actions = [inquiry(p, 'Ask about training & support'), demo(p)];
  }
  if (topics.has('demo')) {
    parts.push(
      c.demo
        ? `There's a ${c.demo.duration} demo of **${p.name}** you can watch on its product page, and you can book a live demo (online, onsite, recorded or customized).`
        : `A recorded demo of **${p.name}** isn't published yet, but you can book a live demo with our product specialists.`,
    );
    actions ??= [demo(p), view(p)];
    sources.push(`${p.name} · Demo`);
  }
  if (!parts.length || topics.has('features') || topics.has('more')) {
    const tagline = p.tagline ? ` — ${p.tagline}` : '';
    const head = [
      opts.recommend ? `I'd recommend **${p.name}**${tagline}` : `**${p.name}**${tagline}`,
      '',
      p.overview,
    ];
    if (p.availability !== 'available')
      head.push('', `*Status: ${EN.availability[p.availability]}*`);
    if (topics.has('features') && p.keyFeatures.length)
      head.push('', '**Key features:**', ...p.keyFeatures.map(bullet));
    if (!topics.has('modules'))
      head.push(
        '',
        '**Modules:**',
        ...c.modules.map((m) => bullet(`**${m.name}** — ${m.description}`)),
      );
    parts.unshift(...head, ...(parts.length ? [''] : []));
    sources.unshift(`${p.name} · Overview & modules`);
  }
  return reply(parts.join('\n'), [p], { sources, grounded, actions });
}

function compare(a: Product, b: Product): AssistantReply {
  const row = (p: Product) =>
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

/** Answers a question about one product: FAQ, documented evidence, then the asked topics. */
function aboutProduct(
  p: Product,
  a: {
    qTokens: string[];
    topics: Set<Topic>;
    topicWords: Set<string>;
    recommend: boolean;
    need: boolean;
    yesNo: boolean;
    idx: CatalogIndex;
  },
): AssistantReply {
  const structural = STRUCTURAL.some((t) => a.topics.has(t));
  if (a.recommend && !structural) return describe(p, new Set(), { recommend: true });
  if (!a.need) {
    const faq = bestMatch(a.qTokens, p.content.faqs, (f) => f.question, 0.4);
    if (faq) return faqReply(p, faq);
  }
  // The asked words, without the product's name; its aliases ("parents", "grades") still say
  // which part of the documentation is meant, but are in scope by definition.
  const nameWords = new Set(tokens(p.name));
  const aliasWords = productWords(p);
  const asked = a.qTokens.filter(
    (t) => !isFiller(t) && !nameWords.has(t) && !isTopicWord(t, a.topicWords),
  );
  const wanted = asked.filter((t) => !aliasWords.has(t));
  if (wanted.length && !a.need) {
    const corpus = a.idx.corpus.get(p.slug) ?? '';
    const missing = wanted.filter((t) => !mentions(corpus, t));
    // A yes/no question about something the documentation never mentions: say so, never guess.
    if (missing.length && a.yesNo && !a.topics.has('integration'))
      return notFound(p, missing.slice(0, 3).join(', '));
    if (!missing.length) {
      const ev = evidence(p, asked, a.topics.has('modules'));
      if (ev) return evidenceReply(p, ev, a.yesNo);
    }
  }
  return describe(p, a.topics, { specific: a.topics.has('integration') ? wanted : [] });
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

/** A FAQ of any product that closely matches the question ("Can one ticket be used twice?"). */
function faqAnywhere(qTokens: string[], products: Product[]) {
  let best: { p: Product; faq: Faq; ratio: number } | null = null;
  for (const p of products)
    for (const faq of p.content.faqs) {
      const ft = new Set(tokens(faq.question));
      const hits = qTokens.filter((t) => ft.has(t)).length;
      const ratio = hits / Math.max(qTokens.length, ft.size);
      if (hits >= 2 && ratio >= 0.6 && (!best || ratio > best.ratio)) best = { p, faq, ratio };
    }
  return best;
}

function industryOrNeed(q: string, taxonomy: Taxonomy, products: Product[]): AssistantReply | null {
  const top = (entries: TaxonomyEntry[]) =>
    entries
      .map((e) => ({ e, n: e.keywords.filter((k) => has(q, k)).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)[0];
  const industry = top(taxonomy.industries);
  const need = top(taxonomy.needs);
  const inIndustry = industry ? products.filter((p) => p.industries.includes(industry.e.id)) : [];
  const forNeed = need ? products.filter((p) => p.needs.includes(need.e.id)) : [];
  if (industry && need) {
    const both = inIndustry.filter((p) => forNeed.includes(p));
    if (both.length)
      return listProducts(
        `For **${industry.e.name}** — to **${need.e.name.toLowerCase()}** — I'd look at:`,
        both,
      );
  }
  if (need && forNeed.length && (!industry || need.n > industry.n))
    return listProducts(`To **${need.e.name.toLowerCase()}**, I'd look at:`, forNeed);
  if (industry && inIndustry.length)
    return listProducts(`For **${industry.e.name}**, these solutions are a good fit:`, inIndustry);
  if (need && forNeed.length)
    return listProducts(`To **${need.e.name.toLowerCase()}**, I'd look at:`, forNeed);
  return null;
}

const STATUS_FILTERS: { statuses: Availability[]; label: string; words: string[] }[] = [
  { statuses: ['pilot'], label: 'in our pilot program', words: ['pilot'] },
  {
    statuses: ['coming_soon', 'in_development'],
    label: 'coming soon or in development',
    words: [
      'coming soon',
      'upcoming',
      'in development',
      'under development',
      'future product',
      'new product',
      'roadmap',
    ],
  },
  {
    statuses: ['available'],
    label: 'available now',
    words: [
      'available now',
      'available today',
      'already available',
      'launched',
      'live now',
      'ready to use',
    ],
  },
];

const PLATFORM_WORDS: [Platform, string[]][] = [
  ['ussd', ['ussd']],
  ['android', ['android']],
  ['ios', ['ios', 'iphone', 'ipad']],
  ['web', ['web', 'browser', 'desktop', 'laptop', 'computer']],
];

function byStatus(products: Product[], filter: (typeof STATUS_FILTERS)[number]): AssistantReply {
  const list = products.filter((p) => filter.statuses.includes(p.availability));
  if (!list.length)
    return said(
      `None of our products is ${filter.label} right now. You can browse what's available today — or suggest a product on our *What Should We Build Next?* page.`,
      [catalogAction],
    );
  return listProducts(
    `These products are ${filter.label}:`,
    list,
    filter.statuses.includes('pilot')
      ? 'You can request a demo to discuss joining a pilot.'
      : undefined,
  );
}

function byPlatform(products: Product[], platforms: Platform[]): AssistantReply {
  const labels = platforms.map((x) => EN.platform[x]).join(' and ');
  const list = products.filter((p) => platforms.every((x) => p.platforms.includes(x)));
  if (!list.length)
    return said(`None of our products currently lists ${labels} access in its documentation.`, [
      inquiry(undefined, 'Ask the product team'),
      catalogAction,
    ]);
  return listProducts(`These products are available on ${labels}:`, list);
}

function countReply(products: Product[]): AssistantReply {
  const phrase: Record<Availability, string> = {
    available: 'available now',
    pilot: 'in pilot',
    coming_soon: 'coming soon',
    in_development: 'in development',
    temporarily_unavailable: 'temporarily unavailable',
  };
  const counts = new Map<Availability, number>();
  for (const p of products) counts.set(p.availability, (counts.get(p.availability) ?? 0) + 1);
  const breakdown = [...counts].map(([a, n]) => `${n} ${phrase[a]}`).join(', ');
  const sorted = [...products].sort((a, b) => Number(b.featured) - Number(a.featured));
  return reply(
    [
      `We currently have **${products.length} digital solutions** in our catalog (${breakdown}):`,
      ...sorted.map((p) => bullet(`**${p.name}**`)),
      '',
      'Would you like details on any of them?',
    ].join('\n'),
    sorted.slice(0, 4),
    { actions: [catalogAction] },
  );
}

function integrationReply(products: Product[], specific: string[]): AssistantReply {
  if (specific.length) {
    const hits = products.filter((p) => {
      const listed = norm(`${p.content.integrations.join(' ')} ${p.content.integrationNotes}`);
      return specific.every((t) => mentions(listed, t));
    });
    if (hits.length)
      return listProducts(
        `These products document integration with **${specific.join(' ')}**:`,
        hits,
        'The exact integration scope is confirmed with the product team.',
      );
    return {
      text: `I couldn't find **${specific.join(', ')}** among the documented integrations of our products, so I can't confirm it. Our products work with NIB digital channels (mobile banking, internet banking and the payment gateway), and other integrations are scoped with the product team.`,
      products: [],
      actions: [inquiry(undefined, 'Ask about integration'), catalogAction],
      sources: [],
      grounded: false,
    };
  }
  const viaApi = products.filter((p) => p.content.integrations.some((i) => /\bapi\b/i.test(i)));
  const examples = viaApi.slice(0, 3).map((p) => p.name);
  return reply(
    `Our solutions are built to work with NIB digital channels (mobile banking, internet banking and the payment gateway).${examples.length ? ` Several products also integrate with core banking and other systems through APIs — for example ${examples.length > 1 ? `${examples.slice(0, -1).join(', ')} and ${examples[examples.length - 1]}` : examples[0]}.` : ''} The exact integration with your existing systems is scoped with our product team.\n\nTell me which product you're interested in and I'll share its documented integrations.`,
    viaApi,
    { actions: [inquiry(undefined, 'Ask about integration'), catalogAction] },
  );
}

function deploymentReply(products: Product[], q: string): AssistantReply {
  const allCloud = products.length > 0 && products.every((p) => p.deployment.includes('cloud'));
  if (has(q, 'hybrid'))
    return listProducts(
      'These products support a hybrid deployment:',
      products.filter((p) => p.deployment.includes('hybrid')),
      'The product team confirms the right deployment model for your requirements.',
    );
  const onPremise = ['on-premise', 'on premise', 'onpremise', 'install', 'server'].some((k) =>
    has(q, k),
  );
  if (!onPremise && ['cloud', 'saas', 'hosted', 'hosting'].some((k) => has(q, k)))
    return listProducts(
      allCloud
        ? 'All our products are available on NIB Cloud (SaaS). A few highlights:'
        : 'These products are available on NIB Cloud (SaaS):',
      products.filter((p) => p.deployment.includes('cloud')),
    );
  return listProducts(
    `${allCloud ? 'All products are available on NIB Cloud. ' : ''}These can also be deployed on-premise at your institution:`,
    products.filter((p) => p.deployment.includes('on_premise')),
    'Hybrid options are available for several products; the product team confirms the right model for your requirements.',
  );
}

function demoReply(products: Product[], q: string): AssistantReply {
  if (has(q, 'video')) {
    const withVideo = products.filter((p) => p.content.demo);
    if (withVideo.length)
      return listProducts(
        'These products have a recorded demo you can watch on their product page:',
        withVideo,
        'You can also book a live demo of any product.',
      );
  }
  const trial = has(q, 'trial');
  return said(
    `${trial ? "I can't confirm a free trial from the published information, but you can request a demo. " : 'Happy to arrange a demo. '}You can choose an online, onsite, recorded or customized demo — tell us which product you're interested in, or leave it open and our team will suggest the best fit.`,
    [demo(), catalogAction],
  );
}

const IDENTITY_TEXT =
  "I'm the NIB Digital Solutions Assistant, an automated guide to our digital products. I answer from the published product information: I can recommend products for your industry or business need, explain features, modules, deployment and integration, compare products, and help you request a demo or pricing. When something isn't covered, I'll point you to our team.";

const HELP_TEXT = [
  "Here's what I can help with:",
  bullet('Recommend products for your industry or business need'),
  bullet("Explain a product's features, modules, platforms, deployment and integrations"),
  bullet('Compare two products side by side'),
  bullet('Help you request a demo or a pricing proposal'),
  '',
  "Tell me about your business or what you'd like to automate, and I'll suggest where to start.",
].join('\n');

// ── The assistant ────────────────────────────────────────────────────────────

export function answer(question: string, ctx: AssistantContext): AssistantReply {
  const products = ctx.products;
  const history = ctx.history ?? [];
  const focus = ctx.focusSlug ? products.find((p) => p.slug === ctx.focusSlug) : undefined;

  if (sharesSensitiveData(question))
    return said(
      "For your security, please don't share account numbers, card numbers, PINs, passwords or one-time codes in this chat — I don't need them to answer questions about our products. How can I help you with our digital solutions?",
      [catalogAction, inquiry(undefined, 'Contact the team')],
    );

  // Contact details typed into the chat never reach anyone: point to the contact form.
  if (sharesContactDetails(question))
    return said(
      "Thanks! Messages in this chat don't reach our team, so please send your phone number or e-mail through the contact form together with what you need — the right specialist will get back to you.",
      [inquiry(focus, 'Contact the team'), demo(focus)],
    );

  const amharic = translateAmharic(question);
  if (amharic.amharic && !amharic.understood && !/[a-z]{2,}/i.test(question))
    return said(
      'Sorry — I can only understand questions in English for now, and our product information is published in English. Please try asking in English, or contact our team directly.',
      [inquiry(undefined, 'Contact the team'), catalogAction],
      { grounded: false },
    );

  const idx = catalogIndex(products, ctx.taxonomy);
  const text = correctSpelling(amharic.text, idx);
  const q = norm(text);
  const core = q.replace(LEAD, ' ');
  const qTokens = tokens(text);
  const ranked = scoreProducts(q, qTokens, products, ctx.taxonomy, idx);
  const explicit = ranked.filter((r) => r.explicit).map((r) => r.p);
  const { topics, words: topicWords } = detectTopics(withoutProductNames(q, ranked));
  const business = [...topics].some((t) => !SMALL_TALK.has(t));
  const structural = STRUCTURAL.some((t) => topics.has(t));
  const yesNo = YES_NO.test(core) || has(core, 'support');
  const owner = OWNER.test(core);
  const need = (NEED.test(core) || owner) && !JUST_ASKING.test(core);
  const recommend = RECOMMEND.test(core) || need;

  // ── Conversation context: the product(s) the previous answer was about ──
  const lastAt = lastIndex(history, 'assistant');
  const last = history[lastAt];
  const lastProducts = last ? mentioned(last.text, products) : [];
  const picked =
    lastProducts.length > 1
      ? (ordinal(core, lastProducts) ?? explicit.find((p) => lastProducts.includes(p)))
      : undefined;

  // The visitor answered "which product do you mean?": answer their earlier question for it.
  if (picked && last?.text.startsWith(WHICH_ONE) && !business) {
    const prevAt = lastIndex(history.slice(0, lastAt), 'user');
    const prev = history[prevAt];
    if (prev)
      return answer(prev.text, {
        ...ctx,
        focusSlug: picked.slug,
        history: history.slice(0, prevAt),
      });
  }

  // Follow-ups ("does it work with USSD?", "and the benefits?") refer to the product discussed last.
  let followUp: Product | undefined;
  let ambiguous: Product[] = [];
  if (!explicit.length && !focus && lastProducts.length && !LIST_QUESTION.test(core)) {
    const singular = SINGULAR.test(core);
    const refersBack =
      singular || topics.has('more') || (structural && qTokens.length <= 3) || !qTokens.length;
    if (picked) followUp = picked;
    else if (refersBack && lastProducts.length === 1) followUp = lastProducts[0];
    else if (lastProducts.length > 1 && (singular || topics.has('more'))) ambiguous = lastProducts;
  }
  const subject = explicit[0] ?? focus ?? followUp;

  // ── Small talk ──
  const contentful = qTokens.filter((t) => !SMALL_TALK_WORDS.has(t));
  if (!contentful.length && !explicit.length) {
    if (topics.has('identity')) return said(IDENTITY_TEXT, [catalogAction]);
    if (topics.has('help') && !subject) return said(HELP_TEXT, [catalogAction]);
  }
  if (!contentful.length && !business && !explicit.length) {
    if (subject && (topics.has('more') || followUp))
      return describe(subject, new Set(['features']));
    if (ambiguous.length) return whichOne(ambiguous);
    if (topics.has('thanks'))
      return reply(
        "You're welcome! Anything else I can help you find? I can also book a demo for you.",
        focus ? [focus] : [],
      );
    if (topics.has('bye'))
      return said(
        "Thank you for visiting NIB Digital Solutions! Whenever you're ready, request a demo or send us a message — we'll be glad to help.",
        [demo(focus), inquiry(focus, 'Contact the team')],
      );
    if (topics.has('ack'))
      return said(
        'Is there anything else you would like to know? I can recommend products, explain features or help you book a demo.',
        [catalogAction],
      );
    return reply(
      focus
        ? `Hi! Ask me anything about **${focus.name}** — features, modules, deployment, integration or how to get a demo.`
        : "Hi! I'm the NIB Digital Solutions Assistant. Tell me about your business or what you'd like to automate, and I'll recommend the right products.",
      focus ? [focus] : [],
    );
  }

  // ── Policy topics ──
  if (topics.has('banking') && !explicit.length)
    return said(
      "I'm the assistant for NIB's digital business solutions, so I can't help with personal banking such as accounts, cards, transfers, balances or exchange rates. For those, please contact NIB International Bank through its official customer service channels or visit a branch.\n\nIf you're looking for software for your business or institution, I'm happy to help.",
      [catalogAction],
    );

  if (topics.has('pricing')) {
    return {
      text: PRICING_TEXT,
      products: subject ? [subject.slug] : [],
      actions: [inquiry(subject, 'Request pricing'), ...(subject ? [demo(subject)] : [])],
      sources: ['Commercial policy'],
      grounded: true,
    };
  }

  if (topics.has('compare')) {
    const first = explicit[0];
    const pair =
      explicit.length >= 2
        ? explicit.slice(0, 2)
        : first
          ? [
              (focus && focus !== first ? focus : undefined) ??
                lastProducts.find((p) => p !== first),
              first,
            ].filter((p): p is Product => !!p)
          : lastProducts.slice(0, 2);
    if (pair.length === 2) return compare(pair[0]!, pair[1]!);
  }

  if (ambiguous.length) return whichOne(ambiguous);

  if (topics.has('start'))
    return said(
      `The best first step is to request a demo${subject ? ` of **${subject.name}**` : ' of the product you are interested in'} — or send us a message describing what you need. Our team will follow up to understand your requirements and prepare a tailored proposal.`,
      [demo(subject), inquiry(subject, 'Contact the team')],
      { products: subject ? [subject.slug] : [] },
    );

  if (topics.has('contact'))
    return said(
      `The quickest way to reach our Digital Solutions team is to send us a message: tell us what you need and the right specialist will get back to you.${subject ? ` You can also request a demo of **${subject.name}** directly.` : ' If you already know which product interests you, you can also request a demo directly.'}`,
      [inquiry(subject, 'Contact the team'), demo(subject)],
      { products: subject ? [subject.slug] : [] },
    );

  // An industry or business need named in full ("Which product fits “Events & Entertainment”?",
  // the catalog page's prompt): every product filed under it, as the catalog shows them.
  const named = [
    ...ctx.taxonomy.industries.map((e) => ({ e, of: (p: Product) => p.industries })),
    ...ctx.taxonomy.needs.map((e) => ({ e, of: (p: Product) => p.needs })),
  ].find(({ e }) => q.includes(norm(e.name)));
  if (
    named &&
    (recommend || topics.has('catalog') || !qTokens.some((t) => !tokens(named.e.name).includes(t)))
  ) {
    const list = products.filter((p) => named.of(p).includes(named.e.id));
    if (list.length)
      return listProducts(`For **${named.e.name}**, these solutions are a good fit:`, list);
  }

  // ── Catalog filters ──
  if (!subject) {
    const status = STATUS_FILTERS.find((f) => f.words.some((w) => has(q, w)));
    if (status) return byStatus(products, status);
    const platforms = PLATFORM_WORDS.filter(([, words]) => words.some((w) => has(q, w))).map(
      ([platform]) => platform,
    );
    if (platforms.length) return byPlatform(products, platforms);
    if (topics.has('count')) return countReply(products);
    // "What do you have for retail?" is about retail, not the whole catalog.
    if (topics.has('catalog'))
      return (
        industryOrNeed(q, ctx.taxonomy, products) ??
        listProducts(
          `We currently offer ${products.length} digital solutions. Here are a few highlights:`,
          [...products].sort((a, b) => Number(b.featured) - Number(a.featured)),
        )
      );
  }

  // ── One product ──
  if (subject) {
    if (explicit.length > 1 && recommend && !structural)
      return listProducts('These products match what you described:', explicit);
    // A product was named, but another product's FAQ asks exactly this ("Can merchants join the marketplace?").
    if (!focus || explicit.length) {
      const exact = faqAnywhere(qTokens, products);
      if (exact && exact.ratio >= 0.8) return faqReply(exact.p, exact.faq);
    }
    return aboutProduct(subject, {
      qTokens,
      topics,
      topicWords,
      recommend: recommend && explicit.length > 0,
      need,
      yesNo,
      idx,
    });
  }

  // ── General topics ──
  if (topics.has('demo')) return demoReply(products, q);
  if (topics.has('mobile')) {
    return listProducts(
      'These solutions include mobile apps (Android/iOS) or USSD access:',
      products.filter((p) => p.platforms.some((x) => x !== 'web')),
    );
  }
  const wanted = qTokens.filter((t) => !isFiller(t) && !isTopicWord(t, topicWords));
  if (topics.has('integration')) return integrationReply(products, wanted);
  if (topics.has('customization')) {
    const customizable = products.filter((p) => p.customizable).length;
    return reply(
      `${customizable === products.length ? 'All of our products' : 'Most of our products'} can be configured and customized to your workflows, branding and reporting needs. The scope and timeline of a customization is agreed with the product team — choosing a *Customized demo* is the best way to start that conversation.`,
      [],
      { actions: [inquiry(undefined, 'Discuss customization'), catalogAction] },
    );
  }
  if (topics.has('deployment')) return deploymentReply(products, q);
  if (topics.has('security'))
    return said(
      "Security questions — such as data protection, hosting and access control — depend on the product and the deployment option you choose. The published product pages don't describe security controls in detail, so rather than guess, I'd suggest asking our product team. Tell me which product you're considering and I'll share the security-related features its documentation lists.",
      [inquiry(undefined, 'Ask about security'), catalogAction],
      { grounded: false },
    );
  if (topics.has('implementation'))
    return said(
      "Implementation timelines aren't published because they depend on the modules you need, integrations with your systems, data migration and any customization. Our product team agrees the plan and timeline with you during scoping — a demo is a good first step.",
      [inquiry(undefined, 'Discuss implementation'), demo()],
    );
  if (topics.has('support'))
    return said(
      "The published product information doesn't describe training and support packages, so I can't confirm exactly what's included. Our product team can explain onboarding, training and ongoing support for the product you're interested in.",
      [inquiry(undefined, 'Ask about training & support'), catalogAction],
      { grounded: false },
    );

  // ── Anything else the catalog documents ──
  const faq = faqAnywhere(qTokens, products);
  if (faq) return faqReply(faq.p, faq.faq);

  const fit = industryOrNeed(q, ctx.taxonomy, products);
  if (fit) return fit;

  // "Which product sends SMS reminders?": products whose documentation covers every asked word in one place.
  if ((yesNo || recommend) && wanted.length) {
    const found = products
      .map((p) => ({ p, ev: evidence(p, wanted) }))
      .filter((x): x is { p: Product; ev: Evidence } => !!x.ev && x.ev.covered === wanted.length);
    if (found.length === 1) return evidenceReply(found[0]!.p, found[0]!.ev, yesNo);
    if (found.length > 1) {
      const top = found.slice(0, 6);
      return reply(
        [
          'These products cover that in their documentation:',
          ...top.map(({ p, ev }) => bullet(`**${p.name}** — ${evidenceLabel(ev)}`)),
          '',
          'Would you like details on one of them?',
        ].join('\n'),
        top.map((x) => x.p),
        { actions: [...top.slice(0, 2).map((x) => view(x.p)), catalogAction] },
      );
    }
  }

  if (ranked.length && ranked[0]!.score >= 4) {
    const top = ranked.slice(0, 3).map((r) => r.p);
    if (top.length === 1) return describe(top[0]!, topics);
    return listProducts('Based on what you described, these products look relevant:', top);
  }

  if (owner) {
    const related = ranked.slice(0, 3).map((r) => r.p);
    if (related.length)
      return listProducts('These products could fit a business like yours:', related);
    const general = ctx.taxonomy.industries.filter((e) =>
      e.keywords.some((k) => /small business|\bsme\b/i.test(k)),
    );
    const forBusinesses = products.filter((p) =>
      p.industries.some((id) => general.some((e) => e.id === id)),
    );
    if (forBusinesses.length)
      return listProducts(
        "We don't have a solution built specifically for that type of business, but these work for most small and medium businesses:",
        forBusinesses,
      );
  }

  if (yesNo && wanted.length) return notFound(undefined, wanted.slice(0, 3).join(', '));
  return notFound();
}
