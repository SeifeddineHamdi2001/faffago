// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { formatDayKey, formatTunisDateTime, preferredLocale } from '@/lib/locale';
import { proxy as middleware } from '@/proxy';

/** The public site's languages (Landing 5). */
describe('preferredLocale', () => {
  it('keeps the remembered choice above all', () => {
    expect(preferredLocale('ar', 'fr-FR,fr;q=0.9')).toBe('ar');
  });

  it('follows the browser on a first visit, in its own order of preference', () => {
    expect(preferredLocale(undefined, 'ar-TN,ar;q=0.9,fr;q=0.8')).toBe('ar');
    expect(preferredLocale(undefined, 'fr-FR,fr;q=0.9,ar;q=0.8')).toBe('fr');
    expect(preferredLocale(undefined, 'en-US,en;q=0.9,ar;q=0.8')).toBe('ar');
    expect(preferredLocale(undefined, 'fr;q=0.5,ar;q=0.7')).toBe('ar');
  });

  it('reads French when the browser names neither language, or refuses one', () => {
    expect(preferredLocale(undefined, 'en-US,de;q=0.5')).toBe('fr');
    expect(preferredLocale(undefined, null)).toBe('fr');
    expect(preferredLocale(undefined, 'ar;q=0')).toBe('fr');
    expect(preferredLocale('xx', null)).toBe('fr');
  });
});

describe('dates on the public site', () => {
  it('shows Tunis time in Latin digits in both languages', () => {
    expect(formatTunisDateTime('2026-09-25T13:32:00.000Z', 'fr')).toBe('25/09/2026 à 14:32');
    expect(formatTunisDateTime('2026-09-25T13:32:00.000Z', 'ar')).toBe('25/09/2026 - 14:32');
  });

  it('shows a chosen day as it is, never shifted by a time zone', () => {
    expect(formatDayKey('2026-10-01')).toBe('01/10/2026');
  });
});

describe('the middleware on the public site', () => {
  const request = (path: string, headers: Record<string, string> = {}) =>
    new NextRequest(new URL(path, 'http://localhost:3000'), { headers });

  it('opens / in the browser’s language on a first visit', async () => {
    const response = await middleware(request('/', { 'accept-language': 'ar-TN,ar;q=0.9' }));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/ar');
  });

  it('keeps /suivi/FG-… answering forever, in the remembered language (D-43)', async () => {
    const response = await middleware(
      request('/suivi/FG-8K2QX7AB', { cookie: 'fg_locale=ar', 'accept-language': 'fr' }),
    );
    expect(response.headers.get('location')).toBe('http://localhost:3000/ar/suivi/FG-8K2QX7AB');
  });

  it('remembers the language of the page opened', async () => {
    const response = await middleware(request('/ar'));
    expect(response.cookies.get('fg_locale')?.value).toBe('ar');
  });

  it('never remembers a language the router only prefetched', async () => {
    const response = await middleware(
      request('/ar', { cookie: 'fg_locale=fr', 'next-router-prefetch': '1' }),
    );
    expect(response.cookies.get('fg_locale')).toBeUndefined();
  });

  it('never asks for a session on the public site', async () => {
    const response = await middleware(request('/fr/suivi/FG-8K2QX7AB'));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});
