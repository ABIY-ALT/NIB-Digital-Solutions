'use client';

import { Toaster as SonnerToaster } from 'sonner';

/** Toast host — mounted once in the app providers. */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      closeButton
      richColors={false}
      toastOptions={{
        classNames: {
          toast:
            'group !rounded-surface !border !border-border !bg-surface !text-foreground !shadow-overlay !font-sans',
          description: '!text-muted-foreground',
          success: '[&_[data-icon]]:!text-success',
          error: '[&_[data-icon]]:!text-danger',
          warning: '[&_[data-icon]]:!text-warning',
          info: '[&_[data-icon]]:!text-info',
        },
      }}
    />
  );
}

/** Toast API (success / error / warning / info / promise). */
export { toast } from 'sonner';
