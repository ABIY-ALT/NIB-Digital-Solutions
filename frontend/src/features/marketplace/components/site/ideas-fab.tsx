'use client';

import { Lightbulb } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * Floating "What should we build next?" button (bottom-left, opposite the
 * assistant). Fades in after the visitor scrolls past the hero; hidden on the
 * idea board itself.
 */
export function IdeasFab() {
  const t = useTranslations('marketplace.nav');
  const pathname = usePathname();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 480);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (pathname.startsWith('/ideas') || pathname.startsWith('/questions')) return null;
  return (
    <Link
      href="/ideas#suggest"
      aria-label={t('ideas')}
      title={t('ideas')}
      className={cn(
        'group fixed bottom-5 left-5 z-[55] flex items-center gap-2.5 rounded-full border border-gold-300/70 bg-white/95 py-2 pr-2 pl-2 text-brown-900 shadow-lift backdrop-blur transition-all duration-300 hover:border-gold-400 hover:bg-gold-50 lg:pr-5',
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
      )}
    >
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gold-500 text-brown-950 transition group-hover:-rotate-12">
        <Lightbulb className="h-4.5 w-4.5" aria-hidden />
        <span
          className="absolute inset-0 rounded-full ring-2 ring-gold-400/60 motion-safe:animate-ping [animation-duration:2.8s]"
          aria-hidden
        />
      </span>
      <span className="hidden text-sm font-semibold lg:inline">{t('ideas')}</span>
    </Link>
  );
}
