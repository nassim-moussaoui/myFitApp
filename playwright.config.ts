import { defineConfig, devices } from '@playwright/test';

/**
 * WebKit with an iPhone profile is the reference target (run in CI).
 * Set E2E_BROWSER=chromium to run the same tests where WebKit is not installed.
 */
const browser = process.env.E2E_BROWSER === 'chromium' ? 'chromium' : 'webkit';
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/myFitApp/`,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'off',
  },
  projects: [
    {
      name: `iphone-${browser}`,
      use: { ...devices['iPhone 14'], browserName: browser, ...(browser === 'chromium' ? { isMobile: true } : {}) },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/myFitApp/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
