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

test('admin resolves an escalated alert and can read the persisted resolution note', async ({ page }) => {
  await signIn(page, ['PlatformAdmin'])
  let current = { ...alert, status: 'Escalated', escalatedAt: '2026-10-12T06:00:00Z', responseNote: 'Đã thay nước', resolutionNote: null as string | null }
  let writes = 0
  await page.route('**/api/admin/alerts?*', route => {
    const params = new URL(route.request().url()).searchParams
    expect(params.get('pageSize')).toBe('10')
    const items = params.get('status') === current.status ? [current] : []
    return route.fulfill({ json: { items, page: 1, pageSize: 10, total: items.length } })
  })
  await page.route('**/api/admin/alerts/37/resolve', route => {
    writes++
    expect(route.request().postDataJSON()).toEqual({ note: 'Đã kiểm tra và xử lý' })
    current = { ...current, status: 'Resolved', resolutionNote: 'Đã kiểm tra và xử lý' }
    return route.fulfill({ json: current })
  })
  await page.goto('/admin/alerts')
  await page.getByRole('button', { name: 'Đóng cảnh báo 37' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Xác nhận đóng' })).toBeDisabled()
  await dialog.getByLabel('Kết quả xử lý').fill('Đã kiểm tra và xử lý')
  await dialog.getByRole('button', { name: 'Xác nhận đóng' }).click()
  await expect(page.getByText('Đã đóng cảnh báo.', { exact: true })).toBeVisible()
  await expect(page.getByText('Không có cảnh báo phù hợp.')).toBeVisible()
  await page.getByLabel('Trạng thái cảnh báo').selectOption('Resolved')
  await expect(page.getByText('Kết quả: Đã kiểm tra và xử lý')).toBeVisible()
  await expect(page.getByText('Hộ nuôi: Đã thay nước')).toBeVisible()
  expect(writes).toBe(1)
  if (process.env.CAPTURE_ALERT_SCREENSHOTS) {
    await page.screenshot({ path: '../docs/validation/assets/cs40-admin-alerts.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: '../docs/validation/assets/cs40-admin-alerts-small.png', fullPage: true })
  }
})

test('admin retains the resolution note on conflict and sends server filters', async ({ page }) => {
  await signIn(page, ['PlatformAdmin'])
  let filtered = false
  await page.route('**/api/admin/alerts?*', route => {
    const params = new URL(route.request().url()).searchParams
    filtered ||= params.get('severity') === 'High' && params.get('q') === 'TEST-CS37'
    return route.fulfill({ json: { items: [{ ...alert, status: 'Escalated' }], page: 1, pageSize: 10, total: 1 } })
  })
  await page.route('**/api/admin/alerts/37/resolve', route => route.fulfill({ status: 409, json: { detail: 'Cảnh báo đã được đóng.' } }))
  await page.goto('/admin/alerts')
  await page.getByLabel('Mức độ cảnh báo').selectOption('High')
  await page.getByLabel('Tìm cảnh báo').fill('TEST-CS37')
  await expect.poll(() => filtered).toBe(true)
  await page.getByRole('button', { name: 'Đóng cảnh báo 37' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Kết quả xử lý').fill('Đã xử lý')
  await dialog.getByRole('button', { name: 'Xác nhận đóng' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Cảnh báo đã được đóng.')
  await expect(dialog.getByLabel('Kết quả xử lý')).toHaveValue('Đã xử lý')
})

test('evidence reviewer cannot open admin alerts or send its API request', async ({ page }) => {
  await signIn(page, ['EvidenceReviewer'])
  let reads = 0
  await page.route('**/api/admin/alerts*', route => { reads++; return route.fulfill({ status: 403 }) })
  await page.goto('/admin/alerts')
  await expect(page.getByRole('heading', { name: 'Cảnh báo Trại (Leo thang)' })).toHaveCount(0)
  expect(reads).toBe(0)
})

test('operator alert cache is isolated when the signed-in user changes', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/operators/me/alerts*', route => route.fulfill({ json: [{ ...alert, message: route.request().headers().authorization === 'Bearer second-token' ? 'Cảnh báo hộ thứ hai' : 'Cảnh báo hộ thứ nhất' }] }))
  await page.goto('/operator/alerts')
  await expect(page.getByText('Cảnh báo hộ thứ nhất')).toBeVisible()
  await page.evaluate(async () => {
    const modulePath = '/src/shared/auth/authStore.ts'
    const { useAuthStore } = await import(modulePath)
    useAuthStore.getState().setSession('second-token', '2099-01-01T00:00:00Z', { userId: 2, fullName: 'Second user', email: 'second@test.local', phone: null, status: 'Active', roles: ['OperatorMember'], operatorId: 2 })
  })
  await expect(page.getByText('Cảnh báo hộ thứ hai')).toBeVisible()
  await expect(page.getByText('Cảnh báo hộ thứ nhất')).toHaveCount(0)
})
