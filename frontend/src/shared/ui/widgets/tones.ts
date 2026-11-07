/**
 * Semantic tones shared by the dashboard widgets. Every class is a theme token,
 * so a tone works in light and dark mode and follows the product's brand colours.
 */
export type WidgetTone = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';

/** Soft tile: tinted background + strong foreground (icon tiles, chips). */
export const TONE_SOFT: Record<WidgetTone, string> = {
  primary: 'bg-primary-soft text-primary-text',
  secondary: 'bg-secondary-soft text-secondary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

/** Solid fill (bars, dots). */
export const TONE_FILL: Record<WidgetTone, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

/** CSS colour for SVG strokes and fills. */
export const TONE_COLOR: Record<WidgetTone, string> = {
  primary: 'var(--chart-1)',
  secondary: 'var(--chart-2)',
  success: 'var(--success)',
  warning: 'var(--chart-5)',
  danger: 'var(--danger)',
  info: 'var(--chart-4)',
};
