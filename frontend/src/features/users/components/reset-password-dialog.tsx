'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { usePasswordPolicy } from '@/features/auth/hooks/use-auth';
import { Alert } from '@/shared/ui/feedback';
import { Button } from '@/shared/ui/button';
import { Form, FormRootError, SubmitButton, TextField } from '@/shared/ui/form';
import { Dialog, DialogContent } from '@/shared/ui/overlay';
import { PasswordChecklist, usePasswordIssueTranslator } from '@/shared/ui/password-checklist';
import { toast } from '@/shared/ui/toaster';
import { useResetUserPassword } from '../hooks/use-users';
import { passwordPolicy } from '../schemas';
import type { User } from '../types';

/** Generates a policy-compliant temporary password (one of each class, then random). */
function generatePassword(minLength = 10): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!#$%&*+?@'];
  const all = sets.join('');
  const pick = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0]! % s.length]!;
  const length = Math.max(14, minLength + 2);
  const chars = [...sets.map(pick), ...Array.from({ length: length - 4 }, () => pick(all))];
  return chars.toSorted(() => crypto.getRandomValues(new Uint8Array(1))[0]! - 128).join('');
}

/** Admin: set a temporary password for another user (ends their sessions). */
export function ResetPasswordDialog({
  user,
  onOpenChange,
}: Readonly<{
  user: User | null;
  onOpenChange: (open: boolean) => void;
}>) {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const reset = useResetUserPassword();
  const policy = usePasswordPolicy();
  const translateIssue = usePasswordIssueTranslator();
  const schema = z.object({ newPassword: passwordPolicy(t, policy.data) });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '' },
  });
  const value = useWatch({ control: form.control, name: 'newPassword' }) ?? '';

  return (
    <Dialog
      open={!!user}
      onOpenChange={(open) => {
        if (!open) form.reset();
        onOpenChange(open);
      }}
    >
      <DialogContent
        size="sm"
        title={t('reset.title')}
        description={user ? `${user.fullName} · @${user.username}` : undefined}
      >
        {user ? (
          <Form
            form={form}
            translateIssue={translateIssue}
            onSubmit={async (values) => {
              await reset.mutateAsync({ id: user.id, newPassword: values.newPassword });
              toast.success(t('reset.done', { name: user.fullName }));
              form.reset();
              onOpenChange(false);
            }}
          >
            <Alert tone="warning" title={t('reset.warning')} />
            <TextField<Values>
              name="newPassword"
              label={t('reset.newPassword')}
              required
              autoComplete="off"
              className="[&_input]:font-mono"
              startAdornment={<KeyRound />}
              endAdornment={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('reset.generate')}
                  title={t('reset.generate')}
                  onClick={() =>
                    form.setValue('newPassword', generatePassword(policy.data?.minLength), {
                      shouldValidate: true,
                    })
                  }
                >
                  <RefreshCw />
                </Button>
              }
            />
            <PasswordChecklist
              value={value}
              rules={policy.data}
              personal={[user.username, user.fullName, user.email]}
            />
            <FormRootError referenceLabel={tc('reference')} />
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tc('cancel')}
              </Button>
              <SubmitButton>{t('reset.submit')}</SubmitButton>
            </div>
          </Form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
