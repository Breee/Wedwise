import { defineConfig } from '@playwright/test'

const baseURL = process.env.BASE_URL ?? 'http://localhost:8080'

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { Origin: baseURL },
    trace: 'retain-on-failure',
  },
})
