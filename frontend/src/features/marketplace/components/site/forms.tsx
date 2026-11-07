'use client';

import {
  CalendarCheck,
  CheckCircle2,
  Copy,
  Lock,
  Mail,
  MessagesSquare,
  MonitorPlay,
  Presentation,
  Send,
  Video,
  Wand2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { cn } from '@/shared/lib/cn';
import { askTheDeveloper, submissionError, submitDemoRequest, submitInquiry } from '../../client';
import { SITE_CONTACT } from '../../site-config';
import { CONTACT_METHODS, DEMO_TYPES, INQUIRY_TYPES } from '../../taxonomy';
import type { ContactMethod, DemoType, InquiryType, LeadSource } from '../../types';
import { useMarketplace } from './marketplace-provider';
import {
  Honeypot,
  SiteButton,
  SiteCheckbox,
  SiteInput,
  SiteSelect,
  SiteTextarea,
} from './primitives';

type Errors = Partial<Record<string, string>>;
const collect = (error: z.ZodError): Errors => {
  const out: Errors = {};
  for (const i of error.issues) out[String(i.path[0] ?? 'form')] ??= i.message;
  return out;
};
const phoneDigits = (v: string) => v.replace(/[^\d+]/g, '');

function Submitted({
  reference,
  title,
  steps,
  onDone,
}: {
  reference: string;
  title: string;
  steps: string[];
  onDone?: () => void;
}) {
  const t = useTranslations('marketplace.forms.submitted');
  const [copied, setCopied] = useState(false);
  return (
    <div className="animate-scale-in py-4 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60">
        <CheckCircle2 className="h-9 w-9 text-emerald-600" />
      </div>
      <h3 className="mt-6 text-2xl font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">{t('thanks')}</p>
      <div className="mx-auto mt-6 inline-flex items-center gap-3 rounded-2xl border border-line bg-mist px-5 py-3">
        <div className="text-left">
          <div className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
            {t('reference')}
          </div>
          <div className="font-mono text-lg font-bold tracking-wide text-brown-900">
            {reference}
          </div>
        </div>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(reference);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-brown-900"
          aria-label={t('copy')}
        >
          {copied ? (
            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
          ) : (
            <Copy className="h-4.5 w-4.5" />
          )}
        </button>
      </div>
      <ol className="mx-auto mt-8 max-w-md space-y-3 text-left">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-3 text-sm text-charcoal">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brown-700 text-xs font-bold text-white">
              {i + 1}
            </span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      <p className="mt-8 flex flex-wrap items-center justify-center gap-1.5 text-xs text-slate-500">
        <Mail className="h-3.5 w-3.5" /> {t('questions')}{' '}
        <a className="font-medium text-brown-700 underline" href={`mailto:${SITE_CONTACT.email}`}>
          {SITE_CONTACT.email}
        </a>{' '}
        {t('quote')}
      </p>
      {onDone && (
        <SiteButton className="mt-6" variant="secondary" onClick={onDone}>
          {t('done')}
        </SiteButton>
      )}
    </div>
  );
}

const DEMO_ICONS: Record<DemoType, typeof Video> = {
  online: MonitorPlay,
  onsite: Presentation,
  recorded: Video,
  customized: Wand2,
};

export function DemoRequestForm({
  productSlug = '',
  source,
  demoType = 'online',
  onDone,
}: {
  productSlug?: string;
  source: LeadSource;
  demoType?: DemoType;
  onDone?: () => void;
}) {
  const t = useTranslations('marketplace');
  const { products } = useMarketplace();
  const [openedAt] = useState(() => Date.now());
  const [honeypot, setHoneypot] = useState('');
  const [form, setForm] = useState({
    fullName: '',
    organization: '',
    jobTitle: '',
    email: '',
    phone: '',
    productSlug,
    demoType,
    preferredDate: '',
    preferredTime: '',
    requirements: '',
    consent: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const schema = useMemo(
    () =>
      z.object({
        fullName: z.string().trim().min(2, t('forms.validation.name')),
        organization: z.string().trim().min(2, t('forms.validation.organization')),
        jobTitle: z.string().trim().min(2, t('forms.validation.jobTitle')),
        email: z.email(t('forms.validation.email')),
        phone: z
          .string()
          .transform(phoneDigits)
          .pipe(z.string().regex(/^\+?\d{9,15}$/, t('forms.validation.phone'))),
        productSlug: z.string().min(1, t('forms.validation.product')),
        preferredDate: z.string().refine((v) => !v || v >= today, t('forms.validation.date')),
        preferredTime: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, t('forms.validation.time')),
        consent: z.literal(true, { message: t('forms.validation.consent') }),
      }),
    [t, today],
  );

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setErrors(collect(parsed.error));
      setFormError(t('forms.check'));
      return;
    }
    setSubmitting(true);
    try {
      const ref = await submitDemoRequest(
        {
          ...form,
          email: form.email.trim().toLowerCase(),
          preferredDate: form.preferredDate || null,
          preferredTime: form.preferredTime || null,
          requirements: form.requirements || null,
          consent: true,
          source,
        },
        { honeypot, openedAt },
      );
      setReference(ref);
    } catch (err) {
      const failure = submissionError(err, t('forms.failed'));
      setErrors(failure.fields);
      setFormError(failure.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (reference) {
    const product = products.find((p) => p.slug === form.productSlug);
    return (
      <Submitted
        reference={reference}
        title={t('forms.demo.received')}
        steps={[
          t('forms.demo.stepOne', { product: product?.name ?? t('forms.demo.productFallback') }),
          t('forms.demo.stepTwo'),
          t('forms.demo.stepThree'),
        ]}
        onDone={onDone}
      />
    );
  }

  return (
    <form onSubmit={submit} noValidate className="relative space-y-6">
      <Honeypot value={honeypot} onChange={setHoneypot} />
      <fieldset className="space-y-4">
        <legend className="mb-1 text-xs font-semibold tracking-wider text-slate-500 uppercase">
          {t('forms.demo.about')}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <SiteInput
            label={t('forms.demo.fullName')}
            required
            autoComplete="name"
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            error={errors.fullName}
            data-autofocus
            maxLength={120}
          />
          <SiteInput
            label={t('forms.demo.organization')}
            required
            autoComplete="organization"
            value={form.organization}
            onChange={(e) => set('organization', e.target.value)}
            error={errors.organization}
            maxLength={160}
          />
          <SiteInput
            label={t('forms.demo.jobTitle')}
            required
            autoComplete="organization-title"
            value={form.jobTitle}
            onChange={(e) => set('jobTitle', e.target.value)}
            error={errors.jobTitle}
            maxLength={120}
          />
          <SiteInput
            label={t('forms.demo.email')}
            required
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            error={errors.email}
            maxLength={160}
          />
          <SiteInput
            label={t('forms.demo.phone')}
            required
            type="tel"
            autoComplete="tel"
            placeholder="+251 9..."
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            error={errors.phone}
            containerClassName="sm:col-span-2"
            maxLength={40}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-xs font-semibold tracking-wider text-slate-500 uppercase">
          {t('forms.demo.yourDemo')}
        </legend>
        <SiteSelect
          label={t('forms.demo.product')}
          required
          value={form.productSlug}
          onChange={(e) => set('productSlug', e.target.value)}
          error={errors.productSlug}
        >
          <option value="">{t('forms.demo.chooseProduct')}</option>
          {products.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </SiteSelect>
        <div>
          <span className="mb-2 block text-sm font-medium text-brown-900">
            {t('forms.demo.demoType')}
          </span>
          <div
            className="grid gap-2.5 sm:grid-cols-2"
            role="radiogroup"
            aria-label={t('forms.demo.demoType')}
          >
            {DEMO_TYPES.map((type) => {
              const Icon = DEMO_ICONS[type];
              const active = form.demoType === type;
              return (
                <button
                  type="button"
                  key={type}
                  role="radio"
                  aria-checked={active}
                  onClick={() => set('demoType', type)}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3.5 text-left transition',
                    active
                      ? 'border-brown-900 bg-brown-50/60 ring-1 ring-brown-900'
                      : 'border-line hover:border-brown-200 hover:bg-mist',
                  )}
                >
                  <Icon
                    className={cn(
                      'mt-0.5 h-5 w-5 shrink-0',
                      active ? 'text-brown-900' : 'text-slate-400',
                    )}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-brown-900">
                      {t(`demoType.${type}`)}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {t(`demoTypeHint.${type}`)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SiteInput
            label={t('forms.demo.date')}
            type="date"
            min={today}
            value={form.preferredDate}
            onChange={(e) => set('preferredDate', e.target.value)}
            error={errors.preferredDate}
          />
          <SiteInput
            label={t('forms.demo.time')}
            type="time"
            min="08:00"
            max="18:00"
            step={900}
            value={form.preferredTime}
            onChange={(e) => set('preferredTime', e.target.value)}
            error={errors.preferredTime}
            hint={t('forms.demo.timeHint')}
          />
        </div>
        <SiteTextarea
          label={t('forms.demo.requirements')}
          placeholder={t('forms.demo.requirementsPlaceholder')}
          value={form.requirements}
          maxLength={2000}
          onChange={(e) => set('requirements', e.target.value)}
          error={errors.requirements}
          hint={`${form.requirements.length}/2000`}
        />
      </fieldset>

      <SiteCheckbox
        checked={form.consent}
        onChange={(e) => set('consent', e.target.checked)}
        error={errors.consent}
        label={t('forms.demo.consent')}
      />

      {formError && (
        <div
          className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          role="alert"
        >
          {formError}
        </div>
      )}
      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Lock className="h-3.5 w-3.5" /> {t('forms.demo.secure')}
        </p>
        <SiteButton
          type="submit"
          size="lg"
          loading={submitting}
          iconLeft={!submitting && <CalendarCheck className="h-4.5 w-4.5" />}
        >
          {submitting ? t('forms.demo.submitting') : t('forms.demo.submit')}
        </SiteButton>
      </div>
    </form>
  );
}

export function InquiryForm({
  productSlug = '',
  inquiryType = 'product_information',
  source,
  message = '',
  onDone,
}: {
  productSlug?: string;
  inquiryType?: InquiryType;
  source: LeadSource;
  message?: string;
  onDone?: () => void;
}) {
  const t = useTranslations('marketplace');
  const { products } = useMarketplace();
  const [openedAt] = useState(() => Date.now());
  const [honeypot, setHoneypot] = useState('');
  const [form, setForm] = useState({
    customerName: '',
    company: '',
    email: '',
    phone: '',
    productSlug,
    inquiryType,
    message,
    requirements: '',
    contactMethod: 'email' as ContactMethod,
    consent: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        customerName: z.string().trim().min(2, t('forms.validation.name')),
        email: z.email(t('forms.validation.email')),
        phone: z
          .string()
          .transform(phoneDigits)
          .pipe(z.string().regex(/^$|^\+?\d{9,15}$/, t('forms.validation.phoneOptional'))),
        message: z.string().trim().min(10, t('forms.validation.message')),
        consent: z.literal(true, { message: t('forms.validation.consent') }),
      }),
    [t],
  );

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setErrors(collect(parsed.error));
      setFormError(t('forms.check'));
      return;
    }
    setSubmitting(true);
    try {
      const ref = await submitInquiry(
        {
          ...form,
          email: form.email.trim().toLowerCase(),
          company: form.company || null,
          phone: form.phone || null,
          productSlug: form.productSlug || null,
          requirements: form.requirements || null,
          consent: true,
          source,
        },
        { honeypot, openedAt },
      );
      setReference(ref);
    } catch (err) {
      const failure = submissionError(err, t('forms.failed'));
      setErrors(failure.fields);
      setFormError(failure.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (reference) {
    return (
      <Submitted
        reference={reference}
        title={t('forms.inquiry.received')}
        steps={[
          t('forms.inquiry.stepOne', { type: t(`inquiryType.${form.inquiryType}`).toLowerCase() }),
          t('forms.inquiry.stepTwo', {
            method: t(`contactMethod.${form.contactMethod}`).toLowerCase(),
          }),
        ]}
        onDone={onDone}
      />
    );
  }

  return (
    <form onSubmit={submit} noValidate className="relative space-y-5">
      <Honeypot value={honeypot} onChange={setHoneypot} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SiteInput
          label={t('forms.inquiry.name')}
          required
          autoComplete="name"
          value={form.customerName}
          onChange={(e) => set('customerName', e.target.value)}
          error={errors.customerName}
          data-autofocus
          maxLength={120}
        />
        <SiteInput
          label={t('forms.inquiry.company')}
          autoComplete="organization"
          value={form.company}
          onChange={(e) => set('company', e.target.value)}
          error={errors.company}
          maxLength={160}
        />
        <SiteInput
          label={t('forms.inquiry.email')}
          required
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          error={errors.email}
          maxLength={160}
        />
        <SiteInput
          label={t('forms.inquiry.phone')}
          type="tel"
          autoComplete="tel"
          placeholder="+251 9..."
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          error={errors.phone}
          maxLength={40}
        />
        <SiteSelect
          label={t('forms.inquiry.product')}
          value={form.productSlug}
          onChange={(e) => set('productSlug', e.target.value)}
        >
          <option value="">{t('forms.inquiry.general')}</option>
          {products.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </SiteSelect>
        <SiteSelect
          label={t('forms.inquiry.type')}
          required
          value={form.inquiryType}
          onChange={(e) => set('inquiryType', e.target.value as InquiryType)}
        >
          {INQUIRY_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`inquiryType.${type}`)}
            </option>
          ))}
        </SiteSelect>
      </div>
      <SiteTextarea
        label={t('forms.inquiry.message')}
        required
        value={form.message}
        maxLength={2000}
        onChange={(e) => set('message', e.target.value)}
        error={errors.message}
        placeholder={t('forms.inquiry.messagePlaceholder')}
      />
      <SiteTextarea
        label={t('forms.inquiry.requirements')}
        value={form.requirements}
        maxLength={2000}
        onChange={(e) => set('requirements', e.target.value)}
        placeholder={t('forms.inquiry.requirementsPlaceholder')}
        className="min-h-20"
      />
      <div>
        <span className="mb-2 block text-sm font-medium text-brown-900">
          {t('forms.inquiry.contactMethod')}
        </span>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label={t('forms.inquiry.contactMethod')}
        >
          {CONTACT_METHODS.map((m) => (
            <button
              type="button"
              key={m}
              role="radio"
              aria-checked={form.contactMethod === m}
              onClick={() => set('contactMethod', m)}
              className={cn(
                'rounded-full border px-4 py-2 text-sm font-medium transition',
                form.contactMethod === m
                  ? 'border-brown-700 bg-brown-700 text-white'
                  : 'border-line text-charcoal hover:border-brown-200',
              )}
            >
              {t(`contactMethod.${m}`)}
            </button>
          ))}
        </div>
      </div>
      <SiteCheckbox
        checked={form.consent}
        onChange={(e) => set('consent', e.target.checked)}
        error={errors.consent}
        label={t('forms.inquiry.consent')}
      />
      {formError && (
        <div
          className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          role="alert"
        >
          {formError}
        </div>
      )}
      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Lock className="h-3.5 w-3.5" /> {t('forms.inquiry.secure')}
        </p>
        <SiteButton
          type="submit"
          size="lg"
          variant="secondary"
          loading={submitting}
          iconLeft={!submitting && <Send className="h-4 w-4" />}
        >
          {submitting ? t('forms.inquiry.submitting') : t('forms.inquiry.submit')}
        </SiteButton>
      </div>
    </form>
  );
}

/**
 * "Ask the developer": the question goes to the product's assigned developer
 * (Telegram or e-mail); the answer comes back by e-mail with the reference
 * number, and the private conversation link allows follow-up questions.
 */
export function AskDeveloperForm({
  productSlug,
  productName,
  onDone,
}: {
  productSlug: string;
  productName: string;
  onDone?: () => void;
}) {
  const t = useTranslations('marketplace');
  const [openedAt] = useState(() => Date.now());
  const [honeypot, setHoneypot] = useState('');
  const [form, setForm] = useState({ customerName: '', customerEmail: '', question: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<{ reference: string; link: string } | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        customerName: z.string().trim().min(2, t('forms.validation.name')),
        customerEmail: z.email(t('forms.validation.email')),
        question: z.string().trim().min(10, t('forms.ask.validation')),
      }),
    [t],
  );

  const set = <K extends keyof typeof form>(key: K, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setErrors(collect(parsed.error));
      setFormError(t('forms.check'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await askTheDeveloper(
        {
          productSlug,
          customerName: parsed.data.customerName,
          customerEmail: parsed.data.customerEmail.toLowerCase(),
          question: parsed.data.question,
        },
        { honeypot, openedAt },
      );
      // The link is built by the backend from the public URL; keep only the path so it
      // always opens on this site.
      const url = new URL(res.conversationUrl, window.location.origin);
      setSent({ reference: res.reference, link: `${url.pathname}${url.search}` });
    } catch (err) {
      const failure = submissionError(err, t('forms.failed'));
      setErrors(failure.fields);
      setFormError(failure.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div>
        <Submitted
          reference={sent.reference}
          title={t('forms.ask.received')}
          steps={[
            t('forms.ask.stepOne', { product: productName }),
            t('forms.ask.stepTwo'),
            t('forms.ask.stepThree'),
          ]}
          onDone={onDone}
        />
        <p className="mt-4 text-center">
          <a
            href={sent.link}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brown-700 underline hover:text-brown-900"
          >
            <MessagesSquare className="h-4 w-4" /> {t('forms.ask.viewConversation')}
          </a>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="relative space-y-5">
      <Honeypot value={honeypot} onChange={setHoneypot} />
      <div className="rounded-xl border border-line bg-mist px-4 py-3 text-sm text-charcoal">
        <span className="font-semibold text-brown-900">{t('forms.ask.product')}:</span>{' '}
        {productName}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SiteInput
          label={t('forms.ask.name')}
          required
          autoComplete="name"
          value={form.customerName}
          onChange={(e) => set('customerName', e.target.value)}
          error={errors.customerName}
          data-autofocus
          maxLength={120}
        />
        <SiteInput
          label={t('forms.ask.email')}
          required
          type="email"
          autoComplete="email"
          value={form.customerEmail}
          onChange={(e) => set('customerEmail', e.target.value)}
          error={errors.customerEmail}
          maxLength={160}
        />
      </div>
      <SiteTextarea
        label={t('forms.ask.question')}
        required
        value={form.question}
        maxLength={4000}
        onChange={(e) => set('question', e.target.value)}
        error={errors.question}
        placeholder={t('forms.ask.questionPlaceholder')}
        className="min-h-36"
      />
      {formError && (
        <div
          className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          role="alert"
        >
          {formError}
        </div>
      )}
      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex max-w-xs items-start gap-1.5 text-xs text-slate-500">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('forms.ask.privacy')}
        </p>
        <SiteButton
          type="submit"
          size="lg"
          loading={submitting}
          iconLeft={!submitting && <Send className="h-4 w-4" />}
        >
          {submitting ? t('forms.ask.submitting') : t('forms.ask.submit')}
        </SiteButton>
      </div>
    </form>
  );
}
