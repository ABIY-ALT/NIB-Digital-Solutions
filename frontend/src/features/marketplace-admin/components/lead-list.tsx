'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useCurrentUser } from '@/features/auth/components/permissions-provider';
import { useOptionPages, useResolvedOptions } from '@/shared/data/record-options';
import type { FilterDef } from '@/shared/lib/table-filters';
import { Badge, type BadgeTone } from '@/shared/ui/badge';

/**
 * Shared pieces of the two lead lists (demo requests, inquiries): status
 * badge, owner names and the filter bar. Owners are staff accounts served by
 * the backend picker source "lead-assignees.<resource>".
 */

export type LeadKind = 'demo' | 'inquiry';

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'scheduled',
  'completed',
  'qualified',
  'closed_won',
  'closed_lost',
] as const;

export const LEAD_SOURCES = [
  'homepage',
  'product_card',
  'product_page',
  'assistant',
  'catalog',
  'contact_page',
  'navigation',
  'staff',
] as const;

const STATUS_TONE: Record<string, BadgeTone> = {
  new: 'info',
  contacted: 'warning',
  scheduled: 'primary',
  completed: 'secondary',
  qualified: 'success',
  closed_won: 'success',
  closed_lost: 'neutral',
};

export const leadResource = (kind: LeadKind) =>
  kind === 'demo' ? 'demo-requests' : 'product-inquiries';

/** Picker source of the staff who may own leads of this kind. */
export const assigneeSource = (kind: LeadKind) => `lead-assignees.${leadResource(kind)}`;

export function LeadStatusBadge({ status }: { status: string }) {
  const t = useTranslations('marketplaceAdmin');
  const known = (LEAD_STATUSES as readonly string[]).includes(status);
  return (
    <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot>
      {known ? t(`status.${status}`) : status}
    </Badge>
  );
}

/** Owner names for the leads on screen (one request per page of leads). */
export function useLeadOwners(kind: LeadKind, owners: readonly (string | null | undefined)[]) {
  const values = useMemo(() => [...new Set(owners.filter((o): o is string => !!o))], [owners]);
  const { byValue } = useResolvedOptions(assigneeSource(kind), values);
  return (owner: string | null | undefined) =>
    owner ? (byValue.get(owner)?.label ?? owner) : null;
}

/**
 * Filters of a lead list: status, owner ("me" first, then the team),
 * product, source and date received.
 */
export function useLeadFilterDefs(
  kind: LeadKind,
  productNames: Record<string, string>,
): FilterDef[] {
  const t = useTranslations('marketplaceAdmin.leads');
  const ts = useTranslations('marketplaceAdmin');
  const me = useCurrentUser();
  const team = useOptionPages(assigneeSource(kind), { pageSize: 100 });
  const others = team.options.filter((o) => o.value !== me?.id);

  return [
    {
      id: 'status',
      label: t('status'),
      type: 'multiselect',
      options: LEAD_STATUSES.map((s) => ({ value: s, label: ts(`status.${s}`) })),
    },
    {
      id: 'assignedTo',
      label: t('owner'),
      type: 'select',
      options: [
        ...(me ? [{ value: me.id, label: t('assignedToMe') }] : []),
        ...others.map((o) => ({ value: o.value, label: o.label })),
      ],
    },
    {
      id: 'productSlug',
      label: t('product'),
      type: 'multiselect',
      options: Object.entries(productNames)
        .sort(([, a], [, b]) => a.localeCompare(b))
        .map(([value, label]) => ({ value, label })),
    },
    {
      id: 'source',
      label: t('source'),
      type: 'multiselect',
      options: LEAD_SOURCES.map((s) => ({ value: s, label: t(`sources.${s}`) })),
    },
    { id: 'createdAt', label: t('receivedOn'), type: 'dateRange' },
  ];
}
