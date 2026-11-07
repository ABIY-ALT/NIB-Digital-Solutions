'use client';

import { create } from 'zustand';
import { SIDEBAR_COOKIE } from '@/shared/layouts/constants';

/**
 * Lightweight global CLIENT state (Zustand): UI preferences and open panels.
 * Server data (including notifications) belongs in TanStack Query, never here.
 */

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  density: 'compact' | 'default' | 'comfortable' | null;
  openPanels: Record<string, boolean>;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  setDensity: (density: UiState['density']) => void;
  setPanelOpen: (panel: string, open: boolean) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  density: null,
  openPanels: {},

  toggleSidebar: () =>
    set((s) => {
      persistSidebar(!s.sidebarCollapsed);
      return { sidebarCollapsed: !s.sidebarCollapsed };
    }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
  setDensity: (density) => set({ density }),
  setPanelOpen: (panel, open) => set((s) => ({ openPanels: { ...s.openPanels, [panel]: open } })),
}));

/** Sidebar preference is kept in a (non-sensitive) cookie so the server renders it correctly. */
function persistSidebar(collapsed: boolean): void {
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
}
