import { test, expect, type Page } from '@playwright/test'

const alert = { id: 37, batchCode: 'TEST-CS37', farmName: 'Hộ nuôi kiểm thử', type: 'WaterQuality', severity: 'High', message: 'Cần điều chỉnh nước', raisedAt: '2026-10-12T03:00:00Z', ackDeadline: '2026-10-12T05:00:00Z', status: 'Open', acknowledgedAt: null, acknowledgedBy: null, responseNote: null, escalatedAt: null }
async function signIn(page: Page, roles = ['OperatorMember']) {
  await page.addInitScript(roles => localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token: 'test-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 1, fullName: 'Alert User', email: 'test@local', phone: null, status: 'Active', roles, operatorId: 1 } }, version: 0 })), roles)
}

test('operator acknowledges via API and retains a late escalation', async ({ page }) => {
  await signIn(page)
  let current: object = alert
  let writes = 0
  await page.route('**/api/operators/me/alerts*', route => route.fulfill({ json: [current] }))
  await page.route('**/api/alerts/37/acknowledge', async route => {
    writes++
    expect(route.request().postDataJSON()).toEqual({ responseNote: 'Đã thay nước' })
    expect(route.request().headers().authorization).toBe('Bearer test-token')
    current = { ...alert, status: 'Escalated', acknowledgedAt: '2026-10-12T06:00:00Z', responseNote: 'Đã thay nước' }
    await route.fulfill({ json: current })
  })
  await page.goto('/operator/alerts')
  await page.getByRole('button', { name: 'Xác nhận cảnh báo 37' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Gửi xác nhận' })).toBeDisabled()
  await dialog.getByLabel('Cách xử lý cảnh báo').fill('   ')
  await expect(dialog.getByRole('button', { name: 'Gửi xác nhận' })).toBeDisabled()
  await dialog.getByLabel('Cách xử lý cảnh báo').fill('Đã thay nước')
  await dialog.getByRole('button', { name: 'Gửi xác nhận' }).click()
  await expect(page.getByText('Phản hồi: Đã thay nước')).toBeVisible()
  await expect(page.getByText('Đã chuyển quản trị theo dõi.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Xác nhận cảnh báo 37' })).toHaveCount(0)
  expect(writes).toBe(1)
})

test('operator retains note on API conflict and can retry', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/operators/me/alerts*', route => route.fulfill({ json: [alert] }))
  await page.route('**/api/alerts/37/acknowledge', route => route.fulfill({ status: 409, json: { detail: 'Cảnh báo đã thay đổi.' } }))
  await page.goto('/operator/alerts')
  await page.getByRole('button', { name: 'Xác nhận cảnh báo 37' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Cách xử lý cảnh báo').fill('Đã thay nước')
  await dialog.getByRole('button', { name: 'Gửi xác nhận' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Cảnh báo đã thay đổi.')
  await expect(dialog.getByLabel('Cách xử lý cảnh báo')).toHaveValue('Đã thay nước')
})

test('operator shows fetch error, retries, and filters real empty results on a phone viewport', async ({ page }) => {
  await signIn(page)
  let fail = true
  await page.route('**/api/operators/me/alerts*', route => fail ? route.fulfill({ status: 500, json: { detail: 'Không tải được cảnh báo.' } }) : route.fulfill({ json: [] }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/operator/alerts')
  await expect(page.getByRole('alert')).toContainText('Không tải được cảnh báo.', { timeout: 15000 })
  fail = false
  await page.getByRole('button', { name: 'Thử lại' }).click()
  await expect(page.getByText('Không có cảnh báo', { exact: true })).toBeVisible()
  await page.getByLabel('Trạng thái', { exact: true }).selectOption('Escalated')
  await expect(page.getByText('Không có cảnh báo', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
