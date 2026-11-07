'use client';

import { createContext, useContext, type ReactNode } from 'react';
// Types only: surface.tsx depends on this module, never the other way round.
import type { SurfaceSettings } from './surface';

/**
 * Interaction settings shared by every feature, from app.config `ui` (plus
 * per-user preferences where allowed). One provider for all of them; add a
 * section here instead of a new provider.
 *
 *   const { search } = useUiSettings();
 */
export type SearchMode = 'submit' | 'live';

export interface SearchSettings {
  /** "submit": query on the search button (or Enter) · "live": query while typing (debounced). */
  mode: SearchMode;
  /** In submit mode, Enter also runs the search. */
  submitOnEnter: boolean;
  /** Debounce for live mode (ms). */
  liveDelayMs: number;
  /** Shortest query sent to the backend (clearing is always allowed). */
  minLength: number;
}

export type LoaderVariant = 'ring' | 'comet' | 'dots' | 'bars' | 'orbit' | 'pulse';
export type LoaderTone = 'brand' | 'primary' | 'current' | 'muted';

export interface LoadingSettings {
  variant: LoaderVariant;
  tone: LoaderTone;
  /** Show a loader only after this long (no flash on fast responses). */
  delayMs: number;
  /** Keep a shown loader at least this long (no flicker). */
  minDurationMs: number;
  /** Top progress bar during page navigation. */
  routeProgress: boolean;
}

export type ButtonAppearance = 'solid' | 'soft' | 'outline' | 'elevated';
export type FieldAppearance = 'outline' | 'filled' | 'underline';

export interface ControlSettings {
  /** Look of coloured buttons (primary, secondary, danger). */
  button: ButtonAppearance;
  /** Look of text fields, selects and pickers. */
  field: FieldAppearance;
}

export interface PaginationSettings {
  /** Rows per page when neither the URL nor the list says otherwise. */
  pageSize: number;
  /** Choices in the rows-per-page select. */
  pageSizeOptions: number[];
  /** Largest page a URL may ask for. */
  maxPageSize: number;
  showPageSize: boolean;
  /** Jump-to-first / jump-to-last buttons. */
  showFirstLast: boolean;
  /** Page numbers shown on each side of the current page. */
  siblings: number;
}

export interface TableExpansionSettings {
  /** "multiple": any number of rows open · "single": opening one closes the others. */
  mode: 'multiple' | 'single';
  /** Header button that expands / collapses every row of the page. */
  expandAll: boolean;
  /** Clicking anywhere on a row toggles it. */
  expandOnRowClick: boolean;
}

export interface TableSettings {
  /** Defaults of <DataTable expansion> (master–detail rows). */
  expansion: TableExpansionSettings;
}

export interface UiSettings {
  forms: SurfaceSettings;
  search: SearchSettings;
  loading: LoadingSettings;
  controls: ControlSettings;
  pagination: PaginationSettings;
  tables: TableSettings;
}

export const DEFAULT_SURFACE_SETTINGS: SurfaceSettings = {
  surface: 'dialog',
  drawerSide: 'end',
  overrides: {},
  closeOnOutsideClick: false,
  maxColumns: 2,
};

export const DEFAULT_SEARCH_SETTINGS: SearchSettings = {
  mode: 'submit',
  submitOnEnter: true,
  liveDelayMs: 350,
  minLength: 0,
};

export const DEFAULT_LOADING_SETTINGS: LoadingSettings = {
  variant: 'ring',
  tone: 'brand',
  delayMs: 150,
  minDurationMs: 400,
  routeProgress: true,
};

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  button: 'solid',
  field: 'outline',
};

export const DEFAULT_PAGINATION_SETTINGS: PaginationSettings = {
  pageSize: 20,
  pageSizeOptions: [10, 20, 50, 100],
  maxPageSize: 100,
  showPageSize: true,
  showFirstLast: true,
  siblings: 1,
};

export const DEFAULT_TABLE_SETTINGS: TableSettings = {
  expansion: { mode: 'multiple', expandAll: true, expandOnRowClick: false },
};

export const DEFAULT_UI_SETTINGS: UiSettings = {
  forms: DEFAULT_SURFACE_SETTINGS,
  search: DEFAULT_SEARCH_SETTINGS,
  loading: DEFAULT_LOADING_SETTINGS,
  controls: DEFAULT_CONTROL_SETTINGS,
  pagination: DEFAULT_PAGINATION_SETTINGS,
  tables: DEFAULT_TABLE_SETTINGS,
};

const UiSettingsContext = createContext<UiSettings>(DEFAULT_UI_SETTINGS);

export function UiSettingsProvider({
  settings,
  children,
}: Readonly<{
  settings: UiSettings;
  children: ReactNode;
}>) {
  return <UiSettingsContext.Provider value={settings}>{children}</UiSettingsContext.Provider>;
}

export function useUiSettings(): UiSettings {
  return useContext(UiSettingsContext);
}
