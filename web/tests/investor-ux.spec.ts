import { expect, reply, signIn, test } from './support/app'
import { DONE, RUN, contracts, mockInvestor, moneyClosed, moneyRunning, panel } from './support/investor'

test.beforeEach(async ({ page, api }) => {
  mockInvestor(api)
  await signIn(page, 'Investor')
})

test('nguồn việc lỗi vẫn giữ việc đã biết và cho thử lại phần chưa tải', async ({ page, api }) => {
  let down = true
  api.get('/api/me/contracts', () => down ? reply(503, { detail: 'Không tải được hợp đồng.' }) : contracts)
  await page.goto('/nha-dau-tu')
  const queue = panel(page, 'Việc cần làm')
  await expect(queue.getByText('Chưa kiểm tra được hết việc cần làm.')).toBeVisible()
  await expect(queue.getByRole('link', { name: /Biểu quyết/ })).toBeVisible()
  await expect(queue.getByText('Không có việc nào đang chờ.')).toHaveCount(0)
  down = false
  await queue.getByRole('button', { name: 'Thử lại' }).click()
  await expect(queue.getByRole('link', { name: /Ký hợp đồng/ })).toBeVisible()
  await expect(queue.getByText('Chưa kiểm tra được hết việc cần làm.')).toHaveCount(0)
})

test('nguồn đang tải không được thông báo là không có việc', async ({ page, api }) => {
  let complete: (value: typeof contracts) => void = () => {}
  api.get('/api/me/contracts', () => new Promise<typeof contracts>((resolve) => { complete = resolve }))
  await page.goto('/nha-dau-tu')
  const queue = panel(page, 'Việc cần làm')
  await expect(queue.getByText('Đang kiểm tra việc cần làm…')).toBeVisible()
  await expect(queue.getByText('Không có việc nào đang chờ.')).toHaveCount(0)
  complete(contracts)
  await expect(queue.getByRole('link', { name: /Ký hợp đồng/ })).toBeVisible()
})

test('thông báo nhật trình và quyết toán mở đúng mục của lô', async ({ page, api }) => {
  api.get('/api/me/notifications', {
    items: [
      { id: 'ProductionReceived:1', type: 'ProductionReceived', title: 'Nhật ký mới', body: 'Đã nhận nhật ký.', at: new Date().toISOString(), batchCode: RUN, canOpenPortfolio: true, amount: null },
      { id: 'SettlementPublished:1', type: 'SettlementPublished', title: 'Bảng quyết toán', body: 'Đã công bố bảng.', at: new Date().toISOString(), batchCode: RUN, canOpenPortfolio: true, amount: null },
    ], page: 1, pageSize: 20, total: 2, asOf: new Date().toISOString(),
  })
  await page.goto('/nha-dau-tu/thong-bao')
  const notices = page.locator('article')
  await expect(notices.nth(0).getByRole('link')).toHaveAttribute('href', `/nha-dau-tu/danh-muc/${RUN}?tab=nhat-trinh`)
  await expect(notices.nth(1).getByRole('link')).toHaveAttribute('href', `/nha-dau-tu/danh-muc/${RUN}?tab=quyet-toan`)
})

test('không tải được tiền của mọi lô thì không hiển thị số không và có thể tải lại', async ({ page, api }) => {
  let down = true
  api.get(`/api/batches/${RUN}/money-summary`, () => down ? reply(503, { detail: 'Chưa tải được.' }) : moneyRunning)
  api.get(`/api/batches/${DONE}/money-summary`, () => down ? reply(503, { detail: 'Chưa tải được.' }) : moneyClosed)
  await page.goto('/nha-dau-tu', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Chưa tải được số liệu vốn', { exact: true })).toBeVisible()
  await expect(page.getByText('0đ', { exact: true })).toHaveCount(0)
  down = false
  await page.getByRole('button', { name: 'Thử lại số liệu vốn' }).click()
  await expect(page.getByText('50.000.000đ', { exact: true })).toBeVisible()
  await expect(page.getByText('Chưa tải được số liệu vốn', { exact: true })).toHaveCount(0)
})
