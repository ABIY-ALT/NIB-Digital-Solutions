'use client';

import { AlertCircle, ChevronDown, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib/cn';

// ─────────────────────────────────────────────────────────────────────────────
// Marketing-grade primitives for the public marketplace site. The staff
// screens keep using the AppCore component library (@/shared/ui).
// ─────────────────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'light' | 'link';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const base =
  'group/btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500';
const variants: Record<Variant, string> = {
  primary:
    'bg-gold-500 text-brown-900 hover:bg-gold-400 hover:-translate-y-px shadow-[0_6px_20px_-8px_rgb(253_185_19/0.8)] hover:shadow-glow',
  secondary: 'bg-brown-600 text-white hover:bg-brown-700 hover:-translate-y-px shadow-tile',
  outline: 'border border-line bg-white text-brown-900 hover:border-brown-300 hover:bg-mist',
  ghost: 'text-brown-900 hover:bg-brown-50',
  light: 'border border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20',
  link: 'px-0! text-brown-700 underline-offset-4 hover:text-brown-900 hover:underline',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-13 px-7 text-base',
  icon: 'h-10 w-10',
};

interface Common {
  variant?: Variant;
  size?: Size;
  className?: string;
  children?: ReactNode;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export function SiteButton({
  variant = 'primary',
  size = 'md',
  className,
  children,
  loading,
  iconLeft,
  iconRight,
  href,
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement> & { href?: string }) {
  const classes = cn(base, variants[variant], sizes[size], className);
  const content = (
    <>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : iconLeft}
      {children}
      {iconRight ? (
        // Trailing arrows nudge forward on hover.
        <span className="inline-flex transition-transform duration-200 group-hover/btn:translate-x-0.5">
          {iconRight}
        </span>
      ) : null}
    </>
  );
  if (href) {
    return href.startsWith('#') ? (
      <a href={href} className={classes}>
        {content}
      </a>
    ) : (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
    >
      {content}
    </button>
  );
}

type Tone = 'neutral' | 'brown' | 'gold' | 'green' | 'blue' | 'violet' | 'outline';
const tones: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  brown: 'bg-brown-700 text-white',
  gold: 'bg-gold-50 text-gold-800 ring-1 ring-gold-200',
  green: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70',
  blue: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200/70',
  violet: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200/70',
  outline: 'bg-white text-charcoal ring-1 ring-line',
};

export function SiteBadge({
  tone = 'neutral',
  children,
  className,
  dot,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/**
 * 'idle' (above the fold, or no IntersectionObserver: shown as rendered) →
 * 'hidden' (below the fold, waiting) → 'shown' (scrolled into view, once).
 * Only content below the fold is ever hidden, so the server-rendered first
 * screen never flashes.
 */
function useScrollReveal<T extends Element>(rootMargin = '0px 0px -8% 0px') {
  const ref = useRef<T>(null);
  const [state, setState] = useState<'idle' | 'hidden' | 'shown'>('idle');
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setState('hidden');
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setState('shown');
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return [ref, state] as const;
}

const REVEAL_ANIMATIONS = {
  up: 'animate-fade-up',
  scale: 'animate-scale-up',
  image: 'animate-reveal-image',
  fade: 'animate-fade-in',
} as const;

/**
 * Animates content in when it scrolls into view (once): a fade-up by default,
 * `scale` for cards, `image` for a curtain-style image reveal. Content stays
 * visible without JS and in print; reduced motion shortens it to an instant change.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  variant = 'up',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  variant?: keyof typeof REVEAL_ANIMATIONS;
  as?: 'div' | 'li';
}) {
  const [ref, state] = useScrollReveal<HTMLDivElement & HTMLLIElement>();
  return (
    <Tag
      ref={ref}
      className={cn(
        state === 'hidden' && 'opacity-0',
        state === 'shown' && REVEAL_ANIMATIONS[variant],
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/**
 * A number that counts up from zero when it scrolls into view. The server and
 * the first client render show the final value (correct without JS and for
 * crawlers); screen readers always read the final value.
 */
export function CountUp({
  value,
  durationMs = 1600,
  className,
}: {
  value: number;
  durationMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    setShown(0);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / durationMs);
          // easeOutExpo: fast start, gentle landing.
          const eased = p === 1 ? 1 : 1 - 2 ** (-10 * p);
          setShown(Math.round(eased * value));
          if (p < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      setShown(value);
    };
  }, [value, durationMs]);
  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      <span className="sr-only">{value}</span>
      <span aria-hidden>{shown}</span>
    </span>
  );
}

export function SiteSkeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton-block animate-pulse', className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line bg-mist/60 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brown-700 shadow-tile">
        {icon}
      </div>
      <h3 className="mt-5 text-lg font-bold">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-500">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Accordion({
  items,
  defaultOpen = 0,
}: {
  items: { title: ReactNode; content: ReactNode; meta?: ReactNode }[];
  defaultOpen?: number | null;
}) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i}>
            <button
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-mist/70 sm:px-6"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <span className="flex-1 font-semibold text-brown-900">{item.title}</span>
              {item.meta}
              <ChevronDown
                className={cn(
                  'h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300',
                  isOpen && 'rotate-180 text-brown-700',
                )}
                aria-hidden
              />
            </button>
            <div
              className={cn(
                'grid transition-all duration-300 ease-out',
                isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
              )}
            >
              <div className="overflow-hidden">
                <div className="px-5 pb-5 text-sm leading-relaxed text-charcoal/90 sm:px-6">
                  {item.content}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Overlays ────────────────────────────────────────────────────────────────

let openCount = 0;

function useOverlay(
  open: boolean,
  onClose: () => void,
  panel: React.RefObject<HTMLDivElement | null>,
) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    openCount++;
    document.body.style.overflow = 'hidden';
    const focusables = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]):not([tabindex="-1"]),select,textarea,[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    const t = setTimeout(
      () =>
        (
          panel.current?.querySelector<HTMLElement>('[data-autofocus]') ??
          focusables()[0] ??
          panel.current
        )?.focus(),
      30,
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab') {
        const els = focusables();
        if (!els.length) return;
        const first = els[0]!;
        const last = els[els.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      openCount--;
      if (openCount <= 0) document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [open, panel]);
}

const modalSizes = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  full: 'max-w-6xl',
};

export function SiteModal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  className,
  bare,
  dark,
  closeLabel = 'Close',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  size?: keyof typeof modalSizes;
  className?: string;
  bare?: boolean;
  dark?: boolean;
  closeLabel?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useOverlay(open, onClose, panel);
  if (!open) return null;
  return createPortal(
    <div
      className="site fixed inset-0 z-[80] flex items-end justify-center bg-transparent! p-0 sm:items-center sm:p-6"
      role="presentation"
    >
      <div
        className={cn(
          'absolute inset-0 animate-fade-in backdrop-blur-sm',
          dark ? 'bg-brown-800/85' : 'bg-brown-800/50',
        )}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[94dvh] w-full animate-scale-in flex-col overflow-hidden outline-none',
          !bare && 'rounded-t-3xl bg-white shadow-lift sm:rounded-3xl',
          modalSizes[size],
          className,
        )}
      >
        {!bare && (title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 pt-6 pb-4">
            <div>
              {title && <h2 className="text-xl font-bold">{title}</h2>}
              {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="-mt-1 -mr-2 rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brown-900"
              aria-label={closeLabel}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className={cn('overflow-y-auto', !bare && 'px-6 py-5')}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function SiteDrawer({
  open,
  onClose,
  title,
  children,
  footer,
  closeLabel = 'Close',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useOverlay(open, onClose, panel);
  if (!open) return null;
  return createPortal(
    <div className="site fixed inset-0 z-[80] bg-transparent!" role="presentation">
      <div
        className="absolute inset-0 animate-fade-in bg-brown-800/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-sm animate-fade-in flex-col bg-white shadow-lift outline-none"
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
          <div className="text-lg font-bold text-brown-900">{title}</div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
            aria-label={closeLabel}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ── Form fields ─────────────────────────────────────────────────────────────

const control =
  'block w-full rounded-xl border bg-white px-3.5 text-sm text-ink placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-4 disabled:bg-slate-50 disabled:text-slate-500';
const okBorder = 'border-line focus:border-brown-400 focus:ring-brown-100';
const badBorder = 'border-red-300 focus:border-red-400 focus:ring-red-100';

function Shell({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (id: string, describedBy?: string) => ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-brown-900">
          {label}
          {required && (
            <span className="ml-0.5 text-red-500" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {children(id, describedBy)}
      {error ? (
        <p
          id={`${id}-err`}
          className="flex items-center gap-1.5 text-xs font-medium text-red-600"
          role="alert"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type FieldProps = { label?: string; hint?: string; error?: string; containerClassName?: string };

export function SiteInput({
  label,
  hint,
  error,
  containerClassName,
  className,
  required,
  ...rest
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Shell
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      {(id, describedBy) => (
        <input
          id={id}
          required={required}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          className={cn(control, 'h-11', error ? badBorder : okBorder, className)}
          {...rest}
        />
      )}
    </Shell>
  );
}

export function SiteTextarea({
  label,
  hint,
  error,
  containerClassName,
  className,
  required,
  ...rest
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Shell
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      {(id, describedBy) => (
        <textarea
          id={id}
          required={required}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          className={cn(
            control,
            'min-h-24 py-2.5 leading-relaxed',
            error ? badBorder : okBorder,
            className,
          )}
          {...rest}
        />
      )}
    </Shell>
  );
}

export function SiteSelect({
  label,
  hint,
  error,
  containerClassName,
  className,
  required,
  children,
  ...rest
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Shell
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      {(id, describedBy) => (
        <div className="relative">
          <select
            id={id}
            required={required}
            aria-invalid={!!error || undefined}
            aria-describedby={describedBy}
            className={cn(
              control,
              'h-11 appearance-none pr-9',
              error ? badBorder : okBorder,
              className,
            )}
            {...rest}
          >
            {children}
          </select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
        </div>
      )}
    </Shell>
  );
}

export function SiteCheckbox({
  label,
  error,
  className,
  ...rest
}: { label: ReactNode; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm text-charcoal">
        <input
          id={id}
          type="checkbox"
          aria-invalid={!!error || undefined}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-brown-900"
          {...rest}
        />
        <span className="leading-relaxed">{label}</span>
      </label>
      {error && (
        <p
          className="mt-1.5 ml-7 flex items-center gap-1.5 text-xs font-medium text-red-600"
          role="alert"
        >
          <AlertCircle className="h-3.5 w-3.5" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

/** Visually hidden honeypot for spam protection: bots fill it, people never see it. */
export function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Website
        <input
          tabIndex={-1}
          autoComplete="off"
          name="website"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}
