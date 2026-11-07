'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { FileDown, Mail, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Can } from '@/features/auth/components/can';
import { Button, type ButtonProps } from '@/shared/ui/button';
import { Alert } from '@/shared/ui/feedback';
import { Form, FormRootError, SubmitButton, TextField } from '@/shared/ui/form';
import { TextareaField } from '@/shared/ui/form-fields';
import { Dialog, DialogContent } from '@/shared/ui/overlay';
import { toast } from '@/shared/ui/toaster';
import { useDownloadDocument, useSendDocument, type DocumentRef } from '../hooks/use-documents';

/**
 * "Download PDF" and "Send by e-mail" for any record whose backend module
 * registered a document source:
 *
 *   <DocumentActions source="roles" id={role.id} name={role.name} />
 *
 * The backend enforces the record type's permissions; the e-mail button is
 * shown only to users holding `documents:send`.
 */
export function DocumentActions({
  source,
  id,
  name,
  variant = 'outline',
  size,
}: DocumentRef & {
  /** What the record is called, shown in the send dialog (e.g. the role name). */
  name: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
}) {
  const t = useTranslations('documents');
  const download = useDownloadDocument();
  const [sending, setSending] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        loading={download.isPending}
        onClick={() => download.mutate({ source, id })}
      >
        {download.isPending ? null : <FileDown />} {t('download')}
      </Button>
      <Can permission="documents:send">
        <Button variant={variant} size={size} onClick={() => setSending(true)}>
          <Mail /> {t('send')}
        </Button>
        <SendDocumentDialog
          source={source}
          id={id}
          name={name}
          open={sending}
          onOpenChange={setSending}
        />
      </Can>
    </>
  );
}

function SendDocumentDialog({
  source,
  id,
  name,
  open,
  onOpenChange,
}: DocumentRef & { name: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('documents');
  const tc = useTranslations('common');
  const send = useSendDocument();

  const schema = z.object({
    to: z.email(t('invalidEmail')).max(254),
    subject: z.string().trim().max(160),
    message: z.string().trim().max(2000),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { to: '', subject: '', message: '' },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent size="sm" icon={<Mail />} title={t('sendTitle')} description={name}>
        <Form
          form={form}
          onSubmit={async ({ to, subject, message }) => {
            const sent = await send.mutateAsync({
              source,
              id,
              to,
              subject: subject || undefined,
              message: message || undefined,
            });
            toast.success(t('sent', { to: sent.to }));
            form.reset();
            onOpenChange(false);
          }}
        >
          <Alert tone="info">{t('sendHint')}</Alert>
          <TextField<Values>
            name="to"
            type="email"
            label={t('to')}
            placeholder={t('toPlaceholder')}
            autoComplete="off"
            required
            autoFocus
          />
          <TextField<Values>
            name="subject"
            label={t('subject')}
            placeholder={t('subjectPlaceholder')}
            maxLength={160}
          />
          <TextareaField<Values>
            name="message"
            label={t('message')}
            placeholder={t('messagePlaceholder')}
            maxLength={2000}
          />
          <FormRootError referenceLabel={tc('reference')} />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <SubmitButton>
              <Send /> {t('sendSubmit')}
            </SubmitButton>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
