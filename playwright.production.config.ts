import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/production',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4184',
    locale: 'ar-KW',
    ...devices['Desktop Chrome HiDPI'],
    viewport: { width: 1280, height: 800 },
    channel: 'chrome',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4184',
    url: 'http://127.0.0.1:4184',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
