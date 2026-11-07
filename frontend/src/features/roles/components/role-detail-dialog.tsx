'use client';

import { Copy, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { DocumentActions } from '@/features/documents/components/document-actions';
import { formatDateTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/feedback';
import { FormSurface } from '@/shared/ui/form-surface';
import { usePermissionCatalogue } from '../hooks/use-roles';
import type { Role } from '../types';
import { PermissionPicker } from './permission-picker';

/** Read-only role view: summary + granted permissions, with the permitted actions in the footer. */
export function RoleDetailDialog({
  role,
  onOpenChange,
  onEdit,
  onClone,
  onDelete,
}: Readonly<{
  role: Role | null;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
  onClone?: () => void;
  onDelete?: () => void;
}>) {
  const t = useTranslations('roles');
  const tc = useTranslations('common');
  const locale = useLocale();
  const catalogue = usePermissionCatalogue();
  const locked = !!role?.isSystem;

  return (
    <FormSurface
      id="roles.detail"
      open={!!role}
      onOpenChange={onOpenChange}
      closeOnOutsideClick
      size="xl"
      icon={<ShieldCheck />}
      title={role?.name ?? ''}
      description={role?.description ?? t('detail.noDescription')}
      headerActions={
        role ? (
          <DocumentActions source="roles" id={role.id} name={role.name} variant="ghost" size="sm" />
        ) : null
      }
      footer={
        <>
          {onDelete ? (
            <Button
              variant="outline"
              className="me-auto text-danger hover:bg-danger-soft max-sm:me-0"
              disabled={locked || !!role?.userCount}
              onClick={onDelete}
            >
              <Trash2 /> {tc('delete')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('close')}
          </Button>
          {onClone ? (
            <Button variant="outline" onClick={onClone}>
              <Copy /> {t('actions.clone')}
            </Button>
          ) : null}
          {onEdit ? (
            <Button onClick={onEdit}>
              <Pencil /> {t('actions.edit')}
            </Button>
          ) : null}
        </>
      }
    >
      {role ? (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-border bg-border sm:grid-cols-4">
            <Meta
              label={t('fields.code')}
              value={<code className="font-mono text-[13px]">{role.code}</code>}
            />
            <Meta
              label={t('columns.type')}
              value={
                role.isSystem ? (
                  <Badge tone="secondary">{t('system')}</Badge>
                ) : (
                  <Badge tone="neutral">{t('custom')}</Badge>
                )
              }
            />
            <Meta
              label={t('columns.users')}
              value={<span className="tabular">{role.userCount}</span>}
            />
            <Meta label={t('detail.updated')} value={formatDateTime(role.updatedAt, locale)} />
          </dl>
          {catalogue.isPending ? (
            <Skeleton className="h-[clamp(360px,55vh,590px)]" />
          ) : (
            <PermissionPicker
              catalogue={catalogue.data ?? []}
              // The super-user flag implies every permission.
              value={
                role.permissions.includes('*')
                  ? (catalogue.data ?? []).map((p) => p.code)
                  : role.permissions
              }
              readOnly
            />
          )}
        </div>
      ) : null}
    </FormSurface>
  );
}

function Meta({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="bg-surface px-3.5 py-2.5">
      <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm">{value}</dd>
    </div>
  );
}
