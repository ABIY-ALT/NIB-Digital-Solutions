'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Per-browser table preferences (hidden columns), keyed by table id.
 * Non-sensitive UI state only — never put user data or tokens here.
 */
interface TablePrefsState {
  hidden: Record<string, string[]>;
  setHidden: (tableId: string, columns: string[]) => void;
}

export const useTablePrefs = create<TablePrefsState>()(
  persist(
    (set) => ({
      hidden: {},
      setHidden: (tableId, columns) =>
        set((s) => ({ hidden: { ...s.hidden, [tableId]: columns } })),
    }),
    // skipHydration: the server render has no storage; the table rehydrates after mount.
    {
      name: 'appcore.table-prefs',
      version: 1,
      storage: createJSONStorage(() => window.localStorage),
      skipHydration: true,
    },
  ),
);
