import { describe, expect, it } from 'vitest';
import { DEFAULT_SURFACE_SETTINGS, resolveSurface, type SurfaceSettings } from './surface';

const settings = (patch: Partial<SurfaceSettings> = {}): SurfaceSettings => ({
  ...DEFAULT_SURFACE_SETTINGS,
  ...patch,
});

describe('resolveSurface', () => {
  it('uses the product defaults', () => {
    expect(resolveSurface(settings())).toEqual({
      surface: 'dialog',
      side: 'end',
      closeOnOutsideClick: false,
      maxColumns: 2,
    });
  });

  it('caps fields per row at the product setting unless the form asks otherwise', () => {
    expect(resolveSurface(settings({ maxColumns: 1 })).maxColumns).toBe(1);
    expect(resolveSurface(settings(), { maxColumns: 3 }).maxColumns).toBe(3);
  });

  it('lets the user preference beat the product default', () => {
    expect(resolveSurface(settings({ userPreference: 'drawer' }), { id: 'users' }).surface).toBe(
      'drawer',
    );
  });

  it('lets a per-form override beat the user preference', () => {
    const s = settings({ userPreference: 'drawer', overrides: { roles: 'dialog' } });
    expect(resolveSurface(s, { id: 'roles' }).surface).toBe('dialog');
    expect(resolveSurface(s, { id: 'users' }).surface).toBe('drawer');
  });

  it('lets the form pin its surface over everything', () => {
    const s = settings({ surface: 'drawer', userPreference: 'drawer', overrides: { x: 'drawer' } });
    expect(resolveSurface(s, { id: 'x', surface: 'dialog' }).surface).toBe('dialog');
  });

  it('takes side and outside-click behaviour from the request, then the settings', () => {
    const s = settings({ drawerSide: 'start', closeOnOutsideClick: true });
    expect(resolveSurface(s)).toMatchObject({ side: 'start', closeOnOutsideClick: true });
    expect(resolveSurface(s, { side: 'end', closeOnOutsideClick: false })).toMatchObject({
      side: 'end',
      closeOnOutsideClick: false,
    });
  });
});
