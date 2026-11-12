'use client';

import {
  ArrowLeft,
  ArrowRight,
  Compass,
  Cpu,
  Handshake,
  HelpCircle,
  Lock,
  ShieldCheck,
  Target,
  Workflow,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { InquiryForm } from './forms';
import { ClosingCta } from './home-page';
import { ContactDetails } from './home-sections';
import { useMarketplace } from './marketplace-provider';
import { EmptyState, Reveal, SiteButton } from './primitives';
import { PageHero } from './site-shell';

export function AboutPage() {
  const t = useTranslations('marketplace.info.about');
  const { products, taxonomy } = useMarketplace();
  const principles = [
    { icon: Workflow, key: 'automation' },
    { icon: Cpu, key: 'connected' },
    { icon: ShieldCheck, key: 'trust' },
    { icon: Handshake, key: 'partnership' },
  ] as const;
  const controls = [
    { icon: Lock, key: 'encryption' },
    { icon: ShieldCheck, key: 'rbac' },
    { icon: Target, key: 'validation' },
    { icon: Compass, key: 'audit' },
  ] as const;
  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />
      <section className="container-x grid gap-12 py-12 sm:py-20 lg:grid-cols-2">
        <Reveal>
          <p className="eyebrow">{t('missionEyebrow')}</p>
          <h2 className="section-title mt-3">{t('missionTitle')}</h2>
          <p className="mt-5 text-lg leading-relaxed text-charcoal/80">{t('missionText')}</p>
        </Reveal>
        <Reveal delay={100} className="grid grid-cols-2 gap-4">
          {[
            [String(products.length), t('stats.products')],
            [String(taxonomy.industries.length), t('stats.industries')],
            ['4', t('stats.channels')],
            ['3', t('stats.deployments')],
          ].map(([v, l]) => (
            <div key={l} className="rounded-2xl bg-mist p-6">
              <p className="font-display text-4xl font-extrabold text-brown-900">{v}</p>
              <p className="mt-2 text-sm text-slate-500">{l}</p>
            </div>
          ))}
        </Reveal>
      </section>
      <section className="bg-mist py-12 sm:py-20">
        <div className="container-x">
          <p className="eyebrow">{t('principlesEyebrow')}</p>
          <h2 className="section-title mt-3">{t('principlesTitle')}</h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {principles.map(({ icon: Icon, key }, i) => (
              <Reveal
                key={key}
                delay={i * 70}
                className="rounded-2xl bg-white p-6 ring-1 ring-line"
              >
                <Icon className="h-7 w-7 text-gold-600" />
                <h3 className="mt-5 font-bold">{t(`principles.${key}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  {t(`principles.${key}.text`)}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section className="container-x grid gap-10 py-12 sm:py-20 lg:grid-cols-[1fr_1.2fr]">
        <Reveal>
          <p className="eyebrow">{t('securityEyebrow')}</p>
          <h2 className="section-title mt-3">{t('securityTitle')}</h2>
          <p className="mt-4 leading-relaxed text-charcoal/80">{t('securityText')}</p>
        </Reveal>
        <Reveal delay={100} className="grid gap-3 sm:grid-cols-2">
          {controls.map(({ icon: Icon, key }) => (
            <div key={key} className="flex items-start gap-3 rounded-2xl border border-line p-5">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brown-700" />
              <p className="text-sm font-medium text-brown-900">{t(`controls.${key}`)}</p>
            </div>
          ))}
        </Reveal>
      </section>
      <ClosingCta />
    </>
  );
}

export function ContactPage() {
  const t = useTranslations('marketplace');
  return (
    <>
      <PageHero
        eyebrow={t('info.contact.eyebrow')}
        title={t('info.contact.title')}
        lead={t('info.contact.lead')}
      />
      <section className="container-x grid gap-10 py-10 sm:py-16 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-4">
          <ContactDetails />
          <div className="rounded-2xl bg-brown-700 p-6 text-white">
            <Handshake className="h-6 w-6 text-gold-400" />
            <h2 className="mt-4 text-lg font-bold text-white!">
              {t('info.contact.partnersTitle')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              {t('info.contact.partnersText')}
            </p>
          </div>
        </div>
        <div className="rounded-3xl border border-line bg-white p-6 shadow-tile sm:p-8">
          <h2 className="text-xl font-bold">{t('forms.inquiry.heading')}</h2>
          <p className="mt-1 mb-6 text-sm text-slate-500">{t('forms.inquiry.required')}</p>
          <InquiryForm source="contact_page" />
        </div>
      </section>
    </>
  );
}

export function ProductNotFound() {
  const t = useTranslations('marketplace');
  return (
    <div className="container-x pt-40 pb-24">
      <EmptyState
        icon={<HelpCircle className="h-6 w-6" />}
        title={t('product.notFound.title')}
        description={t('product.notFound.description')}
        action={
          <SiteButton href="/products" iconLeft={<ArrowLeft className="h-4 w-4" />}>
            {t('common.backToProducts')}
          </SiteButton>
        }
      />
    </div>
  );
}

/** Any address that matches no page: in the website's own look, with a way back in. */
export function SiteNotFound() {
  const t = useTranslations('marketplace.notFound');
  return (
    <div className="container-x pt-40 pb-24">
      <EmptyState
        icon={<Compass className="h-6 w-6" />}
        title={t('title')}
        description={t('text')}
        action={
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <SiteButton href="/" iconLeft={<ArrowLeft className="h-4 w-4" />}>
              {t('home')}
            </SiteButton>
            <SiteButton
              href="/products"
              variant="outline"
              iconRight={<ArrowRight className="h-4 w-4" />}
            >
              {t('products')}
            </SiteButton>
          </div>
        }
      />
    </div>
  );
}

export function CatalogUnavailable() {
  const t = useTranslations('marketplace.common');
  return (
    <div className="container-x pt-40 pb-24">
      <EmptyState
        icon={<HelpCircle className="h-6 w-6" />}
        title={t('unavailableTitle')}
        description={t('unavailableText')}
        action={<SiteButton onClick={() => window.location.reload()}>{t('tryAgain')}</SiteButton>}
      />
    </div>
  );
}
