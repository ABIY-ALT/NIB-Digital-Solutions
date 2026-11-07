'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Dialog, DialogContent, Drawer, DrawerContent, type SurfaceContentProps } from './overlay';
import {
  useSurface,
  type DrawerSide,
  type ResolvedSurface,
  type SurfaceKind,
  type FormColumns,
} from './surface';

/**
 * The container for create / edit forms (and any other editor): a centred
 * modal or a side panel, decided by configuration rather than by the feature.
 *
 *   <FormSurface id="users" open={editor.open} onOpenChange={editor.onOpenChange}
 *                title="Create user" icon={<UserPlus />} size="xl">
 *     <UserForm … />
 *   </FormSurface>
 *
 * Which one opens: `surface` prop › app.config `ui.forms.overrides[id]` › the
 * user's preference › `ui.forms.surface`. Both render the same header, size
 * scale and body, so forms need no changes to move between them; lay fields out
 * with <FormGrid> and they reflow to the space available. Children can read the
 * resolved surface with useFormSurface().
 */
export interface FormSurfaceProps extends Omit<SurfaceContentProps, 'children'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Stable form id for per-form configuration, e.g. "users", "reference-data.items". */
  id?: string;
  /** Pin the surface for this form (beats configuration). */
  surface?: SurfaceKind;
  /** Side panel edge (default from configuration). */
  side?: DrawerSide;
  /** Close on a click outside (default from configuration; off protects unsaved input). */
  closeOnOutsideClick?: boolean;
  /** Fields per row for this form only (default: `ui.forms.maxColumns`). */
  maxColumns?: FormColumns;
  children: ReactNode;
}

const FormSurfaceContext = createContext<(ResolvedSurface & { id?: string }) | null>(null);

/** The surface the surrounding FormSurface resolved to (null outside one). */
export function useFormSurface() {
  return useContext(FormSurfaceContext);
}

export function FormSurface({
  open,
  onOpenChange,
  id,
  surface: pinned,
  side: pinnedSide,
  closeOnOutsideClick: pinnedOutside,
  maxColumns,
  onInteractOutside,
  children,
  ...content
}: FormSurfaceProps) {
  const resolved = useSurface({
    id,
    surface: pinned,
    side: pinnedSide,
    closeOnOutsideClick: pinnedOutside,
    maxColumns,
  });
  // A stable context value: consumers re-render only when the surface really changes.
  const { surface, side, closeOnOutsideClick, maxColumns: columns } = resolved;
  const context = useMemo(
    () => ({ surface, side, closeOnOutsideClick, maxColumns: columns, id }),
    [surface, side, closeOnOutsideClick, columns, id],
  );
  const guard: SurfaceContentProps['onInteractOutside'] = (event) => {
    onInteractOutside?.(event);
    if (!resolved.closeOnOutsideClick) event.preventDefault();
  };
  const body = (
    <FormSurfaceContext.Provider value={context}>{children}</FormSurfaceContext.Provider>
  );

  return resolved.surface === 'drawer' ? (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent {...content} side={resolved.side} data-form-id={id} onInteractOutside={guard}>
        {body}
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent {...content} data-form-id={id} onInteractOutside={guard}>
        {body}
      </DialogContent>
    </Dialog>
  );
}
