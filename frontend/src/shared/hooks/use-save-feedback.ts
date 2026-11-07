'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { isApprovalTicket } from '@/shared/data/approval';
import { toast } from '@/shared/ui/toaster';

/**
 * One call for mutation success feedback that understands maker–checker:
 *
 *   const feedback = useSaveFeedback();
 *   const result = await save.mutateAsync({ id, input });
 *   feedback(result, t('toast.updated', { name }));   // "Saved" or "Submitted for approval"
 *
 * Returns 'pending' when the change awaits a checker, 'saved' otherwise.
 */
export function useSaveFeedback() {
  const t = useTranslations('approval');
  const router = useRouter();
  return useCallback(
    (result: unknown, successMessage: string, description?: string): 'saved' | 'pending' => {
      if (isApprovalTicket(result)) {
        toast.info(t('submitted'), {
          description: t('submittedDescription', { summary: result.summary }),
          duration: 8_000,
          action: {
            label: t('view'),
            onClick: () => router.push(`/approvals?id=${result.approvalId}`),
          },
        });
        return 'pending';
      }
      toast.success(successMessage, description ? { description } : undefined);
      return 'saved';
    },
    [router, t],
  );
}
