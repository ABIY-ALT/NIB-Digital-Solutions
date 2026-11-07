'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, UserPen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { UserProfile } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import {
  Form,
  FormActions,
  FormGrid,
  FormRootError,
  SubmitButton,
  TextField,
} from '@/shared/ui/form';
import { Dialog, DialogContent } from '@/shared/ui/overlay';
import { toast } from '@/shared/ui/toaster';
import { useUpdateProfile } from '../hooks/use-profile';

const schema = (t: (key: string) => string) =>
  z.object({
    fullName: z.string().trim().min(2, t('nameRequired')).max(160),
    phoneNumber: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\+?\d{7,15}$/.test(v), t('invalidPhone')),
  });
type Values = z.infer<ReturnType<typeof schema>>;

/** Self-service: display name and phone. E-mail, branch and roles stay with administrators. */
export function EditProfileDialog({
  profile,
  open,
  onOpenChange,
}: Readonly<{
  profile: UserProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const t = useTranslations('profile.edit');
  const tc = useTranslations('common');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" icon={<UserPen />} title={t('title')} description={t('description')}>
        {open ? (
          <EditForm profile={profile} onDone={() => onOpenChange(false)} cancel={tc('cancel')} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  profile,
  onDone,
  cancel,
}: Readonly<{
  profile: UserProfile;
  onDone: () => void;
  cancel: string;
}>) {
  const t = useTranslations('profile.edit');
  const update = useUpdateProfile();
  const form = useForm<Values>({
    resolver: zodResolver(schema(t)),
    defaultValues: { fullName: profile.fullName, phoneNumber: profile.phoneNumber ?? '' },
  });

  return (
    <Form
      form={form}
      onSubmit={async (values) => {
        const phone = values.phoneNumber === '' ? null : values.phoneNumber;
        await update.mutateAsync({
          version: profile.version,
          ...(values.fullName !== profile.fullName ? { fullName: values.fullName } : {}),
          ...(phone !== profile.phoneNumber ? { phoneNumber: phone } : {}),
        });
        toast.success(t('saved'));
        onDone();
      }}
    >
      <FormGrid columns={1}>
        <TextField<Values> name="fullName" label={t('fullName')} required autoFocus />
        <TextField<Values>
          name="phoneNumber"
          label={t('phone')}
          placeholder="+2519…"
          inputMode="tel"
          description={t('phoneHint')}
        />
      </FormGrid>
      <div className="flex items-start gap-2.5 rounded-control border border-dashed border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          <span className="font-semibold text-foreground">{profile.email}</span> ·{' '}
          {t('managedByAdmin')}
        </span>
      </div>
      <FormRootError />
      <FormActions>
        <Button type="button" variant="outline" onClick={onDone}>
          {cancel}
        </Button>
        <SubmitButton disabled={!form.formState.isDirty}>{t('save')}</SubmitButton>
      </FormActions>
    </Form>
  );
}
