'use client';

import { useTranslations } from 'next-intl';
import { describeError } from '@/shared/errors/error-messages';
import { Badge } from '@/shared/ui/badge';
import { DetailPanel, SubTable, type SubTableColumn } from '@/shared/ui/data-table-detail';
import { ErrorState } from '@/shared/ui/feedback';
import { usePermissionCatalogue } from '../hooks/use-roles';
import type { PermissionDefinition, Role } from '../types';

function permissionColumns(t: (key: string) => string): SubTableColumn<PermissionDefinition>[] {
  return [
    {
      id: 'code',
      header: t('expand.permission'),
      width: '18rem',
      cell: (p) => <code className="font-mono text-[13px]">{p.code}</code>,
    },
    {
      id: 'description',
      header: t('expand.grants'),
      cell: (p) => <span className="text-muted-foreground">{p.description ?? '—'}</span>,
    },
    {
      id: 'scope',
      header: t('expand.scope'),
      align: 'end',
      cell: (p) => {
        const scope = p.code.split(':')[2];
        return <Badge tone={scope ? 'info' : 'neutral'}>{scope ?? t('expand.any')}</Badge>;
      },
    },
  ];
}

/**
 * Detail of a role row: the permissions it grants, with what each one allows.
 * Mounted only while the row is expanded, so the catalogue is fetched on first
 * use and shared (cached) by every expanded row.
 */
export function RolePermissionsDetail({ role }: Readonly<{ role: Role }>) {
  const t = useTranslations('roles');
  const te = useTranslations('errors');
  const catalogue = usePermissionCatalogue();
  const all = role.permissions.includes('*');
  const descriptions = new Map((catalogue.data ?? []).map((p) => [p.code, p.description]));
  const rows: PermissionDefinition[] = (
    all ? (catalogue.data ?? []).map((p) => p.code) : role.permissions
  )
    .toSorted((a, b) => a.localeCompare(b))
    .map((code) => ({ code, description: descriptions.get(code) ?? null }));

  return (
    <DetailPanel
      title={t('expand.title', { count: rows.length })}
      description={all ? t('expand.all') : undefined}
    >
      <SubTable<PermissionDefinition>
        caption={t('expand.caption', { name: role.name })}
        columns={permissionColumns(t)}
        data={rows}
        getRowId={(p) => p.code}
        loading={catalogue.isPending}
        error={
          catalogue.error ? (
            <ErrorState
              title={te('title')}
              description={describeError(catalogue.error, te).message}
            />
          ) : undefined
        }
        emptyText={t('expand.empty')}
      />
    </DetailPanel>
  );
}
