'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, KeyRound, Lock, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { usePasswordPolicy } from '@/features/auth/hooks/use-auth';
import { passwordPolicy } from '@/features/users/schemas';
import { isApiClientError } from '@/shared/errors/api-client-error';
import type { UserProfile } from '@/shared/types';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Alert, Skeleton } from '@/shared/ui/feedback';
import { Form, FormRootError, SubmitButton } from '@/shared/ui/form';
import { usePasswordIssueTranslator } from '@/shared/ui/password-checklist';
import { PasswordField } from '@/shared/ui/password-field';
import { OtpInput } from '@/shared/ui/otp-input';
import { Dialog, DialogContent } from '@/shared/ui/overlay';
import { toast } from '@/shared/ui/toaster';
import {
  useBeginTotpSetup,
  useChangePassword,
  useConfirmTotpSetup,
  useDisableMfa,
} from '../hooks/use-account';
import type { TotpSetup } from '../types';

/** Security tab: change password + two-step verification (TOTP). */
export function SecurityPanel({ profile }: Readonly<{ profile: UserProfile }>) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <ChangePasswordCard profile={profile} />
      <MfaCard profile={profile} />
    </div>
  );
}

function ChangePasswordCard({ profile }: Readonly<{ profile: UserProfile }>) {
  const t = useTranslations('profile.security');
  const tu = useTranslations('users');
  const tc = useTranslations('common');
  const change = useChangePassword();
  const policy = usePasswordPolicy();
  const translateIssue = usePasswordIssueTranslator();
  const schema = z
    .object({
      currentPassword: z.string().min(1, t('currentRequired')),
      newPassword: passwordPolicy(tu, policy.data),
      confirmPassword: z.string(),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      path: ['confirmPassword'],
      message: t('mismatch'),
    });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" aria-hidden /> {t('passwordTitle')}
          </CardTitle>
          <CardDescription>{t('passwordDescription')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Form
          form={form}
          translateIssue={translateIssue}
          onSubmit={async (values) => {
            const result = await change.mutateAsync({
              currentPassword: values.currentPassword,
              newPassword: values.newPassword,
            });
            toast.success(t('passwordChanged'), {
              description: t('otherSessionsEnded', { count: result.terminatedSessions }),
            });
            form.reset();
          }}
        >
          <PasswordField<Values>
            name="currentPassword"
            label={t('currentPassword')}
            required
            startAdornment={<Lock />}
          />
          <PasswordField<Values>
            name="newPassword"
            label={t('newPassword')}
            required
            purpose="new"
            rules={policy.data}
            historyCount={policy.data?.historyCount}
            personal={[profile.username, profile.fullName, profile.email]}
            startAdornment={<KeyRound />}
          />
          <PasswordField<Values>
            name="confirmPassword"
            label={t('confirmPassword')}
            required
            purpose="new"
            startAdornment={<KeyRound />}
          />
          <FormRootError referenceLabel={tc('reference')} />
          <div className="flex justify-end border-t border-border pt-4">
            <SubmitButton>{t('changePassword')}</SubmitButton>
          </div>
        </Form>
      </CardContent>
    </Card>
  );
}

function MfaCard({ profile }: Readonly<{ profile: UserProfile }>) {
  const t = useTranslations('profile.security');
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const enabled = profile.mfaEnabled;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" aria-hidden /> {t('mfaTitle')}
          </CardTitle>
          <CardDescription>{t('mfaDescription')}</CardDescription>
        </div>
        {enabled ? (
          <Badge tone="success" dot>
            {t('on')}
          </Badge>
        ) : (
          <Badge tone="warning" dot>
            {t('off')}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 rounded-control border border-border bg-surface-muted p-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary-text">
            <Smartphone className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t('authenticatorApp')}</p>
            <p className="text-xs text-muted-foreground">
              {enabled && profile.mfaMethod === 'TOTP' ? t('appConfigured') : t('appHint')}
            </p>
          </div>
        </div>
        {!enabled ? (
          <Alert tone="warning" title={t('recommendTitle')}>
            {t('recommendText')}
          </Alert>
        ) : null}
        <div className="flex justify-end border-t border-border pt-4">
          {enabled ? (
            <Button variant="outline" onClick={() => setDisableOpen(true)}>
              <ShieldOff /> {t('turnOff')}
            </Button>
          ) : (
            <Button onClick={() => setSetupOpen(true)}>
              <ShieldCheck /> {t('setUp')}
            </Button>
          )}
        </div>
      </CardContent>
      <TotpSetupDialog open={setupOpen} onOpenChange={setSetupOpen} />
      <DisableMfaDialog open={disableOpen} onOpenChange={setDisableOpen} />
    </Card>
  );
}

function TotpSetupDialog({
  open,
  onOpenChange,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const t = useTranslations('profile.security');
  const tc = useTranslations('common');
  const begin = useBeginTotpSetup();
  const confirm = useConfirmTotpSetup();
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { mutate: start } = begin;

  useEffect(() => {
    if (!open) {
      setSetup(null);
      setQr(null);
      setCode('');
      setError(null);
      return;
    }
    start(undefined, {
      onSuccess: async (s) => {
        setSetup(s);
        // The QR encoder is loaded only when a user actually sets up MFA.
        const { toDataURL } = await import('qrcode');
        setQr(
          await toDataURL(s.otpauthUri, {
            margin: 1,
            width: 188,
            color: { dark: '#323130', light: '#ffffff' },
          }),
        );
      },
      onError: (e) => setError(isApiClientError(e) ? e.message : t('setupFailed')),
    });
  }, [open, start, t]);

  const submit = (value = code) => {
    if (!/^\d{6}$/.test(value)) return;
    setError(null);
    confirm.mutate(value, {
      onSuccess: () => {
        toast.success(t('enabledToast'));
        onOpenChange(false);
      },
      onError: () => {
        setCode('');
        setError(t('wrongCode'));
      },
    });
  };

  const formattedSecret = setup?.secret.replace(/(.{4})/g, '$1 ').trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        title={t('setupTitle')}
        description={t('setupDescription')}
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button
              loading={confirm.isPending}
              disabled={code.length !== 6 || !setup}
              onClick={() => submit()}
            >
              {t('verifyAndEnable')}
            </Button>
          </>
        }
      >
        <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">{t('step1')}</span>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL generated locally
              <img
                src={qr}
                alt={t('qrAlt')}
                width={188}
                height={188}
                className="rounded-control border border-border"
              />
            ) : (
              <Skeleton className="size-[188px]" />
            )}
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">{t('manualKey')}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <code className="flex-1 rounded-control border border-border bg-surface-muted px-2.5 py-1.5 font-mono text-xs break-all select-all">
                  {formattedSecret ?? '…'}
                </code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('copy')}
                  disabled={!setup}
                  onClick={() =>
                    setup &&
                    navigator.clipboard
                      .writeText(setup.secret)
                      .then(() => toast.success(t('copied')))
                  }
                >
                  <Copy />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{t('step2')}</p>
              <OtpInput
                value={code}
                onChange={setCode}
                onComplete={submit}
                disabled={!setup || confirm.isPending}
                invalid={!!error}
                aria-label={t('codeLabel')}
              />
            </div>
            {error ? <Alert tone="danger" title={error} /> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DisableMfaDialog({
  open,
  onOpenChange,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const t = useTranslations('profile.security');
  const tc = useTranslations('common');
  const disable = useDisableMfa();
  const schema = z.object({ password: z.string().min(1, t('currentRequired')) });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '' } });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) form.reset();
        onOpenChange(o);
      }}
    >
      <DialogContent
        size="sm"
        tone="danger"
        title={t('disableTitle')}
        description={t('disableDescription')}
      >
        <Form
          form={form}
          onSubmit={async (values) => {
            await disable.mutateAsync(values.password);
            toast.success(t('disabledToast'));
            form.reset();
            onOpenChange(false);
          }}
        >
          <PasswordField<Values>
            name="password"
            label={t('currentPassword')}
            required
            autoFocus
            startAdornment={<Lock />}
          />
          <FormRootError referenceLabel={tc('reference')} />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <SubmitButton variant="danger">{t('turnOff')}</SubmitButton>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
