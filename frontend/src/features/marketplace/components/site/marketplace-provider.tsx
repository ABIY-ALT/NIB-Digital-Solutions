'use client';

import { ArrowUpRight, CalendarCheck, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { track } from '../../client';
import { taxonomyIndex } from '../../taxonomy';
import type {
  DemoType,
  InquiryType,
  LeadSource,
  MarketplaceCategory,
  MarketplaceProduct,
  Taxonomy,
  TaxonomyEntry,
} from '../../types';
import { DemoPlayer } from './demo-player';
import { DemoRequestForm, InquiryForm } from './forms';
import { SiteButton, SiteModal } from './primitives';

interface DemoOpts {
  productSlug?: string;
  source: LeadSource;
  demoType?: DemoType;
}
interface InquiryOpts {
  productSlug?: string;
  inquiryType?: InquiryType;
  source: LeadSource;
  message?: string;
}

interface MarketplaceApi {
  products: MarketplaceProduct[];
  categories: MarketplaceCategory[];
  categoryName: (code: string) => string | undefined;
  /** Industries and business needs (managed reference data, in the reader's language). */
  taxonomy: Taxonomy;
  industry: (id: string) => TaxonomyEntry | undefined;
  need: (id: string) => TaxonomyEntry | undefined;
  openDemoRequest: (o: DemoOpts) => void;
  openInquiry: (o: InquiryOpts) => void;
  openVideo: (p: MarketplaceProduct) => void;
  openAssistant: (question?: string) => void;
  assistant: {
    open: boolean;
    pending: string | null;
    setOpen: (v: boolean) => void;
    consumePending: () => string | null;
  };
}

const Ctx = createContext<MarketplaceApi | null>(null);

/**
 * Catalog (loaded on the server, once per request) plus the site-wide overlays:
 * demo request, inquiry, video player and assistant.
 */
export function MarketplaceProvider({
  products,
  categories,
  industries,
  needs,
  children,
}: {
  products: MarketplaceProduct[];
  categories: MarketplaceCategory[];
  industries: TaxonomyEntry[];
  needs: TaxonomyEntry[];
  children: ReactNode;
}) {
  const t = useTranslations('marketplace');
  const router = useRouter();
  const [demo, setDemo] = useState<(DemoOpts & { key: number }) | null>(null);
  const [inquiry, setInquiry] = useState<(InquiryOpts & { key: number }) | null>(null);
  const [video, setVideo] = useState<MarketplaceProduct | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const openDemoRequest = useCallback((o: DemoOpts) => {
    setVideo(null);
    setDemo({ ...o, key: Date.now() });
  }, []);
  const openInquiry = useCallback((o: InquiryOpts) => setInquiry({ ...o, key: Date.now() }), []);
  const openVideo = useCallback((p: MarketplaceProduct) => {
    setVideo(p);
    track('demo_play', p.slug);
  }, []);
  const openAssistant = useCallback((q?: string) => {
    setPending(q ?? null);
    setAssistantOpen(true);
  }, []);

  const value = useMemo<MarketplaceApi>(() => {
    const names = new Map(categories.map((c) => [c.code, c.name]));
    const taxonomy = { industries, needs };
    const index = taxonomyIndex(taxonomy);
    return {
      products,
      categories,
      categoryName: (code) => names.get(code),
      taxonomy,
      industry: index.industry,
      need: index.need,
      openDemoRequest,
      openInquiry,
      openVideo,
      openAssistant,
      assistant: {
        open: assistantOpen,
        pending,
        setOpen: setAssistantOpen,
        consumePending: () => {
          const q = pending;
          setPending(null);
          return q;
        },
      },
    };
  }, [
    products,
    categories,
    industries,
    needs,
    openDemoRequest,
    openInquiry,
    openVideo,
    openAssistant,
    assistantOpen,
    pending,
  ]);

  return (
    <Ctx.Provider value={value}>
      {children}

      <SiteModal
        open={!!demo}
        onClose={() => setDemo(null)}
        size="lg"
        title={t('forms.demo.title')}
        description={t('forms.demo.description')}
        closeLabel={t('common.close')}
      >
        {demo && (
          <DemoRequestForm
            key={demo.key}
            productSlug={demo.productSlug}
            source={demo.source}
            demoType={demo.demoType}
            onDone={() => setDemo(null)}
          />
        )}
      </SiteModal>

      <SiteModal
        open={!!inquiry}
        onClose={() => setInquiry(null)}
        size="lg"
        closeLabel={t('common.close')}
        title={
          inquiry?.inquiryType && inquiry.inquiryType !== 'product_information'
            ? t('forms.inquiry.titleTyped', { type: t(`inquiryType.${inquiry.inquiryType}`) })
            : t('forms.inquiry.title')
        }
        description={t('forms.inquiry.description')}
      >
        {inquiry && (
          <InquiryForm
            key={inquiry.key}
            productSlug={inquiry.productSlug}
            inquiryType={inquiry.inquiryType}
            source={inquiry.source}
            message={inquiry.message}
            onDone={() => setInquiry(null)}
          />
        )}
      </SiteModal>

      <SiteModal
        open={!!video}
        onClose={() => setVideo(null)}
        size="xl"
        bare
        dark
        className="rounded-2xl bg-brown-800 shadow-2xl ring-1 ring-white/10"
      >
        {video && (
          <div>
            <div className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="min-w-0">
                <p className="truncate font-display font-bold text-white">{video.name}</p>
                <p className="text-xs text-white/60">
                  {t('video.demo', { duration: video.content.demo?.duration ?? '—' })}
                </p>
              </div>
              <button
                onClick={() => setVideo(null)}
                className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
                aria-label={t('video.close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <DemoPlayer
              product={video}
              onRequestDemo={() =>
                openDemoRequest({ productSlug: video.slug, source: 'product_card' })
              }
            />
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-white/70">{t('video.ownWorkflows')}</p>
              <div className="flex gap-2">
                <SiteButton
                  variant="light"
                  size="sm"
                  onClick={() => {
                    setVideo(null);
                    router.push(`/products/${video.slug}`);
                  }}
                  iconRight={<ArrowUpRight className="h-4 w-4" />}
                >
                  {t('video.details')}
                </SiteButton>
                <SiteButton
                  size="sm"
                  onClick={() =>
                    openDemoRequest({ productSlug: video.slug, source: 'product_card' })
                  }
                  iconLeft={<CalendarCheck className="h-4 w-4" />}
                >
                  {t('video.live')}
                </SiteButton>
              </div>
            </div>
          </div>
        )}
      </SiteModal>
    </Ctx.Provider>
  );
}

export function useMarketplace(): MarketplaceApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMarketplace must be used inside <MarketplaceProvider>');
  return ctx;
}
