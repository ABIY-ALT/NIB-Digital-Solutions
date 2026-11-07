import { SiteFrame } from './(site)/site-frame';
import { SiteNotFound } from '@/features/marketplace/components/site/info-pages';

/**
 * Any address that matches no page. Most visitors are customers, so it uses
 * the public website's look and leads back to the homepage. A missing record
 * inside the staff portal uses (app)/not-found.tsx instead.
 */
export default function NotFound() {
  return (
    <SiteFrame>
      <SiteNotFound />
    </SiteFrame>
  );
}
