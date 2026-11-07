'use client';

import { Check, History, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { cn } from '@/shared/lib/cn';
import {
  DEFAULT_PASSWORD_RULES,
  evaluatePasswordRules,
  passwordStrength,
  type PasswordRulesConfig,
} from '@/shared/lib/password-rules';

const STRENGTH_TONE = ['bg-border', 'bg-danger', 'bg-warning', 'bg-info', 'bg-success'] as const;

/**
 * Live password policy checklist + strength meter. Rules come from the
 * backend policy (GET /auth/password-policy), so products changing the policy
 * in configuration automatically get a matching UI.
 */
export function PasswordChecklist({
  value,
  rules = DEFAULT_PASSWORD_RULES,
  personal = [],
  historyCount,
  className,
}: Readonly<{
  value: string;
  rules?: PasswordRulesConfig;
  /** Name, username, e-mail: the password must not contain them. */
  personal?: Array<string | null | undefined>;
  /** Shown as an extra (server-checked) rule when > 0. */
  historyCount?: number;
  className?: string;
}>) {
  const t = useTranslations('passwordRules');
  const states = evaluatePasswordRules(value, rules, personal);
  const strength = passwordStrength(value);
  return (
    <div className={cn('rounded-surface border border-border bg-muted/40 p-3', className)}>
      <div className="mb-2.5 flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden>
          {[1, 2, 3, 4].map((step) => (
            <span
              key={step}
              className={cn(
                'h-1.5 flex-1 rounded-pill transition-colors',
                strength >= step ? STRENGTH_TONE[strength] : 'bg-border',
              )}
            />
          ))}
        </div>
        <span className="min-w-16 text-end text-[11px] font-semibold text-muted-foreground">
          {t(`strength.${strength}`)}
        </span>
      </div>
      <ul className="grid gap-1 sm:grid-cols-2" aria-label={t('title')}>
        {states.map((s) => (
          <li
            key={s.id}
            className={cn(
              'flex items-center gap-1.5 text-xs transition-colors',
              s.met ? 'text-success' : 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded-full [&_svg]:size-3',
                s.met ? 'bg-success-soft' : 'bg-muted',
              )}
            >
              {s.met ? <Check aria-hidden /> : <X aria-hidden />}
            </span>
            <span>{t(`rules.${s.id}`, { min: rules.minLength })}</span>
            <span className="sr-only">{s.met ? t('met') : t('notMet')}</span>
          </li>
        ))}
        {historyCount ? (
          <li className="flex items-center gap-1.5 text-xs text-muted-foreground sm:col-span-2">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted [&_svg]:size-3">
              <History aria-hidden />
            </span>
            {t('rules.NOT_REUSED', { count: historyCount + 1 })}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** Translates server-side policy violations (issue.code = rule id) for applyServerError. */
export function usePasswordIssueTranslator() {
  const t = useTranslations('passwordRules');
  return useCallback(
    (issue: { code?: string }) =>
      issue.code && t.has(`violations.${issue.code}`) ? t(`violations.${issue.code}`) : undefined,
    [t],
  );
}
