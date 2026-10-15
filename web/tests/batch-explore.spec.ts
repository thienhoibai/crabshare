import { test, expect, type Page } from '@playwright/test'

const batch = (batchCode = 'CS42-REAL-01') => ({
  batchCode, title: 'Cua thịt Năm Căn', operatorName: 'HTX Năm Căn', crabType: 'FatteningMudCrab', status: 'Funding',
  seedQuantity: 120, expectedOutputKg: 65, cycleDays: 90, restockCutoffDays: 7,
  minViableCapital: 80000000, targetCapital: 100000000, maxCapital: 120000000, minContribution: 1000000, operatorSharePct: 20,
  fundingOpenAt: '2026-10-01T00:00:00Z', fundingDeadline: '2026-10-30T00:00:00Z',
  fundingProgress: { confirmedCapital: 33333333, reservedCapital: 5000000, investorCount: 8, pctOfTarget: 33.333333, percentLabel: '33,33%' },
  standardCost: null as null | { versionNo: number; status: string; total: number; items: { category: string; amount: number }[]; lockedAt: string },
})
const detail = () => ({ ...batch(), standardCost: { versionNo: 3, status: 'Locked', total: 80000000, items: [{ category: 'Seed', amount: 50000000 }, { category: 'Feed', amount: 30000000 }], lockedAt: '2026-09-30T00:00:00Z' } })
async function signIn(page: Page) {
  await page.addInitScript(() => localStorage.setItem('crabshare-auth', JSON.stringify({ state: {
    token: 'explore-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 42, fullName: 'Khôi', email: 'explore@test.local', roles: ['Investor'], status: 'Active', phone: null, operatorId: null },
  }, version: 0 })))
  await page.route('**/api/investor/notifications**', r => r.fulfill({ json: { items: [], total: 0, unreadCount: 0 } }))
}

test('server filters and pagination survive detail navigation and refresh', async ({ page }) => {
  await signIn(page)
  const calls: URL[] = []
  await page.route('**/api/batches**', r => {
    expect(r.request().headers()['authorization']).toBe('Bearer explore-token')
    const url = new URL(r.request().url()); calls.push(url)
    if (url.pathname.endsWith('/CS42-PAGE-2')) return r.fulfill({ json: { ...detail(), batchCode: 'CS42-PAGE-2' } })
    const current = Number(url.searchParams.get('page') ?? 1)
    return r.fulfill({ json: { items: [batch(current === 2 ? 'CS42-PAGE-2' : 'CS42-REAL-01')], page: current, pageSize: 20, total: 21 } })
  })
  await page.goto('/nha-dau-tu/kham-pha')
  await expect(page.getByRole('button', { name: 'Xem lô CS42-REAL-01' })).toBeVisible()
  await page.getByLabel('Trạng thái', { exact: true }).selectOption('InProduction')
  await page.getByLabel('Loại cua', { exact: true }).selectOption('FatteningMudCrab')
  await page.getByRole('button', { name: 'Trang sau' }).click()
  await expect(page.getByRole('button', { name: 'Xem lô CS42-PAGE-2' })).toBeVisible()
  expect(calls.some(u => u.searchParams.get('page') === '2' && u.searchParams.get('pageSize') === '20' && u.searchParams.get('status') === 'InProduction' && u.searchParams.get('crabType') === 'FatteningMudCrab')).toBe(true)
  await page.getByRole('button', { name: 'Xem lô CS42-PAGE-2' }).click()
  await expect(page).toHaveURL(/\/lo\/CS42-PAGE-2/)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Điều khoản đã công bố' })).toBeVisible()
  await page.getByRole('button', { name: 'Quay lại' }).click()
  await expect(page.getByLabel('Trạng thái', { exact: true })).toHaveValue('InProduction')
  await expect(page.getByText('Trang 2 / 2')).toBeVisible()
  await page.getByLabel('Loại cua', { exact: true }).selectOption('SoftShellCrab')
  await expect(page.getByText('Trang 1 / 2')).toBeVisible()
})

test('detail displays published terms, locked costs and authoritative percentage without investment or yield promises', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/batches/**', r => r.fulfill({ json: detail() }))
  await page.goto('/nha-dau-tu/lo/CS42-REAL-01')
  await expect(page.getByText('33,33%', { exact: true })).toBeVisible()
  await expect(page.getByText('33.333.333 đ')).toBeVisible()
  await expect(page.getByText('5.000.000 đ')).toBeVisible()
  await expect(page.getByText('Phiên bản 3 · Đã khóa')).toBeVisible()
  await expect(page.getByText('50.000.000 đ')).toBeVisible()
  await expect(page.getByText('120 con')).toBeVisible()
  await expect(page.getByText('7 ngày')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Góp vốn', exact: true })).toHaveCount(0)
  expect(await page.locator('main').innerText()).not.toMatch(/lợi suất|ROI|lợi nhuận kỳ vọng/i)
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('loading, error retry and empty list never fall back to mock batches', async ({ page }) => {
  await signIn(page); let failed = true
  await page.route('**/api/batches?**', async r => {
    await new Promise(resolve => setTimeout(resolve, 500))
    return failed ? r.abort('failed') : r.fulfill({ json: { items: [], page: 1, pageSize: 20, total: 0 } })
  })
  await page.goto('/nha-dau-tu/kham-pha')
  await expect(page.getByRole('status').filter({ hasText: 'Đang tải lô' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Không kết nối được máy chủ')
  failed = false; await page.getByRole('button', { name: 'Thử lại' }).click()
  await expect(page.getByText('Không có lô phù hợp bộ lọc.')).toBeVisible()
  await expect(page.getByText('L2612-01')).toHaveCount(0)
})

test('unavailable detail shows API error and retry instead of stale or sample data', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/batches/**', r => r.fulfill({ status: 404, json: { detail: 'Không tìm thấy lô.' } }))
  await page.goto('/nha-dau-tu/lo/PRIVATE')
  await expect(page.getByRole('alert')).toContainText('Không tìm thấy lô.')
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Điều khoản đã công bố' })).toHaveCount(0)
})

test('over-target API percentage stays uncapped in text while the bar stays within bounds', async ({ page }) => {
  await signIn(page)
  const data = detail(); data.fundingProgress.pctOfTarget = 123.456; data.fundingProgress.percentLabel = '123,46%'
  await page.route('**/api/batches/**', r => r.fulfill({ json: data }))
  await page.goto('/nha-dau-tu/lo/CS42-REAL-01')
  await expect(page.getByText('123,46%', { exact: true })).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '123,46%')
})
