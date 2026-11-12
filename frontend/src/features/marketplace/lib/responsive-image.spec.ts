import { describe, expect, it } from 'vitest';
import { responsiveImage } from './responsive-image';

const MEDIA = '/api/marketplace/media/01a1ad40-d4f6-763c-9c08-8d179ce77e4c';

describe('responsiveImage', () => {
  it('offers optimizer widths for an uploaded image, with the sizes hint', () => {
    const img = responsiveImage(MEDIA, 'calc(100vw - 32px)');
    expect(img.sizes).toBe('calc(100vw - 32px)');
    expect(img.srcSet).toContain(`/_next/image?url=${encodeURIComponent(MEDIA)}&w=640&q=75 640w`);
    // Several candidates, so the browser can pick the one the screen needs.
    expect(img.srcSet!.split(', ').length).toBeGreaterThan(3);
    expect(img.src.startsWith('/_next/image?url=')).toBe(true);
  });

  it('leaves any other address untouched', () => {
    expect(responsiveImage('https://cdn.example.com/a.jpg', '100vw')).toEqual({
      src: 'https://cdn.example.com/a.jpg',
    });
  });
});
