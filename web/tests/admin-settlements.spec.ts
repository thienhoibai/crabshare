/* Danh sách quyết toán của Quản trị (/admin/settlements): Lô đang bán, chờ quyết toán, đang quyết toán, đã đóng;
   xem điều kiện còn thiếu và tính bảng nháp lần đầu. Các bước sau bảng nháp nằm ở trang chi tiết. */
import type { AdminSettlementSummary, CalculateSettlementRequest } from '../src/shared/api/api.gen'
import { expect, reply, signIn, test, vnd, type Page } from './support/app'
import { draftSettlement, mockAdmin, settlements, shownDateTime } from './support/admin'

const [awaiting, proposed, selling, closed] = settlements
const row = (page: Page, s: AdminSettlementSummary) => page.getByRole('row').filter({ hasText: s.batchCode })

test.beforeEach(async ({ page, api }) => {
  mockAdmin(api)
  await signIn(page, 'PlatformAdmin')
})

test('mỗi Lô hiện trạng thái, bảng quyết toán, doanh thu thực thu, góp ý và đúng một việc kế tiếp', async ({ page, api }) => {
  await page.goto('/admin/settlements')
  await expect(page.getByRole('heading', { name: 'Quyết toán', level: 1 })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveText(['Tất cả', 'Chờ và đang quyết toán2', 'Đang bán', 'Đã đóng'])

  // Lô chờ quyết toán chưa có bảng: việc kế tiếp là tính bảng nháp.
  const first = row(page, awaiting)
  await expect(first).toContainText('HTX Ngọc Hiển')
  await expect(first.getByText('Chờ quyết toán', { exact: true })).toBeVisible()
  await expect(first).toContainText('Chưa tính')
  await expect(first).toContainText(vnd(265_000_000))
  await expect(first.getByRole('button', { name: 'Tính quyết toán' })).toBeVisible()

  // Bảng đang lấy góp ý: hiện hạn góp ý và số góp ý chờ trả lời.
  const second = row(page, proposed)
  await expect(second.getByText('Đang quyết toán', { exact: true })).toBeVisible()
  await expect(second.getByText('Đang lấy góp ý')).toBeVisible()
  await expect(second).toContainText(`Hạn góp ý ${await shownDateTime(page, proposed.feedbackDeadline!)}`)
  await expect(second).toContainText(vnd(310_000_000))
  await expect(second.getByText('2 chờ trả lời')).toBeVisible()
  await expect(second.getByRole('link', { name: 'Làm tiếp' })).toHaveAttribute('href', '/admin/settlements/31')

  // Lô còn đang bán: chưa tính được, chỉ xem còn thiếu điều kiện nào.
  const third = row(page, selling)
  await expect(third.getByText('Đang bán và giao')).toBeVisible()
  await expect(third.getByRole('button')).toHaveText(['Còn thiếu gì'])

  const last = row(page, closed)
  await expect(last).toContainText('Lần tính 1')
  await expect(last.getByRole('link', { name: 'Xem bảng' })).toHaveAttribute('href', '/admin/settlements/12')
  await expect(last.getByRole('button')).toHaveCount(0)

  // Các mục lọc ngay trên dữ liệu đã tải, không gọi lại máy chủ.
  await page.getByRole('tab', { name: 'Đang bán' }).click()
  await expect(page.getByRole('row')).toHaveCount(2)
  await expect(row(page, selling)).toBeVisible()
  await page.getByRole('tab', { name: 'Đã đóng' }).click()
  await expect(page.getByRole('row')).toHaveCount(2)
  await expect(row(page, closed)).toBeVisible()
  await page.getByRole('tab', { name: 'Chờ và đang quyết toán' }).click()
  await expect(page.getByRole('row')).toHaveCount(3)
  expect(api.sent('GET', '/api/admin/settlements')).toHaveLength(1)
  expect(api.writes()).toEqual([])
})

test('Còn thiếu gì: mở các điều kiện chờ quyết toán của đúng Lô đó', async ({ page, api }) => {
  await page.goto('/admin/settlements')
  await row(page, selling).getByRole('button', { name: 'Còn thiếu gì' }).click()
  const dialog = page.getByRole('dialog', { name: 'Điều kiện chờ quyết toán' })
  await expect(dialog).toContainText(`Lô ${selling.batchCode}`)
  const steps = dialog.getByRole('listitem')
  await expect(steps).toHaveCount(3)
  await expect(steps.nth(0)).toContainText('Mọi con cua đã giao, bán hoặc ghi nhận hao hụt')
  await expect(steps.nth(0)).toContainText('Còn 35 mục')
  await expect(steps.nth(1)).toContainText('Còn 2 mục')
  // Điều kiện đã đạt không kèm số còn thiếu.
  await expect(steps.nth(2)).toContainText('Không còn khiếu nại chưa xử lý')
  await expect(steps.nth(2)).not.toContainText('Còn 0 mục')
  expect(api.sent('GET', `/api/batches/${selling.batchCode}/settlement-readiness`)).toHaveLength(1)
  expect(api.writes()).toEqual([])
})

test('tính quyết toán: xác nhận rồi gửi lệnh tính bảng nháp và mở bảng vừa tính', async ({ page, api }) => {
  const calculate = `/api/admin/batches/${awaiting.batchCode}/settlements`
  api.post(calculate, draftSettlement)
  await page.goto('/admin/settlements')
  await row(page, awaiting).getByRole('button', { name: 'Tính quyết toán' }).click()
  const dialog = page.getByRole('dialog', { name: 'Tính bảng quyết toán nháp' })
  await expect(dialog).toContainText(`${awaiting.batchCode} · HTX Ngọc Hiển`)
  await expect(dialog).toContainText('Bảng nháp chỉ bạn thấy, tính lại được cho tới khi duyệt.')
  await dialog.getByRole('button', { name: 'Tính quyết toán' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã tính bảng quyết toán nháp.' })).toBeVisible()
  const body: CalculateSettlementRequest = { taxWithholdingPct: 0 }
  expect(api.sent('POST', calculate).map((c) => c.body)).toEqual([body])
  expect(api.writes()).toEqual([`POST ${calculate}`])

  // Sang thẳng bảng vừa tính: bản nháp, việc kế tiếp là công bố.
  await expect(page).toHaveURL(new RegExp(`/admin/settlements/${draftSettlement.settlementId}$`))
  await expect(page.getByRole('heading', { name: `Quyết toán ${draftSettlement.batchTitle}`, level: 1 })).toBeVisible()
  await expect(page.getByRole('main').getByText('Bảng nháp', { exact: true })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Phần chia cho nhà đầu tư' })).toContainText(vnd(draftSettlement.distributable))
  await expect(page.getByRole('button', { name: 'Công bố bảng' })).toBeVisible()
})

test('máy chủ không tính được thì báo lỗi trong hộp xác nhận và ở lại danh sách', async ({ page, api }) => {
  api.post(`/api/admin/batches/${awaiting.batchCode}/settlements`, () =>
    reply(409, { status: 409, code: 'settlement.locked', detail: 'Bảng quyết toán của Lô đã được duyệt (BR-206).' }))
  await page.goto('/admin/settlements')
  await row(page, awaiting).getByRole('button', { name: 'Tính quyết toán' }).click()
  const dialog = page.getByRole('dialog', { name: 'Tính bảng quyết toán nháp' })
  await dialog.getByRole('button', { name: 'Tính quyết toán' }).click()
  await expect(dialog.getByText('Bảng quyết toán của Lô đã được duyệt.', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/settlements$/)
})

test('chưa có Lô nào tới giai đoạn quyết toán thì báo trống', async ({ page, api }) => {
  api.get('/api/admin/settlements', [])
  await page.goto('/admin/settlements')
  await expect(page.getByText('Chưa có Lô nào tới giai đoạn quyết toán')).toBeVisible()
  await page.getByRole('tab', { name: 'Đã đóng' }).click()
  await expect(page.getByText('Chưa có Lô nào đã đóng')).toBeVisible()
})
