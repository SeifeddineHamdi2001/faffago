import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';
import { API_PORT, E2E_ADMIN, WEB_PORT, WEB_URL } from './e2e/support';

/**
 * The browser tests (D-49): the whole platform as a user sees it, from the
 * admin creating a seller to the seller's first pickup request.
 *
 * Playwright starts both servers on ports of their own: the API on PGlite
 * with a fresh database in memory (apps/api/test/e2e/server.ts), and a
 * production build of this app. The build replaces `.next`: stop the web
 * app's `pnpm dev` first. The secrets are drawn on every run and never
 * written anywhere.
 */

const secret = (bytes: number) => randomBytes(bytes).toString('base64');

export default defineConfig({
  testDir: './e2e',
  // One flow, in order: each test starts where the previous one stopped.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: WEB_URL,
    locale: 'fr-FR',
    timezoneId: 'Africa/Tunis',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // Full Chromium in its new headless mode: no separate headless shell to install.
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @faffago/api e2e:server',
      url: `http://127.0.0.1:${API_PORT}/api/auth/me`,
      // /auth/me answers 401 without a session: the API is up.
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      env: {
        API_PORT: String(API_PORT),
        E2E_ADMIN_USERNAME: E2E_ADMIN.username,
        E2E_ADMIN_PASSWORD: E2E_ADMIN.password,
        JWT_ACCESS_SECRET: secret(48),
        JWT_REFRESH_SECRET: secret(48),
        NEXT_PUBLIC_SITE_URL: WEB_URL,
        STORAGE_DRIVER: 'local',
        STORAGE_ENCRYPTION_KEY_ID: 'e2e',
        STORAGE_ENCRYPTION_KEY: secret(32),
      },
    },
    {
      command: `pnpm build && pnpm exec next start --port ${WEB_PORT}`,
      url: `${WEB_URL}/vendeur/connexion`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        API_BASE_URL: `http://127.0.0.1:${API_PORT}`,
        NEXT_PUBLIC_SITE_URL: WEB_URL,
        // The public site reads Paramètres afresh on each page, so a change shows at once.
        PUBLIC_SITE_CACHE_SECONDS: '0',
      },
    },
  ],
});
