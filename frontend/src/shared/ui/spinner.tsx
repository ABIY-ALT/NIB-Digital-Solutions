'use client';

import { useTranslations } from 'next-intl';
import { useId, type CSSProperties, type ReactNode } from 'react';
import { useDelayedLoading } from '@/shared/hooks/use-delayed-loading';
import { cn } from '@/shared/lib/cn';
import { useUiSettings, type LoaderTone, type LoaderVariant } from './ui-settings';

/**
 * Loading kit — one visual language for every wait:
 *
 *   <Spinner />                                   product default (app.config `ui.loading`)
 *   <Spinner variant="dots" size="sm" showLabel label="Saving…" />
 *   <Spinner size="xl"><BrandMark … /></Spinner>  content in the centre (ring, comet, pulse)
 *   <LoadingOverlay active={isFetching}><Table … /></LoadingOverlay>
 *   <PageLoader title="Preparing your workspace" mark={<BrandMark … />} />
 *   <ProgressBar value={42} /> · <ProgressBar />  (indeterminate)
 *   const show = useDelayedLoading(isFetching)    no flash on fast work, no flicker
 *
 * Variants: ring (arc that grows while it turns), comet (arc with a fading
 * tail), dots, bars, orbit (NIB IB: counter-rotating arcs with a glow), pulse. Tones: brand (primary → secondary gradient),
 * primary, current (inherits text colour, e.g. inside buttons), muted.
 * Everything follows the theme (light / dark, brand colours) and keeps moving,
 * slower, under reduced motion. Screen readers hear the label once.
 */
export type { LoaderTone, LoaderVariant };

const SIZES = { xs: 12, sm: 16, md: 24, lg: 40, xl: 64 } as const;
export type SpinnerSize = keyof typeof SIZES | number;

/** Base cycle per variant, in seconds (divided by `speed`). */
const DURATION: Record<LoaderVariant, number> = {
  ring: 1.4,
  comet: 0.9,
  dots: 1.2,
  bars: 1,
  orbit: 1,
  pulse: 1.8,
};

export const spinnerPx = (size: SpinnerSize): number =>
  typeof size === 'number' ? size : SIZES[size];

/** Stroke thickness that stays proportionate from 12px to 96px+. */
export const spinnerStroke = (px: number): number =>
  Math.min(6, Math.max(1.5, Math.round((px / 9) * 2) / 2));

const TONE_TEXT: Record<LoaderTone, string> = {
  brand: 'text-primary',
  primary: 'text-primary',
  current: '',
  muted: 'text-subtle-foreground',
};
const BRAND_FILL = 'bg-[linear-gradient(135deg,var(--brand-primary),var(--brand-secondary))]';
const fill = (tone: LoaderTone) => (tone === 'brand' ? BRAND_FILL : 'bg-current');

/** Arc colours: the two ends of the brand gradient, or the current text colour. */
const arcColors = (tone: LoaderTone) =>
  tone === 'brand'
    ? { head: 'var(--brand-primary)', tail: 'var(--brand-secondary)' }
    : { head: 'currentColor', tail: 'currentColor' };

/** Delay before a loader shows: none, the product's, or the given milliseconds. */
function delayMsFor(delay: boolean | number, productDelayMs: number): number {
  if (delay === false) return 0;
  return delay === true ? productDelayMs : delay;
}

export interface SpinnerProps {
  variant?: LoaderVariant;
  size?: SpinnerSize;
  tone?: LoaderTone;
  /** Animation speed multiplier (2 = twice as fast). */
  speed?: number;
  /** Announced to screen readers; shown with `showLabel`. Default "Loading…". */
  label?: ReactNode;
  showLabel?: boolean;
  labelPosition?: 'end' | 'bottom';
  /** Purely visual (e.g. inside a busy button that already says it is busy). */
  decorative?: boolean;
  /** Appear only after a moment: true = product delay, or milliseconds. */
  delay?: boolean | number;
  /** Centred content for ring, comet and pulse (logo, percentage, icon). */
  children?: ReactNode;
  className?: string;
}

export function Spinner({
  variant: variantProp,
  size = 'md',
  tone: toneProp,
  speed = 1,
  label,
  showLabel = false,
  labelPosition = 'end',
  decorative = false,
  delay = false,
  children,
  className,
}: Readonly<SpinnerProps>) {
  const t = useTranslations('common');
  const { loading } = useUiSettings();
  const variant = variantProp ?? loading.variant;
  const tone = toneProp ?? loading.tone;
  const visible = useDelayedLoading(true, {
    delayMs: delayMsFor(delay, loading.delayMs),
    minDurationMs: 0,
  });
  if (!visible) return null;

  const px = spinnerPx(size);
  const text = label ?? t('loading');
  const style = {
    '--loader-duration': `${DURATION[variant] / Math.max(0.1, speed)}s`,
  } as CSSProperties;

  return (
    <span
      data-motion="essential"
      role={decorative ? undefined : 'status'}
      aria-live={decorative ? undefined : 'polite'}
      aria-hidden={decorative || undefined}
      className={cn(
        'inline-flex shrink-0 items-center',
        labelPosition === 'bottom' ? 'flex-col gap-2.5' : 'gap-2',
        className,
      )}
      style={style}
    >
      <Graphic variant={variant} px={px} tone={tone}>
        {children}
      </Graphic>
      {decorative ? null : (
        <span className={showLabel ? 'text-sm text-muted-foreground' : 'sr-only'}>{text}</span>
      )}
    </span>
  );
}

function Graphic({
  variant,
  px,
  tone,
  children,
}: Readonly<{
  variant: LoaderVariant;
  px: number;
  tone: LoaderTone;
  children?: ReactNode;
}>) {
  // React ids contain characters that are not safe inside url(#…).
  const gradientId = `loader-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const stroke = spinnerStroke(px);
  const centre = children ? (
    <span className="absolute inset-0 flex items-center justify-center">{children}</span>
  ) : null;
  const box = { width: px, height: px };

  switch (variant) {
    case 'ring': {
      const width = (stroke * 50) / px; // stroke in viewBox units
      return (
        <span className={cn('relative inline-flex', TONE_TEXT[tone])} style={box}>
          <svg
            viewBox="0 0 50 50"
            style={{
              ...box,
              animation: 'loader-spin calc(var(--loader-duration) * 1.45) linear infinite',
            }}
            aria-hidden
          >
            {tone === 'brand' ? (
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="var(--brand-primary)" />
                  <stop offset="100%" stopColor="var(--brand-secondary)" />
                </linearGradient>
              </defs>
            ) : null}
            <circle
              cx="25"
              cy="25"
              r="20"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.14"
              strokeWidth={width}
            />
            <circle
              cx="25"
              cy="25"
              r="20"
              fill="none"
              stroke={tone === 'brand' ? `url(#${gradientId})` : 'currentColor'}
              strokeWidth={width}
              strokeLinecap="round"
              style={{ animation: 'loader-dash var(--loader-duration) ease-in-out infinite' }}
            />
          </svg>
          {centre}
        </span>
      );
    }
    case 'comet': {
      const { head, tail } = arcColors(tone);
      return (
        <span className={cn('relative inline-flex', TONE_TEXT[tone])} style={box}>
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(from 0deg, transparent 0deg, color-mix(in oklab, ${tail} 35%, transparent) 150deg, ${head} 360deg)`,
              mask: `radial-gradient(farthest-side, transparent calc(100% - ${stroke}px), #000 calc(100% - ${stroke}px + 0.5px))`,
              WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${stroke}px), #000 calc(100% - ${stroke}px + 0.5px))`,
              animation: 'loader-spin var(--loader-duration) linear infinite',
            }}
            aria-hidden
          >
            {/* Rounded head at the bright end of the arc. */}
            <span
              className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full"
              style={{ width: stroke, height: stroke, background: head }}
            />
          </span>
          {centre}
        </span>
      );
    }
    case 'dots': {
      const dot = Math.max(3, Math.round(px * 0.24));
      return (
        <span
          className={cn('inline-flex items-center justify-center', TONE_TEXT[tone])}
          style={{ width: px, height: px, gap: Math.max(2, Math.round(px * 0.1)) }}
          aria-hidden
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn('rounded-full', fill(tone))}
              style={{
                width: dot,
                height: dot,
                animation: `loader-bounce var(--loader-duration) ease-in-out calc(var(--loader-duration) * ${(i - 2) * 0.14}) infinite both`,
              }}
            />
          ))}
        </span>
      );
    }
    case 'bars': {
      const bar = Math.max(2, Math.round(px * 0.13));
      return (
        <span
          className={cn('inline-flex items-center justify-center', TONE_TEXT[tone])}
          style={{ width: px, height: px, gap: Math.max(1.5, Math.round(px * 0.08)) }}
          aria-hidden
        >
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn('rounded-pill', fill(tone))}
              style={{
                width: bar,
                height: Math.round(px * 0.8),
                animation: `loader-bars var(--loader-duration) ease-in-out calc(var(--loader-duration) * ${(i - 3) * 0.12}) infinite`,
              }}
            />
          ))}
        </span>
      );
    }
    case 'orbit': {
      // NIB IB spinner: two counter-rotating arcs over a track, a soft glow and a pulsing centre.
      const { head, tail } = arcColors(tone);
      const outer = Math.max(2, Math.round((px / 18) * 2) / 2);
      const dot = Math.max(3, Math.round(px * 0.1));
      return (
        <span className={cn('relative inline-flex', TONE_TEXT[tone])} style={box} aria-hidden>
          <span
            className="absolute rounded-full"
            style={{
              inset: px < 32 ? -2 : -4,
              background: `radial-gradient(circle, color-mix(in oklab, ${head} 18%, transparent) 0%, transparent 70%)`,
              animation: 'loader-glow calc(var(--loader-duration) * 2.4) ease-in-out infinite',
            }}
          />
          <span
            className="absolute inset-0 rounded-full opacity-50"
            style={{ border: `${outer}px solid var(--border)` }}
          />
          <span
            className="absolute inset-0 rounded-full"
            style={{
              border: `${outer}px solid transparent`,
              borderTopColor: head,
              borderRightColor: tail,
              filter: `drop-shadow(0 0 4px color-mix(in oklab, ${tail} 28%, transparent))`,
              animation:
                'loader-spin var(--loader-duration) cubic-bezier(0.4, 0.15, 0.6, 0.85) infinite',
            }}
          />
          <span
            className="absolute rounded-full"
            style={{
              inset: Math.round(px * 0.11),
              border: `${Math.max(1, outer * 0.6)}px solid transparent`,
              borderBottomColor: `color-mix(in oklab, ${tail} 28%, transparent)`,
              borderLeftColor: `color-mix(in oklab, ${head} 20%, transparent)`,
              animation:
                'loader-spin calc(var(--loader-duration) * 1.6) cubic-bezier(0.5, 0, 0.5, 1) infinite reverse',
            }}
          />
          {centre ?? (
            <span
              className="absolute inset-0 m-auto rounded-full"
              style={{
                width: dot,
                height: dot,
                background: head,
                boxShadow: `0 0 6px color-mix(in oklab, ${head} 30%, transparent)`,
                animation: 'loader-centre calc(var(--loader-duration) * 1.2) ease-in-out infinite',
              }}
            />
          )}
        </span>
      );
    }
    case 'pulse':
      return (
        <span className={cn('relative inline-flex', TONE_TEXT[tone])} style={box} aria-hidden>
          {[0, 1].map((i) => (
            <span
              key={i}
              className={cn('absolute inset-0 rounded-full', fill(tone))}
              style={{
                animation: `loader-pulse var(--loader-duration) cubic-bezier(0.2, 0.6, 0.4, 1) calc(var(--loader-duration) * ${-0.5 * i}) infinite`,
              }}
            />
          ))}
          {centre ?? (
            <span
              className={cn('absolute inset-0 m-auto rounded-full', fill(tone))}
              style={{ width: px * 0.34, height: px * 0.34 }}
            />
          )}
        </span>
      );
  }
}

// ── Composites ──────────────────────────────────────────────────────────────

interface LoaderCopyProps {
  /** Heading under the spinner. */
  title?: ReactNode;
  description?: ReactNode;
  /** Screen-reader name when there is no visible title (spinner-only loaders). */
  label?: ReactNode;
  variant?: LoaderVariant;
  tone?: LoaderTone;
  /** Override the product timing (ms). */
  delayMs?: number;
  minDurationMs?: number;
}

function LoaderCopy({
  title,
  description,
  label,
  variant,
  tone,
  size,
  children,
}: Pick<LoaderCopyProps, 'title' | 'description' | 'label' | 'variant' | 'tone'> & {
  size: SpinnerSize;
  children?: ReactNode;
}) {
  return (
    <>
      <Spinner variant={variant} tone={tone} size={size} label={title ?? label}>
        {children}
      </Spinner>
      {title || description ? (
        <div className="max-w-sm space-y-1 text-center" aria-hidden>
          {title ? (
            <p
              className="text-sm font-semibold text-foreground"
              style={
                variant === 'orbit'
                  ? { animation: 'loader-fade 2s ease-in-out infinite' }
                  : undefined
              }
            >
              {title}
            </p>
          ) : null}
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
      ) : null}
    </>
  );
}

/**
 * Covers a region (or the screen) while work runs. With children it wraps
 * them; without, it fills the nearest positioned parent.
 *
 *   <LoadingOverlay active={save.isPending} title="Saving…"><Form … /></LoadingOverlay>
 *   <LoadingOverlay active={exporting} fullscreen title="Preparing export" />
 */
export function LoadingOverlay({
  active,
  fullscreen = false,
  blur = true,
  card = false,
  mark,
  size = 'lg',
  className,
  children,
  delayMs,
  minDurationMs,
  ...copy
}: LoaderCopyProps & {
  active: boolean;
  fullscreen?: boolean;
  blur?: boolean;
  /** Loader on a raised card over a frosted backdrop (NIB IB sign-in hand-off). */
  card?: boolean;
  /** Shown inside the spinner, e.g. <BrandMark size={28} />. */
  mark?: ReactNode;
  size?: SpinnerSize;
  className?: string;
  children?: ReactNode;
}) {
  const visible = useDelayedLoading(active, { delayMs, minDurationMs });
  const overlay = visible ? (
    <div
      className={cn(
        'z-40 flex flex-col items-center justify-center gap-3 rounded-[inherit] bg-surface/75 p-6 animate-in fade-in-0',
        fullscreen ? 'fixed inset-0 z-[60] bg-background/80' : 'absolute inset-0',
        blur && (card ? 'backdrop-blur-sm' : 'backdrop-blur-[2px]'),
        card && 'bg-background/50',
        className,
      )}
    >
      {card ? (
        <div className="flex flex-col items-center gap-4 rounded-surface border border-border bg-surface px-12 py-10 shadow-[0_25.6px_57.6px_rgba(0,0,0,0.18),0_4.8px_14.4px_rgba(0,0,0,0.12)] animate-in fade-in-0 zoom-in-95">
          <LoaderCopy {...copy} size={size}>
            {mark}
          </LoaderCopy>
        </div>
      ) : (
        <LoaderCopy {...copy} size={size}>
          {mark}
        </LoaderCopy>
      )}
    </div>
  ) : null;

  if (children === undefined) return overlay;
  return (
    <div className="relative" aria-busy={active || undefined}>
      {children}
      {overlay}
    </div>
  );
}

/**
 * Full-page wait (route loading, first data fetch, sign-in hand-off): a large
 * spinner, optionally around the product mark, with a title and description.
 */
export function PageLoader({
  mark,
  size = 'xl',
  fullscreen = false,
  className,
  delayMs,
  minDurationMs,
  ...copy
}: LoaderCopyProps & {
  /** Shown inside the spinner, e.g. <BrandMark size={28} />. */
  mark?: ReactNode;
  size?: SpinnerSize;
  /** Cover the viewport instead of the content area. */
  fullscreen?: boolean;
  className?: string;
}) {
  const visible = useDelayedLoading(true, { delayMs, minDurationMs: minDurationMs ?? 0 });
  if (!visible) return null;
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 animate-in fade-in-0',
        fullscreen ? 'fixed inset-0 z-[60] bg-background' : 'min-h-[50vh] w-full py-16',
        className,
      )}
    >
      <LoaderCopy {...copy} variant={copy.variant ?? (mark ? 'ring' : undefined)} size={size}>
        {mark}
      </LoaderCopy>
    </div>
  );
}

const BAR_HEIGHT = { xs: 'h-0.5', sm: 'h-1', md: 'h-1.5', lg: 'h-2.5' } as const;
const BAR_FILL: Record<LoaderTone, string> = {
  brand: BRAND_FILL,
  primary: 'bg-primary',
  current: 'bg-current',
  muted: 'bg-subtle-foreground',
};

/**
 * Linear progress. With `value` it is determinate (0–max); without, it runs
 * indeterminately (e.g. a top-of-page bar during navigation).
 */
export function ProgressBar({
  value,
  max = 100,
  size = 'sm',
  tone = 'brand',
  label,
  showValue = false,
  className,
}: Readonly<{
  value?: number;
  max?: number;
  size?: keyof typeof BAR_HEIGHT;
  tone?: LoaderTone;
  /** Accessible name, e.g. "Upload progress". */
  label?: string;
  /** Percentage after the bar. */
  showValue?: boolean;
  className?: string;
}>) {
  const t = useTranslations('common');
  const indeterminate = value === undefined;
  const pct = indeterminate ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* The bar is drawn; assistive technology reads this native progress element. */}
      <progress className="sr-only" aria-label={label ?? t('loading')} max={max} value={value} />
      <div
        aria-hidden
        data-motion="essential"
        className={cn(
          'relative flex-1 overflow-hidden rounded-pill',
          BAR_HEIGHT[size],
          tone === 'muted' ? 'bg-muted' : 'bg-primary/15',
          tone === 'current' && 'bg-current/15',
        )}
        style={{ '--loader-duration': '1.6s' } as CSSProperties}
      >
        <div
          className={cn(
            'absolute inset-y-0 start-0 rounded-pill',
            BAR_FILL[tone],
            indeterminate
              ? 'w-full origin-left rtl:origin-right'
              : 'transition-[width] duration-300 ease-out',
          )}
          style={
            indeterminate
              ? { animation: 'loader-indeterminate var(--loader-duration) ease-in-out infinite' }
              : { width: `${pct}%` }
          }
        />
      </div>
      {showValue && !indeterminate ? (
        <span className="w-10 shrink-0 text-end text-xs font-semibold text-muted-foreground tabular">
          {Math.round(pct)}%
        </span>
      ) : null}
    </div>
  );
}
