import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button, buttonVariants } from './button';
import { fieldShellVariants, fieldVariants, Input, Textarea } from './input';
import { DEFAULT_UI_SETTINGS, UiSettingsProvider, type ControlSettings } from './ui-settings';

const render = (node: ReactElement, controls?: ControlSettings) =>
  renderToStaticMarkup(
    controls
      ? createElement(UiSettingsProvider, {
          settings: { ...DEFAULT_UI_SETTINGS, controls },
          children: node,
        })
      : node,
  );

describe('button appearances', () => {
  it('defaults to solid', () => {
    expect(buttonVariants()).toContain('bg-primary ');
    expect(render(createElement(Button, null, 'Save'))).toContain('bg-primary ');
  });

  it.each([
    ['soft', 'bg-primary-soft'],
    ['outline', 'border-primary'],
    ['elevated', 'shadow-raised'],
  ] as const)('draws the primary button as %s', (appearance, marker) => {
    expect(buttonVariants({ appearance })).toContain(marker);
  });

  it('leaves neutral variants alone', () => {
    for (const variant of ['outline', 'ghost', 'subtle', 'link'] as const) {
      expect(buttonVariants({ variant, appearance: 'soft' })).toBe(
        buttonVariants({ variant, appearance: 'solid' }),
      );
    }
  });

  it('follows the product setting unless the button pins its own', () => {
    const controls: ControlSettings = { button: 'soft', field: 'outline' };
    expect(render(createElement(Button, null, 'Save'), controls)).toContain('bg-primary-soft');
    const pinned = render(createElement(Button, { appearance: 'solid' }, 'Save'), controls);
    expect(pinned).not.toContain('bg-primary-soft');
  });
});

describe('field appearances', () => {
  it('gives each appearance its own surface', () => {
    expect(fieldVariants()).toContain('border-input bg-surface');
    expect(fieldVariants({ appearance: 'filled' })).toContain('bg-muted');
    expect(fieldVariants({ appearance: 'underline' })).toContain('border-b');
    expect(fieldVariants({ appearance: 'underline' })).not.toContain('rounded-control');
  });

  it('keeps the focus look on an open shell', () => {
    expect(fieldShellVariants({ appearance: 'outline', open: true })).toContain('ring-primary');
    expect(fieldShellVariants({ appearance: 'underline', open: true })).not.toContain('ring-1');
  });

  it('follows the product setting unless the field pins its own', () => {
    const controls: ControlSettings = { button: 'solid', field: 'filled' };
    expect(render(createElement(Input), controls)).toContain('bg-muted');
    expect(render(createElement(Textarea), controls)).toContain('bg-muted');
    expect(render(createElement(Input, { appearance: 'underline' }), controls)).toContain(
      'border-b',
    );
  });
});
