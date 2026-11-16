/* Quản trị theo dõi gọi vốn (/admin/funding): vốn đã xác nhận của từng Lô, giai đoạn gọi vốn, và nút chạy ngay một lượt chốt vốn. */
import type { AdminFundingBatch } from '../src/shared/api/api.gen'
import { expect, reply, signIn, test, vnd, type Page } from './support/app'
import { closeResult, fact, fundingBatches, fundingDetail, mockAdmin, shownDate } from './support/admin'

const [open, overdue, closed] = fundingBatches
const row = (page: Page, b: AdminFundingBatch) => page.getByRole('row').filter({ hasText: b.batchCode })

test.beforeEach(async ({ page, api }) => {
  mockAdmin(api)
  await signIn(page, 'PlatformAdmin')
})

test('mỗi Lô hiện giai đoạn, vốn đã xác nhận trên mục tiêu, vốn tối thiểu khả thi và lệnh hoàn', async ({ page, api }) => {
  await page.goto('/admin/funding')
  await expect(page.getByRole('heading', { name: 'Gọi vốn', level: 1 })).toBeVisible()

  await expect(fact(page, 'Lô đang nhận góp')).toContainText('1')
  await expect(fact(page, 'Quá hạn, chờ chốt')).toContainText('1')
  await expect(fact(page, 'Vốn đã xác nhận')).toContainText(vnd(open.confirmedCapital + overdue.confirmedCapital + closed.confirmedCapital))
  await expect(fact(page, 'Lệnh hoàn chưa xong')).toContainText('1')

  const opening = row(page, open)
  await expect(opening).toContainText(`${open.title}${open.batchCode} · HTX Năm Căn`)
  await expect(opening.getByText('Đang nhận góp', { exact: true })).toBeVisible()
  await expect(opening).toContainText(`${await shownDate(page, open.fundingOpenAt!)} – ${await shownDate(page, open.fundingDeadline!)}`)
  await expect(opening).toContainText('8 nhà đầu tư')
  await expect(opening).toContainText(`${vnd(120_000_000)} / ${vnd(200_000_000)}`)
  await expect(opening).toContainText(vnd(150_000_000))
  await expect(opening).toContainText(`Đang giữ chỗ ${vnd(10_000_000)}`)

  await expect(row(page, overdue).getByText('Quá hạn, chờ chốt')).toBeVisible()

  const done = row(page, closed)
  await expect(done.getByText('Đã chốt vốn', { exact: true })).toBeVisible()
  await expect(done).toContainText(`Chốt ${await shownDate(page, closed.capitalClosedAt!)}: ${vnd(180_000_000)} · 2 lệnh hoàn, 1 chưa xong`)

  // Bấm một dòng thì mở hồ sơ của Lô đó.
  await opening.click()
  await expect(page).toHaveURL(new RegExp(`/admin/batches/${open.batchCode}$`))
  await expect(page.getByRole('heading', { name: fundingDetail.batch.title, level: 1 })).toBeVisible()
  expect(api.writes()).toEqual([])
})

test('chạy chốt vốn ngay: phải xác nhận, gửi close-due, rồi hiện kết quả của lượt chốt', async ({ page, api }) => {
  let rows = fundingBatches
  api.get('/api/admin/funding/batches', () => rows)
  api.post('/api/admin/funding/close-due', () => {
    rows = rows.map((b) => (b.batchCode === overdue.batchCode ? { ...b, status: 'Cancelled', stage: 'Cancelled', refundCount: 4, refundOpenCount: 4 } : b))
    return closeResult
  })
  await page.goto('/admin/funding')

  // Mở rồi đóng hộp xác nhận thì không chạy gì.
  await page.getByRole('button', { name: 'Chạy chốt vốn ngay' }).click()
  const dialog = page.getByRole('dialog', { name: 'Chạy chốt vốn ngay' })
  await expect(dialog).toContainText('Lô tới hạn sẽ được chốt vốn, hoặc bị huỷ và hoàn tiền nếu chưa đủ điều kiện mở. Không hoàn tác được.')
  await dialog.getByRole('button', { name: 'Đóng' }).last().click()
  await expect(dialog).toHaveCount(0)
  expect(api.writes()).toEqual([])

  await page.getByRole('button', { name: 'Chạy chốt vốn ngay' }).click()
  await dialog.getByRole('button', { name: 'Chạy ngay' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã chạy xong một lượt chốt vốn.' })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  expect(api.sent('POST', '/api/admin/funding/close-due').map((c) => c.body)).toEqual([null])
  expect(api.writes()).toEqual(['POST /api/admin/funding/close-due'])

  // Kết quả lượt vừa chạy: Lô quá hạn không đủ vốn tối thiểu nên bị huỷ và hoàn tiền.
  await expect(page.getByRole('heading', { name: 'Vừa chốt: 1 Lô, 2 giữ chỗ hết hạn' })).toBeVisible()
  const outcome = page.getByRole('row').filter({ has: page.getByRole('link', { name: overdue.batchCode }) })
  await expect(outcome.getByRole('link', { name: overdue.batchCode })).toHaveAttribute('href', `/admin/batches/${overdue.batchCode}`)
  await expect(outcome.getByText('Huỷ, hoàn tiền', { exact: true })).toBeVisible()
  await expect(outcome).toContainText(vnd(60_000_000))

  // Bảng bên dưới tải lại theo trạng thái mới; vốn của Lô đã huỷ không còn tính vào tổng đã xác nhận.
  await expect(page.getByRole('row').filter({ hasText: overdue.title }).getByText('Đã huỷ, hoàn tiền')).toBeVisible()
  await expect(fact(page, 'Quá hạn, chờ chốt')).toContainText('0')
  await expect(fact(page, 'Vốn đã xác nhận')).toContainText(vnd(open.confirmedCapital + closed.confirmedCapital))
  await expect(fact(page, 'Lệnh hoàn chưa xong')).toContainText('5')

  await page.getByRole('button', { name: 'Ẩn' }).click()
  await expect(page.getByRole('heading', { name: /Vừa chốt/ })).toHaveCount(0)
})

test('lượt chốt vốn lỗi thì báo trong hộp xác nhận và bảng giữ nguyên', async ({ page, api }) => {
  api.post('/api/admin/funding/close-due', () => reply(409, { status: 409, detail: 'Một lượt chốt vốn khác đang chạy.' }))
  await page.goto('/admin/funding')
  await page.getByRole('button', { name: 'Chạy chốt vốn ngay' }).click()
  const dialog = page.getByRole('dialog', { name: 'Chạy chốt vốn ngay' })
  await dialog.getByRole('button', { name: 'Chạy ngay' }).click()
  await expect(dialog.getByText('Một lượt chốt vốn khác đang chạy.')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Vừa chốt/ })).toHaveCount(0)
  await expect(row(page, overdue).getByText('Quá hạn, chờ chốt')).toBeVisible()
})

test('chưa có Lô nào gọi vốn thì báo trống', async ({ page, api }) => {
  api.get('/api/admin/funding/batches', [])
  await page.goto('/admin/funding')
  await expect(page.getByText('Chưa có Lô nào gọi vốn')).toBeVisible()
  await expect(fact(page, 'Vốn đã xác nhận')).toContainText(vnd(0))
})
