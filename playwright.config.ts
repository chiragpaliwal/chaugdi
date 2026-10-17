// Playwright end-to-end suite (GDD §11.1, §16 M7). Mobile viewport by default; the
// keyboard spec runs on a desktop viewport. Most specs use the production build through
// `vite preview` (service worker included); the screen interaction checks use the dev
// server for its /dev fixture routes. Run: npm run e2e
import { defineConfig, devices } from '@playwright/test';
import { DEV_URL, PREVIEW_PORT, DEV_PORT, PREVIEW_URL } from './e2e/urls';

const CI = !!process.env.CI;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  outputDir: 'e2e/.out/results',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never', outputFolder: 'e2e/.out/report' }]] : 'list',
  use: {
    baseURL: PREVIEW_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      testIgnore: /keyboard\.spec/,
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'desktop',
      testMatch: /keyboard\.spec/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: [
    { command: `npx vite preview --port ${PREVIEW_PORT} --strictPort`, url: PREVIEW_URL, reuseExistingServer: !CI, timeout: 60_000 },
    // Own local state: sharing it with the preview server would run every room's alarms twice.
    { command: `CF_PERSIST=.wrangler/e2e-dev npx vite --port ${DEV_PORT} --strictPort`, url: DEV_URL, reuseExistingServer: !CI, timeout: 60_000 },
  ],
});
