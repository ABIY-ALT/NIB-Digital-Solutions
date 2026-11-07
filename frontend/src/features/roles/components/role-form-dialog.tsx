'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, Copy, Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { Alert, Skeleton } from '@/shared/ui/feedback';
import { Form, FormField, FormRootError, SubmitButton, TextField } from '@/shared/ui/form';
import { FormSurface } from '@/shared/ui/form-surface';
import { DialogFooter } from '@/shared/ui/overlay';
import { usePermissionCatalogue, useSaveRole } from '../hooks/use-roles';
import type { Role } from '../types';
import { PermissionPicker } from './permission-picker';

export type RoleFormMode = 'create' | 'edit' | 'clone';

type Translate = (key: string, values?: Record<string, string>) => string;

/** The dialog's icon, title and description for a mode. */
function dialogHeading(
  mode: RoleFormMode,
  roleName: string,
  t: Translate,
): { icon: ReactNode; title: string; description: string } {
  switch (mode) {
    case 'edit':
      return {
        icon: <Pencil />,
        title: t('form.editTitle', { name: roleName }),
        description: t('form.editDescription'),
      };
    case 'clone':
      return {
        icon: <Copy />,
        title: t('form.cloneTitle'),
        description: t('form.cloneDescription', { name: roleName }),
      };
    default:
      return {
        icon: <Plus />,
        title: t('form.createTitle'),
        description: t('form.createDescription'),
      };
  }
}

/**
 * Create / edit / clone a role (modal or side panel per `ui.forms`, form id "roles"): a collapsible "Role information"
 * section above the master-detail permission picker. The dialog never grows
 * past the viewport; the picker scrolls inside itself.
 */
export function RoleFormDialog({
  open,
  onOpenChange,
  mode,
  role,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: RoleFormMode;
  /** The role being edited, or the template being cloned. */
  role: Role | null;
}>) {
  const t = useTranslations('roles');
  const { icon, title, description } = dialogHeading(mode, role?.name ?? '', t);

  return (
    <FormSurface
      id="roles"
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      icon={icon}
      title={title}
      description={description}
      bodyClassName="flex flex-col overflow-hidden"
    >
      {open ? (
        <RoleForm
          key={`${mode}:${role?.id ?? 'new'}`}
          mode={mode}
          role={role}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
    </FormSurface>
  );
}

function RoleForm({
  mode,
  role,
  onDone,
}: Readonly<{
  mode: RoleFormMode;
  role: Role | null;
  onDone: () => void;
}>) {
  const t = useTranslations('roles');
  const tc = useTranslations('common');
  const catalogue = usePermissionCatalogue();
  const save = useSaveRole();
  const feedback = useSaveFeedback();
  const [reason, setReason] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const editing = mode === 'edit' && role !== null;
  const superRole = editing && role.permissions.includes('*');
  const systemRole = editing && role.isSystem;

  const schema = z.object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9_]{1,63}$/, t('validation.code')),
    name: z.string().trim().min(2, t('validation.name')).max(120),
    description: z.string().trim().max(500).optional(),
    permissions: z.array(z.string()),
  });
  type Values = z.input<typeof schema>;
  type Output = z.output<typeof schema>;

  const form = useForm<Values, unknown, Output>({
    resolver: zodResolver(schema),
    defaultValues:
      mode === 'clone' && role
        ? {
            code: `${role.code}_COPY`.slice(0, 64),
            name: t('form.copyName', { name: role.name }),
            description: role.description ?? '',
            permissions: role.permissions.filter((p) => p !== '*'),
          }
        : {
            code: role?.code ?? '',
            name: role?.name ?? '',
            description: role?.description ?? '',
            permissions: role?.permissions ?? [],
          },
  });
  const [name, code] = useWatch({ control: form.control, name: ['name', 'code'] });

  return (
    <Form
      form={form}
      className="flex min-h-0 flex-1 flex-col space-y-0"
      onSubmit={async (values) => {
        const input = editing
          ? {
              version: role.version,
              name: values.name,
              description: values.description || null,
              ...(superRole ? {} : { permissions: values.permissions }),
            }
          : {
              code: values.code,
              name: values.name,
              description: values.description || null,
              permissions: values.permissions,
            };
        const result = await save.mutateAsync({ id: editing ? role.id : undefined, input, reason });
        feedback(
          result,
          editing
            ? t('toast.updated', { name: values.name })
            : t('toast.created', { name: values.name }),
        );
        onDone();
      }}
    >
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-5 max-sm:px-4">
        {systemRole ? (
          <Alert tone="info" title={superRole ? t('superNotice') : t('systemNotice')} />
        ) : null}

        <section className={cn('shrink-0', collapsed && 'border-b border-border pb-3')}>
          <InformationToggle
            collapsed={collapsed}
            onToggle={() => setCollapsed((v) => !v)}
            name={name}
            code={code}
          />
          <div className={cn('mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2', collapsed && 'hidden')}>
            <TextField<Values>
              name="name"
              label={t('fields.name')}
              required
              autoFocus
              disabled={systemRole}
              maxLength={120}
              autoComplete="off"
            />
            <TextField<Values>
              name="code"
              label={t('fields.code')}
              required
              disabled={editing}
              maxLength={64}
              autoComplete="off"
              description={editing ? undefined : t('fields.codeHint')}
              className="[&_input]:font-mono [&_input]:uppercase"
            />
            <TextField<Values>
              name="description"
              label={t('fields.description')}
              placeholder={t('fields.descriptionPlaceholder')}
              maxLength={500}
              className="sm:col-span-2"
            />
          </div>
        </section>

        <FormField<Values>
          name="permissions"
          className="flex min-h-0 flex-col"
          render={({ field, fieldState }) =>
            catalogue.isPending ? (
              <Skeleton className="h-[clamp(360px,55vh,590px)]" />
            ) : (
              <PermissionPicker
                catalogue={catalogue.data ?? []}
                value={(field.value as string[]) ?? []}
                onChange={field.onChange}
                readOnly={superRole}
                invalid={!!fieldState.error}
              />
            )
          }
        />
        <ApprovalNotice
          action={editing ? 'roles.update' : 'roles.create'}
          reason={reason}
          onReasonChange={setReason}
          className="shrink-0"
        />
        <FormRootError referenceLabel={tc('reference')} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {tc('cancel')}
        </Button>
        <SubmitButton>{editing ? t('form.save') : t('form.create')}</SubmitButton>
      </DialogFooter>
    </Form>
  );
}

/** The "Role information" disclosure; collapsed, it still shows the name and code. */
function InformationToggle({
  collapsed,
  onToggle,
  name,
  code,
}: Readonly<{
  collapsed: boolean;
  onToggle: () => void;
  name: string;
  code: string;
}>) {
  const t = useTranslations('roles');
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="flex w-full items-center justify-between gap-3 rounded-control py-1 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <h3 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold">
        {t('form.information')}
        {collapsed && name ? (
          <span className="truncate text-xs font-normal text-muted-foreground">
            · {name} · <span className="font-mono">{code}</span>
          </span>
        ) : null}
      </h3>
      <ChevronDown
        className={cn(
          'size-4 shrink-0 text-muted-foreground transition-transform',
          !collapsed && 'rotate-180',
        )}
        aria-hidden
      />
    </button>
  );
}
