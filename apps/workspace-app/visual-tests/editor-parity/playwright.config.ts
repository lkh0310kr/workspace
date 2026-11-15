import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'parity.spec.ts',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4179',
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'UTC',
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'npx vite --config vite.config.ts',
    port: 4179,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
})
