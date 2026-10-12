import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5175', channel: process.env.CI ? undefined : 'chrome', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175',
    env: { VITE_API_URL: 'http://127.0.0.1:5175' },
    reuseExistingServer: false,
  },
})
