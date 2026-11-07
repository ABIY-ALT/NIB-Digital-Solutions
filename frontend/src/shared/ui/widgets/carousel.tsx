'use client';

import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { keyed } from '@/shared/lib/keys';

export interface CarouselLabels {
  region: string;
  previous: string;
  next: string;
  pause: string;
  play: string;
  slide: (index: number, total: number) => string;
}

/**
 * Accessible carousel (WAI-ARIA APG): auto-advances, pauses on hover/focus and
 * via a button, honours prefers-reduced-motion, arrow keys switch slides.
 */
export function Carousel({
  slides,
  intervalMs = 6000,
  labels,
  className,
}: Readonly<{
  slides: ReactNode[];
  intervalMs?: number;
  labels: CarouselLabels;
  className?: string;
}>) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const count = slides.length;
  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const autoplay = playing && !hovered && !reducedMotion && count > 1;
  useEffect(() => {
    if (!autoplay) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(timer);
  }, [autoplay, count, intervalMs]);

  if (count === 0) return null;
  const btn =
    'flex size-7 items-center justify-center rounded-pill bg-surface/85 text-foreground shadow-card outline-none backdrop-blur hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4';

  return (
    <section // NOSONAR -- APG carousel: pauses on hover/focus and takes arrow keys bubbling up from its controls
      ref={root}
      aria-roledescription="carousel"
      aria-label={labels.region}
      className={cn('relative overflow-hidden rounded-surface', className)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(e) => !root.current?.contains(e.relatedTarget as Node) && setHovered(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(index + 1);
        if (e.key === 'ArrowLeft') go(index - 1);
      }}
    >
      <div
        className={cn(
          'flex h-full',
          !reducedMotion && 'transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
        )}
        style={{ transform: `translateX(${-index * 100}%)` }}
        aria-live={autoplay ? 'off' : 'polite'}
      >
        {/* Slides have no identity besides their position: "slide", "slide~1", … */}
        {keyed(slides, () => 'slide').map(({ key, item: slide }, i) => (
          <fieldset
            key={key}
            aria-roledescription="slide"
            aria-label={labels.slide(i + 1, count)}
            aria-hidden={i !== index}
            inert={i !== index}
            className="h-full w-full min-w-0 shrink-0"
          >
            {slide}
          </fieldset>
        ))}
      </div>
      {count > 1 ? (
        <div className="absolute inset-x-3 bottom-3 flex items-center gap-2">
          <button
            type="button"
            className={btn}
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? labels.pause : labels.play}
          >
            {playing ? <Pause /> : <Play />}
          </button>
          <div className="flex flex-1 justify-center gap-1.5">
            {keyed(slides, () => 'dot').map(({ key }, i) => (
              <button
                key={key}
                type="button"
                onClick={() => go(i)}
                aria-label={labels.slide(i + 1, count)}
                aria-current={i === index}
                className={cn(
                  'h-1.5 rounded-pill transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/55 hover:bg-white/80',
                )}
              />
            ))}
          </div>
          <button
            type="button"
            className={btn}
            onClick={() => go(index - 1)}
            aria-label={labels.previous}
          >
            <ChevronLeft className="rtl:rotate-180" />
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => go(index + 1)}
            aria-label={labels.next}
          >
            <ChevronRight className="rtl:rotate-180" />
          </button>
        </div>
      ) : null}
    </section>
  );
}
