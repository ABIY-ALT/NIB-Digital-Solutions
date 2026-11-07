import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ComponentGalleryPage } from '@/features/component-gallery/components/component-gallery-page';
import { isFeatureEnabled } from '@/infrastructure/config/app-config.schema';
import { appConfig } from '@/infrastructure/config/app.config';
import { PageSkeleton } from '@/shared/ui/feedback';

export const metadata: Metadata = { title: 'Components' };

export default function Page() {
  if (!isFeatureEnabled(appConfig, 'componentGallery')) notFound();
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComponentGalleryPage />
    </Suspense>
  );
}
