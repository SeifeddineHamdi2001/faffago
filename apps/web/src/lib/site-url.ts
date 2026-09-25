/**
 * The public site's address (D-43): `NEXT_PUBLIC_SITE_URL`, the one printed in
 * every label's QR code. Canonical links, Open Graph and the sitemap use it.
 */
export function siteUrl(): URL {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');
}
