import { test, expect, type Page } from '@playwright/test'

async function setup(page: Page, memberRole = 'Owner') {
  await page.addInitScript(() => localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token: 'test-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 1, fullName: 'Viên', email: 'test@local', status: 'Active', roles: ['OperatorMember'], operatorId: 1 } }, version: 0 })))
  await page.route('**/api/operators/me', route => route.fulfill({ json: { operatorId: 1, legalName: 'Trại thử', status: 'Approved', memberRole, canEdit: false, canSubmit: false } }))
}
const box = { slotCode: '0001', status: 'Available', rowCode: null, rackNo: null, tierNo: null, columnNo: null }

test('creates a padded range then changes a box status and filters', async ({ page }) => {
  await setup(page)
  let items: typeof box[] = []
  await page.route('**/api/boxes?*', route => {
    const p = new URL(route.request().url()).searchParams
    const filtered = items.filter(b => !p.get('status') || b.status === p.get('status'))
    return route.fulfill({ json: { items: filtered, total: filtered.length, page: 1, pageSize: 50 } })
  })
  await page.route('**/api/boxes/range', route => {
    expect(route.request().postDataJSON()).toEqual({ from: 1, to: 1200, width: 4 })
    items = [box]
    return route.fulfill({ status: 201, json: { created: 1200, from: '0001', to: '1200' } })
  })
  await page.route('**/api/boxes/0001', route => {
    expect(route.request().postDataJSON()).toEqual({ status: 'Maintenance' })
    items = [{ ...box, status: 'Maintenance' }]
    return route.fulfill({ json: items[0] })
  })
  await page.goto('/operator/boxes')
  await page.getByRole('button', { name: 'Tạo hàng loạt', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Tạo hộp' }).click()
  await expect(page.getByText('Đã tạo 1.200 hộp (0001–1200).')).toBeVisible()
  await page.getByRole('button', { name: 'Hộp 0001, Sẵn sàng' }).click()
  await page.getByRole('button', { name: 'Chuyển bảo trì' }).click()
  await page.getByLabel('Trạng thái hộp').selectOption('Available')
  await expect(page.getByText('Không có hộp phù hợp.')).toBeVisible()
})

test('capacity error retains input and staff cannot create', async ({ page }) => {
  await setup(page)
  await page.route('**/api/boxes?*', route => route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 50 } }))
  await page.route('**/api/boxes/range', route => route.fulfill({ status: 422, json: { code: 'box.over_capacity', detail: 'Tổng số hộp vượt sức chứa đã được duyệt.' } }))
  await page.goto('/operator/boxes')
  await page.getByRole('button', { name: 'Tạo hàng loạt', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Tạo hộp' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('vượt sức chứa')
  await expect(page.getByLabel('Đến số')).toHaveValue('1200')
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng', exact: true }).click()
  await setup(page, 'Staff')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Hộp nuôi', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tạo hàng loạt', exact: true })).toHaveCount(0)
})

test('adds one box with optional location on a phone', async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width: 390, height: 844 })
  let items: typeof box[] = []
  await page.route('**/api/boxes?*', route => route.fulfill({ json: { items, total: items.length, page: 1, pageSize: 50 } }))
  await page.route('**/api/boxes', route => {
    expect(route.request().postDataJSON()).toEqual({ slotCode: 'A01', rowCode: 'A', rackNo: 1, tierNo: 2, columnNo: null })
    items = [{ ...box, slotCode: 'A01' }]
    return route.fulfill({ status: 201, json: items[0] })
  })
  await page.goto('/operator/boxes')
  await page.getByRole('button', { name: 'Thêm hộp', exact: true }).click()
  await page.getByLabel('Số hộp', { exact: true }).fill('A01')
  await page.getByLabel('Dãy (tuỳ chọn)').fill('A')
  await page.getByLabel('Kệ (tuỳ chọn)').fill('1')
  await page.getByLabel('Tầng (tuỳ chọn)').fill('2')
  await page.getByRole('dialog').getByRole('button', { name: 'Tạo hộp' }).click()
  await expect(page.getByRole('button', { name: 'Hộp A01, Sẵn sàng' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('retries loading and passes search, status and page to API', async ({ page }) => {
  await setup(page, 'Staff')
  let fail = true
  await page.route('**/api/boxes?*', route => {
    if (fail) return route.fulfill({ status: 500, json: { detail: 'Tạm thời không tải được hộp.' } })
    const p = new URL(route.request().url()).searchParams
    const current = p.get('page') === '2' ? { ...box, slotCode: '0051' } : box
    const items = p.get('search') === '9999' || p.get('status') === 'Maintenance' ? [] : [current]
    return route.fulfill({ json: { items, total: items.length ? 51 : 0, page: Number(p.get('page')), pageSize: 50 } })
  })
  await page.goto('/operator/boxes')
  await expect(page.getByRole('alert')).toContainText('Tạm thời không tải được hộp.')
  fail = false
  await page.getByRole('button', { name: 'Thử lại' }).click()
  await page.getByRole('button', { name: 'Trang sau' }).click()
  await expect(page.getByRole('button', { name: 'Hộp 0051, Sẵn sàng' })).toBeVisible()
  await page.getByLabel('Tìm số hộp').fill('9999')
  await expect(page.getByText('Không có hộp phù hợp.')).toBeVisible()
  await page.getByLabel('Tìm số hộp').clear()
  await page.getByLabel('Trạng thái hộp').selectOption('Maintenance')
  await expect(page.getByText('Không có hộp phù hợp.')).toBeVisible()
})
