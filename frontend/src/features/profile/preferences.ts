import { z } from 'zod';

/**
 * Per-user display preferences. They override the product theme's density and
 * font scale (see app/layout.tsx), so the configurable theme tokens are also
 * adjustable by each user.
 */
export const PREFERENCES_COOKIE = 'appcore.prefs';

export const preferencesSchema = z.object({
  density: z.enum(['compact', 'default', 'comfortable']).optional(),
  fontScale: z.enum(['sm', 'md', 'lg']).optional(),
  /** Where create / edit forms open (when the product allows the choice). */
  formSurface: z.enum(['dialog', 'drawer']).optional(),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export function parsePreferences(raw: string | undefined): Preferences {
  if (!raw) return {};
  try {
    const result = preferencesSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}
