import { test, expect, type Page } from '@playwright/test'
import type { InvestorNotification } from '../src/features/investor/notifications/notificationsApi'

const event = (id = 'PaymentConfirmed:65', at = '2026-10-15T01:00:00Z'): InvestorNotification => ({ id, type: 'PaymentConfirmed', title: 'Đã nhận tiền', body: 'Khoản góp 20.000.001 đ cho lô CS65-TEST đã được xác nhận.', at, batchCode: 'CS65-TEST', canOpenPortfolio: true, amount: 20000001 })
const asOf = '2026-10-15T02:00:00Z'
const result = (items = [event()], total = items.length, page = 1) => ({ items, total, page, pageSize: 100, asOf })
async function setup(page: Page, role = 'Investor') {
  await page.addInitScript((role) => localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token: 'notification-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 65, email: 'n@test.local', fullName: 'Khôi', roles: [role], status: 'Active', phone: null, operatorId: null } }, version: 0 })), role)
  await page.route('**/api/me/kyc', (r) => r.fulfill({ json: { verificationStatus: 'Verified', verifiedAt: asOf, lastCheck: null } }))
  await page.route('**/api/investor/portfolio**', (r) => r.fulfill({ json: { items: [], page: 1, pageSize: 5, total: 0, summary: { totalConfirmedAmount: 0, activeConfirmedAmount: 0, totalBatches: 0, activeBatches: 0, approvedNetPayout: 0 } } }))
}
async function openBell(page: Page) { await page.getByRole('button', { name: /^Thông báo/ }).click() }
test('new confirmed payment appears in the real bell; opening does not acknowledge it', async ({ page }) => {
  await setup(page); let paid = false
  await page.route('**/api/me/notifications**', (r) => { expect(r.request().headers()['authorization']).toBe('Bearer notification-token'); return r.fulfill({ json: result(paid ? [event()] : []) }) })
  await page.goto('/nha-dau-tu'); await openBell(page)
  await expect(page.getByText('Chưa có thông báo.', { exact: true })).toBeVisible()
  paid = true; await page.getByRole('button', { name: 'Làm mới thông báo' }).click()
  await expect(page.getByRole('button', { name: 'Thông báo, 1 chưa đọc', exact: true })).toBeVisible()
  await expect(page.getByText('Đã nhận tiền', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape'); await expect(page.getByLabel('Danh sách thông báo')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Thông báo, 1 chưa đọc', exact: true })).toBeFocused()
  await openBell(page); await expect(page.getByText('1 chưa đọc', { exact: true })).toBeVisible()
})
test('read marker persists and a later event at the exact same timestamp remains unread', async ({ page }) => {
  await setup(page); let items = [event()]
  await page.route('**/api/me/notifications**', (r) => r.fulfill({ json: result(items) }))
  await page.goto('/nha-dau-tu'); await expect(page.getByRole('button', { name: 'Thông báo, 1 chưa đọc' })).toBeVisible(); await openBell(page)
  await page.getByRole('button', { name: 'Đọc tất cả', exact: true }).click()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('crabshare-notification-read:65')!).through)).toBe('2026-10-15T01:00:00Z')
  await page.reload(); await openBell(page); await expect(page.getByText('0 chưa đọc', { exact: true })).toBeVisible()
  items = [event('PaymentConfirmed:66'), event()]
  await page.getByRole('button', { name: 'Làm mới thông báo' }).click()
  await expect(page.getByText('1 chưa đọc', { exact: true })).toBeVisible()
  await expect(page.getByTestId('notification-PaymentConfirmed:66')).toHaveClass(/is-unread/)
  await expect(page.getByTestId('notification-PaymentConfirmed:65')).not.toHaveClass(/is-unread/)
})
test('one event is read without acknowledging others and opens the private real portfolio URL', async ({ page }) => {
  await setup(page)
  await page.route('**/api/me/notifications**', (r) => r.fulfill({ json: result([event(), event('PaymentConfirmed:66')]) }))
  await page.route('**/api/investor/portfolio/CS65-TEST', (r) => r.fulfill({ status: 404, json: { detail: 'Lô đã đóng quyền truy cập.' } }))
  await page.goto('/nha-dau-tu'); await expect(page.getByRole('button', { name: 'Thông báo, 2 chưa đọc' })).toBeVisible(); await openBell(page)
  await page.getByTestId('notification-PaymentConfirmed:65').getByRole('button', { name: 'Xem lô CS65-TEST' }).click()
  await expect(page).toHaveURL(/\/danh-muc\/CS65-TEST$/)
  await expect(page.getByRole('button', { name: 'Thông báo, 1 chưa đọc' })).toBeVisible()
  await page.reload(); await expect(page.getByRole('button', { name: 'Thông báo, 1 chưa đọc' })).toBeVisible()
})
test('all notification pages use the same server boundary; a refunded receipt has no broken portfolio link', async ({ page }) => {
  await setup(page); const requests: URL[] = []
  await page.route('**/api/me/notifications**', (r) => {
    const url = new URL(r.request().url()); requests.push(url)
    return r.fulfill({ json: result(url.searchParams.get('page') === '2' ? [{ ...event('PaymentConfirmed:999'), canOpenPortfolio: false }] : [event()], 101, Number(url.searchParams.get('page'))) })
  })
  await page.goto('/nha-dau-tu'); await expect(page.getByRole('button', { name: 'Thông báo, 2 chưa đọc' })).toBeVisible(); await openBell(page)
  expect(requests[1].searchParams.get('until')).toBe(asOf)
  await expect(page.getByTestId('notification-PaymentConfirmed:999').getByRole('button', { name: /Xem lô/ })).toHaveCount(0)
})
test('API failure retries to a real empty feed and wrong-host HTML is an error', async ({ page }) => {
  await setup(page); let mode = 'failure'
  await page.route('**/api/me/notifications**', (r) => mode === 'failure' ? r.fulfill({ status: 503, json: { detail: 'Không tải được thông báo.' } }) : mode === 'html' ? r.fulfill({ contentType: 'text/html', body: '<html>wrong host</html>' }) : r.fulfill({ json: result([]) }))
  await page.goto('/nha-dau-tu'); await openBell(page)
  await expect(page.getByRole('alert')).toContainText('Không tải được thông báo.')
  mode = 'html'; await page.getByRole('button', { name: 'Thử lại' }).click(); await expect(page.getByRole('alert')).toContainText('Có lỗi xảy ra')
  mode = 'empty'; await page.getByRole('button', { name: 'Thử lại' }).click(); await expect(page.getByText('Chưa có thông báo.', { exact: true })).toBeVisible()
})
test('device storage failure does not clear unread state or claim success', async ({ page }) => {
  await setup(page)
  await page.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key.startsWith('crabshare-notification-read:')) throw new Error('storage unavailable'); original.call(this, key, value) } })
  await page.route('**/api/me/notifications**', (r) => r.fulfill({ json: result() }))
  await page.goto('/nha-dau-tu'); await expect(page.getByRole('button', { name: 'Thông báo, 1 chưa đọc' })).toBeVisible(); await openBell(page)
  await page.getByRole('button', { name: 'Đọc tất cả', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Không lưu được mốc đã đọc')
  await expect(page.getByText('1 chưa đọc', { exact: true })).toBeVisible()
})
test('account switching isolates both feed and saved read marker', async ({ page }) => {
  await setup(page)
  await page.route('**/api/me/notifications**', (r) => r.fulfill({ json: result([event(r.request().headers()['authorization'] === 'Bearer second-token' ? 'PaymentConfirmed:other' : 'PaymentConfirmed:65')]) }))
  await page.goto('/nha-dau-tu'); await expect(page.getByRole('button', { name: 'Thông báo, 1 chưa đọc' })).toBeVisible(); await openBell(page)
  await page.getByRole('button', { name: 'Đọc tất cả', exact: true }).click()
  await page.evaluate(async () => { const { useAuthStore } = await import('/src/shared/auth/authStore.ts'); useAuthStore.getState().setSession('second-token', '2099-01-01T00:00:00Z', { userId: 66, email: 'other@local', fullName: 'Other', roles: ['Investor'], phone: null, status: 'Active', operatorId: null }) })
  await expect(page.getByRole('button', { name: 'Thông báo, 1 chưa đọc' })).toBeVisible(); await openBell(page)
  await expect(page.getByTestId('notification-PaymentConfirmed:other')).toBeVisible()
  await expect(page.getByTestId('notification-PaymentConfirmed:65')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('crabshare-notification-read:66'))).toBeNull()
})
test('bell and scrollable panel fit the current desktop and phone design', async ({ page }) => {
  await setup(page)
  await page.route('**/api/me/notifications**', (r) => r.fulfill({ json: result([event(), { ...event('AlertRaised:2'), type: 'AlertRaised', title: 'Cảnh báo vận hành', body: 'Lô CS65-TEST có cảnh báo mới.' }, { ...event('PayoutSucceeded:3'), type: 'PayoutSucceeded', title: 'Đã chi trả', body: 'Lệnh chi trả 22.700.001 đ đã thành công.' }]) }))
  await page.goto('/nha-dau-tu'); await expect(page.getByRole('button', { name: 'Thông báo, 3 chưa đọc' })).toBeVisible(); await openBell(page)
  if (process.env.CAPTURE_NOTIFICATIONS === '1') await page.screenshot({ path: '../docs/validation/assets/cs65-notifications-web.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByLabel('Danh sách thông báo')).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (process.env.CAPTURE_NOTIFICATIONS === '1') await page.screenshot({ path: '../docs/validation/assets/cs65-notifications-small.png', fullPage: true })
})
