'use client';

import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { cn } from '@/shared/lib/cn';
import { Label, Textarea } from '@/shared/ui/input';
import { useApprovalRequired } from '../hooks/use-approvals';

/**
 * Shown in forms and confirmations whose action is under maker–checker control
 * (per the live policy): explains the four-eyes step and collects the reason
 * the checker will see. Renders nothing when the action runs immediately.
 *
 *   const [reason, setReason] = useState('');
 *   <ApprovalNotice action="roles.update" reason={reason} onReasonChange={setReason} />
 *   save.mutateAsync({ id, input, reason });
 */
export function ApprovalNotice({
  action,
  reason,
  onReasonChange,
  className,
}: Readonly<{
  action: string;
  reason: string;
  onReasonChange: (reason: string) => void;
  className?: string;
}>) {
  const t = useTranslations('approval');
  const required = useApprovalRequired(action);
  const id = useId();
  if (!required) return null;
  return (
    <div
      className={cn(
        'space-y-2 rounded-surface border border-warning/40 bg-warning-soft/40 p-3',
        className,
      )}
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ShieldCheck className="size-4 shrink-0 text-warning" aria-hidden />
        {t('requiresApproval')}
      </p>
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs">
          {t('reasonLabel')}
        </Label>
        <Textarea
          id={id}
          rows={2}
          maxLength={1000}
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder={t('reasonPlaceholder')}
          aria-describedby={`${id}-hint`}
        />
        <p id={`${id}-hint`} className="text-[11px] text-muted-foreground">
          {t('reasonHint')}
        </p>
      </div>
    </div>
  );
}
