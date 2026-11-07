'use client';

import { TriangleAlert } from 'lucide-react';
import {
  useEffect,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { cn } from '@/shared/lib/cn';
import { Input, type InputProps } from './input';

export interface SecretInputLabels {
  show: string;
  hide: string;
  showPassword: string;
  hidePassword: string;
  capsLock: string;
}

export interface SecretInputProps extends Omit<InputProps, 'type' | 'endAdornment'> {
  ref?: Ref<HTMLInputElement>;
  labels: SecretInputLabels;
  /**
   * "block" (banking default): browsers and password managers must never save
   * or autofill the value — it is masked with -webkit-text-security instead of
   * type="password", autofill hints are off and copy/cut are blocked.
   */
  storage?: 'block' | 'allow';
  /** Autocomplete purpose when storage is allowed. */
  purpose?: 'current' | 'new';
  startAdornment?: ReactNode;
}

/** Masks typed characters without type="password" (Chromium/WebKit). */
function useWebkitTextSecurity(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(typeof CSS !== 'undefined' && CSS.supports('-webkit-text-security', 'disc'));
  }, []);
  return supported;
}

/**
 * Password / secret field used everywhere a credential is typed (sign-in,
 * change password, administrator reset): Show/Hide toggle, Caps Lock badge
 * inside the field (no layout shift), and the no-storage behaviour above.
 */
export function SecretInput({
  labels,
  storage = 'block',
  purpose = 'current',
  className,
  onKeyDown,
  onKeyUp,
  onBlur,
  ...props
}: Readonly<SecretInputProps>) {
  const block = storage === 'block';
  const webkitMask = useWebkitTextSecurity();
  const [show, setShow] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  // Firefox has no text-security: it keeps type="password" + autocomplete="new-password".
  const maskedText = block && webkitMask && !show;

  const trackCapsLock = (e: KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState?.('CapsLock') ?? false);

  return (
    <Input
      {...props}
      {...(block
        ? {
            'data-lpignore': 'true',
            'data-1p-ignore': 'true',
            'data-form-type': 'other',
            onCopy: (e: ClipboardEvent) => e.preventDefault(),
            onCut: (e: ClipboardEvent) => e.preventDefault(),
          }
        : {})}
      onKeyDown={(e) => {
        trackCapsLock(e);
        onKeyDown?.(e);
      }}
      onKeyUp={(e) => {
        trackCapsLock(e);
        onKeyUp?.(e);
      }}
      onBlur={(e) => {
        setCapsLock(false);
        onBlur?.(e);
      }}
      type={show || maskedText ? 'text' : 'password'}
      autoComplete={autoCompleteFor(maskedText, block || purpose === 'new')}
      autoCapitalize="none"
      spellCheck={false}
      className={cn(
        capsLock ? 'pe-32' : 'pe-16',
        maskedText && '[-webkit-text-security:disc]',
        className,
      )}
      endAdornment={
        <span className="flex items-center gap-1">
          {capsLock ? (
            <output
              title={labels.capsLock}
              className="inline-flex items-center gap-1 rounded-item bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-warning"
            >
              <TriangleAlert className="size-3" aria-hidden />
              CAPS
              <span className="sr-only">{labels.capsLock}</span>
            </output>
          ) : null}
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? labels.hidePassword : labels.showPassword}
            aria-pressed={show}
            className="me-1 rounded-item px-2 py-1 text-xs font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {show ? labels.hide : labels.show}
          </button>
        </span>
      }
    />
  );
}

/** Autofill hint: none while the text is masked, else a new or the current password. */
function autoCompleteFor(maskedText: boolean, newPassword: boolean): string {
  if (maskedText) return 'off';
  return newPassword ? 'new-password' : 'current-password';
}
