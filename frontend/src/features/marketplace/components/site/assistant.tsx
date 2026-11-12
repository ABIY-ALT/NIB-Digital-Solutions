'use client';

import {
  ArrowUpRight,
  Bot,
  CalendarCheck,
  ChevronDown,
  CornerDownLeft,
  LayoutGrid,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { ask } from '../../client';
import type { AssistantAction, AssistantReply, ChatTurn, MarketplaceProduct } from '../../types';
import { useMarketplace } from './marketplace-provider';
import { ProductIcon } from './product-card';

interface Message extends ChatTurn {
  id: number;
  reply?: AssistantReply;
}

/** The assistant's limited markdown (bold, italics, bullets) → React nodes. Never injects HTML. */
function RichText({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) =>
      part.startsWith('**') ? (
        <strong key={i} className="font-semibold text-brown-900">
          {part.slice(2, -2)}
        </strong>
      ) : part.startsWith('*') && part.length > 2 ? (
        <em key={i}>{part.slice(1, -1)}</em>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`l${blocks.length}`} className="my-1.5 space-y-1">
        {list.map((li, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
            <span>{inline(li)}</span>
          </li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('- ')) list.push(line.slice(2));
    else {
      flush();
      if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="space-y-1.5">{blocks}</div>;
}

const SUGGESTIONS = ['schools', 'building', 'lending', 'customize', 'mobile', 'integrate'] as const;
const PRODUCT_SUGGESTIONS = [
  'what',
  'modules',
  'integrate',
  'mobile',
  'customize',
  'demo',
] as const;

export function AssistantChat({
  focusProduct,
  variant = 'floating',
  initialQuestion,
  className,
}: {
  focusProduct?: MarketplaceProduct;
  variant?: 'floating' | 'embedded';
  initialQuestion?: string | null;
  className?: string;
}) {
  const t = useTranslations('marketplace.assistant');
  const { products, taxonomy, openDemoRequest, openInquiry, assistant } = useMarketplace();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const asked = useRef(false);

  const suggestions = focusProduct
    ? PRODUCT_SUGGESTIONS.map((k) => t(`productSuggestions.${k}`, { name: focusProduct.name }))
    : SUGGESTIONS.map((k) => t(`suggestions.${k}`));

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function send(text: string) {
    const q = text.trim().slice(0, 600);
    if (q.length < 2 || busy || !products.length) return;
    setInput('');
    const history: ChatTurn[] = messages.map(({ role, text: m }) => ({ role, text: m }));
    setMessages((m) => [...m, { id: Date.now(), role: 'user', text: q }]);
    setBusy(true);
    try {
      const reply = await ask(q, { products, taxonomy, focusSlug: focusProduct?.slug, history });
      setMessages((m) => [
        ...m,
        { id: Date.now() + 1, role: 'assistant', text: reply.text, reply },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          role: 'assistant',
          text: t('error'),
          reply: {
            text: '',
            products: [],
            actions: [{ kind: 'inquiry', label: t('contactTeam') }],
            sources: [],
            grounded: false,
          },
        },
      ]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  useEffect(() => {
    if (initialQuestion && products.length && !asked.current) {
      asked.current = true;
      void send(initialQuestion);
    }
    // send is stable enough for a one-off initial question
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion, products.length]);

  function runAction(a: AssistantAction, lastQuestion: string) {
    if (a.kind === 'view' && a.slug) {
      if (variant === 'floating') assistant.setOpen(false);
      router.push(`/products/${a.slug}`);
    } else if (a.kind === 'demo') openDemoRequest({ productSlug: a.slug, source: 'assistant' });
    else if (a.kind === 'inquiry')
      openInquiry({
        productSlug: a.slug,
        source: 'assistant',
        inquiryType: /pric/i.test(a.label) ? 'pricing' : 'product_information',
        message: lastQuestion,
      });
    else if (a.kind === 'catalog') {
      if (variant === 'floating') assistant.setOpen(false);
      router.push('/products');
    }
  }

  const productMap = new Map(products.map((p) => [p.slug, p]));
  const lastUserQuestion = [...messages].reverse().find((m) => m.role === 'user')?.text ?? '';
  const avatar = (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brown-700 text-gold-400">
      <Bot className="h-4.5 w-4.5" />
    </span>
  );

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div
        ref={scroller}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="animate-fade-in">
            <div className="flex gap-3">
              {avatar}
              <div className="rounded-2xl rounded-tl-md bg-mist px-4 py-3 text-sm leading-relaxed text-charcoal">
                {focusProduct ? t('greetingProduct', { name: focusProduct.name }) : t('greeting')}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 pl-11">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-line bg-white px-3 py-1.5 text-left text-xs font-medium text-brown-800 transition hover:border-gold-400 hover:bg-gold-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex animate-fade-in justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-brown-700 px-4 py-2.5 text-sm text-white">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex animate-fade-up gap-3">
              {avatar}
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    'rounded-2xl rounded-tl-md px-4 py-3 text-sm leading-relaxed text-charcoal',
                    m.reply?.grounded === false ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-mist',
                  )}
                >
                  <RichText text={m.text} />
                </div>
                {m.reply && m.reply.products.length > 1 && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {m.reply.products.slice(0, 4).map((slug) => {
                      const p = productMap.get(slug);
                      if (!p) return null;
                      return (
                        <button
                          key={slug}
                          onClick={() => runAction({ kind: 'view', slug, label: '' }, m.text)}
                          className="flex items-center gap-2.5 rounded-xl border border-line bg-white p-2.5 text-left transition hover:border-brown-200 hover:shadow-tile"
                        >
                          <ProductIcon product={p} size="sm" />
                          <span className="line-clamp-2 min-w-0 flex-1 text-xs leading-snug font-semibold text-brown-900">
                            {p.name}
                          </span>
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        </button>
                      );
                    })}
                  </div>
                )}
                {m.reply && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {m.reply.actions.slice(0, 3).map((a, i) => (
                      <button
                        key={i}
                        onClick={() => runAction(a, lastUserQuestion)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                          a.kind === 'demo'
                            ? 'bg-gold-500 text-brown-950 hover:bg-gold-400'
                            : 'border border-line bg-white text-brown-800 hover:border-brown-200',
                        )}
                      >
                        {a.kind === 'demo' ? (
                          <CalendarCheck className="h-3.5 w-3.5" />
                        ) : a.kind === 'inquiry' ? (
                          <MessageSquare className="h-3.5 w-3.5" />
                        ) : a.kind === 'catalog' ? (
                          <LayoutGrid className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        )}
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
                {m.reply && m.reply.sources.length > 0 && (
                  <p className="mt-2 flex items-start gap-1 text-[11px] text-slate-400">
                    <ShieldCheck className="mt-px h-3 w-3 shrink-0" />{' '}
                    {t('source', { sources: m.reply.sources.slice(0, 2).join(' · ') })}
                  </p>
                )}
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brown-700 text-gold-400">
              <Sparkles className="h-4 w-4" />
            </span>
            <div
              className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-mist px-4 py-3"
              aria-label={t('typing')}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-2 w-2 animate-pulse-dot rounded-full bg-brown-300"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <form
        className="border-t border-line bg-white p-3 sm:p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-white p-1.5 pl-3.5 transition focus-within:border-brown-300 focus-within:ring-4 focus-within:ring-brown-50">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={600}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder={
              focusProduct ? t('placeholderProduct', { name: focusProduct.name }) : t('placeholder')
            }
            aria-label={t('question')}
            className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-slate-400"
          />
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-brown-800"
              aria-label={t('newChat')}
              title={t('newChat')}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button
            type="submit"
            disabled={input.trim().length < 2 || busy}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-brown-700 text-white transition hover:bg-brown-800 disabled:opacity-40"
            aria-label={t('send')}
          >
            <CornerDownLeft className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 px-1 text-[11px] leading-snug text-slate-400">{t('notice')}</p>
      </form>
    </div>
  );
}

/** Floating assistant available on every public page. */
export function AssistantWidget() {
  const t = useTranslations('marketplace.assistant');
  const { assistant } = useMarketplace();
  const [session, setSession] = useState(0);
  const [initial, setInitial] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const { open, pending, consumePending } = assistant;
  // Phones: the launcher waits until the visitor scrolls a little, so it never
  // sits on a page's first-screen buttons (the homepage's "Explore our products",
  // a product's "Request a Demo"). A page too short to scroll shows it at once.
  // CSS (max-sm) decides the screen size, so the server render is already right.
  const pathname = usePathname();
  const [atTop, setAtTop] = useState(true);
  const holdOnPhones = atTop;

  useEffect(() => {
    const check = () => {
      const canScroll = document.documentElement.scrollHeight - window.innerHeight > 160;
      setAtTop(canScroll && window.scrollY < 160);
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [pathname]);

  useEffect(() => {
    if (open) setMounted(true);
    if (open && pending) {
      setInitial(consumePending());
      setSession((s) => s + 1);
    }
  }, [open, pending, consumePending]);

  return (
    <>
      <div
        className={cn(
          'fixed right-0 bottom-0 z-[70] flex h-[min(680px,100dvh)] w-full origin-bottom-right flex-col overflow-hidden bg-white shadow-lift transition-all duration-300 sm:right-5 sm:bottom-5 sm:h-[min(640px,calc(100dvh-2.5rem))] sm:w-[420px] sm:rounded-3xl sm:ring-1 sm:ring-line',
          open
            ? 'pointer-events-auto scale-100 opacity-100'
            : 'pointer-events-none scale-95 opacity-0',
        )}
        role="dialog"
        aria-label={t('name')}
        inert={!open}
      >
        <div className="flex items-center gap-3 bg-brown-700 px-5 py-4 text-white">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
            <Bot className="h-5 w-5 text-gold-400" />
            <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-brown-900" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold">{t('name')}</p>
            <p className="text-xs text-white/60">{t('subtitle')}</p>
          </div>
          <button
            onClick={() => assistant.setOpen(false)}
            className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label={t('minimize')}
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
        {mounted && <AssistantChat key={session} initialQuestion={initial} className="flex-1" />}
      </div>
      <button
        onClick={() => assistant.setOpen(!open)}
        className={cn(
          'group fixed right-5 bottom-5 z-[60] flex items-center gap-2.5 rounded-full bg-brown-700 py-3 pr-5 pl-3 text-white shadow-lift transition-all duration-300 hover:bg-brown-800',
          open && 'pointer-events-none translate-y-4 opacity-0',
          holdOnPhones &&
            'max-sm:pointer-events-none max-sm:invisible max-sm:translate-y-4 max-sm:opacity-0',
        )}
        aria-label={t('openLabel')}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-500 text-brown-950 transition group-hover:rotate-12">
          <Sparkles className="h-4.5 w-4.5" />
        </span>
        <span className="hidden text-sm font-semibold sm:inline">{t('open')}</span>
      </button>
    </>
  );
}
