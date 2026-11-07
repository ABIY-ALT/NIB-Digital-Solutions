'use client';

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ExternalLink,
  ImagePlus,
  Lock,
  Plus,
  Save,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import type { DigitalProduct } from '@/features/digital-products/types';
import {
  useDigitalProduct,
  useSaveDigitalProduct,
} from '@/features/digital-products/hooks/use-digital-products';
import { MARKETPLACE_ICON_NAMES } from '@/features/marketplace/icons';
import { ProductScreen } from '@/features/marketplace/components/site/product-screen';
import {
  AVAILABILITIES,
  DEPLOYMENTS,
  PLATFORMS,
  isUpcoming,
} from '@/features/marketplace/taxonomy';
import type { MarketplaceProduct, ScreenVariant } from '@/features/marketplace/types';
import { useAllProductCategories } from '@/features/product-categories/hooks/use-product-categories';
import { useLookup } from '@/features/reference-data/hooks/use-reference-data';
import type { LookupOption } from '@/features/reference-data/types';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { describeError } from '@/shared/errors/error-messages';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { ErrorState, Skeleton } from '@/shared/ui/feedback';
import { Input, Label, Textarea } from '@/shared/ui/input';
import { PageHeader } from '@/shared/ui/page-header';
import { toast } from '@/shared/ui/toaster';

type Draft = Omit<DigitalProduct, 'id' | 'createdAt' | 'updatedAt' | 'version'> & {
  id?: string;
  version?: number;
};
type Content = DigitalProduct['content'];
const VARIANTS: ScreenVariant[] = [
  'dashboard',
  'table',
  'mobile',
  'form',
  'analytics',
  'calendar',
  'ticket',
];
const SUPPORT_STATUSES = ['active', 'limited', 'paused'] as const;

interface DeveloperOption {
  id: string;
  name: string;
  telegramLinked: boolean;
  telegramUsername: string | null;
}

/** Active developers, plus the one already chosen if they have been deactivated since. */
function developerOptions(list: DeveloperOption[] | undefined, current: string | null) {
  const options = list ?? [];
  return current && !options.some((o) => o.id === current)
    ? [
        ...options,
        {
          id: current,
          name: '(inactive developer)',
          telegramLinked: false,
          telegramUsername: null,
        },
      ]
    : options;
}

/** "Hana Tesfaye · @hana_dev" (the username tells staff who the bot will recognise). */
const developerLabel = (o: DeveloperOption) =>
  o.telegramUsername ? `${o.name} · @${o.telegramUsername}` : o.name;

/** The three developer slots, in routing order (main developer first). */
const DEVELOPER_SLOTS = ['developerId', 'backupDeveloperId', 'thirdDeveloperId'] as const;

const PRODUCT_STATUSES = ['draft', 'published', 'archived'] as const;
const MAX_IMAGE = 700_000;

const blank = (): Draft => ({
  slug: '',
  name: '',
  tagline: '',
  summary: '',
  overview: '',
  problem: '',
  categoryCode: '',
  status: 'draft',
  availability: 'available',
  releaseDate: null,
  developerId: null,
  backupDeveloperId: null,
  thirdDeveloperId: null,
  supportStatus: 'active',
  featured: false,
  customizable: true,
  icon: 'Package',
  accent: '#8B4E20',
  industries: [],
  needs: [],
  deployment: ['cloud'],
  platforms: ['web'],
  keyFeatures: ['', '', ''],
  content: {
    benefits: [],
    modules: [],
    screenshots: [{ id: 's1', title: 'Dashboard', caption: '', variant: 'dashboard' }],
    demo: null,
    targetCustomers: [],
    integrations: [],
    integrationNotes: '',
    faqs: [],
    screenLabels: {
      kpis: [
        { label: 'Metric', value: '0' },
        { label: 'Metric', value: '0' },
        { label: 'Metric', value: '0' },
      ],
      rows: ['Record 1', 'Record 2', 'Record 3'],
      mobileTitle: 'Home',
    },
  },
  documentation: [],
});

/** API record → editable draft (three key-feature inputs at least). */
const toDraft = (p: DigitalProduct): Draft => {
  const { createdAt: _c, updatedAt: _u, ...rest } = p;
  return {
    ...rest,
    keyFeatures: [...rest.keyFeatures, '', '', ''].slice(0, Math.max(3, rest.keyFeatures.length)),
  };
};

const slugify = (v: string) =>
  v
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
const selectClass =
  'h-control w-full rounded-control border border-border-strong bg-surface px-2.5 text-sm';

function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

/** Ordered list editor: add, remove, reorder. */
function ListEditor<T>({
  items,
  onChange,
  create,
  render,
  addLabel,
}: {
  items: T[];
  onChange: (v: T[]) => void;
  create: () => T;
  render: (item: T, update: (v: Partial<T>) => void, index: number) => ReactNode;
  addLabel: string;
}) {
  const t = useTranslations('marketplaceAdmin.editor');
  const move = (i: number, d: number) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    if (x !== undefined) next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="rounded-surface border border-border bg-muted/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">#{i + 1}</span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label={t('moveUp')}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
                aria-label={t('moveDown')}
              >
                <ArrowDown />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                aria-label={t('remove')}
              >
                <Trash2 className="text-danger" />
              </Button>
            </div>
          </div>
          {render(item, (v) => onChange(items.map((x, j) => (j === i ? { ...x, ...v } : x))), i)}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, create()])}
      >
        <Plus /> {addLabel}
      </Button>
    </div>
  );
}

/**
 * Chip options of a managed list (industries, business needs). Codes are stored
 * in lower case. Retired entries stay visible only while the product has them.
 */
function taxonomyOptions(
  items: LookupOption[] | undefined,
  selected: string[],
): [string, string][] {
  return (items ?? [])
    .map((o) => ({ id: o.code.toLowerCase(), label: o.label, active: o.active }))
    .filter((o) => o.active || selected.includes(o.id))
    .map((o) => [o.id, o.label]);
}

function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: [T, string][];
  value: T[];
  onChange: (v: T[]) => void;
  error?: string;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([id, name]) => {
          const on = value.includes(id);
          return (
            <button
              type="button"
              key={id}
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== id) : [...value, id])}
              className={cn(
                'rounded-pill border px-3 py-1 text-xs font-medium transition',
                on
                  ? 'border-secondary bg-secondary text-secondary-foreground'
                  : 'border-border-strong bg-surface hover:bg-hover',
              )}
            >
              {name}
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-1.5 text-xs font-medium text-danger">{error}</p> : null}
    </fieldset>
  );
}

const asPreview = (d: Draft): MarketplaceProduct => ({
  ...d,
  askDeveloper: !!d.developerId && d.supportStatus !== 'paused',
  // The editor preview shows the product as new: no customer ratings yet.
  rating: null,
  featuredReview: null,
  id: d.id ?? 'preview',
  name: d.name || 'Untitled product',
  tagline: d.tagline ?? '',
  overview: d.overview ?? '',
  problem: d.problem ?? '',
  icon: d.icon ?? 'Package',
  accent: d.accent && /^#[0-9a-fA-F]{6}$/.test(d.accent) ? d.accent : '#8B4E20',
  keyFeatures: d.keyFeatures.filter(Boolean),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

type TabId = 'basics' | 'content' | 'modules' | 'media' | 'customers' | 'faq' | 'docs';

/**
 * Whether each assigned developer can receive questions on Telegram: connected,
 * waiting for them to tap Start in the bot, or missing a username (e-mail only).
 */
function DeveloperTelegramStatus({
  ids,
  options,
}: {
  ids: string[];
  options: DeveloperOption[] | undefined;
}) {
  const t = useTranslations('marketplaceAdmin.editor');
  if (!ids.length) return null;
  return (
    <ul className="space-y-1.5 rounded-surface border border-border bg-muted/40 p-3 text-sm">
      {ids.map((id) => {
        const o = options?.find((x) => x.id === id);
        const state = !o
          ? 'inactive'
          : o.telegramLinked
            ? 'connected'
            : o.telegramUsername
              ? 'waiting'
              : 'noUsername';
        return (
          <li key={id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span
              className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                state === 'connected'
                  ? 'bg-emerald-500'
                  : state === 'waiting'
                    ? 'bg-amber-500'
                    : 'bg-red-500',
              )}
              aria-hidden
            />
            <span className="font-medium">{o?.name ?? t('telegram.inactiveName')}</span>
            {o?.telegramUsername ? (
              <span className="text-muted-foreground">@{o.telegramUsername}</span>
            ) : null}
            <span className="text-muted-foreground">· {t(`telegram.${state}`)}</span>
          </li>
        );
      })}
      <li className="pt-1">
        <Link
          href="/product-developers"
          className="text-xs font-medium text-brand-primary-text underline"
        >
          {t('telegram.manage')}
        </Link>
      </li>
    </ul>
  );
}

export function ProductEditor({ id }: { id: string | null }) {
  const t = useTranslations('marketplaceAdmin.editor');
  const tm = useTranslations('marketplace');
  const ts = useTranslations('marketplaceAdmin.productStatus');
  // Managed reference data (Administration › Reference data), retired entries included.
  const industryList = useLookup('marketplace-industries', { includeInactive: true });
  const needList = useLookup('marketplace-needs', { includeInactive: true });
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const router = useRouter();
  const { can } = usePermissions();
  const existing = useDigitalProduct(id);
  const categories = useAllProductCategories();
  const save = useSaveDigitalProduct();
  const feedback = useSaveFeedback();
  const [draft, setDraft] = useState<Draft | null>(id ? null : blank());
  const [tab, setTab] = useState<TabId>('basics');
  const [dirty, setDirty] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!!id);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);
  const writable = can(id ? 'digital-products:update' : 'digital-products:create');

  // Load once per record: background refetches never overwrite unsaved edits.
  useEffect(() => {
    if (id && existing.data && (!draft || draft.id !== existing.data.id)) {
      setDraft(toDraft(existing.data));
    }
  }, [id, existing.data, draft]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const preview = useMemo(() => (draft ? asPreview(draft) : null), [draft]);
  // Every hook must run before the early returns below (same hooks, same order, every render).
  const developers = useQuery({
    queryKey: ['product-developers', 'options'],
    queryFn: async ({ signal }) =>
      (await apiFetch<DeveloperOption[]>('/api/product-developers/options', { signal })).data,
    staleTime: 60_000,
  });

  if (id && existing.error) {
    const e = describeError(existing.error, te);
    return (
      <ErrorState
        title={te('title')}
        description={e.message}
        correlationId={e.correlationId}
        referenceLabel={tc('reference')}
      />
    );
  }
  if (!draft) return <Skeleton className="h-96" />;
  const d = draft;
  const set = (patch: Partial<Draft>) => {
    setDraft((cur) => (cur ? { ...cur, ...patch } : cur));
    setDirty(true);
  };
  const setContent = (patch: Partial<Content>) => set({ content: { ...d.content, ...patch } });

  function validate(p: Draft) {
    const e: Record<string, string> = {};
    if (p.name.trim().length < 3) e.name = t('validation.name');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)) e.slug = t('validation.slug');
    if (p.summary.trim().length < 20) e.summary = t('validation.summary');
    if (!p.categoryCode) e.categoryCode = t('validation.category');
    if (p.status === 'published' && !p.industries.length) e.industries = t('validation.industries');
    if (p.status === 'published' && !p.keyFeatures.some(Boolean))
      e.keyFeatures = t('validation.keyFeatures');
    if (p.content.demo && !/^\d{1,2}:\d{2}$/.test(p.content.demo.duration))
      e.duration = t('validation.duration');
    if (
      p.content.demo?.url &&
      !/^https:\/\//.test(p.content.demo.url) &&
      !p.content.demo.url.startsWith('/api/marketplace/media/')
    )
      e.videoUrl = t('validation.videoUrl');
    return e;
  }

  async function onSave() {
    const e = validate(d);
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(t('validation.fix'));
      if (e.name || e.slug || e.summary || e.categoryCode || e.industries || e.keyFeatures)
        setTab('basics');
      else if (e.duration || e.videoUrl) setTab('media');
      return;
    }
    const { id: recordId, version, ...input } = d;
    const body = {
      ...input,
      keyFeatures: d.keyFeatures.map((f) => f.trim()).filter(Boolean),
      content: {
        ...d.content,
        modules: d.content.modules.map((m) => ({
          ...m,
          features: m.features.map((f) => f.trim()).filter(Boolean),
        })),
        integrations: d.content.integrations.map((i) => i.trim()).filter(Boolean),
        screenLabels: {
          ...d.content.screenLabels,
          rows: d.content.screenLabels.rows.map((r) => r.trim()).filter(Boolean),
        },
      },
    };
    try {
      const result = await save.mutateAsync(
        recordId ? { id: recordId, input: { ...body, version }, reason } : { input: body, reason },
      );
      const outcome = feedback(result, recordId ? t('saved') : t('created'));
      setDirty(false);
      setReason('');
      // A 202 (approval ticket) leaves the record unchanged until a checker approves it.
      if (outcome === 'saved') {
        const saved = result as DigitalProduct;
        if (recordId) setDraft(toDraft(saved));
        else router.replace(`/digital-products/${saved.id}`);
      }
    } catch (err) {
      const e2 = describeError(err, te);
      toast.error(e2.message);
    }
  }

  async function upload(file: File | undefined, apply: (url: string) => void, key: string) {
    if (!file) return;
    if (file.size > MAX_IMAGE) {
      toast.error(t('tooLarge'));
      return;
    }
    setUploading(key);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });
      const res = await apiFetch<{ url: string }>('/api/marketplace/admin/media', {
        method: 'POST',
        body: { data },
      });
      apply(res.data.url);
      toast.success(t('uploaded'));
    } catch (err) {
      toast.error(t('uploadFailed'), { description: describeError(err, te).message });
    } finally {
      setUploading(null);
    }
  }

  const tabs: TabId[] = ['basics', 'content', 'modules', 'media', 'customers', 'faq', 'docs'];
  const c = d.content;

  return (
    <>
      <PageHeader
        icon={<ShoppingCart />}
        title={id ? t('editTitle', { name: d.name || '…' }) : t('newTitle')}
        description={dirty ? t('unsaved') : d.slug ? `/products/${d.slug}` : undefined}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/digital-products">
                <ArrowLeft /> {t('back')}
              </Link>
            </Button>
            {id && d.status === 'published' ? (
              <Button variant="outline" asChild>
                <a href={`/products/${d.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink /> {t('viewLive')}
                </a>
              </Button>
            ) : null}
            {writable ? (
              <Button onClick={onSave} disabled={save.isPending}>
                <Save /> {id ? t('save') : t('create')}
              </Button>
            ) : null}
          </>
        }
      />

      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto rounded-control bg-muted p-1">
        {tabs.map((id2) => (
          <button
            key={id2}
            role="tab"
            aria-selected={tab === id2}
            onClick={() => setTab(id2)}
            className={cn(
              'shrink-0 rounded-control px-3 py-1.5 text-sm font-medium',
              tab === id2
                ? 'bg-surface shadow-card'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`tabs.${id2}`)}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <fieldset disabled={!writable} className="min-w-0 space-y-4">
          {tab === 'basics' && (
            <>
              <Section title={t('identity')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('fields.name')} error={errors.name}>
                    <Input
                      value={d.name}
                      maxLength={160}
                      onChange={(e) =>
                        set({
                          name: e.target.value,
                          ...(slugTouched ? {} : { slug: slugify(e.target.value) }),
                        })
                      }
                    />
                  </Field>
                  <Field
                    label={t('fields.slug')}
                    error={errors.slug}
                    hint={t('fields.slugHint', { slug: d.slug || '…' })}
                  >
                    <Input
                      value={d.slug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        set({ slug: slugify(e.target.value) });
                      }}
                    />
                  </Field>
                </div>
                <Field label={t('fields.tagline')}>
                  <Input
                    value={d.tagline ?? ''}
                    maxLength={160}
                    onChange={(e) => set({ tagline: e.target.value })}
                  />
                </Field>
                <Field
                  label={t('fields.summary')}
                  error={errors.summary}
                  hint={`${d.summary.length}/300`}
                >
                  <Textarea
                    value={d.summary}
                    maxLength={300}
                    onChange={(e) => set({ summary: e.target.value })}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label={t('fields.category')} error={errors.categoryCode}>
                    <select
                      className={selectClass}
                      value={d.categoryCode}
                      onChange={(e) => set({ categoryCode: e.target.value })}
                    >
                      <option value="">—</option>
                      {(categories.data ?? []).map((cat) => (
                        <option key={cat.code} value={cat.code}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('fields.icon')}>
                    <select
                      className={selectClass}
                      value={d.icon ?? 'Package'}
                      onChange={(e) => set({ icon: e.target.value })}
                    >
                      {MARKETPLACE_ICON_NAMES.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('fields.accent')}>
                    <div className="flex h-control items-center gap-2 rounded-control border border-border-strong px-2">
                      <input
                        type="color"
                        value={d.accent ?? '#8B4E20'}
                        onChange={(e) => set({ accent: e.target.value })}
                        className="h-6 w-8 cursor-pointer border-0 bg-transparent"
                        aria-label={t('fields.accent')}
                      />
                      <span className="font-mono text-xs text-muted-foreground">{d.accent}</span>
                    </div>
                  </Field>
                </div>
              </Section>
              <Section title={t('publishing')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('fields.status')}>
                    <select
                      className={selectClass}
                      value={d.status}
                      onChange={(e) => set({ status: e.target.value as Draft['status'] })}
                    >
                      {PRODUCT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {ts(s)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('fields.availability')}>
                    <select
                      className={selectClass}
                      value={d.availability}
                      onChange={(e) =>
                        set({ availability: e.target.value as Draft['availability'] })
                      }
                    >
                      {AVAILABILITIES.map((a) => (
                        <option key={a} value={a}>
                          {tm(`availability.${a}`)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {isUpcoming(d) ? (
                    <Field label={t('fields.releaseDate')} hint={t('hints.releaseDate')}>
                      <Input
                        type="date"
                        value={d.releaseDate ?? ''}
                        onChange={(e) => set({ releaseDate: e.target.value || null })}
                      />
                    </Field>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-6 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={d.featured}
                      onChange={(e) => set({ featured: e.target.checked })}
                    />{' '}
                    {t('fields.featured')}
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={d.customizable}
                      onChange={(e) => set({ customizable: e.target.checked })}
                    />{' '}
                    {t('fields.customizable')}
                  </label>
                </div>
              </Section>
              <Section title={t('support')} description={t('supportHint')}>
                <div className="grid gap-4 sm:grid-cols-3">
                  {DEVELOPER_SLOTS.map((slot, i) => {
                    const before = DEVELOPER_SLOTS.slice(0, i).map((k) => d[k]);
                    const others = DEVELOPER_SLOTS.filter((k) => k !== slot).map((k) => d[k]);
                    return (
                      <Field key={slot} label={t(`fields.developerSlot${i + 1}`)}>
                        <select
                          className={selectClass}
                          value={d[slot] ?? ''}
                          // A slot opens once the one before it is filled.
                          disabled={before.some((v) => !v)}
                          onChange={(e) => {
                            const value = e.target.value || null;
                            // Clearing a slot clears the ones after it (no gaps in the order).
                            const later = value
                              ? {}
                              : Object.fromEntries(
                                  DEVELOPER_SLOTS.slice(i + 1).map((k) => [k, null]),
                                );
                            set({ [slot]: value, ...later } as Partial<Draft>);
                          }}
                        >
                          <option value="">{t('developerNone')}</option>
                          {developerOptions(developers.data, d[slot])
                            .filter((o) => o.id === d[slot] || !others.includes(o.id))
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {developerLabel(o)}
                              </option>
                            ))}
                        </select>
                      </Field>
                    );
                  })}
                </div>
                <DeveloperTelegramStatus
                  ids={DEVELOPER_SLOTS.map((k) => d[k]).filter((v): v is string => !!v)}
                  options={developers.data}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label={t('fields.supportStatus')}>
                    <select
                      className={selectClass}
                      value={d.supportStatus}
                      onChange={(e) =>
                        set({ supportStatus: e.target.value as Draft['supportStatus'] })
                      }
                    >
                      {SUPPORT_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {t(`supportStatuses.${st}`)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">
                  {d.developerId && d.supportStatus !== 'paused' ? t('askOn') : t('askOff')}
                </p>
              </Section>
              <Section title={t('discovery')} description={t('discoveryHint')}>
                <Chips
                  label={t('fields.industries')}
                  options={taxonomyOptions(industryList.data, d.industries)}
                  value={d.industries}
                  onChange={(v) => set({ industries: v })}
                  error={errors.industries}
                />
                <Chips
                  label={t('fields.needs')}
                  options={taxonomyOptions(needList.data, d.needs)}
                  value={d.needs}
                  onChange={(v) => set({ needs: v })}
                />
                <Chips
                  label={t('fields.deployment')}
                  options={DEPLOYMENTS.map((x) => [x, tm(`deployment.${x}`)])}
                  value={d.deployment}
                  onChange={(v) => set({ deployment: v })}
                />
                <Chips
                  label={t('fields.platforms')}
                  options={PLATFORMS.map((x) => [x, tm(`platform.${x}`)])}
                  value={d.platforms}
                  onChange={(v) => set({ platforms: v })}
                />
              </Section>
              <Section title={t('keyFeaturesTitle')} description={t('keyFeaturesHint')}>
                {[0, 1, 2].map((i) => (
                  <Input
                    key={i}
                    aria-label={t('fields.keyFeature', { index: i + 1 })}
                    placeholder={t('fields.keyFeature', { index: i + 1 })}
                    maxLength={120}
                    value={d.keyFeatures[i] ?? ''}
                    onChange={(e) =>
                      set({
                        keyFeatures: Object.assign([...d.keyFeatures], { [i]: e.target.value }),
                      })
                    }
                  />
                ))}
                {errors.keyFeatures ? (
                  <p className="text-xs font-medium text-danger">{errors.keyFeatures}</p>
                ) : null}
              </Section>
            </>
          )}

          {tab === 'content' && (
            <>
              <Section title={t('tabs.content')}>
                <Field label={t('fields.overview')}>
                  <Textarea
                    className="min-h-32"
                    maxLength={2000}
                    value={d.overview ?? ''}
                    onChange={(e) => set({ overview: e.target.value })}
                  />
                </Field>
                <Field label={t('fields.problem')}>
                  <Textarea
                    maxLength={2000}
                    value={d.problem ?? ''}
                    onChange={(e) => set({ problem: e.target.value })}
                  />
                </Field>
              </Section>
              <Section title={t('sections.benefits')}>
                <ListEditor
                  items={c.benefits}
                  onChange={(benefits) => setContent({ benefits })}
                  addLabel={t('add.benefit')}
                  create={() => ({ title: '', description: '', icon: 'Zap' })}
                  render={(b, u) => (
                    <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                      <Input
                        aria-label={t('fields.title')}
                        placeholder={t('fields.title')}
                        maxLength={120}
                        value={b.title}
                        onChange={(e) => u({ title: e.target.value })}
                      />
                      <select
                        className={selectClass}
                        aria-label={t('fields.icon')}
                        value={b.icon}
                        onChange={(e) => u({ icon: e.target.value })}
                      >
                        {MARKETPLACE_ICON_NAMES.map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                      <Textarea
                        aria-label={t('fields.description')}
                        placeholder={t('fields.description')}
                        maxLength={400}
                        className="sm:col-span-2"
                        value={b.description}
                        onChange={(e) => u({ description: e.target.value })}
                      />
                    </div>
                  )}
                />
              </Section>
            </>
          )}

          {tab === 'modules' && (
            <Section title={t('sections.modules')}>
              <ListEditor
                items={c.modules}
                onChange={(modules) => setContent({ modules })}
                addLabel={t('add.module')}
                create={() => ({ name: '', description: '', features: [] })}
                render={(m, u) => (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        aria-label={t('fields.moduleName')}
                        placeholder={t('fields.moduleName')}
                        maxLength={120}
                        value={m.name}
                        onChange={(e) => u({ name: e.target.value })}
                      />
                      <Input
                        aria-label={t('fields.description')}
                        placeholder={t('fields.description')}
                        maxLength={400}
                        value={m.description}
                        onChange={(e) => u({ description: e.target.value })}
                      />
                    </div>
                    <Textarea
                      aria-label={t('fields.features')}
                      placeholder={t('fields.features')}
                      value={m.features.join('\n')}
                      onChange={(e) => u({ features: e.target.value.split('\n') })}
                    />
                  </div>
                )}
              />
            </Section>
          )}

          {tab === 'media' && (
            <>
              <Section
                title={t('sections.screenshots')}
                description={t('sections.screenshotsHint')}
              >
                <ListEditor<Content['screenshots'][number]>
                  items={c.screenshots}
                  onChange={(screenshots) => setContent({ screenshots })}
                  addLabel={t('add.screenshot')}
                  create={() => ({
                    id: `s${Date.now().toString(36)}`,
                    title: '',
                    caption: '',
                    variant: 'dashboard' as ScreenVariant,
                  })}
                  render={(s, u, i) => (
                    <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                      <div>
                        {preview ? (
                          <ProductScreen
                            product={preview}
                            variant={s.variant}
                            imageUrl={s.imageUrl}
                            className="rounded-control ring-1 ring-border"
                          />
                        ) : null}
                        <label className="mt-2 flex cursor-pointer items-center justify-center gap-1.5 rounded-control border border-dashed border-border-strong py-1.5 text-xs font-medium hover:bg-hover">
                          <ImagePlus className="size-3.5" />{' '}
                          {uploading === `s${i}` ? t('uploading') : t('upload')}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/avif"
                            className="sr-only"
                            onChange={(e) =>
                              upload(e.target.files?.[0], (url) => u({ imageUrl: url }), `s${i}`)
                            }
                          />
                        </label>
                        {s.imageUrl ? (
                          <button
                            type="button"
                            className="mt-1 w-full text-xs text-danger hover:underline"
                            onClick={() => u({ imageUrl: undefined })}
                          >
                            {t('removeImage')}
                          </button>
                        ) : null}
                      </div>
                      <div className="space-y-3">
                        <Input
                          aria-label={t('fields.title')}
                          placeholder={t('fields.title')}
                          maxLength={120}
                          value={s.title}
                          onChange={(e) => u({ title: e.target.value })}
                        />
                        <Input
                          aria-label={t('fields.caption')}
                          placeholder={t('fields.caption')}
                          maxLength={300}
                          value={s.caption}
                          onChange={(e) => u({ caption: e.target.value })}
                        />
                        <Field label={t('fields.layout')} hint={t('fields.layoutHint')}>
                          <select
                            className={selectClass}
                            value={s.variant}
                            onChange={(e) => u({ variant: e.target.value as ScreenVariant })}
                          >
                            {VARIANTS.map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    </div>
                  )}
                />
              </Section>
              <Section title={t('sections.demo')}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!c.demo}
                    onChange={(e) =>
                      setContent({
                        demo: e.target.checked
                          ? {
                              duration: '2:00',
                              chapters: c.screenshots.map((s) => ({
                                title: s.title,
                                caption: s.caption,
                                variant: s.variant,
                              })),
                            }
                          : null,
                      })
                    }
                  />
                  {t('sections.hasDemo')}
                </label>
                {c.demo ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                      <Field
                        label={t('fields.videoUrl')}
                        hint={t('fields.videoUrlHint')}
                        error={errors.videoUrl}
                      >
                        <Input
                          value={c.demo.url ?? ''}
                          maxLength={500}
                          placeholder="https://www.youtube.com/watch?v=…"
                          onChange={(e) =>
                            setContent({ demo: { ...c.demo!, url: e.target.value || undefined } })
                          }
                        />
                      </Field>
                      <Field label={t('fields.duration')} error={errors.duration}>
                        <Input
                          value={c.demo.duration}
                          maxLength={5}
                          onChange={(e) =>
                            setContent({ demo: { ...c.demo!, duration: e.target.value } })
                          }
                        />
                      </Field>
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-medium">{t('sections.chapters')}</p>
                      <ListEditor
                        items={c.demo.chapters}
                        onChange={(chapters) => setContent({ demo: { ...c.demo!, chapters } })}
                        addLabel={t('add.chapter')}
                        create={() => ({
                          title: '',
                          caption: '',
                          variant: 'dashboard' as ScreenVariant,
                        })}
                        render={(ch, u) => (
                          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                            <Input
                              aria-label={t('fields.chapterTitle')}
                              placeholder={t('fields.chapterTitle')}
                              maxLength={120}
                              value={ch.title}
                              onChange={(e) => u({ title: e.target.value })}
                            />
                            <select
                              className={selectClass}
                              aria-label={t('fields.layout')}
                              value={ch.variant}
                              onChange={(e) => u({ variant: e.target.value as ScreenVariant })}
                            >
                              {VARIANTS.map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                            <Input
                              aria-label={t('fields.chapterCaption')}
                              placeholder={t('fields.chapterCaption')}
                              maxLength={300}
                              className="sm:col-span-2"
                              value={ch.caption}
                              onChange={(e) => u({ caption: e.target.value })}
                            />
                          </div>
                        )}
                      />
                    </div>
                  </>
                ) : null}
              </Section>
              <Section title={t('sections.labels')} description={t('sections.labelsHint')}>
                <div className="grid gap-3 sm:grid-cols-3">
                  {c.screenLabels.kpis.map((k, i) => (
                    <div key={i} className="space-y-2">
                      <Input
                        aria-label={t('fields.kpiLabel', { index: i + 1 })}
                        placeholder={t('fields.kpiLabel', { index: i + 1 })}
                        maxLength={40}
                        value={k.label}
                        onChange={(e) =>
                          setContent({
                            screenLabels: {
                              ...c.screenLabels,
                              kpis: c.screenLabels.kpis.map((x, j) =>
                                j === i ? { ...x, label: e.target.value } : x,
                              ),
                            },
                          })
                        }
                      />
                      <Input
                        aria-label={t('fields.kpiValue', { index: i + 1 })}
                        placeholder={t('fields.kpiValue', { index: i + 1 })}
                        maxLength={40}
                        value={k.value}
                        onChange={(e) =>
                          setContent({
                            screenLabels: {
                              ...c.screenLabels,
                              kpis: c.screenLabels.kpis.map((x, j) =>
                                j === i ? { ...x, value: e.target.value } : x,
                              ),
                            },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
                <Field label={t('fields.rows')}>
                  <Textarea
                    value={c.screenLabels.rows.join('\n')}
                    onChange={(e) =>
                      setContent({
                        screenLabels: {
                          ...c.screenLabels,
                          rows: e.target.value.split('\n').slice(0, 8),
                        },
                      })
                    }
                  />
                </Field>
                <Field label={t('fields.mobileTitle')}>
                  <Input
                    maxLength={40}
                    value={c.screenLabels.mobileTitle}
                    onChange={(e) =>
                      setContent({
                        screenLabels: { ...c.screenLabels, mobileTitle: e.target.value },
                      })
                    }
                  />
                </Field>
              </Section>
            </>
          )}

          {tab === 'customers' && (
            <>
              <Section title={t('sections.customers')}>
                <ListEditor
                  items={c.targetCustomers}
                  onChange={(targetCustomers) => setContent({ targetCustomers })}
                  addLabel={t('add.customer')}
                  create={() => ({ title: '', description: '' })}
                  render={(x, u) => (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        aria-label={t('fields.segment')}
                        placeholder={t('fields.segment')}
                        maxLength={120}
                        value={x.title}
                        onChange={(e) => u({ title: e.target.value })}
                      />
                      <Input
                        aria-label={t('fields.description')}
                        placeholder={t('fields.description')}
                        maxLength={400}
                        value={x.description}
                        onChange={(e) => u({ description: e.target.value })}
                      />
                    </div>
                  )}
                />
              </Section>
              <Section title={t('sections.integration')}>
                <Field label={t('fields.integrations')}>
                  <Textarea
                    value={c.integrations.join('\n')}
                    onChange={(e) => setContent({ integrations: e.target.value.split('\n') })}
                    onBlur={(e) => setContent({ integrations: lines(e.target.value) })}
                  />
                </Field>
                <Field label={t('fields.integrationNotes')}>
                  <Textarea
                    maxLength={1000}
                    value={c.integrationNotes}
                    onChange={(e) => setContent({ integrationNotes: e.target.value })}
                  />
                </Field>
              </Section>
            </>
          )}

          {tab === 'faq' && (
            <Section title={t('sections.faqs')} description={t('sections.faqsHint')}>
              <ListEditor
                items={c.faqs}
                onChange={(faqs) => setContent({ faqs })}
                addLabel={t('add.faq')}
                create={() => ({ question: '', answer: '' })}
                render={(f, u) => (
                  <div className="space-y-3">
                    <Input
                      aria-label={t('fields.question')}
                      placeholder={t('fields.question')}
                      maxLength={300}
                      value={f.question}
                      onChange={(e) => u({ question: e.target.value })}
                    />
                    <Textarea
                      aria-label={t('fields.answer')}
                      placeholder={t('fields.answer')}
                      maxLength={1500}
                      value={f.answer}
                      onChange={(e) => u({ answer: e.target.value })}
                    />
                  </div>
                )}
              />
            </Section>
          )}

          {tab === 'docs' && (
            <Section title={t('sections.docs')} description={t('sections.docsHint')}>
              <p className="flex items-start gap-2 rounded-control bg-info-soft p-3 text-xs text-info">
                <Lock className="mt-0.5 size-3.5 shrink-0" /> {t('sections.docsWarning')}
              </p>
              <ListEditor
                items={d.documentation}
                onChange={(documentation) => set({ documentation })}
                addLabel={t('add.doc')}
                create={() => ({ title: '', body: '' })}
                render={(doc, u) => (
                  <div className="space-y-3">
                    <Input
                      aria-label={t('fields.docTitle')}
                      placeholder={t('fields.docTitle')}
                      maxLength={120}
                      value={doc.title}
                      onChange={(e) => u({ title: e.target.value })}
                    />
                    <Textarea
                      aria-label={t('fields.docBody')}
                      placeholder={t('fields.docBody')}
                      maxLength={4000}
                      className="min-h-28"
                      value={doc.body}
                      onChange={(e) => u({ body: e.target.value })}
                    />
                  </div>
                )}
              />
            </Section>
          )}

          {writable ? (
            <ApprovalNotice
              action={id ? 'digital-products.update' : 'digital-products.create'}
              reason={reason}
              onReasonChange={setReason}
            />
          ) : null}
        </fieldset>

        <aside className="hidden xl:block">
          <div className="sticky top-20 space-y-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t('preview')}
            </p>
            {preview ? (
              <div className="overflow-hidden rounded-surface border border-border bg-surface shadow-card">
                <div className="bg-muted px-4 pt-4">
                  <ProductScreen
                    product={preview}
                    variant={c.screenshots[0]?.variant ?? 'dashboard'}
                    imageUrl={c.screenshots[0]?.imageUrl}
                    className="rounded-t-control"
                  />
                </div>
                <div className="space-y-2 p-4">
                  <p className="font-semibold">{preview.name}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{preview.summary}</p>
                  <ul className="space-y-1 text-xs">
                    {preview.keyFeatures.slice(0, 3).map((f) => (
                      <li key={f}>✓ {f}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}
