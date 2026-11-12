import { getImageProps } from 'next/image';

/** Images uploaded by staff (hero slides, product screenshots), served by the BFF. */
const MEDIA_PREFIX = '/api/marketplace/media/';

export interface ResponsiveImage {
  src: string;
  srcSet?: string;
  sizes?: string;
}

/**
 * Responsive sources for an uploaded marketplace image: a `srcset` of widths
 * from the Next.js image optimizer (AVIF or WebP, whichever the browser
 * accepts) plus the `sizes` hint, so a phone downloads a phone-sized file
 * instead of the 2400 px original. Any other URL is returned unchanged.
 *
 * `sizes` must describe the rendered width at each breakpoint; the browser
 * picks the smallest candidate that covers it at the screen's pixel density.
 */
export function responsiveImage(src: string, sizes: string): ResponsiveImage {
  if (!src.startsWith(MEDIA_PREFIX)) return { src };
  const { props } = getImageProps({ src, alt: '', fill: true, sizes });
  return { src: props.src, srcSet: props.srcSet, sizes: props.sizes };
}
