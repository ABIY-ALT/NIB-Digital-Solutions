import { permanentRedirect } from 'next/navigation';

/**
 * Industries merged into Explore Products (the "Industry" filter). Old links
 * such as /industries#education keep working: browsers carry the #hash over
 * the redirect and the catalog selects that industry.
 */
export default function Page() {
  permanentRedirect('/products');
}
