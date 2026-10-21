import { test, expect, type Page } from '@playwright/test'

const code = 'TL-2026-01'
const item = (type: string, id: number, payload: object) => ({
  id: `${type}:${id}`, type, sourceId: String(id), businessDate: '2026-10-20',
  occurredAt: type === 'ProductionLog' ? null : '2026-10-20T01:30:00Z', timeBasis: type === 'ProductionLog' ? 'Date' : 'Occurred',
  productionLog: null, slotEvent: null, evidence: null, alert: null, ...payload,
})
const entries = [
  item('Alert', 1, { alert: { type: 'WaterQuality', severity: 'Medium', message: 'Độ mặn ngoài khoảng hộ nuôi đã cấu hình.', status: 'Acknowledged', acknowledgedAt: '2026-10-20T02:00:00Z', escalatedAt: null } }),
  item('Evidence', 2, { evidence: { mediaType: 'Photo', source: 'InAppCapture', slotCode: '0012', reviewStatus: 'Accepted', fileUrl: `/api/batches/${code}/timeline/evidence/2/file` } }),
  item('SlotEvent', 3, { slotEvent: { eventType: 'Relocated', slotCode: '0012', destinationSlotCode: '0018', quantity: 1, note: 'Chuyển sang hộp sạch' } }),
  item('ProductionLog', 4, { productionLog: { ph: 7.5, waterTempC: 28, salinityPpt: 20, feedKg: 1.25, source: 'Manual', plausibilityFlag: 'Ok', note: 'Kiểm tra nước buổi sáng' } }),
]
const first = { batchCode: code, timeZone: 'Asia/Ho_Chi_Minh', groups: [{ date: '2026-10-20', items: entries }], nextBefore: '2026-10-20', hasMore: true }
async function setup(page: Page) {
  await page.addInitScript(() => localStorage.setItem('crabshare-auth', JSON.stringify({ state: {
    token: 'timeline-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 42, fullName: 'Nhà đầu tư', email: 'timeline@test.local', roles: ['Investor'], status: 'Active', phone: null, operatorId: null },
  }, version: 0 })))
  await page.route('**/api/investor/notifications**', r => r.fulfill({ json: { items: [], total: 0, unreadCount: 0 } }))
  await page.route('**/api/batches/*', r => r.fulfill({ json: {
    batchCode: code, title: 'Cua thịt Năm Căn', operatorName: 'HTX Năm Căn', crabType: 'FatteningMudCrab', status: 'InProduction',
    seedQuantity: 120, expectedOutputKg: 65, cycleDays: 90, restockCutoffDays: 7, minViableCapital: 80000000, targetCapital: 100000000, maxCapital: 120000000, minContribution: 1000000, operatorSharePct: 20,
    fundingOpenAt: '2026-10-01T00:00:00Z', fundingDeadline: '2026-10-30T00:00:00Z',
    fundingProgress: { confirmedCapital: 100000000, reservedCapital: 0, investorCount: 8, pctOfTarget: 100, percentLabel: '100%' },
    standardCost: { versionNo: 1, status: 'Locked', total: 80000000, items: [], lockedAt: '2026-09-30T00:00:00Z' },
  } }))
}

test('production timeline renders real payloads, private photo and full-day pagination without duplicate refresh', async ({ page }) => {
  await setup(page)
  await page.route('**/timeline?**', r => {
    expect(r.request().headers()['authorization']).toBe('Bearer timeline-token')
    return r.fulfill({ json: new URL(r.request().url()).searchParams.has('before')
      ? { ...first, groups: [{ date: '2026-10-18', items: [{ ...entries[3], id: 'ProductionLog:5', sourceId: '5', businessDate: '2026-10-18' }] }], hasMore: false, nextBefore: null } : first })
  })
  await page.route('**/timeline/evidence/2/file', r => {
    expect(r.request().headers()['authorization']).toBe('Bearer timeline-token')
    return r.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEwAAAABJRU5ErkJggg==', 'base64') })
  })
  await page.goto(`/nha-dau-tu/lo/${code}`)
  const timeline = page.getByRole('region', { name: 'Nhật trình sản xuất' })
  await expect(timeline.getByRole('heading', { name: 'Nhật trình sản xuất' })).toBeVisible()
  await expect(timeline.getByText('1,25')).toBeVisible()
  await expect(timeline.getByText('°C', { exact: true })).toBeVisible()
  await expect(timeline.getByText('Đã phản hồi', { exact: true })).toBeVisible()
  await expect(timeline.getByText('0012 → 0018')).toBeVisible()
  await timeline.getByRole('button', { name: 'Xem ảnh bằng chứng 2' }).scrollIntoViewIfNeeded()
  await expect(timeline.getByRole('img', { name: 'Bằng chứng hộp 0012' })).toHaveAttribute('src', /^blob:/)
  await timeline.getByRole('button', { name: 'Xem ảnh bằng chứng 2' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await timeline.getByRole('button', { name: 'Xem những ngày trước' }).click()
  await expect(timeline.locator('[data-timeline-id]')).toHaveCount(5)
  await timeline.getByRole('button', { name: 'Làm mới nhật trình' }).click()
  await expect(timeline.locator('[data-timeline-id]')).toHaveCount(4)
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width !== 320) await timeline.screenshot({ path: `test-results/timeline-${width}.png` })
  }
})

test('403 after loading more clears every old timeline item', async ({ page }) => {
  await setup(page)
  await page.route('**/timeline?**', r => new URL(r.request().url()).searchParams.has('before')
    ? r.fulfill({ status: 403, json: { detail: 'Không có quyền.' } }) : r.fulfill({ json: first }))
  await page.route('**/timeline/evidence/**', r => r.fulfill({ status: 404 }))
  await page.goto(`/nha-dau-tu/lo/${code}`)
  const timeline = page.getByRole('region', { name: 'Nhật trình sản xuất' })
  await expect(timeline.locator('[data-timeline-id]')).toHaveCount(4)
  await timeline.getByRole('button', { name: 'Xem những ngày trước' }).click()
  await expect(timeline.getByRole('alert')).toContainText('quyền')
  await expect(timeline.locator('[data-timeline-id]')).toHaveCount(0)
})

test('empty timeline offers refresh without fabricated events', async ({ page }) => {
  await setup(page)
  await page.route('**/timeline?**', r => r.fulfill({ json: { ...first, groups: [], hasMore: false, nextBefore: null } }))
  await page.goto(`/nha-dau-tu/lo/${code}`)
  const timeline = page.getByRole('region', { name: 'Nhật trình sản xuất' })
  await expect(timeline.getByText('Nhật trình đang chờ những ghi nhận đầu tiên')).toBeVisible()
  await expect(timeline.getByRole('button', { name: 'Làm mới nhật trình' })).toBeEnabled()
  await expect(timeline.locator('[data-timeline-id]')).toHaveCount(0)
})
