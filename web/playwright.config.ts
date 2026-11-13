import { defineConfig } from '@playwright/test'

// PW_PORT cho phép chạy hai lượt kiểm thử cùng lúc trên một máy (mỗi lượt một cổng); mặc định 5175.
const port = Number(process.env.PW_PORT ?? 5175)
const origin = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests',
  workers: 1,
  // Trình duyệt luôn ở giờ Việt Nam để máy CI (UTC) và máy của nhóm cho cùng kết quả.
  use: { baseURL: origin, channel: process.env.CI ? undefined : 'chrome', trace: 'retain-on-failure', timezoneId: 'Asia/Ho_Chi_Minh' },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: origin,
    env: { VITE_API_URL: origin },
    reuseExistingServer: false,
  },
})
