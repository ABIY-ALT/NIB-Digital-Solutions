'use client';

import { useMutation } from '@tanstack/react-query';
import { Copy, ExternalLink, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { describeError } from '@/shared/errors/error-messages';
import { Button } from '@/shared/ui/button';
import { Alert, Spinner } from '@/shared/ui/feedback';
import { Dialog, DialogContent } from '@/shared/ui/overlay';
import { toast } from '@/shared/ui/toaster';
import type { ProductDeveloper, TelegramLinkCode } from '../types';

/**
 * Links a developer's Telegram: issues a one-time code (valid 30 minutes) that
 * the developer sends to the bot. The bot then links the chat Telegram itself
 * reports, so nobody types a chat id and a username is never trusted alone.
 */
export function TelegramLinkDialog({
  developer,
  onOpenChange,
}: {
  developer: ProductDeveloper | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('productDevelopers.telegram');
  const te = useTranslations('errors');
  const issue = useMutation({
    mutationFn: async (id: string) =>
      (
        await apiFetch<TelegramLinkCode>(`/api/product-developers/${id}/telegram-link`, {
          method: 'POST',
        })
      ).data,
  });
  const { mutate, reset } = issue;

  useEffect(() => {
    if (developer) mutate(developer.id);
    else reset();
  }, [developer, mutate, reset]);

  const link = issue.data;
  const command = link ? `/start ${link.code}` : '';
  return (
    <Dialog open={!!developer} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('title', { name: developer?.name ?? '' })}
        description={t('description')}
      >
        {issue.isPending ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : issue.error ? (
          <Alert tone="danger">{describeError(issue.error, te).message}</Alert>
        ) : link ? (
          <div className="space-y-4">
            <ol className="list-decimal space-y-2 ps-5 text-sm">
              <li>{t('step1')}</li>
              <li>
                {t('step2')}
                <div className="mt-2 flex items-center gap-2">
                  <code className="rounded-control border border-border bg-muted px-3 py-2 font-mono text-base font-semibold tracking-wider">
                    {command}
                  </code>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('copy')}
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(command)
                        .then(() => toast.success(t('copied')))
                    }
                  >
                    <Copy />
                  </Button>
                </div>
              </li>
              <li>{t('step3')}</li>
            </ol>
            {link.deepLink ? (
              <Button
                variant="outline"
                onClick={() => window.open(link.deepLink!, '_blank', 'noopener')}
              >
                <Send /> {t('open')} <ExternalLink />
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">{t('noBotName')}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {t('expires', {
                time: new Date(link.expiresAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
