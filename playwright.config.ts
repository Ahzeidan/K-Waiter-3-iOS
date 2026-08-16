import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:4183',
    locale: 'ar-KW',
    timezoneId: 'Asia/Kuwait',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome HiDPI'],
    viewport: { width: 1280, height: 800 },
    channel: 'chrome',
  },
  webServer: {
    command: 'npm run dev -- --port 4183',
    url: 'http://127.0.0.1:4183',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
