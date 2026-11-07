'use client';

import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from 'input-otp';
import { cn } from '@/shared/lib/cn';
import { keyed } from '@/shared/lib/keys';
import { fieldShellVariants, useFieldAppearance } from './input';

/** Accessible one-time-code input (MFA). Supports paste and SMS autofill. */
export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled,
  invalid,
  autoFocus,
  onComplete,
  'aria-label': ariaLabel,
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  onComplete?: (value: string) => void;
  'aria-label'?: string;
}>) {
  return (
    <OTPInput
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      maxLength={length}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid}
      containerClassName="flex items-center justify-center gap-2 has-[:disabled]:opacity-60"
      render={({ slots }) => (
        <div className="flex gap-2" dir="ltr">
          {/* A slot is a digit position: "digit", "digit~1", … */}
          {keyed(slots, () => 'digit').map(({ key, item: slot }) => (
            <Slot key={key} {...slot} invalid={invalid} />
          ))}
        </div>
      )}
    />
  );
}

function Slot({ char, isActive, hasFakeCaret, invalid }: SlotProps & { invalid?: boolean }) {
  const appearance = useFieldAppearance();
  return (
    <div
      className={cn(
        fieldShellVariants({ appearance, open: isActive }),
        'relative flex size-11 items-center justify-center text-lg font-semibold tabular',
        invalid && 'border-danger',
      )}
    >
      {char}
      {hasFakeCaret ? (
        <span className="absolute h-5 w-px animate-pulse bg-foreground" aria-hidden />
      ) : null}
    </div>
  );
}
