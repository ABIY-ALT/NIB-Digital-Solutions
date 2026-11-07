'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { humanize, parseAction } from '../lib/audit-display';

/** "ROLE_UPDATE_REQUESTED" → "Role updated (submitted for approval)", translated when known. */
export function useActionLabel() {
  const t = useTranslations('audit');
  return useCallback(
    (action: string) => {
      const { base, requested } = parseAction(action);
      const label = t.has(`actions.${base}`) ? t(`actions.${base}`) : humanize(base);
      return requested ? t('requestedAction', { action: label }) : label;
    },
    [t],
  );
}

/** Field name → translated label ("passwordHash" → "Password"), humanized when unknown. */
export function useFieldLabel() {
  const t = useTranslations('audit.fields');
  return useCallback((field: string) => (t.has(field) ? t(field) : humanize(field)), [t]);
}
