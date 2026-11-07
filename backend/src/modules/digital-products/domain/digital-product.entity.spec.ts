import { describe, expect, it } from 'vitest';
import { DigitalProduct, type DigitalProductInput } from './digital-product.entity.js';

const valid: DigitalProductInput = {
  slug: 'school-management-system',
  name: 'School Management System',
  summary: 'An all-in-one platform for schools.',
  categoryCode: 'business-management',
  status: 'published',
  availability: 'available',
  industries: ['education'],
  keyFeatures: ['Online admissions', ' Online admissions ', 'Digital fee collection'],
  accent: '#3B6FE0',
};

describe('DigitalProduct', () => {
  it('creates a valid product and de-duplicates lists', () => {
    const p = DigitalProduct.create(valid, 'tester');
    expect(p.version).toBe(1);
    expect(p.createdBy).toBe('tester');
    expect(p.keyFeatures).toEqual(['Online admissions', 'Digital fee collection']);
    expect(p.isPublished).toBe(true);
  });

  it('rejects malformed slugs, unknown vocabularies and bad colours', () => {
    expect(() => DigitalProduct.create({ ...valid, slug: 'School System' }, null)).toThrow();
    expect(() => DigitalProduct.create({ ...valid, status: 'live' }, null)).toThrow();
    expect(() =>
      DigitalProduct.create({ ...valid, industries: ['space travel!'] }, null),
    ).toThrow();
    // Codes are normalised to lower case (reference-data codes are upper case).
    expect(DigitalProduct.create({ ...valid, industries: ['EDUCATION'] }, null).industries).toEqual(
      ['education'],
    );
    expect(() => DigitalProduct.create({ ...valid, accent: 'blue' }, null)).toThrow();
  });

  it('requires an industry and a key feature to publish, not to draft', () => {
    expect(() => DigitalProduct.create({ ...valid, industries: [] }, null)).toThrow();
    expect(() =>
      DigitalProduct.create({ ...valid, status: 'draft', industries: [], keyFeatures: [] }, null),
    ).not.toThrow();
  });

  it('trims documentation and drops empty sections', () => {
    const p = DigitalProduct.create(
      {
        ...valid,
        documentation: [
          { title: ' Onboarding ', body: 'Setup steps' },
          { title: '', body: '' },
        ],
      },
      null,
    );
    expect(p.documentation).toEqual([{ title: 'Onboarding', body: 'Setup steps' }]);
  });

  it('bounds the size of page content', () => {
    const huge = { modules: [{ name: 'x', description: 'y'.repeat(250_000), features: [] }] };
    expect(() => DigitalProduct.create({ ...valid, content: huge }, null)).toThrow();
  });
});
