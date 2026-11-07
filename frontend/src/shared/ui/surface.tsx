'use client';

import { useUiSettings } from './ui-settings';

export { DEFAULT_SURFACE_SETTINGS } from './ui-settings';

/**
 * Surface settings: where forms (and other editors) open — a centred modal
 * ("dialog") or a side panel ("drawer"). The product sets defaults in
 * app.config.ts (`ui.forms`), each user may override the default in
 * Preferences, and single forms can be pinned by id or by prop.
 *
 *   resolveSurface(settings, { id: 'users' })              → 'dialog' | 'drawer'
 *   const { surface, side } = useSurface({ id: 'users' })  (inside components)
 */
export type SurfaceKind = 'dialog' | 'drawer';
export type DrawerSide = 'start' | 'end';

export interface SurfaceSettings {
  /** Product default. */
  surface: SurfaceKind;
  drawerSide: DrawerSide;
  /** Product decisions per form id; they beat the user's preference. */
  overrides: Readonly<Record<string, SurfaceKind>>;
  /** The signed-in user's choice (only set when the product allows it). */
  userPreference?: SurfaceKind;
  closeOnOutsideClick: boolean;
  /** Most fields per row in a form surface (FormGrid is capped to it). */
  maxColumns: FormColumns;
}

export type FormColumns = 1 | 2 | 3 | 4;

export interface SurfaceRequest {
  /** Stable form id for overrides, e.g. "users", "reference-data.items". */
  id?: string;
  /** Pins the surface (the form needs it); beats every setting. */
  surface?: SurfaceKind;
  side?: DrawerSide;
  closeOnOutsideClick?: boolean;
  /** Allow more (or fewer) fields per row than the product setting, for this form only. */
  maxColumns?: FormColumns;
}

export interface ResolvedSurface {
  surface: SurfaceKind;
  side: DrawerSide;
  closeOnOutsideClick: boolean;
  maxColumns: FormColumns;
}

/** Precedence: prop › overrides[id] › user preference › product default. */
export function resolveSurface(
  settings: SurfaceSettings,
  request: SurfaceRequest = {},
): ResolvedSurface {
  const byId = request.id ? settings.overrides[request.id] : undefined;
  return {
    surface: request.surface ?? byId ?? settings.userPreference ?? settings.surface,
    side: request.side ?? settings.drawerSide,
    closeOnOutsideClick: request.closeOnOutsideClick ?? settings.closeOnOutsideClick,
    maxColumns: request.maxColumns ?? settings.maxColumns,
  };
}

export function useSurface(request: SurfaceRequest = {}): ResolvedSurface {
  return resolveSurface(useUiSettings().forms, request);
}
