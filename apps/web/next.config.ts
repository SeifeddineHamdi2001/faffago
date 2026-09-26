import type { NextConfig } from 'next';

/**
 * Security headers on every response. The tokens never reach the browser
 * (they live in httpOnly cookies set by the route handlers), and these
 * headers keep the pages from being framed or sniffed.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(), microphone=()' },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `pnpm dev` only: Next serves its scripts to localhost alone, so a phone on
  // the local network (or 127.0.0.1) got a page that never hydrated (D-93).
  allowedDevOrigins: ['127.0.0.1', '192.168.*.*'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // `/` and `/suivi/*` go to their language in the middleware: the browser's
  // on a first visit, the remembered one after (Landing 5).
};

export default config;
