import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/shared/lib/cn';

/** Product mark: the configured logo, or a gold tile with the product initials. */
export function BrandMark({
  short,
  logo,
  size = 32,
  className,
}: Readonly<{
  short: string;
  logo?: string;
  size?: number;
  className?: string;
}>) {
  if (logo) {
    return (
      <Image
        src={logo}
        alt=""
        width={size}
        height={size}
        priority
        className={cn(
          'shrink-0 object-contain drop-shadow-[0_2px_6px_rgb(138_77_33/0.14)]',
          className,
        )}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-control bg-primary text-sm font-black text-primary-foreground',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {short.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Logo + product name + brown tagline (NIB IB brand block). */
export function Brand({
  name,
  short,
  tagline,
  logo,
  href,
}: Readonly<{
  name: string;
  short: string;
  tagline?: string;
  logo?: string;
  href: string;
}>) {
  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-3 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <BrandMark short={short} logo={logo} size={36} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[15px] font-bold tracking-[-0.015em] text-foreground">
          {name}
        </span>
        {tagline ? (
          <span className="truncate text-[11.5px] font-semibold tracking-[0.02em] text-secondary">
            {tagline}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
