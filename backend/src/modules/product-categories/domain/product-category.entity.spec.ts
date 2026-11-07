import { describe, expect, it } from 'vitest';
import { ProductCategory } from './product-category.entity.js';

describe('ProductCategory', () => {
  it('creates a valid product category', () => {
    const entity = ProductCategory.create(
      {
        code: 'Sample Code',
        name: 'Sample Name',
        description: 'Details',
        icon: 'Sample Icon',
        sortOrder: 1,
      },
      'tester',
    );
    expect(entity.version).toBe(1);
    expect(entity.createdBy).toBe('tester');
  });

  it('requires code', () => {
    expect(() =>
      ProductCategory.create(
        {
          ...{
            code: 'Sample Code',
            name: 'Sample Name',
            description: 'Details',
            icon: 'Sample Icon',
            sortOrder: 1,
          },
          code: '  ',
        },
        null,
      ),
    ).toThrow();
  });
});
