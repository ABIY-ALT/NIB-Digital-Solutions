/**
 * Frontend templates (Next.js BFF, feature-based). The generated feature uses
 * the framework building blocks: defineResource, resourceRoutes / export,
 * createResourceHooks, DataTable, Form kit, maker–checker notice, i18n.
 */

const isText = (f) => f.type === 'string' || f.type === 'text';

export function types(n, fields) {
  const input = fields
    .map((f) => {
      const t = { string: 'string', text: 'string', int: 'number', number: 'number', boolean: 'boolean', date: 'string' }[f.type];
      return `  ${f.name}?: ${t}${f.required ? '' : ' | null'};`;
    })
    .join('\n');
  return `import type { ApiSchemas } from '@/shared/api';

/** ${n.singularTitle} as returned by the API (shared contract, generated from the backend). */
export type ${n.Pascal} = ApiSchemas['${n.Pascal}'];

/** Create / update body (dates as ISO strings). */
export interface ${n.Pascal}Input {
${input}
  version?: number;
}
`;
}

export function resource(n, fields) {
  const firstSortable = fields.find((f) => f.type !== 'text' && f.type !== 'boolean')?.name ?? 'createdAt';
  return `import { defineResource } from '@/shared/data/resource';
import type { ${n.Pascal} } from './types';

/** ${n.title}: one definition for query keys, hooks, BFF routes and server prefetch. */
export const ${n.camelPlural}Resource = defineResource<${n.Pascal}>({
  name: '${n.kebab}',
  apiPath: '/api/${n.kebab}',
  backendPath: '/${n.kebab}',
  listDefaults: { pageSize: 20, sort: [{ field: '${firstSortable}', direction: 'asc' }] },
});
`;
}

export function schemas(n, fields) {
  const formField = (f) => {
    switch (f.type) {
      case 'boolean':
        return `    ${f.name}: z.boolean(),`;
      case 'int':
      case 'number': {
        const re = f.type === 'int' ? String.raw`/^-?\d+$/` : String.raw`/^-?\d+(\.\d+)?$/`;
        return `    ${f.name}: z.string().trim()${f.required ? ".min(1, t('validation.required'))" : ''}.refine((v) => v === '' || ${re}.test(v), t('validation.number')),`;
      }
      case 'date':
        return `    ${f.name}: z.string()${f.required ? ".min(1, t('validation.required'))" : ''},`;
      default:
        return `    ${f.name}: z.string().trim()${f.required ? ".min(1, t('validation.required'))" : ''}.max(${f.type === 'text' ? 2000 : 160}),`;
    }
  };
  const toInput = (f) => {
    switch (f.type) {
      case 'boolean':
        return `    ${f.name}: v.${f.name},`;
      case 'int':
      case 'number':
        return `    ${f.name}: v.${f.name} === '' ? ${f.required ? 'undefined' : 'null'} : Number(v.${f.name}),`;
      case 'date':
        return `    ${f.name}: v.${f.name} ? \`\${v.${f.name}}T00:00:00.000Z\` : ${f.required ? 'undefined' : 'null'},`;
      default:
        return `    ${f.name}: v.${f.name}${f.required ? '' : ' || null'},`;
    }
  };
  const fromEntity = (f) => {
    switch (f.type) {
      case 'boolean':
        return `    ${f.name}: e?.${f.name} ?? false,`;
      case 'int':
      case 'number':
        return `    ${f.name}: e?.${f.name} === null || e?.${f.name} === undefined ? '' : String(e.${f.name}),`;
      case 'date':
        return `    ${f.name}: e?.${f.name} ? e.${f.name}.slice(0, 10) : '',`;
      default:
        return `    ${f.name}: e?.${f.name} ?? '',`;
    }
  };
  return `import { z } from 'zod';
import type { ${n.Pascal}, ${n.Pascal}Input } from './types';

type T = (key: string) => string;
const id: T = (k) => k;

/** Form schema (strings for inputs; converted by \`toInput\`). Translated messages via \`t\`. */
export const ${n.camel}FormSchema = (t: T = id) =>
  z.object({
${fields.map(formField).join('\n')}
  });
export type ${n.Pascal}FormValues = z.infer<ReturnType<typeof ${n.camel}FormSchema>>;

export const ${n.camel}FormDefaults = (e?: ${n.Pascal} | null): ${n.Pascal}FormValues => ({
${fields.map(fromEntity).join('\n')}
});

export const to${n.Pascal}Input = (v: ${n.Pascal}FormValues): ${n.Pascal}Input => ({
${fields.map(toInput).join('\n')}
});
`;
}

export function apiRoutes(n, fields) {
  const body = (f, update) => {
    const base = {
      string: 'z.string().trim().max(160)',
      text: 'z.string().trim().max(2000)',
      int: 'z.number().int()',
      number: 'z.number()',
      boolean: 'z.boolean()',
      date: 'z.string().max(40)',
    }[f.type];
    return `  ${f.name}: ${base}${update || !f.required ? '.nullish()' : ''},`;
  };
  const cols = fields.filter((f) => f.type !== 'text');
  return `import { z } from 'zod';
import { resourceRoutes } from '@/features/auth/api/resource-routes';
import { resourceExportRoute } from '@/features/auth/api/resource-transfer';
import { ${n.camelPlural}Resource } from '../resource';
import type { ${n.Pascal} } from '../types';

/**
 * ${n.title} BFF routes → NestJS /${n.kebab}. Bodies are bounded here; the
 * backend validates business rules and applies the maker–checker policy.
 */
const createBody = z.object({
${fields.map((f) => body(f, false)).join('\n')}
});
const updateBody = z.object({
  version: z.number().int().min(1),
${fields.map((f) => body(f, true)).join('\n')}
});

export const { list, get, create, update, remove } = resourceRoutes<${n.Pascal}>(${n.camelPlural}Resource, {
  access: {
    read: '${n.kebab}:read',
    create: '${n.kebab}:create',
    update: '${n.kebab}:update',
    delete: '${n.kebab}:delete',
  },
  schemas: { create: createBody, update: updateBody },
});

export const exportRoute = resourceExportRoute<${n.Pascal}>(${n.camelPlural}Resource, {
  access: '${n.kebab}:read',
  fileName: '${n.kebab}',
  columns: [
${cols.map((f) => `    { id: '${f.name}', header: '${n.camelPlural}.fields.${f.name}', value: (e) => e.${f.name} },`).join('\n')}
    { id: 'updatedAt', header: '${n.camelPlural}.columns.updated', value: (e) => e.updatedAt },
  ],
});
`;
}

export function hooks(n) {
  return `'use client';

import { createResourceHooks } from '@/shared/data/resource-hooks';
import { ${n.camelPlural}Resource } from '../resource';
import type { ${n.Pascal}, ${n.Pascal}Input } from '../types';

/** ${n.title} hooks: component → hook → /api/${n.kebab} (Next.js) → NestJS. */
const ${n.camelPlural} = createResourceHooks<${n.Pascal}, ${n.Pascal}Input, ${n.Pascal}Input>(${n.camelPlural}Resource);

export const ${n.camel}Keys = ${n.camelPlural}.keys;
export const use${n.Plural} = ${n.camelPlural}.useList;
export const useSave${n.Pascal} = ${n.camelPlural}.useSave;
export const useDelete${n.Pascal} = ${n.camelPlural}.useRemove;
export const ${n.camelPlural}ExportPath = ${n.camelPlural}.exportPath;
`;
}

export function page(n, fields, icon) {
  const shown = fields.filter((f) => f.type !== 'text').slice(0, 5);
  const titleField = fields.find(isText)?.name;
  const cell = (f) => {
    switch (f.type) {
      case 'boolean':
        return `(e) => (e.${f.name} ? <Badge tone="success">{tc('yes')}</Badge> : <Badge>{tc('no')}</Badge>)`;
      case 'date':
        return `(e) => (e.${f.name} ? formatDate(e.${f.name}, locale) : '—')`;
      case 'int':
      case 'number':
        return `(e) => <span className="tabular">{e.${f.name} ?? '—'}</span>`;
      default:
        return f.name === titleField
          ? `(e) => (
        <span className="flex items-center gap-2 font-medium">
          {e.${f.name}}
          {pending[e.id] ? <PendingApprovalBadge approvalId={pending[e.id]!} /> : null}
        </span>
      )`
          : `(e) => e.${f.name} ?? '—'`;
    }
  };
  const columns = shown
    .map(
      (f, i) => `    {
      id: '${f.name}',
      header: t('fields.${f.name}'),${f.type !== 'boolean' ? '\n      sortable: true,' : ''}${i === 0 ? '\n      hideable: false,' : ''}${i > 1 ? '\n      hideOnMobile: true,' : ''}
      cell: ${cell(f)},
    },`,
    )
    .join('\n');
  const nameExpr = titleField ? `confirming?.${titleField} ?? ''` : "''";
  return `'use client';

import { ${icon}, Pencil, Plus, Trash2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { PendingApprovalBadge } from '@/features/approvals/components/approval-status';
import { usePendingApprovals } from '@/features/approvals/hooks/use-approvals';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { describeError } from '@/shared/errors/error-messages';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useEditor } from '@/shared/hooks/use-editor';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { formatDate } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { DataTable, DataTableToolbar, TableSearch, type DataTableColumn } from '@/shared/ui/data-table';
import { useDataTableLabels, useTableToolLabels } from '@/shared/ui/data-table-labels';
import { DataTableExport } from '@/shared/ui/data-table-export';
import { ErrorState } from '@/shared/ui/feedback';
import { ConfirmDialog } from '@/shared/ui/overlay';
import { PageHeader } from '@/shared/ui/page-header';
import { RefreshButton, RowActionsMenu, type RowAction } from '@/shared/ui/row-actions';
import { ${n.camelPlural}ExportPath, useDelete${n.Pascal}, use${n.Plural} } from '../hooks/use-${n.kebab}';
import { ${n.camelPlural}Resource } from '../resource';
import type { ${n.Pascal} } from '../types';

const ${n.Pascal}FormDialog = dynamic(() =>
  import('./${n.singularKebab}-form-dialog').then((m) => m.${n.Pascal}FormDialog),
);

/** ${n.title} (generated): list → search → row actions → form surface (modal or side panel). */
export function ${n.Plural}Page() {
  const t = useTranslations('${n.camelPlural}');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const labels = useDataTableLabels();
  const tools = useTableToolLabels();
  const { can } = usePermissions();
  const { params, update } = useListParams(${n.camelPlural}Resource.listDefaults);
  const { data, isPending, isFetching, error, refetch } = use${n.Plural}(params);
  const pending = usePendingApprovals('${n.Pascal}', (data?.items ?? []).map((e) => e.id)).data ?? {};
  const remove = useDelete${n.Pascal}({ meta: { notify: { error: true } } });
  const feedback = useSaveFeedback();
  const editor = useEditor<${n.Pascal}>();
  const [confirming, setConfirming] = useState<${n.Pascal} | null>(null);
  const [reason, setReason] = useState('');

  const columns: DataTableColumn<${n.Pascal}>[] = [
${columns}
    {
      id: 'updatedAt',
      header: t('columns.updated'),
      sortable: true,
      hideOnMobile: true,
      width: 130,
      cell: (e) => <span className="tabular text-muted-foreground">{formatDate(e.updatedAt, locale)}</span>,
    },
  ];

  const rowActions = (e: ${n.Pascal}) => {
    const actions: RowAction[] = [
      {
        id: 'edit',
        label: t('actions.edit'),
        icon: <Pencil />,
        onSelect: () => editor.edit(e),
        hidden: !can('${n.kebab}:update'),
      },
      {
        id: 'delete',
        label: t('actions.delete'),
        icon: <Trash2 />,
        danger: true,
        divider: true,
        onSelect: () => setConfirming(e),
        hidden: !can('${n.kebab}:delete'),
      },
    ];
    return <RowActionsMenu actions={actions} label={t('actions.menu')} />;
  };

  return (
    <>
      <PageHeader icon={<${icon} />} title={t('title')} description={t('description')} />
      <DataTable
        tableId="${n.kebab}"
        caption={t('title')}
        columns={columns}
        data={data?.items ?? []}
        getRowId={(e) => e.id}
        labels={labels}
        loading={isPending}
        sort={params.sort}
        onSortChange={(sort) => update({ sort })}
        pagination={data?.pagination}
        onPageChange={(page) => update({ page }, false)}
        onPageSizeChange={(pageSize) => update({ pageSize })}
        onRowClick={can('${n.kebab}:update') ? (e) => editor.edit(e) : undefined}
        rowActions={rowActions}
        error={
          error ? (
            <ErrorState
              title={te('title')}
              description={describeError(error, te).message}
              correlationId={describeError(error, te).correlationId}
              referenceLabel={tc('reference')}
            />
          ) : undefined
        }
        toolbar={
          <DataTableToolbar
            actions={
              <>
                {can('${n.kebab}:create') ? (
                  <Button size="sm" className="h-[30px] px-3" onClick={editor.create}>
                    <Plus /> {t('new')}
                  </Button>
                ) : null}
                <DataTableExport
                  endpoint={${n.camelPlural}ExportPath}
                  params={params}
                  tableId="${n.kebab}"
                  columnIds={[${fields.filter((f) => f.type !== 'text').map((f) => `'${f.name}'`).join(', ')}, 'updatedAt']}
                  fileName="${n.kebab}"
                  labels={tools.export}
                />
                <RefreshButton busy={isFetching} onClick={() => refetch()} label={tc('refresh')} busyLabel={tc('refreshing')} />
              </>
            }
            search={
              <TableSearch
                value={params.search ?? ''}
                onChange={(search) => update({ search })}
                placeholder={t('searchPlaceholder')}
                label={tc('search')}
              />
            }
          />
        }
      />

      <${n.Pascal}FormDialog
        open={editor.open}
        entity={editor.record}
        onOpenChange={editor.onOpenChange}
      />

      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(null);
            setReason('');
          }
        }}
        title={t('delete.title')}
        description={t('delete.description', { name: ${nameExpr} })}
        confirmLabel={t('actions.delete')}
        cancelLabel={tc('cancel')}
        loading={remove.isPending}
        onConfirm={() =>
          confirming &&
          remove.mutate(
            { id: confirming.id, reason },
            {
              onSuccess: (result) => {
                feedback(result, t('toast.deleted'));
                setConfirming(null);
                setReason('');
              },
              onError: () => setConfirming(null),
            },
          )
        }
      >
        <ApprovalNotice action="${n.kebab}.delete" reason={reason} onReasonChange={setReason} />
      </ConfirmDialog>
    </>
  );
}
`;
}

export function formDialog(n, fields, icon) {
  const field = (f, i) => {
    const auto = i === 0 ? ' autoFocus' : '';
    switch (f.type) {
      case 'boolean':
        return `        <SwitchField<Values> name="${f.name}" label={t('fields.${f.name}')} />`;
      case 'text':
        return `        <TextareaField<Values> name="${f.name}" label={t('fields.${f.name}')}${f.required ? ' required' : ''} rows={3} className="col-span-full"${auto} />`;
      case 'date':
        return `        <TextField<Values> name="${f.name}" label={t('fields.${f.name}')} type="date"${f.required ? ' required' : ''}${auto} />`;
      case 'int':
      case 'number':
        return `        <TextField<Values> name="${f.name}" label={t('fields.${f.name}')} inputMode="${f.type === 'int' ? 'numeric' : 'decimal'}"${f.required ? ' required' : ''}${auto} />`;
      default:
        return `        <TextField<Values> name="${f.name}" label={t('fields.${f.name}')}${f.required ? ' required' : ''} maxLength={160}${auto} />`;
    }
  };
  const needsSwitch = fields.some((f) => f.type === 'boolean');
  const needsTextarea = fields.some((f) => f.type === 'text');
  const fieldImports = [needsSwitch ? 'SwitchField' : null, needsTextarea ? 'TextareaField' : null].filter(Boolean);
  return `'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ${icon} } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { Button } from '@/shared/ui/button';
import { Form, FormActions, FormGrid, FormRootError, SubmitButton, TextField } from '@/shared/ui/form';
${fieldImports.length ? `import { ${fieldImports.join(', ')} } from '@/shared/ui/form-fields';\n` : ''}import { FormSurface } from '@/shared/ui/form-surface';
import { useSave${n.Pascal} } from '../hooks/use-${n.kebab}';
import {
  ${n.camel}FormDefaults,
  ${n.camel}FormSchema,
  to${n.Pascal}Input,
  type ${n.Pascal}FormValues,
} from '../schemas';
import type { ${n.Pascal} } from '../types';

type Values = ${n.Pascal}FormValues;

/**
 * Create / edit a ${n.lowerSingular} (generated): a modal or side panel per app.config
 * ui.forms (form id "${n.kebab}"). Server validation maps onto fields.
 */
export function ${n.Pascal}FormDialog({
  open,
  entity,
  onOpenChange,
}: {
  open: boolean;
  entity: ${n.Pascal} | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('${n.camelPlural}');
  return (
    <FormSurface
      id="${n.kebab}"
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      icon={<${icon} />}
      title={entity ? t('form.editTitle') : t('form.createTitle')}
    >
      {open ? <${n.Pascal}Form entity={entity} onDone={() => onOpenChange(false)} /> : null}
    </FormSurface>
  );
}

function ${n.Pascal}Form({ entity, onDone }: { entity: ${n.Pascal} | null; onDone: () => void }) {
  const t = useTranslations('${n.camelPlural}');
  const tc = useTranslations('common');
  const save = useSave${n.Pascal}();
  const feedback = useSaveFeedback();
  const [reason, setReason] = useState('');
  const form = useForm<Values>({
    resolver: zodResolver(${n.camel}FormSchema(t)),
    defaultValues: ${n.camel}FormDefaults(entity),
  });

  return (
    <Form
      form={form}
      onSubmit={async (values) => {
        const input = to${n.Pascal}Input(values);
        const result = await save.mutateAsync(
          entity
            ? { id: entity.id, input: { ...input, version: entity.version }, reason }
            : { input, reason },
        );
        feedback(result, entity ? t('toast.updated') : t('toast.created'));
        onDone();
      }}
    >
      <FormGrid columns={2}>
${fields.map(field).join('\n')}
      </FormGrid>
      <ApprovalNotice
        action={entity ? '${n.kebab}.update' : '${n.kebab}.create'}
        reason={reason}
        onReasonChange={setReason}
      />
      <FormRootError referenceLabel={tc('reference')} />
      <FormActions>
        <Button type="button" variant="outline" onClick={onDone}>
          {tc('cancel')}
        </Button>
        <SubmitButton>{entity ? tc('save') : t('form.create')}</SubmitButton>
      </FormActions>
    </Form>
  );
}
`;
}

export function i18n(n, fields) {
  return JSON.stringify(
    {
      [n.camelPlural]: {
        nav: n.title,
        title: n.title,
        description: `Manage ${n.title.toLowerCase()}.`,
        new: `New ${n.lowerSingular}`,
        searchPlaceholder: `Search ${n.title.toLowerCase()}`,
        fields: Object.fromEntries(fields.map((f) => [f.name, f.label])),
        columns: { updated: 'Updated' },
        actions: { edit: 'Edit', delete: 'Delete', menu: 'Actions' },
        form: {
          createTitle: `New ${n.lowerSingular}`,
          editTitle: `Edit ${n.lowerSingular}`,
          create: `Create ${n.lowerSingular}`,
        },
        toast: {
          created: `${n.singularTitle} created`,
          updated: `${n.singularTitle} updated`,
          deleted: `${n.singularTitle} deleted`,
        },
        delete: {
          title: `Delete this ${n.lowerSingular}?`,
          description: '“{name}” will be removed.',
        },
        validation: { required: 'This field is required', number: 'Enter a number' },
      },
    },
    null,
    2,
  ) + '\n';
}

export function appPage(n) {
  return `import type { Metadata } from 'next';
import { listQuery, pageListParams, Prefetch } from '@/features/auth/api/prefetch';
import { requireUser } from '@/features/auth/api/session';
import { ${n.Plural}Page } from '@/features/${n.kebab}/components/${n.kebab}-page';
import { ${n.camelPlural}Resource } from '@/features/${n.kebab}/resource';

export const metadata: Metadata = { title: '${n.title}' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser({ permission: '${n.kebab}:read' });
  const params = pageListParams(await searchParams, ${n.camelPlural}Resource);
  return (
    <Prefetch queries={[listQuery(${n.camelPlural}Resource, params)]}>
      <${n.Plural}Page />
    </Prefetch>
  );
}
`;
}

export const routeFiles = (n) => ({
  [`src/app/api/${n.kebab}/route.ts`]: `export { list as GET, create as POST } from '@/features/${n.kebab}/api/${n.kebab}.routes';\n`,
  [`src/app/api/${n.kebab}/[id]/route.ts`]: `export { get as GET, update as PATCH, remove as DELETE } from '@/features/${n.kebab}/api/${n.kebab}.routes';\n`,
  [`src/app/api/${n.kebab}/export/route.ts`]: `export { exportRoute as GET } from '@/features/${n.kebab}/api/${n.kebab}.routes';\n`,
});
