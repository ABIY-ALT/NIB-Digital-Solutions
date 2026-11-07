'use client';

import { useCallback, useMemo, useState } from 'react';

/**
 * State of a record editor on a CRUD page (which record, which mode, open or
 * not) — pairs with <FormSurface> so pages do not hand-roll it:
 *
 *   const editor = useEditor<User>();
 *   <Button onClick={editor.create}>New user</Button>
 *   rowAction: () => editor.edit(user)
 *   <UserFormDialog open={editor.open} onOpenChange={editor.onOpenChange} user={editor.record} />
 *
 * Modes beyond create/edit are free-form (`editor.openAs('clone', role)`).
 * The record is kept while closing so the surface can animate out without its
 * content changing underneath.
 */
export type EditorMode = 'create' | 'edit' | (string & {});

export interface EditorState<T, M extends string = EditorMode> {
  open: boolean;
  mode: M;
  record: T | null;
  /** True when editing an existing record. */
  isEditing: boolean;
  create: () => void;
  edit: (record: T) => void;
  openAs: (mode: M, record?: T | null) => void;
  close: () => void;
  /** For the surface's onOpenChange. */
  onOpenChange: (open: boolean) => void;
}

export function useEditor<T, M extends string = EditorMode>(): EditorState<T, M> {
  const [state, setState] = useState<{ open: boolean; mode: M; record: T | null }>({
    open: false,
    mode: 'create' as M,
    record: null,
  });

  const openAs = useCallback(
    (mode: M, record: T | null = null) => setState({ open: true, mode, record }),
    [],
  );
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  return useMemo(
    () => ({
      ...state,
      isEditing: state.mode === 'edit' && state.record !== null,
      create: () => openAs('create' as M),
      edit: (record: T) => openAs('edit' as M, record),
      openAs,
      close,
      onOpenChange: (open: boolean) => (open ? setState((s) => ({ ...s, open })) : close()),
    }),
    [state, openAs, close],
  );
}
