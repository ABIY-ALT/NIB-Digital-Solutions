'use client';

import { Pause, Play, RotateCcw, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import type { MarketplaceProduct } from '../../types';
import { ProductScreen } from './product-screen';

/** YouTube / Vimeo links → privacy-friendly embeds; anything else plays natively. */
export function resolveVideo(url: string): { kind: 'iframe' | 'file'; src: string } {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be')
      return {
        kind: 'iframe',
        src: `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}?autoplay=1&rel=0&modestbranding=1`,
      };
    if (host.endsWith('youtube.com')) {
      const id = u.searchParams.get('v') ?? u.pathname.split('/').filter(Boolean).pop();
      return {
        kind: 'iframe',
        src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`,
      };
    }
    if (host.endsWith('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return { kind: 'iframe', src: `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1` };
    }
  } catch {
    /* not an absolute URL: uploaded media */
  }
  return { kind: 'file', src: url };
}

export function durationSeconds(d: string | undefined) {
  if (!d) return 120;
  const [m, s] = d.split(':').map(Number);
  return (m || 0) * 60 + (s || 0) || 120;
}

const fmt = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

interface Props {
  product: MarketplaceProduct;
  onRequestDemo?: () => void;
  autoPlay?: boolean;
  className?: string;
}

export function DemoPlayer({ product, onRequestDemo, autoPlay = true, className }: Props) {
  const t = useTranslations('marketplace.video');
  const demo = product.content.demo;
  if (demo?.url) {
    const v = resolveVideo(demo.url);
    return (
      <div className={cn('aspect-video w-full overflow-hidden bg-black', className)}>
        {v.kind === 'iframe' ? (
          <iframe
            src={autoPlay ? v.src : v.src.replace('autoplay=1', 'autoplay=0')}
            title={t('title', { name: product.name })}
            className="h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <video
            src={v.src}
            poster={demo.posterUrl}
            controls
            autoPlay={autoPlay}
            playsInline
            className="h-full w-full"
          >
            {t('unsupported')}
          </video>
        )}
      </div>
    );
  }
  return (
    <Walkthrough
      product={product}
      onRequestDemo={onRequestDemo}
      autoPlay={autoPlay}
      className={className}
    />
  );
}

/** Guided product walkthrough (chaptered screens + captions) until a recorded video is uploaded. */
function Walkthrough({ product, onRequestDemo, autoPlay, className }: Props) {
  const t = useTranslations('marketplace.video');
  const chapters = useMemo(
    () =>
      product.content.demo?.chapters.length
        ? product.content.demo.chapters
        : product.content.screenshots.map((s) => ({
            title: s.title,
            caption: s.caption,
            variant: s.variant,
          })),
    [product],
  );
  const total = durationSeconds(product.content.demo?.duration);
  const per = total / Math.max(chapters.length, 1);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(!!autoPlay);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) {
      last.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      if (last.current != null) {
        const dt = (now - last.current) / 1000;
        setElapsed((e) => {
          const next = e + dt;
          if (next >= total) {
            setPlaying(false);
            return total;
          }
          return next;
        });
      }
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);

  if (!chapters.length) return null;
  const index = Math.min(Math.floor(elapsed / per), chapters.length - 1);
  const chapter = chapters[index]!;
  const chapterProgress = (elapsed - index * per) / per;
  const ended = elapsed >= total;
  const seek = (i: number) => {
    setElapsed(i * per + 0.01);
    setPlaying(true);
  };

  return (
    <div
      className={cn('relative w-full overflow-hidden bg-brown-800 outline-none', className)}
      tabIndex={0}
      aria-label={t('walkthrough', { name: product.name })}
      onKeyDown={(e) => {
        if (e.code === 'Space' && e.target === e.currentTarget) {
          e.preventDefault();
          setPlaying((p) => !p);
        }
      }}
    >
      <div className="relative aspect-video">
        <div className="grid-bg absolute inset-0 opacity-60" aria-hidden />
        {/* 16:10 screen inside a 16:9 stage: width 66% leaves room for the caption band below. */}
        <div className="absolute inset-0 flex items-center justify-center p-[3%] pb-[11%]">
          <div key={index} className="w-full max-w-[66%] animate-fade-in">
            <div
              className="transition-transform ease-linear"
              style={{
                transform: `scale(${1 + chapterProgress * 0.035})`,
                transitionDuration: playing ? '200ms' : '0ms',
              }}
            >
              <ProductScreen
                product={product}
                variant={chapter.variant}
                className="rounded-xl shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)]"
              />
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brown-800 via-brown-800/85 to-transparent px-5 pt-14 pb-4 sm:px-8">
          <div key={`c${index}`} className="animate-fade-up">
            <div className="text-xs font-semibold tracking-wider text-gold-400 uppercase">
              {t('chapter', { index: index + 1, total: chapters.length, title: chapter.title })}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-white/90 sm:text-base">{chapter.caption}</p>
          </div>
        </div>

        {!playing && !ended && elapsed === 0 && (
          <button
            onClick={() => setPlaying(true)}
            className="absolute inset-0 flex items-center justify-center bg-brown-800/30"
            aria-label={t('play')}
          >
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gold-500 text-brown-950 shadow-glow transition hover:scale-105">
              <Play className="ml-1 h-8 w-8" fill="currentColor" />
            </span>
          </button>
        )}

        {ended && (
          <div className="absolute inset-0 flex animate-fade-in flex-col items-center justify-center gap-4 bg-brown-800/85 p-6 text-center backdrop-blur-sm">
            <Sparkles className="h-8 w-8 text-gold-400" />
            <p className="max-w-md font-display text-xl font-bold text-white sm:text-2xl">
              {t('cta', { name: product.name })}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {onRequestDemo && (
                <button
                  onClick={onRequestDemo}
                  className="h-11 rounded-xl bg-gold-500 px-5 text-sm font-semibold text-brown-950 transition hover:bg-gold-400"
                >
                  {t('live')}
                </button>
              )}
              <button
                onClick={() => seek(0)}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 px-5 text-sm font-semibold text-white hover:bg-white/10"
              >
                <RotateCcw className="h-4 w-4" /> {t('replay')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 bg-brown-800 px-4 py-3 sm:px-6">
        <button
          onClick={() => (ended ? seek(0) : setPlaying((p) => !p))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          aria-label={playing ? t('pause') : t('resume')}
        >
          {playing ? (
            <Pause className="h-4 w-4" fill="currentColor" />
          ) : (
            <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
          )}
        </button>
        <div className="flex flex-1 gap-1.5" role="group" aria-label={t('chapters')}>
          {chapters.map((c, i) => (
            <button
              key={i}
              onClick={() => seek(i)}
              className="group relative h-6 flex-1"
              aria-label={t('chapterLabel', { index: i + 1, title: c.title })}
              title={c.title}
            >
              <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/15 transition group-hover:h-1.5">
                <span
                  className="block h-full rounded-full bg-gold-500"
                  style={{ width: `${i < index ? 100 : i === index ? chapterProgress * 100 : 0}%` }}
                />
              </span>
            </button>
          ))}
        </div>
        <span className="shrink-0 text-xs text-white/70 tabular-nums">
          {fmt(elapsed)} / {fmt(total)}
        </span>
      </div>
    </div>
  );
}
