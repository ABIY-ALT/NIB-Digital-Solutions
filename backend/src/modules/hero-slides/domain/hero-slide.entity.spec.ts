import { describe, expect, it } from 'vitest';
import { ValidationError } from '#core/domain/errors/app-error.js';
import { HeroSlide, isSafeHref, type HeroSlideInput } from './hero-slide.entity.js';

const DESKTOP = '0190f3a2-7b1c-7d2e-8f3a-1b2c3d4e5f60';
const MOBILE = '0190f3a2-7b1c-7d2e-8f3a-1b2c3d4e5f61';

const valid: HeroSlideInput = {
  title: 'Run your institution from one screen',
  description: 'Fees, rent and savings collected through NIB channels.',
  ctaLabel: 'Explore products',
  ctaHref: '/products?category=business-management',
  desktopImageId: DESKTOP,
  mobileImageId: MOBILE,
  altText: 'A specialist presenting school and building products',
  sortOrder: 1,
  active: true,
};

const issuesOf = (input: HeroSlideInput): string[] => {
  try {
    HeroSlide.create(input, null);
    return [];
  } catch (e) {
    if (e instanceof ValidationError && Array.isArray(e.details))
      return e.details.map((d) => d.field);
    throw e;
  }
};

describe('HeroSlide', () => {
  it('creates a valid hero slide', () => {
    const entity = HeroSlide.create(valid, 'tester');
    expect(entity.version).toBe(1);
    expect(entity.createdBy).toBe('tester');
    expect(entity.ctaHref).toBe('/products?category=business-management');
  });

  it('accepts an image-only slide (all text optional)', () => {
    const entity = HeroSlide.create({ desktopImageId: DESKTOP }, null);
    expect(entity.title).toBeNull();
    expect(entity.ctaLabel).toBeNull();
    expect(entity.mobileImageId).toBeNull();
    expect(entity.active).toBe(false);
  });

  it('requires the desktop image', () => {
    expect(issuesOf({ ...valid, desktopImageId: '  ' })).toContain('desktopImageId');
  });

  it('only accepts uploaded media ids for images', () => {
    expect(issuesOf({ ...valid, desktopImageId: 'https://example.com/a.png' })).toContain(
      'desktopImageId',
    );
    expect(issuesOf({ ...valid, mobileImageId: 'not-an-id' })).toContain('mobileImageId');
  });

  it('needs both the button text and its destination, or neither', () => {
    expect(issuesOf({ ...valid, ctaHref: null })).toContain('ctaHref');
    expect(issuesOf({ ...valid, ctaLabel: null })).toContain('ctaLabel');
    expect(issuesOf({ ...valid, ctaLabel: null, ctaHref: null })).toEqual([]);
  });

  it('refuses unsafe or invalid button destinations', () => {
    for (const href of [
      'javascript:alert(1)',
      'data:text/html,x',
      '//evil.example',
      'http://example.com',
      'products',
      '/a b',
    ]) {
      expect(issuesOf({ ...valid, ctaHref: href }), href).toContain('ctaHref');
    }
  });

  it('refuses a negative position', () => {
    expect(issuesOf({ ...valid, sortOrder: -1 })).toContain('sortOrder');
  });

  it('keeps the version-checked update path', () => {
    const entity = HeroSlide.create(valid, 'maker');
    entity.update({ active: false, sortOrder: 4 }, 'editor');
    expect(entity.active).toBe(false);
    expect(entity.sortOrder).toBe(4);
    expect(entity.desktopImageId).toBe(DESKTOP);
  });
});

describe('isSafeHref', () => {
  it('allows site paths, anchors and https addresses', () => {
    for (const href of ['/products', '/products?category=a,b', '#contact', 'https://nibbanksc.com'])
      expect(isSafeHref(href), href).toBe(true);
  });
});
