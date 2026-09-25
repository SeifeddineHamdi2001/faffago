import type { MetadataRoute } from 'next';
import { LOCALES } from '@/lib/locale';
import { siteUrl } from '@/lib/site-url';

/** The landing page in French and Arabic, each naming the other (Landing 6). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const at = (path: string) => new URL(path, base).toString();
  return LOCALES.map((locale) => ({
    url: at(`/${locale}`),
    changeFrequency: 'weekly',
    priority: 1,
    alternates: { languages: { fr: at('/fr'), ar: at('/ar') } },
  }));
}
