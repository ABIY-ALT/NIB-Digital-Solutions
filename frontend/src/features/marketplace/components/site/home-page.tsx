'use client';

import { BadgeCheck, Bot, CalendarCheck, MessagesSquare, Sparkles, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AssistantChat } from './assistant';
import { HeroShowcase } from './hero-showcase';
import {
  AboutOffice,
  ContactCollaboration,
  HowItWorks,
  IdeasTeaser,
  Impact,
  LatestNews,
  ProductCategories,
  ProductsShowcase,
  WhyChoose,
} from './home-sections';
import { UpcomingProducts } from './coming-soon';
import { FeaturedSolutions } from './featured-solutions';
import { useMarketplace } from './marketplace-provider';
import { Reveal, SiteButton } from './primitives';
import { Testimonials } from './testimonials';
import type { PublicHeroCarousel } from '../../types';

function AssistantSection() {
  const t = useTranslations('marketplace');
  const { openAssistant } = useMarketplace();
  const points = [
    [Zap, t('home.assistant.pointA')],
    [MessagesSquare, t('home.assistant.pointB')],
    [BadgeCheck, t('home.assistant.pointC')],
  ] as const;
  return (
    <section className="py-14 sm:py-32">
      <div className="container-x grid items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <p className="eyebrow">
            <Sparkles className="h-3.5 w-3.5" /> {t('home.assistant.eyebrow')}
          </p>
          <h2 className="section-title mt-4 text-balance">{t('home.assistant.title')}</h2>
          <p className="section-lead">{t('home.assistant.lead')}</p>
          <ul className="mt-8 space-y-3">
            {points.map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-3 text-charcoal">
                <Icon className="h-5 w-5 text-gold-600" /> {text}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-2">
            {(['schools', 'building', 'lending'] as const).map((k) => (
              <button
                key={k}
                onClick={() => openAssistant(t(`assistant.suggestions.${k}`))}
                className="rounded-full border border-line bg-white px-3.5 py-2 text-sm font-medium text-brown-800 transition hover:-translate-y-px hover:border-gold-400 hover:bg-gold-50"
              >
                {t(`assistant.suggestions.${k}`)}
              </button>
            ))}
          </div>
        </Reveal>
        <Reveal delay={120} variant="scale">
          <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-lift">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brown-600 text-gold-300">
                <Bot className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display text-sm font-bold text-brown-900">
                  {t('assistant.name')}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{' '}
                  {t('home.assistant.online')}
                </p>
              </div>
            </div>
            <AssistantChat variant="embedded" className="h-[460px]" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function ClosingCta() {
  const t = useTranslations('marketplace.home.cta');
  const { openDemoRequest, openInquiry } = useMarketplace();
  return (
    <section className="py-12 sm:py-24">
      <div className="container-x">
        <Reveal
          variant="scale"
          className="brand-band relative overflow-hidden rounded-[2rem] px-6 py-16 text-center shadow-card-hover sm:px-12 sm:py-20"
        >
          <div className="honeycomb-light pointer-events-none absolute inset-0" aria-hidden />
          <div
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-gold-400/30 blur-3xl motion-safe:animate-drift"
            aria-hidden
          />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-extrabold text-white! sm:text-5xl">
              {t('title')}
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-white/70">{t('lead')}</p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <SiteButton
                size="lg"
                onClick={() => openDemoRequest({ source: 'homepage' })}
                iconLeft={<CalendarCheck className="h-5 w-5" />}
              >
                {t('demo')}
              </SiteButton>
              <SiteButton
                size="lg"
                variant="light"
                onClick={() => openInquiry({ source: 'homepage' })}
              >
                {t('contact')}
              </SiteButton>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** The homepage. The hero carousel comes from the administration screen (server-loaded). */
export function HomePage({ hero }: { hero: PublicHeroCarousel }) {
  return (
    <>
      <HeroShowcase carousel={hero} />
      <AboutOffice />
      <ProductsShowcase />
      <ProductCategories />
      <Impact />
      <FeaturedSolutions />
      <WhyChoose />
      <HowItWorks />
      <Testimonials />
      <UpcomingProducts />
      <IdeasTeaser />
      <LatestNews />
      <AssistantSection />
      <ContactCollaboration />
    </>
  );
}
