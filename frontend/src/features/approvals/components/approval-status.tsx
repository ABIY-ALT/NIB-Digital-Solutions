'use client';

import { CircleAlert, CircleCheck, CircleSlash, CircleX, Clock3, Hourglass } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Badge, type BadgeTone } from '@/shared/ui/badge';
import type { ApprovalStatus } from '../types';

export const STATUS_TONE: Record<ApprovalStatus, BadgeTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
  FAILED: 'danger',
};

const STATUS_ICON = {
  PENDING: Clock3,
  APPROVED: CircleCheck,
  REJECTED: CircleX,
  CANCELLED: CircleSlash,
  EXPIRED: Hourglass,
  FAILED: CircleAlert,
} as const;

export function ApprovalStatusBadge({ status }: Readonly<{ status: ApprovalStatus }>) {
  const t = useTranslations('approvals.status');
  const Icon = STATUS_ICON[status];
  return (
    <Badge tone={STATUS_TONE[status]}>
      <Icon className="size-3.5" aria-hidden />
      {t(status)}
    </Badge>
  );
}

/** "Pending approval" chip for list rows whose record has a change waiting for a checker. */
export function PendingApprovalBadge({ approvalId }: Readonly<{ approvalId: string }>) {
  const t = useTranslations('approval');
  return (
    <Link
      href={`/approvals?id=${approvalId}`}
      title={t('pendingHint')}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 rounded-pill bg-warning-soft px-1.5 py-0 text-[10px] font-bold text-warning outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Clock3 className="size-3" aria-hidden />
      {t('pending')}
    </Link>
  );
}
