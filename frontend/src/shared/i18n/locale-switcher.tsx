'use client';

import { Check, Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/ui/menu';
import { useChangeLocale } from './use-change-locale';

/** Language switcher → POST /api/locale. */
export function LocaleSwitcher({
  locales,
}: Readonly<{ locales: Array<{ code: string; label: string }> }>) {
  const t = useTranslations('common');
  const current = useLocale();
  const change = useChangeLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('language')}
          loading={change.isPending}
          className="gap-1.5"
        >
          {!change.isPending ? <Languages /> : null}
          <span className="hidden text-xs font-semibold uppercase sm:inline">{current}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('language')}</DropdownMenuLabel>
        {locales.map((l) => (
          <DropdownMenuItem key={l.code} lang={l.code} onSelect={() => change.mutate(l.code)}>
            <span className="flex-1">{l.label}</span>
            {l.code === current ? <Check /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
