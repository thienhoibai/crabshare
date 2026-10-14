import { test, expect, type Page } from '@playwright/test'
import type { PortfolioItem, PortfolioDetail, PortfolioPage } from '../src/features/investor/portfolio/portfolioApi'

const item = (code = 'CS61-REAL-01', frozen = true): PortfolioItem => ({
  batch: { code, title: 'Cua thịt Năm Căn', operatorName: 'HTX Năm Căn', crabType: 'FatteningMudCrab', status: 'InProduction', targetCapital: 100000004, raisedCapital: 100000004, minContribution: 1000000, cycleDays: 90, seedQuantity: 100, fundingDeadline: null, stockedAt: '2026-09-01T00:00:00Z', expectedHarvestDate: '2026-12-01', dayOfCycle: 44, aliveCount: 97, openAlerts: 2 },
  confirmedAmount: 25000001, capitalRatio: .25, capitalBasis: frozen ? 'Frozen' : 'LiveConfirmed', lastConfirmedAt: '2026-08-30T08:00:00Z', settlement: null,
})
const pageData = (items = [item()], total = items.length, page = 1): PortfolioPage => ({ items, page, pageSize: 10, total, summary: { totalConfirmedAmount: 25000001, activeConfirmedAmount: 25000001, totalBatches: total, activeBatches: total, approvedNetPayout: 0 } })
const detail = (position = item()): PortfolioDetail => ({ position,
  contributions: [{ id: 61, amount: 25000001, status: 'Confirmed', reservedAt: '2026-08-30T07:50:00Z', confirmedAt: '2026-08-30T08:00:00Z', contractNo: 'CT-61', contractStatus: 'FullySigned', fullySignedAt: '2026-08-31T08:00:00Z' }],
  timeline: [{ type: 'Stocked', label: 'Thả giống', at: '2026-09-01T00:00:00Z' }],
  latestProduction: { logDate: '2026-10-14', ph: 7.8, waterTempC: 28, salinityPpt: 15, feedKg: 2, source: 'Manual', plausibilityFlag: 'Ok', verifiedAt: null },
})
async function signIn(page: Page, role = 'Investor') {
  await page.addInitScript((roles) => localStorage.setItem('crabshare-auth', JSON.stringify({ state: {
    token: 'portfolio-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 61, fullName: 'Khôi', email: 'portfolio@test.local', roles: [roles], status: 'Active', phone: null, operatorId: null },
  }, version: 0 })), role)
  await page.route('**/api/me/kyc', (r) => r.fulfill({ json: { verificationStatus: 'Verified', verifiedAt: '2026-10-01T00:00:00Z', lastCheck: null } }))
}
test('overview reads real capital and links to the private portfolio detail', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/investor/portfolio**', (r) => {
    expect(r.request().headers()['authorization']).toBe('Bearer portfolio-token')
    return r.fulfill({ json: new URL(r.request().url()).pathname.endsWith('/CS61-REAL-01') ? detail() : pageData() })
  })
  await page.goto('/nha-dau-tu')
  await expect(page.getByTestId('portfolio-active-capital')).toHaveText('25.000.001 đ')
  await expect(page.getByText('L2612-01')).toHaveCount(0)
  await page.getByRole('button', { name: 'Xem lô CS61-REAL-01', exact: true }).click()
  await expect(page).toHaveURL(/\/danh-muc\/CS61-REAL-01$/)
  await expect(page.getByRole('heading', { name: 'Chi tiết danh mục' })).toBeVisible()
  await expect(page.getByText('Hợp đồng CT-61 · Đã đủ chữ ký')).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(44 / 90 * 100))
  await expect(page.getByText('Chưa có quyết toán được duyệt.')).toBeVisible()
  await page.getByRole('button', { name: 'Danh mục', exact: true }).last().click()
  await expect(page).toHaveURL(/\/danh-muc$/)
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Chi tiết danh mục' })).toBeVisible()
})
test('filters and pages use API parameters while the global summary stays intact', async ({ page }) => {
  await signIn(page)
  const calls: URL[] = []
  await page.route('**/api/investor/portfolio**', (r) => {
    const url = new URL(r.request().url()); calls.push(url)
    return r.fulfill({ json: pageData([item(url.searchParams.get('page') === '2' ? 'CS61-PAGE-2' : 'CS61-REAL-01', false)], 11, Number(url.searchParams.get('page') ?? 1)) })
  })
  await page.goto('/nha-dau-tu/danh-muc')
  await expect(page.getByText('Tạm tính 25% vốn lô')).toBeVisible()
  await page.getByRole('button', { name: 'Trang sau' }).click()
  await expect(page.getByRole('button', { name: 'Xem lô CS61-PAGE-2' })).toBeVisible()
  await page.getByLabel('Tìm lô').fill('Năm Căn')
  await page.getByRole('button', { name: 'Tìm kiếm' }).click()
  await page.getByRole('combobox', { name: 'Trạng thái', exact: true }).selectOption('InProduction')
  await expect.poll(() => calls.some(u => u.searchParams.get('q') === 'Năm Căn' && u.searchParams.get('status') === 'InProduction' && u.searchParams.get('page') === '1')).toBe(true)
  await expect(page.getByTestId('portfolio-active-capital')).toHaveText('25.000.001 đ')
})
test('network failure can retry and empty holdings never fall back to mock', async ({ page }) => {
  await signIn(page); let failure = true
  await page.route('**/api/investor/portfolio**', (r) => failure ? r.abort('failed') : r.fulfill({ json: { ...pageData([]), summary: { totalConfirmedAmount: 0, activeConfirmedAmount: 0, totalBatches: 0, activeBatches: 0, approvedNetPayout: 0 } } }))
  await page.goto('/nha-dau-tu/danh-muc')
  await expect(page.getByRole('alert')).toContainText('Không kết nối được máy chủ')
  failure = false; await page.getByRole('button', { name: 'Thử lại' }).click()
  await expect(page.getByText('Bạn chưa có vốn đã xác nhận trong lô nào.')).toBeVisible()
  await expect(page.getByTestId('portfolio-active-capital')).toHaveText('0 đ')
})
test('an HTML response from the wrong API host does not crash the overview or KYC banner', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/investor/portfolio**', (r) => r.fulfill({ contentType: 'text/html', body: '<html>Wrong API host</html>' }))
  await page.goto('/nha-dau-tu')
  await expect(page.getByRole('alert')).toContainText('Có lỗi xảy ra')
  await expect(page.getByText('Đã xác minh danh tính', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible()
})
test('detail has unknown ratio, clamped cycle and approved actual payout without yield', async ({ page }) => {
  await signIn(page)
  const p = item(); p.capitalRatio = null; p.batch.dayOfCycle = 100
  p.settlement = { status: 'Approved', capitalReturn: 25000001, profitShare: -1000000, taxWithheld: 0, netPayout: 24000001, inKindQtyKg: 0 }
  await page.route('**/api/investor/portfolio/**', (r) => r.fulfill({ json: detail(p) }))
  await page.goto('/nha-dau-tu/danh-muc/CS61-REAL-01')
  await expect(page.getByText('Chưa có tỷ lệ vốn')).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  await expect(page.getByText('100 / 90 ngày')).toBeVisible()
  await expect(page.getByText('24.000.001 đ')).toBeVisible()
  await expect(page.getByText('Đã duyệt, chờ chi trả')).toBeVisible()
  expect(await page.locator('main').innerText()).not.toMatch(/lợi suất|ROI|lợi nhuận kỳ vọng/i)
})
test('foreign portfolio detail shows 404 and retry instead of a sample batch', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/investor/portfolio/**', (r) => r.fulfill({ status: 404, json: { detail: 'Không tìm thấy lô trong danh mục của bạn.' } }))
  await page.goto('/nha-dau-tu/danh-muc/FOREIGN')
  await expect(page.getByRole('alert')).toContainText('Không tìm thấy lô trong danh mục của bạn.')
  await expect(page.getByText('Vốn đã chốt', { exact: true })).toHaveCount(0)
})
test('account change isolates cached portfolio', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/investor/portfolio**', (r) => r.fulfill({ json: r.request().headers()['authorization'] === 'Bearer second-token' ? { ...pageData([]), summary: { totalConfirmedAmount: 0, activeConfirmedAmount: 0, totalBatches: 0, activeBatches: 0, approvedNetPayout: 0 } } : pageData() }))
  await page.goto('/nha-dau-tu/danh-muc')
  await expect(page.getByTestId('portfolio-active-capital')).toHaveText('25.000.001 đ')
  await page.evaluate(async () => {
    const { useAuthStore } = await import('/src/shared/auth/authStore.ts')
    useAuthStore.getState().setSession('second-token', '2099-01-01T00:00:00Z', { userId: 62, email: 'second@test.local', fullName: 'Other', roles: ['Investor'], phone: null, status: 'Active', operatorId: null })
  })
  await expect(page.getByTestId('portfolio-active-capital')).toHaveText('0 đ')
  await expect(page.getByRole('button', { name: 'Xem lô CS61-REAL-01' })).toHaveCount(0)
})
test('portfolio follows the existing card design at desktop and phone widths', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/investor/portfolio**', (r) => r.fulfill({ json: new URL(r.request().url()).pathname.endsWith('/CS61-REAL-01') ? detail() : pageData() }))
  await page.goto('/nha-dau-tu/danh-muc')
  await expect(page.getByRole('button', { name: 'Xem lô CS61-REAL-01' })).toBeVisible()
  if (process.env.CAPTURE_PORTFOLIO === '1') await page.screenshot({ path: '../docs/validation/assets/cs61-portfolio-web.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Xem lô CS61-REAL-01' }).click()
  await expect(page.getByText('Vốn đã chốt', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (process.env.CAPTURE_PORTFOLIO === '1') await page.screenshot({ path: '../docs/validation/assets/cs61-portfolio-detail-small.png', fullPage: true })
})
test('customer without Investor cannot access portfolio or call its API', async ({ page }) => {
  await signIn(page, 'Customer'); let calls = 0
  await page.route('**/api/investor/portfolio**', (r) => { calls++; return r.fulfill({ json: pageData() }) })
  await page.goto('/nha-dau-tu/danh-muc')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Danh mục', exact: true })).toHaveCount(0)
  expect(calls).toBe(0)
})
