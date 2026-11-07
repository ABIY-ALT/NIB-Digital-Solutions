'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

const GRADIENTS = {
  brand: 'bg-[linear-gradient(120deg,var(--brand-secondary)_0%,#a3622a_55%,#d9921a_100%)]',
  secondary: 'bg-gradient-to-br from-secondary to-chart-5',
  info: 'bg-gradient-to-br from-chart-4 to-chart-3',
  success: 'bg-gradient-to-br from-chart-3 to-success',
} as const;

/**
 * Highlight card ("Congratulations, Mekdes 🎉", "Welcome back"): a headline,
 * one prominent figure with a caption, an action and a decorative visual.
 * Text sits on a brand gradient, so it is always white.
 */
export function HeroCard({
  eyebrow,
  title,
  description,
  value,
  caption,
  action,
  visual,
  tone = 'brand',
  className,
}: Readonly<{
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** The headline figure. */
  value?: ReactNode;
  caption?: ReactNode;
  /** Call to action (a Link or Button styled for a dark background). */
  action?: ReactNode;
  /** Decorative icon or illustration on the end side (hidden from assistive tech). */
  visual?: ReactNode;
  tone?: keyof typeof GRADIENTS;
  className?: string;
}>) {
  return (
    <section
      className={cn(
        'relative flex min-h-[188px] flex-col justify-between overflow-hidden rounded-surface p-5 text-white shadow-raised',
        GRADIENTS[tone],
        className,
      )}
    >
      <div
        className="pointer-events-none absolute -end-10 -top-14 size-48 rounded-full bg-white/10"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-16 end-24 size-32 rounded-full bg-white/10"
        aria-hidden
      />
      {visual ? (
        <div
          className="pointer-events-none absolute end-5 bottom-4 text-white/25 [&_svg]:size-24"
          aria-hidden
        >
          {visual}
        </div>
      ) : null}
      <div className="relative max-w-[75%]">
        {eyebrow ? <p className="text-xs font-semibold text-white/80">{eyebrow}</p> : null}
        <h2 className="mt-0.5 text-lg leading-snug font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-xs text-white/85">{description}</p> : null}
      </div>
      <div className="relative mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          {value ? (
            <p className="text-2xl leading-tight font-semibold tracking-tight tabular">{value}</p>
          ) : null}
          {caption ? <p className="mt-0.5 text-xs text-white/85">{caption}</p> : null}
        </div>
        {action}
      </div>
    </section>
  );
}

/** Class for a call-to-action link or button placed on a HeroCard. */
export const heroActionClass =
  'relative inline-flex w-fit items-center gap-1.5 rounded-control bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#323130] outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-white [&_svg]:size-3.5';
