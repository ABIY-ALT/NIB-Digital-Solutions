'use client';

import { Check, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/ui/menu';
import type { ColorMode } from './color-mode';
import { useTheme } from './theme-provider';

export const COLOR_MODE_ICON: Record<ColorMode, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/** Header control (Materio style): the current palette's icon, a menu with Light / Dark / System. */
export function ThemeSwitcher({ className }: Readonly<{ className?: string }>) {
  const t = useTranslations('theme');
  const { mode, resolved, modes, setMode, canSwitch } = useTheme();
  if (!canSwitch) return null;
  const Current = mode === 'system' ? Monitor : COLOR_MODE_ICON[resolved];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('text-muted-foreground', className)}
          aria-label={t('current', { mode: t(`modes.${mode}`) })}
          title={t('label')}
        >
          <Current />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t('label')}</DropdownMenuLabel>
        {modes.map((m) => {
          const Icon = COLOR_MODE_ICON[m];
          return (
            <DropdownMenuItem key={m} onSelect={() => setMode(m)}>
              <Icon /> <span className="flex-1">{t(`modes.${m}`)}</span>
              {mode === m ? <Check aria-label={t('selected')} /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
