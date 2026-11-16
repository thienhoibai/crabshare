/* /nha-dau-tu/thong-bao — Thông báo của nhà đầu tư (GET /api/me/notifications?page=&pageSize=), liệt kê theo thời gian.
   Chuông ở thanh trên dẫn tới trang này. Máy chủ không lưu mốc đã đọc nên trang không có số "chưa đọc". */
import type { InvestorNotification, NotificationPage } from '../src/shared/api/api.gen'
import { daysFromNow, expect, file, reply, signIn, test, vnd } from './support/app'
import { DONE, OPEN, RUN, mockInvestor, notifications, open, viDateTime } from './support/investor'

const notice = (id: number, extra: Partial<InvestorNotification> = {}): InvestorNotification => ({
  id: `ProductionReceived:${id}`, type: 'ProductionReceived', title: 'Nhật ký nuôi mới', body: `Đã nhận nhật ký nuôi mới của lô ${RUN}.`,
  at: daysFromNow(-id), batchCode: RUN, canOpenPortfolio: true, amount: null, ...extra,
})

test.beforeEach(async ({ page, api }) => {
  mockInvestor(api)
  await signIn(page, 'Investor')
})

test('chuông dẫn tới trang thông báo; mỗi thông báo có nội dung, số tiền, thời điểm và lối mở Lô', async ({ page, api }) => {
  await page.goto('/nha-dau-tu')
  await page.getByRole('main').getByRole('link', { name: 'Cảnh báo và thông báo' }).click()
  await expect(page).toHaveURL(/\/nha-dau-tu\/thong-bao$/)
  await expect(page.getByRole('heading', { name: 'Thông báo', level: 1 })).toBeVisible()

  // Mới nhất ở trên, đúng thứ tự máy chủ trả về.
  const items = page.getByRole('article')
  await expect(items).toHaveText([/^Cảnh báo vận hành/, /^Đã nhận tiền/, /^Đã chi trả/])
  const paid = items.nth(1)
  await expect(paid).toContainText(`Đã nhận tiền · ${vnd(10_000_000)}`)
  await expect(paid).toContainText(`Khoản góp 10.000.000 đ cho lô ${OPEN} đã được xác nhận.`)
  await expect(paid).toContainText(viDateTime(notifications.items[1].at))
  await expect(items.nth(0).getByRole('link', { name: `Mở Lô ${RUN}` })).toHaveAttribute('href', `/nha-dau-tu/danh-muc/${RUN}`)
  await expect(items.nth(2)).toContainText(`Đã chi trả · ${vnd(21_757_500)}`)
  await expect(items.nth(2).getByRole('link', { name: `Mở Lô ${DONE}` })).toBeVisible()
  // Thông báo không kèm số tiền thì tiêu đề không có phần số.
  await expect(items.nth(0).getByText('Cảnh báo vận hành', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Trang sau' })).toHaveCount(0)

  const calls = api.sent('GET', '/api/me/notifications')
  expect(calls.map((c) => c.query)).toEqual([{ page: '1', pageSize: '20' }])
  expect(calls[0].auth).toBe('Bearer test-token')

  // Mở Lô từ thông báo: sang trang riêng của Lô trong danh mục.
  await paid.getByRole('link', { name: `Mở Lô ${OPEN}` }).click()
  await expect(page).toHaveURL(new RegExp(`/nha-dau-tu/danh-muc/${OPEN}$`))
  await expect(page.getByRole('heading', { name: open.batch.title, level: 1 })).toBeVisible()
  expect(api.writes()).toEqual([])
})

test('thông báo của Lô không còn mở được thì không có liên kết hỏng', async ({ page, api }) => {
  const refunded = notice(1, { id: 'PaymentConfirmed:999', type: 'PaymentConfirmed', title: 'Đã nhận tiền', body: 'Khoản góp 5.000.000 đ cho lô P-2607-01 đã được xác nhận.', batchCode: 'P-2607-01', canOpenPortfolio: false, amount: 5_000_000 })
  api.get('/api/me/notifications', { ...notifications, items: [refunded, notice(2)], total: 2 })
  await page.goto('/nha-dau-tu/thong-bao')
  const items = page.getByRole('article')
  await expect(items).toHaveCount(2)
  await expect(items.nth(0)).toContainText(`Đã nhận tiền · ${vnd(5_000_000)}`)
  await expect(items.nth(0).getByRole('link')).toHaveCount(0)
  await expect(items.nth(1).getByRole('link', { name: `Mở Lô ${RUN}` })).toBeVisible()
})

test('nhiều hơn một trang thì chuyển trang bằng tham số của máy chủ', async ({ page, api }) => {
  api.get('/api/me/notifications', (call): NotificationPage => {
    const pageNo = Number(call.query.page)
    const items = pageNo === 1 ? Array.from({ length: 20 }, (_, i) => notice(i + 1)) : [notice(21, { title: 'Hợp đồng đã đủ chữ ký', type: 'ContractSigned', body: `Hợp đồng góp vốn lô ${RUN} đã có đủ chữ ký.` })]
    return { items, page: pageNo, pageSize: 20, total: 41, asOf: daysFromNow(0) }
  })
  await page.goto('/nha-dau-tu/thong-bao')
  await expect(page.getByRole('article')).toHaveCount(20)
  await expect(page.getByText('41 thông báo')).toBeVisible()
  await expect(page.getByText('Trang 1 / 3')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Trang trước' })).toBeDisabled()

  await page.getByRole('button', { name: 'Trang sau' }).click()
  await expect(page.getByText('Trang 2 / 3')).toBeVisible()
  await expect(page.getByRole('article')).toHaveText([/^Hợp đồng đã đủ chữ ký/])
  expect(api.sent('GET', '/api/me/notifications').map((c) => c.query)).toEqual([{ page: '1', pageSize: '20' }, { page: '2', pageSize: '20' }])
})

test('không tải được thì hiện lỗi của máy chủ; thử lại ra danh sách thật, kể cả khi rỗng', async ({ page, api }) => {
  let down = true
  api.get('/api/me/notifications', () => (down ? reply(503, { status: 503, detail: 'Không tải được thông báo.' }) : { ...notifications, items: [], total: 0 }))
  await page.goto('/nha-dau-tu/thong-bao')
  await expect(page.getByRole('alert')).toContainText('Không tải được thông báo.')
  await expect(page.getByRole('article')).toHaveCount(0)

  down = false
  await page.getByRole('button', { name: 'Thử lại' }).click()
  await expect(page.getByText('Chưa có thông báo nào')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('article')).toHaveCount(0)
})

/* VITE_API_URL trỏ nhầm sang máy chủ web thì /api/… trả index.html với mã 200. shared/api/http.ts coi phản hồi HTML là lỗi,
   nên trang hiện báo lỗi và vẫn giữ khung cổng thay vì đọc trang HTML như dữ liệu rồi vỡ. */
test('máy chủ trả trang HTML thay cho JSON (trỏ sai địa chỉ API) thì báo lỗi, không vỡ trang', async ({ page, api }) => {
  api.get('/api/me/notifications', file('<!doctype html><html><body>wrong host</body></html>', 'text/html'))
  await page.goto('/nha-dau-tu/thong-bao')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Thông báo', level: 1 })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Menu Nhà đầu tư' })).toBeVisible()
})

test('trang thông báo vừa màn hình điện thoại, không phải cuộn ngang', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/nha-dau-tu/thong-bao')
  await expect(page.getByRole('article')).toHaveCount(3)
  await expect(page.getByRole('article').first()).toContainText(viDateTime(notifications.items[0].at))
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  // Trên điện thoại chuông nằm ở thanh đầu trang và vẫn dẫn tới trang này.
  await expect(page.getByRole('link', { name: 'Cảnh báo và thông báo' }).and(page.locator(':visible'))).toHaveAttribute('href', '/nha-dau-tu/thong-bao')
})
