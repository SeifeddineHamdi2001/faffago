import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site-url';

/**
 * Search engines read the landing page in both languages (Landing 6), never
 * the seller space, the back office, the API or one parcel's tracking page.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/fr', '/ar'],
        disallow: ['/admin', '/vendeur', '/api', '/suivi', '/fr/suivi', '/ar/suivi'],
      },
    ],
    sitemap: new URL('/sitemap.xml', siteUrl()).toString(),
  };
}
