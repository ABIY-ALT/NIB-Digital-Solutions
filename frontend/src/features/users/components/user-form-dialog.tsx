'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Pencil, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch, type FieldPath, type FieldValues } from 'react-hook-form';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { usePasswordPolicy } from '@/features/auth/hooks/use-auth';
import { ReferenceSelectField } from '@/features/reference-data/components/reference-select';
import { SelectField } from '@/shared/ui/form-fields';
import {
  Form,
  FormActions,
  FormGrid,
  FormRootError,
  SubmitButton,
  TextField,
} from '@/shared/ui/form';
import { Button } from '@/shared/ui/button';
import { FormSurface } from '@/shared/ui/form-surface';
import { usePasswordIssueTranslator } from '@/shared/ui/password-checklist';
import { PasswordField } from '@/shared/ui/password-field';
import { RecordPickerField } from '@/shared/ui/record-picker';
import { toast } from '@/shared/ui/toaster';
import { useCreateUser, useUpdateUser } from '../hooks/use-users';
import {
  createUserFormSchema,
  updateUserSchema,
  type CreateUserFormInput,
  type CreateUserFormValues,
  type UpdateUserInput,
  type UpdateUserValues,
} from '../schemas';
import type { User } from '../types';

/**
 * Create / edit a user — a modal or side panel per `ui.forms` (form id "users").
 * Server errors (duplicates, stale version, validation) map onto the form automatically.
 */
export function UserFormDialog({
  open,
  onOpenChange,
  user,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
}>) {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const editing = !!user;

  return (
    <FormSurface
      id="users"
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      icon={editing ? <Pencil /> : <UserPlus />}
      title={editing ? t('form.editTitle') : t('form.createTitle')}
      description={editing ? user.username : t('form.createDescription')}
    >
      {editing ? (
        <EditForm user={user} onDone={() => onOpenChange(false)} cancelLabel={tc('cancel')} />
      ) : (
        <CreateForm onDone={() => onOpenChange(false)} cancelLabel={tc('cancel')} />
      )}
    </FormSurface>
  );
}

/** Roles as a searchable multi-select (value = role codes). */
function RolesField<T extends FieldValues>({ label }: Readonly<{ label: string }>) {
  const t = useTranslations('users.form');
  return (
    <RecordPickerField<T>
      name={'roles' as FieldPath<T>}
      label={label}
      required
      multiple
      source="roles"
      placeholder={t('rolesPlaceholder')}
      searchPlaceholder={t('rolesSearch')}
    />
  );
}

function CreateForm({
  onDone,
  cancelLabel,
}: Readonly<{ onDone: () => void; cancelLabel: string }>) {
  const t = useTranslations('users');
  const create = useCreateUser();
  const policy = usePasswordPolicy();
  const translateIssue = usePasswordIssueTranslator();
  const idempotencyKey = useRef(crypto.randomUUID());
  const form = useForm<CreateUserFormInput, unknown, CreateUserFormValues>({
    resolver: zodResolver(createUserFormSchema(t, policy.data)),
    defaultValues: {
      username: '',
      email: '',
      fullName: '',
      phoneNumber: '',
      password: '',
      confirmPassword: '',
      branchCode: '',
      roles: ['USER'],
    },
  });

  const [username, fullName, email, password, confirmPassword] = useWatch({
    control: form.control,
    name: ['username', 'fullName', 'email', 'password', 'confirmPassword'],
  });
  const passwordsMatch = !!password && password === confirmPassword;

  return (
    <Form
      form={form}
      translateIssue={translateIssue}
      onSubmit={async ({ confirmPassword: _confirmation, ...values }) => {
        // The confirmation is checked here only; it is never sent.
        await create.mutateAsync({ ...values, idempotencyKey: idempotencyKey.current });
        toast.success(t('toast.created', { name: values.fullName }));
        onDone();
      }}
    >
      <FormGrid columns={2}>
        <TextField<CreateUserFormInput>
          name="fullName"
          label={t('fields.fullName')}
          required
          autoFocus
        />
        <TextField<CreateUserFormInput>
          name="username"
          label={t('fields.username')}
          required
          autoComplete="off"
        />
        <TextField<CreateUserFormInput>
          name="email"
          label={t('fields.email')}
          type="email"
          required
        />
        <TextField<CreateUserFormInput>
          name="phoneNumber"
          label={t('fields.phone')}
          placeholder="+2519…"
        />
        <ReferenceSelectField<CreateUserFormInput>
          name="branchCode"
          label={t('fields.branch')}
          type="branches"
          allowEmpty
        />
        <RolesField<CreateUserFormInput> label={t('fields.roles')} />
        <PasswordField<CreateUserFormInput>
          name="password"
          label={t('fields.password')}
          required
          purpose="new"
          rules={policy.data}
          personal={[username, fullName, email]}
        />
        <PasswordField<CreateUserFormInput>
          name="confirmPassword"
          label={t('fields.confirmPassword')}
          required
          purpose="new"
          description={
            passwordsMatch ? (
              <span className="flex items-center gap-1 font-medium text-success">
                <Check className="size-3.5" aria-hidden /> {t('form.passwordsMatch')}
              </span>
            ) : undefined
          }
        />
      </FormGrid>
      <FormRootError />
      <FormActions>
        <Button type="button" variant="outline" onClick={onDone}>
          {cancelLabel}
        </Button>
        <SubmitButton>{t('form.create')}</SubmitButton>
      </FormActions>
    </Form>
  );
}

function EditForm({
  user,
  onDone,
  cancelLabel,
}: Readonly<{
  user: User;
  onDone: () => void;
  cancelLabel: string;
}>) {
  const t = useTranslations('users');
  const update = useUpdateUser();
  const feedback = useSaveFeedback();
  const [reason, setReason] = useState('');
  const form = useForm<UpdateUserInput, unknown, UpdateUserValues>({
    resolver: zodResolver(updateUserSchema(t)),
    defaultValues: {
      version: user.version,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber ?? '',
      branchCode: user.branchCode ?? '',
      status: user.status === 'PENDING_ACTIVATION' ? 'ACTIVE' : user.status,
      roles: user.roles,
    },
  });
  useEffect(() => form.setValue('version', user.version), [user.version, form]);

  return (
    <Form
      form={form}
      onSubmit={async (values) => {
        const result = await update.mutateAsync({ id: user.id, input: values, reason });
        feedback(result, t('toast.updated', { name: values.fullName }));
        onDone();
      }}
    >
      <FormGrid columns={2}>
        <TextField<UpdateUserInput> name="fullName" label={t('fields.fullName')} required />
        <TextField<UpdateUserInput> name="email" label={t('fields.email')} type="email" required />
        <TextField<UpdateUserInput> name="phoneNumber" label={t('fields.phone')} />
        <ReferenceSelectField<UpdateUserInput>
          name="branchCode"
          label={t('fields.branch')}
          type="branches"
          allowEmpty
        />
        <SelectField<UpdateUserInput>
          name="status"
          label={t('fields.status')}
          required
          options={(['ACTIVE', 'LOCKED', 'DISABLED'] as const).map((s) => ({
            value: s,
            label: t(`status.${s}`),
          }))}
        />
      </FormGrid>
      <RolesField<UpdateUserInput> label={t('fields.roles')} />
      <ApprovalNotice action="users.update" reason={reason} onReasonChange={setReason} />
      <FormRootError />
      <FormActions>
        <Button type="button" variant="outline" onClick={onDone}>
          {cancelLabel}
        </Button>
        <SubmitButton>{t('form.save')}</SubmitButton>
      </FormActions>
    </Form>
  );
}
