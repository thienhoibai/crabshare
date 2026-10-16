import { test, expect, type Page } from '@playwright/test'
import type { AdminDashboardData, OperatorDashboardData } from '../src/features/reports/dashboardApi'
import { readFile } from 'node:fs/promises'

const admin: AdminDashboardData = { from: '2026-10-01', to: '2026-10-16', asOf: '2026-10-16T03:00:00Z', confirmedCapital: 25000001, confirmedContributions: 2, totalUsers: 17,
  capitalByDay: [{ date: '2026-10-16', amount: 25000001, count: 2 }], batchesByStatus: [{ status: 'InProduction', count: 2 }], escalatedAlerts: 1,
  latestEscalatedAlerts: [{ id: 73, batchCode: 'CS73-REAL', farmName: 'HTX Thật', severity: 'High', message: 'Cần phản hồi chất lượng nước', raisedAt: '2026-10-15T00:00:00Z' }], ordersByStatus: [{ status: 'Completed', count: 4 }], completedOrderRevenue: 10000001, payoutsByStatus: [{ status: 'Created', count: 1, amount: 999 }], succeededPayoutAmount: 20000001 }
const farm: OperatorDashboardData = { from: admin.from, to: admin.to, asOf: admin.asOf, farmName: 'HTX Năm Căn thật', selectedBatchCode: null, batches: [{ batchCode: 'CS73-REAL', title: 'Lô thật', status: 'InProduction', aliveCount: 123, expectedOutputKg: 50, openAlerts: 1, loggedToday: false }], aliveCount: 123, openAlerts: 1, pendingCaptureRequests: 2, logsDueToday: 1, ordersToPack: 3, ordersToShip: 1, environmentByDay: [{ date: '2026-10-16', ph: 7.8, waterTempC: 28 }], recentLogs: [{ id: 73, batchCode: 'CS73-REAL', date: '2026-10-16', ph: 7.8, waterTempC: 28, salinityPpt: 15, feedKg: 2 }] }
async function signIn(page: Page, role: string) {
  await page.addInitScript(role => localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token: 'dashboard-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 73, email: 'dashboard@local', fullName: 'Khôi', roles: [role], status: 'Active', operatorId: role === 'OperatorMember' ? 1 : null } }, version: 0 })), role)
}
test('admin dashboard reads actual integer money, filters and downloads authenticated UTF8 CSV', async ({ page }) => {
  await signIn(page, 'PlatformAdmin'); const queries: URL[] = []
  await page.route('**/api/admin/dashboard**', r => { queries.push(new URL(r.request().url())); expect(r.request().headers()['authorization']).toBe('Bearer dashboard-token'); return r.fulfill({ json: admin }) })
  await page.route('**/api/admin/reports/capital.csv**', r => { expect(r.request().headers()['authorization']).toBe('Bearer dashboard-token'); return r.fulfill({ contentType: 'text/csv; charset=utf-8', body: '\ufeff"Ngày","Vốn"\r\n"2026-10-16","25000001"\r\n' }) })
  await page.goto('/admin'); await expect(page.getByText('25.000.001 đ', { exact: true })).toBeVisible()
  await expect(page.getByText('10.000.001 đ', { exact: true })).toBeVisible(); await expect(page.getByText('Cần phản hồi chất lượng nước')).toBeVisible()
  await expect(page.getByText('4.25')).toHaveCount(0)
  await page.getByLabel('Từ ngày', { exact: true }).fill('2026-10-01'); await expect.poll(() => queries.at(-1)?.searchParams.get('from')).toBe('2026-10-01')
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'CSV vốn góp' }).click(); const file = await download
  expect(file.suggestedFilename()).toMatch(/^crabshare-capital-/); const bytes = await readFile((await file.path())!); expect(bytes.subarray(0, 3)).toEqual(Buffer.from([239, 187, 191])); expect(bytes.toString('utf8')).toContain('25000001')
})
test('dashboard handles server failure, empty reads and invalid intervals without mock fallback', async ({ page }) => {
  await signIn(page, 'PlatformAdmin'); let failed = true
  await page.route('**/api/admin/dashboard**', r => failed ? r.fulfill({ status: 503, json: { detail: 'Báo cáo đang tạm ngưng.' } }) : r.fulfill({ json: { ...admin, confirmedCapital: 0, confirmedContributions: 0, capitalByDay: [], batchesByStatus: [], ordersByStatus: [], payoutsByStatus: [], latestEscalatedAlerts: [], escalatedAlerts: 0 } }))
  await page.goto('/admin'); await expect(page.getByRole('alert')).toContainText('Báo cáo đang tạm ngưng.')
  failed = false; await page.getByRole('button', { name: 'Thử lại' }).click(); await expect(page.getByText('Chưa có khoản góp được xác nhận trong kỳ.')).toBeVisible()
  await page.getByLabel('Từ ngày', { exact: true }).fill('2099-01-01'); await expect(page.getByRole('alert')).toContainText('tối đa 366 ngày'); await expect(page.getByRole('button', { name: 'CSV vốn góp' })).toBeDisabled()
})
test('farm dashboard uses only returned farm data and passes the batch filter to the API', async ({ page }) => {
  await signIn(page, 'OperatorMember'); const requests: URL[] = []
  await page.route('**/api/operators/me/dashboard**', r => { requests.push(new URL(r.request().url())); return r.fulfill({ json: farm }) })
  await page.goto('/operator'); await expect(page.getByRole('heading', { name: 'Chào HTX Năm Căn thật' })).toBeVisible()
  await expect(page.getByText('3 đơn chờ đóng gói · 1 chờ giao')).toBeVisible(); await expect(page.getByText('2 yêu cầu chụp còn hạn')).toBeVisible()
  await expect(page.getByText('Trại Cần Giờ 01', { exact: true })).toHaveCount(0)
  await page.getByLabel('Lọc theo lô').selectOption('CS73-REAL'); await expect.poll(() => requests.at(-1)?.searchParams.get('batchCode')).toBe('CS73-REAL')
})
test('farm empty and network error states are useful, and both dashboards fit a phone', async ({ page }) => {
  await signIn(page, 'OperatorMember'); let failed = true
  await page.route('**/api/operators/me/dashboard**', r => failed ? r.fulfill({ status: 503, json: { detail: 'Không kết nối được báo cáo trại.' } }) : r.fulfill({ json: { ...farm, batches: [], aliveCount: 0, openAlerts: 0, logsDueToday: 0, pendingCaptureRequests: 0, ordersToPack: 0, ordersToShip: 0, environmentByDay: [], recentLogs: [] } }))
  await page.goto('/operator'); await expect(page.getByRole('alert')).toContainText('Không kết nối được báo cáo trại.')
  failed = false; await page.getByRole('button', { name: 'Thử lại' }).click(); await expect(page.getByText('Hộ nuôi chưa có lô đang nuôi.')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (process.env.CAPTURE_DASHBOARD === '1') await page.screenshot({ path: '../.artifacts/sprint3/cs73-operator-small.png', fullPage: true })
})
test('admin layout remains responsive with populated data', async ({ page }) => {
  await signIn(page, 'PlatformAdmin'); await page.route('**/api/admin/dashboard**', r => r.fulfill({ json: admin }))
  await page.goto('/admin'); await expect(page.getByText('25.000.001 đ', { exact: true })).toBeVisible()
  if (process.env.CAPTURE_DASHBOARD === '1') await page.screenshot({ path: '../.artifacts/sprint3/cs73-admin.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (process.env.CAPTURE_DASHBOARD === '1') await page.screenshot({ path: '../.artifacts/sprint3/cs73-admin-small.png', fullPage: true })
})
