import type { Metadata } from 'next';
import { requireUser } from '@/features/auth/api/session';
import { HeroSlidesPage } from '@/features/hero-slides/components/hero-slides-page';

export const metadata: Metadata = { title: 'Hero carousel' };

export default async function Page() {
  await requireUser({ permission: 'hero-slides:read' });
  return <HeroSlidesPage />;
}
