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
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async redirects() {
    // The public site lives under its locale (tech-stack 3); French by default.
    return [{ source: '/', destination: '/fr', permanent: false }];
  },
};

export default config;
