import { describe, expect, it } from 'vitest';
import { sniffImageType } from './media.service.js';

describe('image sniffing', () => {
  it('recognises images by their bytes, not their name', () => {
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
      'image/png',
    );
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
  });
});
