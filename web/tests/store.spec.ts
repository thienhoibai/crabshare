import { test, expect, type Page } from '@playwright/test'

const listing = (listingId: number, title: string, batchCode: string, pricePerKg: number, inStock = true) => ({
  listingId, title, status: inStock ? 'Published' : 'SoldOut', crabType: 'RoeCrab', gradeCode: 'L1', gradeName: 'Loại 1', minWeightG: 500, maxWeightG: null,
  storageType: 'Fresh', batchCode, farmName: 'HTX Năm Căn', harvestedAt: '2026-10-10T00:00:00Z', pricePerKg, availableQtyKg: inStock ? 8 : 0, inStock,
  imageUrl: null, publishedAt: '2026-10-10T00:00:00Z',
})
const all = [listing(3, 'Cua gạch son', 'TEST-02', 520_000), listing(7, 'Cua thịt loại 1', 'TEST-05', 430_000), listing(9, 'Cua gạch hết hàng', 'TEST-02', 450_000, false)]

/** Giả lập GET /api/listings lọc như backend và ghi lại tham số mỗi lần gọi. */
async function mockStore(page: Page) {
  const calls: URLSearchParams[] = []
  await page.route('**/api/listings?*', route => {
    const q = new URL(route.request().url()).searchParams
    calls.push(q)
    const min = q.get('minPrice'), max = q.get('maxPrice'), batch = q.get('batch')
    const items = all.filter(l => (!batch || l.batchCode === batch) && (!min || l.pricePerKg >= Number(min)) && (!max || l.pricePerKg <= Number(max)))
    const total = batch || min || max ? items.length : 30
    return route.fulfill({ json: { items, page: Number(q.get('page')), pageSize: Number(q.get('pageSize')), total } })
  })
  return calls
}

test('filters the storefront by origin batch and price range and resets to page 1', async ({ page }) => {
  const calls = await mockStore(page)
  await page.goto('/cua-hang')
  await page.getByRole('button', { name: /Trang sau/ }).click()
  await expect(page.getByText('Trang 2 / 3')).toBeVisible()

  await page.getByLabel('Mã lô').fill(' TEST-02 ')
  await page.getByRole('button', { name: 'Lọc', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Xem Cua thịt loại 1' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Xem Cua gạch son' })).toBeVisible()
  let last = calls.at(-1)!
  expect(last.get('batch')).toBe('TEST-02')
  expect(last.get('page')).toBe('1')

  await page.getByLabel('Mã lô').fill('')
  await page.getByLabel('Giá từ').fill('430000')
  await page.getByLabel('đến').fill('500000')
  await page.getByLabel('đến').press('Enter')
  await expect(page.getByRole('button', { name: 'Xem Cua gạch son' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Xem Cua thịt loại 1' })).toBeVisible()
  last = calls.at(-1)!
  expect([last.get('batch'), last.get('minPrice'), last.get('maxPrice'), last.get('page')]).toEqual([null, '430000', '500000', '1'])

  await page.getByRole('button', { name: 'Bỏ lọc lô và giá' }).click()
  await expect(page.getByRole('button', { name: 'Xem Cua gạch son' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Xem Cua thịt loại 1' })).toBeVisible()
  await expect(page.getByLabel('Giá từ')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Bỏ lọc lô và giá' })).toHaveCount(0)
})

test('a min price above the max price is refused without calling the API', async ({ page }) => {
  const calls = await mockStore(page)
  await page.goto('/cua-hang')
  await expect(page.getByRole('button', { name: 'Xem Cua gạch son' })).toBeVisible()
  const before = calls.length

  await page.getByLabel('Giá từ').fill('500000')
  await page.getByLabel('đến').fill('300000')
  await page.getByRole('button', { name: 'Lọc', exact: true }).click()

  await expect(page.getByRole('alert')).toHaveText('Giá từ không được lớn hơn giá đến.')
  expect(calls.length).toBe(before)
})

test('a sold-out listing still cannot be added to the cart', async ({ page }) => {
  await mockStore(page)
  await page.route('**/api/listings/9', route => route.fulfill({ json: {
    listing: all[2], batchTitle: 'Lô thử', frozenAt: null, sellUntil: null, traceTagCode: null, priceHistory: [],
  } }))
  await page.goto('/cua-hang')

  await expect(page.getByRole('button', { name: 'Thêm Cua gạch son vào giỏ' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thêm Cua gạch hết hàng vào giỏ' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Xem Cua gạch hết hàng' }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Hết hàng' })).toBeDisabled()
})
