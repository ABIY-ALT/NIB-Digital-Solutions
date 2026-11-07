'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  Handshake,
  Headset,
  Mail,
  MessageSquarePlus,
  Phone,
  UserRound,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { useCurrentUser, usePermissions } from '@/features/auth/components/permissions-provider';
import {
  demoRequestKeys,
  useSaveDemoRequest,
} from '@/features/demo-requests/hooks/use-demo-requests';
import type { DemoRequest } from '@/features/demo-requests/types';
import {
  productInquiryKeys,
  useSaveProductInquiry,
} from '@/features/product-inquiries/hooks/use-product-inquiries';
import type { ProductInquiry } from '@/features/product-inquiries/types';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { describeError } from '@/shared/errors/error-messages';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { formatDate, formatDateTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Input, Label, Textarea } from '@/shared/ui/input';
import { Drawer, DrawerContent } from '@/shared/ui/overlay';
import { RecordPicker } from '@/shared/ui/record-picker';
import { toast } from '@/shared/ui/toaster';
import { assigneeSource, LEAD_STATUSES } from './lead-list';

const selectClass =
  'h-control w-full rounded-control border border-border-strong bg-surface px-2.5 text-sm';

type Lead = { kind: 'demo'; record: DemoRequest } | { kind: 'inquiry'; record: ProductInquiry };

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-3 text-sm">
      <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium break-words">{children}</dd>
    </div>
  );
}

/**
 * Lead detail (demo request or inquiry): the customer's submission, the
 * workflow (status, owner, follow-up / response) and internal notes.
 * Customer details are read-only; workflow changes go through the
 * maker–checker gate like any other write.
 */
export function LeadDetail({
  lead,
  productNames,
  onOpenChange,
}: {
  lead: Lead | null;
  productNames: Record<string, string>;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('marketplaceAdmin');
  const tm = useTranslations('marketplace');
  const te = useTranslations('errors');
  const locale = useLocale();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const me = useCurrentUser();
  const saveDemo = useSaveDemoRequest();
  const saveInquiry = useSaveProductInquiry();
  const feedback = useSaveFeedback();
  const [status, setStatus] = useState('new');
  const [assignedTo, setAssignedTo] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [notes, setNotes] = useState<DemoRequest['notes']>([]);
  const [busyNote, setBusyNote] = useState(false);

  const r = lead?.record;
  // Reset only when a different lead is opened: the list re-renders with a new
  // object after every refetch, which must not discard notes just added here.
  const openedId = lead ? `${lead.kind}:${lead.record.id}` : null;
  useEffect(() => {
    if (!lead) return;
    setStatus(lead.record.status);
    setAssignedTo(lead.record.assignedTo ?? '');
    setDate(lead.kind === 'demo' ? (lead.record.followUpDate?.slice(0, 10) ?? '') : '');
    setNotes(lead.record.notes);
    setReason('');
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the opened lead
  }, [openedId]);

  if (!lead || !r) return <Drawer open={false} onOpenChange={onOpenChange} />;
  const demo = lead.kind === 'demo';
  const resource = demo ? 'demo-requests' : 'product-inquiries';
  const writable = can(`${resource}:update`);
  const name = lead.kind === 'demo' ? lead.record.fullName : lead.record.customerName;
  const org = lead.kind === 'demo' ? lead.record.organization : lead.record.company;
  const product = r.productSlug
    ? (productNames[r.productSlug] ?? r.productSlug)
    : t('leads.general');
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: demo ? demoRequestKeys.all : productInquiryKeys.all });

  async function saveWorkflow(extra: Record<string, unknown> = {}) {
    if (!r) return;
    const input = {
      version: r.version,
      status,
      assignedTo: assignedTo || null,
      ...(demo ? { followUpDate: date ? `${date}T00:00:00.000Z` : null } : {}),
      ...extra,
    };
    try {
      const result = demo
        ? await saveDemo.mutateAsync({ id: r.id, input, reason })
        : await saveInquiry.mutateAsync({ id: r.id, input, reason });
      feedback(result, t('leads.updated'));
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, te).message);
    }
  }

  async function addNote() {
    if (!r || !note.trim()) return;
    setBusyNote(true);
    try {
      const res = await apiFetch<DemoRequest | ProductInquiry>(`/api/${resource}/${r.id}/notes`, {
        method: 'POST',
        body: { body: note.trim() },
      });
      setNotes(res.data.notes);
      setNote('');
      toast.success(t('leads.noteAdded'));
      void invalidate();
    } catch (err) {
      toast.error(describeError(err, te).message);
    } finally {
      setBusyNote(false);
    }
  }

  return (
    <Drawer open onOpenChange={onOpenChange}>
      <DrawerContent
        title={t('leads.detailTitle', { name, reference: r.reference })}
        icon={demo ? <Handshake /> : <Headset />}
        size="lg"
      >
        <div className="space-y-6">
          <dl className="divide-y divide-border rounded-surface border border-border">
            <Row icon={<UserRound />} label={t('leads.contact')}>
              {name}
              {lead.kind === 'demo' ? `, ${lead.record.jobTitle}` : ''}
              {org ? ` · ${org}` : ''}
            </Row>
            <Row icon={<Mail />} label={t('leads.email')}>
              <a className="hover:underline" href={`mailto:${r.email}`}>
                {r.email}
              </a>
            </Row>
            <Row icon={<Phone />} label={t('leads.phone')}>
              {r.phone || '—'}
            </Row>
            <Row
              icon={<CalendarClock />}
              label={demo ? t('leads.preferred') : t('leads.contactMethod')}
            >
              {lead.kind === 'demo'
                ? `${tm(`demoType.${lead.record.demoType}`)} · ${lead.record.preferredDate ? formatDate(lead.record.preferredDate, locale) : t('leads.anyDate')} ${lead.record.preferredTime ?? ''}`
                : tm(`contactMethod.${lead.record.contactMethod}`)}
            </Row>
            <div className="px-4 py-3 text-sm">
              <dt className="text-muted-foreground">
                {t('leads.product')} · {t('leads.source')}
              </dt>
              <dd className="mt-1 font-medium">
                {product} ·{' '}
                <span className="text-muted-foreground">{(r.source ?? '—').replace('_', ' ')}</span>
              </dd>
            </div>
            {lead.kind === 'inquiry' ? (
              <div className="px-4 py-3 text-sm">
                <dt className="text-muted-foreground">
                  {tm(`inquiryType.${lead.record.inquiryType}`)} · {t('leads.message')}
                </dt>
                <dd className="mt-1 whitespace-pre-wrap">{lead.record.message}</dd>
              </div>
            ) : null}
            {r.requirements ? (
              <div className="px-4 py-3 text-sm">
                <dt className="text-muted-foreground">{t('leads.requirements')}</dt>
                <dd className="mt-1 whitespace-pre-wrap">{r.requirements}</dd>
              </div>
            ) : null}
            <p className="px-4 py-2.5 text-xs text-muted-foreground">
              {t('leads.received', { date: formatDateTime(r.createdAt, locale) })} ·{' '}
              {t('leads.customerFixed')}
            </p>
          </dl>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{t('leads.workflow')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('leads.status')}</Label>
                <select
                  className={selectClass}
                  disabled={!writable}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`status.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="lead-owner">{t('leads.owner')}</Label>
                  {writable && me && assignedTo !== me.id ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-primary-text hover:underline"
                      onClick={() => setAssignedTo(me.id)}
                    >
                      {t('leads.assignToMe')}
                    </button>
                  ) : null}
                </div>
                <RecordPicker
                  id="lead-owner"
                  source={assigneeSource(lead.kind)}
                  value={assignedTo || null}
                  onChange={(value) => setAssignedTo(value ?? '')}
                  disabled={!writable}
                  clearable
                  placeholder={t('leads.unassigned')}
                />
              </div>
              {demo ? (
                <div className="space-y-1.5">
                  <Label>{t('leads.followUp')}</Label>
                  <Input
                    type="date"
                    disabled={!writable}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>{t('leads.responded')}</Label>
                  {lead.kind === 'inquiry' && lead.record.respondedAt ? (
                    <p className="flex h-control items-center text-sm text-success">
                      {t('leads.respondedAt', {
                        date: formatDateTime(lead.record.respondedAt, locale),
                      })}
                    </p>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={!writable}
                      onClick={() =>
                        saveWorkflow({
                          respondedAt: new Date().toISOString(),
                          ...(status === 'new' ? { status: 'contacted' } : {}),
                        })
                      }
                    >
                      {t('leads.markResponded')}
                    </Button>
                  )}
                </div>
              )}
            </div>
            {writable ? (
              <>
                <ApprovalNotice
                  action={`${resource}.update`}
                  reason={reason}
                  onReasonChange={setReason}
                />
                <Button
                  onClick={() => saveWorkflow()}
                  disabled={saveDemo.isPending || saveInquiry.isPending}
                >
                  {t('leads.saveWorkflow')}
                </Button>
              </>
            ) : null}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{t('leads.notes')}</h3>
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('leads.noNotes')}</p>
            ) : null}
            <ol className="space-y-2.5">
              {notes.map((n) => (
                <li key={n.id} className="rounded-control bg-muted p-3 text-sm">
                  <p className="whitespace-pre-wrap">{n.body}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {n.author} · {n.createdAt ? formatDateTime(n.createdAt, locale) : ''}
                  </p>
                </li>
              ))}
            </ol>
            {writable ? (
              <div className="space-y-2">
                <Textarea
                  aria-label={t('leads.addNote')}
                  placeholder={t('leads.notePlaceholder')}
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={addNote}
                  disabled={!note.trim() || busyNote}
                >
                  <MessageSquarePlus /> {t('leads.addNote')}
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
