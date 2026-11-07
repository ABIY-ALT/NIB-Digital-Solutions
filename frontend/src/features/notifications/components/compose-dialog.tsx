'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Megaphone, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { Form, FormRootError, SubmitButton, TextField } from '@/shared/ui/form';
import { RadioGroupField, SelectField, TextareaField } from '@/shared/ui/form-fields';
import { Dialog, DialogContent } from '@/shared/ui/overlay';
import { RecordPickerField } from '@/shared/ui/record-picker';
import { toast } from '@/shared/ui/toaster';
import { useBroadcast } from '../hooks/use-notifications';
import { CategoryIcon } from './notification-visuals';

/** Announcement to everyone or to selected roles (requires notifications:broadcast). */
export function ComposeDialog({
  open,
  onOpenChange,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const t = useTranslations('notifications.compose');
  const tc = useTranslations('common');
  const broadcast = useBroadcast();

  const schema = z
    .object({
      audience: z.enum(['ALL', 'ROLES']),
      roles: z.array(z.string()),
      severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
      title: z.string().trim().min(3, t('validation.title')).max(200),
      body: z.string().trim().min(3, t('validation.body')).max(2000),
      link: z
        .string()
        .trim()
        .max(300)
        .refine((v) => !v || /^\/[^/\\]/.test(v), t('validation.link')),
    })
    .refine((v) => v.audience === 'ALL' || v.roles.length > 0, {
      path: ['roles'],
      message: t('validation.roles'),
    });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { audience: 'ALL', roles: [], severity: 'INFO', title: '', body: '', link: '' },
  });
  const [audience, title, body] = useWatch({
    control: form.control,
    name: ['audience', 'title', 'body'],
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        size="lg"
        title={t('title')}
        description={t('description')}
        icon={<Megaphone />}
      >
        <Form
          form={form}
          onSubmit={async (v) => {
            const result = await broadcast.mutateAsync({
              audience: v.audience,
              roles: v.audience === 'ROLES' ? v.roles : undefined,
              severity: v.severity,
              title: v.title,
              body: v.body,
              link: v.link || null,
            });
            toast.success(t('sent', { count: result.recipients }));
            form.reset();
            onOpenChange(false);
          }}
        >
          <RadioGroupField<Values>
            name="audience"
            label={t('audience')}
            orientation="horizontal"
            options={[
              { value: 'ALL', label: t('audienceAll') },
              { value: 'ROLES', label: t('audienceRoles') },
            ]}
          />
          {audience === 'ROLES' ? (
            <RecordPickerField<Values> name="roles" label={t('roles')} multiple source="roles" />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField<Values>
              name="title"
              label={t('subject')}
              required
              maxLength={200}
              className="sm:col-span-2"
            />
            <SelectField<Values>
              name="severity"
              label={t('severity')}
              options={(['INFO', 'WARNING', 'CRITICAL'] as const).map((s) => ({
                value: s,
                label: t(`severities.${s}`),
              }))}
            />
          </div>
          <TextareaField<Values>
            name="body"
            label={t('message')}
            required
            rows={5}
            maxLength={2000}
          />
          <TextField<Values>
            name="link"
            label={t('link')}
            placeholder="/approvals"
            description={t('linkHint')}
          />

          {title || body ? (
            <div className="rounded-surface border border-dashed border-border-strong p-3">
              <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t('preview')}
              </p>
              <div className="flex gap-3">
                <CategoryIcon category="ANNOUNCEMENT" />
                <div className="min-w-0">
                  <p className={cn('text-sm font-bold', !title && 'text-subtle-foreground')}>
                    {title || t('subject')}
                  </p>
                  <p className="line-clamp-3 text-xs text-muted-foreground">{body}</p>
                </div>
              </div>
            </div>
          ) : null}

          <FormRootError referenceLabel={tc('reference')} />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <SubmitButton>
              <Send /> {t('send')}
            </SubmitButton>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
