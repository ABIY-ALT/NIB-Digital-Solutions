import { permanentRedirect } from 'next/navigation';

/**
 * Solutions merged into Explore Products (the "Business need" filter). Old
 * links such as /solutions#digital-lending keep working: browsers carry the
 * #hash over the redirect and the catalog selects that need.
 */
export default function Page() {
  permanentRedirect('/products');
}
