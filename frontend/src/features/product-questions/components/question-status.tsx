'use client';

import { useTranslations } from 'next-intl';
import { Badge, type BadgeTone } from '@/shared/ui/badge';
import type { QuestionStatus } from '../types';

export const QUESTION_STATUSES: QuestionStatus[] = ['open', 'in_progress', 'answered', 'closed'];

const TONE: Record<QuestionStatus, BadgeTone> = {
  open: 'warning',
  in_progress: 'info',
  answered: 'success',
  closed: 'neutral',
};

export function QuestionStatusBadge({ status }: { status: QuestionStatus }) {
  const t = useTranslations('productQuestions.statuses');
  return (
    <Badge tone={TONE[status]} dot>
      {t(status)}
    </Badge>
  );
}
