'use client';

import { useTranslations } from 'next-intl';
import { StatusBadge, type BadgeTone } from '@/shared/ui/badge';
import type { UserStatus } from '../types';

const TONES: Record<UserStatus, BadgeTone> = {
  ACTIVE: 'success',
  LOCKED: 'warning',
  DISABLED: 'danger',
  PENDING_ACTIVATION: 'info',
};

export function UserStatusBadge({ status }: Readonly<{ status: UserStatus }>) {
  const t = useTranslations('users.status');
  return <StatusBadge status={status} map={TONES} label={t(status)} />;
}
