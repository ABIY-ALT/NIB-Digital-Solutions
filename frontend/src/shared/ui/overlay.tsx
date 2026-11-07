'use client';

import { X } from 'lucide-react';
import { AlertDialog as AlertPrimitive, Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Button } from './button';

/** Dialogs (modals), drawers (side sheets) and confirmation dialogs — Radix-based, focus-trapped. */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const overlayClass =
  'fixed inset-0 z-50 bg-black/45 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0';

/**
 * Surface widths — one scale for modals and side panels (both shrink to the
 * viewport on small screens):
 *
 *   size   modal     side panel   typical use
 *   sm     448px     384px        confirmations, short prompts
 *   md     576px     448px        single-column forms
 *   lg     768px     576px        two-column forms
 *   xl     880px     768px        three-column forms, detail views
 *   2xl    1152px    1024px       wide editors, side-by-side panes
 *   full   viewport  viewport     large tables, previews
 *
 * Pair with <FormGrid columns={…}> so fields reflow to the width actually available.
 */
const dialogSizes = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-[880px]',
  '2xl': 'max-w-6xl',
  full: 'max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-4rem)]',
} as const;

const drawerSizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-5xl',
  full: 'max-w-[calc(100vw-3rem)]',
} satisfies Record<keyof typeof dialogSizes, string>;

export type DialogSize = keyof typeof dialogSizes;
export type SurfaceTone = 'primary' | 'danger';

/** Props shared by modals and side panels (and FormSurface, which picks one). */
export interface SurfaceContentProps extends Omit<
  ComponentProps<typeof DialogPrimitive.Content>,
  'title'
> {
  title: ReactNode;
  description?: ReactNode;
  size?: DialogSize;
  /** Actions pinned under the scrolling body. */
  footer?: ReactNode;
  /** Colour of the IB-style accent bar at the top. */
  tone?: SurfaceTone;
  /** Icon shown in a tinted square next to the title (IB modal header). */
  icon?: ReactNode;
  /** Overrides the icon square's tint (e.g. a category colour). */
  iconClassName?: string;
  /** Replaces the default scrolling body padding (e.g. for panes that scroll themselves). */
  bodyClassName?: string;
  /** Extra header content before the close button (e.g. a status badge). */
  headerActions?: ReactNode;
}

export type DialogContentProps = SurfaceContentProps;

/** IB modal footer: right-aligned actions over a hairline. Use inside forms that span body + footer. */
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-surface px-6 pt-3 pb-4 max-sm:px-4 max-sm:[&>button]:flex-1',
        className,
      )}
      {...props}
    />
  );
}

type ChromeProps = Pick<
  SurfaceContentProps,
  | 'title'
  | 'description'
  | 'tone'
  | 'icon'
  | 'iconClassName'
  | 'headerActions'
  | 'footer'
  | 'bodyClassName'
  | 'children'
>;

/** Accent bar, icon, title, description, close button, body and footer — identical in modals and panels. */
function SurfaceChrome({
  title,
  description,
  tone = 'primary',
  icon,
  iconClassName,
  headerActions,
  footer,
  bodyClassName,
  children,
}: Readonly<ChromeProps>) {
  return (
    <>
      <div
        className={cn('h-[3px] shrink-0', tone === 'danger' ? 'bg-danger' : 'bg-primary')}
        aria-hidden
      />
      <div className="flex shrink-0 items-start justify-between gap-3 px-6 pt-5 pb-4 max-sm:px-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {icon ? (
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-control [&_svg]:size-[18px]',
                tone === 'danger'
                  ? 'bg-danger-soft text-danger'
                  : 'bg-primary-soft text-primary-text',
                iconClassName,
              )}
              aria-hidden
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-lg leading-snug font-semibold">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description
              className={
                description ? 'mt-0.5 text-xs leading-snug text-muted-foreground' : 'sr-only'
              }
            >
              {description ?? (typeof title === 'string' ? title : '')}
            </DialogPrimitive.Description>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerActions}
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X />
            </Button>
          </DialogPrimitive.Close>
        </div>
      </div>
      <div
        className={cn(
          'scrollbar-thin min-h-0 flex-1',
          bodyClassName ?? 'overflow-y-auto px-6 pb-5 max-sm:px-4',
        )}
      >
        {children}
      </div>
      {footer ? <DialogFooter>{footer}</DialogFooter> : null}
    </>
  );
}

/** Centred modal. */
export function DialogContent({
  title,
  description,
  size = 'md',
  footer,
  tone,
  icon,
  iconClassName,
  bodyClassName,
  headerActions,
  className,
  children,
  ...props
}: Readonly<SurfaceContentProps>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        data-surface="dialog"
        className={cn(
          'fixed start-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-surface border border-border bg-surface shadow-overlay outline-none rtl:translate-x-1/2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          dialogSizes[size],
          className,
        )}
        {...props}
      >
        <SurfaceChrome
          {...{
            title,
            description,
            tone,
            icon,
            iconClassName,
            headerActions,
            footer,
            bodyClassName,
          }}
        >
          {children}
        </SurfaceChrome>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Drawer / side panel: full height, slides in from the start or end edge. */
export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;

export interface DrawerContentProps extends SurfaceContentProps {
  /** "end" = right in LTR (left in RTL). */
  side?: 'start' | 'end';
}

export function DrawerContent({
  title,
  description,
  size = 'md',
  footer,
  tone,
  icon,
  iconClassName,
  bodyClassName,
  headerActions,
  side = 'end',
  className,
  children,
  ...props
}: Readonly<DrawerContentProps>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        data-surface="drawer"
        data-side={side}
        className={cn(
          'fixed inset-y-0 z-50 flex w-full flex-col border-border bg-surface shadow-overlay outline-none data-[state=closed]:animate-out data-[state=open]:animate-in',
          side === 'end'
            ? 'end-0 border-s data-[state=open]:slide-in-from-right rtl:data-[state=open]:slide-in-from-left'
            : 'start-0 border-e data-[state=open]:slide-in-from-left rtl:data-[state=open]:slide-in-from-right',
          drawerSizes[size],
          className,
        )}
        {...props}
      >
        <SurfaceChrome
          {...{
            title,
            description,
            tone,
            icon,
            iconClassName,
            headerActions,
            footer,
            bodyClassName,
          }}
        >
          {children}
        </SurfaceChrome>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  /** Extra content under the description (e.g. a "reason for the change" field). */
  children?: ReactNode;
}

/** Confirmation for destructive or important actions (role="alertdialog"). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  loading,
  onConfirm,
  children,
}: Readonly<ConfirmDialogProps>) {
  return (
    <AlertPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className={overlayClass} />
        <AlertPrimitive.Content className="fixed start-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-surface border border-border bg-surface shadow-overlay rtl:translate-x-1/2 data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <div
            className={cn('h-[3px]', tone === 'danger' ? 'bg-danger' : 'bg-primary')}
            aria-hidden
          />
          <div className="p-6">
            <AlertPrimitive.Title className="text-lg font-semibold">{title}</AlertPrimitive.Title>
            <AlertPrimitive.Description className="mt-2 text-sm text-muted-foreground">
              {description}
            </AlertPrimitive.Description>
            {children ? <div className="mt-4 space-y-3">{children}</div> : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-surface-muted px-6 py-3">
            <AlertPrimitive.Cancel asChild>
              <Button variant="outline" disabled={loading}>
                {cancelLabel}
              </Button>
            </AlertPrimitive.Cancel>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              loading={loading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
