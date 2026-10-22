import { expect, test } from '@playwright/test'

const code = '23456789ABCD'
const trace = {
  tagCode: code,
  batchCode: 'BT-TRACE-001',
  crabType: 'FatteningMudCrab',
  itemStatus: 'Delivered',
  weightG: 250,
  gradeCode: 'L3',
  gradeName: 'Hạng 3',
  stockedAt: '2026-09-01T00:00:00Z',
  harvestedAt: '2026-10-01T00:00:00Z',
  slotCode: '0001',
  events: [{ eventType: 'Delivered', occurredAt: '2026-10-02T00:00:00Z', note: 'PRIVATE-EVENT-NOTE' }],
  operatorName: 'PRIVATE-OPERATOR-NAME',
  farmAddress: 'PRIVATE-FARM-ADDRESS',
  itemUuid: 'PRIVATE-INTERNAL-UUID',
  harvestPhotoUri: 'https://private.example/harvest.jpg',
  orderNo: 'PRIVATE-ORDER-001',
}

test('opens the QR URL directly without login and renders only public trace fields', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  const requests: string[] = []
  await page.route(`**/api/trace/${code}`, async route => {
    requests.push(route.request().url())
    await route.fulfill({ json: trace })
  })

  await page.goto(`/truy-xuat/${code}`)

  await expect(page.getByText('Lô BT-TRACE-001')).toBeVisible()
  await expect(page.getByText('Hạng 3')).toBeVisible()
  await expect(page.getByText('250 g')).toBeVisible()
  await expect(page.getByText('0001', { exact: true })).toBeVisible()
  await expect(page.getByText('PRIVATE-OPERATOR-NAME')).toHaveCount(0)
  await expect(page.getByText('PRIVATE-FARM-ADDRESS')).toHaveCount(0)
  await expect(page.getByText('PRIVATE-INTERNAL-UUID')).toHaveCount(0)
  await expect(page.getByText('PRIVATE-ORDER-001')).toHaveCount(0)
  await expect(page.getByText('PRIVATE-EVENT-NOTE')).toHaveCount(0)
  await expect(page.locator('img')).toHaveCount(0)
  expect(requests).toHaveLength(1)
  expect(new URL(requests[0]).pathname).toBe(`/api/trace/${code}`)
})

test('shows a useful invalid-code state', async ({ page }) => {
  await page.route('**/api/trace/invalid', route => route.fulfill({
    status: 400,
    json: { code: 'tag.invalid_code', detail: 'Mã tem không đúng định dạng.' },
  }))

  await page.goto('/truy-xuat/invalid')

  await expect(page.getByRole('heading', { name: 'Mã tem không hợp lệ' })).toBeVisible()
})

test('shows distinct public errors for missing, inactive, and void tags', async ({ page }) => {
  const cases = [
    { code: 'tag.not_found', heading: 'Không tìm thấy tem' },
    { code: 'tag.not_active', heading: 'Tem chưa được kích hoạt' },
    { code: 'tag.void', heading: 'Tem đã bị hủy' },
  ]
  await page.route('**/api/trace/*', route => {
    const code = new URL(route.request().url()).pathname.split('/').at(-1)
    const current = cases.find((item, index) => `ERR${index}` === code)!
    return route.fulfill({ status: current.code === 'tag.not_found' ? 404 : 422, json: { code: current.code } })
  })

  for (const [index, current] of cases.entries()) {
    await page.goto(`/truy-xuat/ERR${index}`)
    await expect(page.getByRole('heading', { name: current.heading })).toBeVisible()
  }
})

test('shows loading and retries a failed public lookup', async ({ page }) => {
  let attempts = 0
  let notifyStarted!: () => void
  let releaseFailure!: () => void
  const started = new Promise<void>(resolve => { notifyStarted = resolve })
  await page.route(`**/api/trace/${code}`, async route => {
    attempts += 1
    if (attempts === 1) {
      notifyStarted()
      await new Promise<void>(resolve => { releaseFailure = resolve })
      await route.abort('failed')
      return
    }
    await route.fulfill({ json: trace })
  })

  await page.goto(`/truy-xuat/${code}`)

  await started
  await expect(page.getByRole('status')).toContainText('Đang tải thông tin truy xuất')
  releaseFailure()
  await expect(page.getByRole('heading', { name: 'Chưa tải được thông tin' })).toBeVisible()
  await page.getByRole('button', { name: 'Thử lại' }).click()
  await expect(page.getByText('Lô BT-TRACE-001')).toBeVisible()
  expect(attempts).toBe(2)
})
