/* /nha-dau-tu/danh-muc — Các Lô tôi đã góp vốn: tổng của cả danh mục, từng Lô, lọc và phân trang do máy chủ làm. */
import type { PortfolioPage } from '../src/shared/api/api.gen'
import { expect, signIn, test, vnd, type Page } from './support/app'
import { DONE, OPEN, RUN, closed, fact, mockInvestor, open, portfolioItems, portfolioPage, running, viDate } from './support/investor'

/** Các dòng Lô trong danh sách (mỗi dòng là một liên kết sang trang của Lô). */
const lots = (page: Page) => page.getByRole('main').getByRole('link').filter({ hasText: /P-\d{4}-\d{2}/ })

test.beforeEach(async ({ page, api }) => {
  mockInvestor(api)
  await signIn(page, 'Investor')
})

test('danh mục hiện tổng vốn đã ghi nhận và từng Lô với giai đoạn, số tiền, phần vốn', async ({ page, api }) => {
  await page.goto('/nha-dau-tu/danh-muc')
  await expect(page.getByRole('heading', { name: 'Lô tôi đã góp', level: 1 })).toBeVisible()

  await expect(fact(page, 'Vốn đã xác nhận')).toContainText(vnd(60_000_000))
  await expect(fact(page, 'Ở Lô đang chạy')).toContainText(vnd(40_000_000))
  await expect(fact(page, 'Lô đang chạy')).toContainText('2 / 3')
  await expect(fact(page, 'Quyết toán đã duyệt')).toContainText(vnd(21_757_500))

  const rows = lots(page)
  await expect(rows).toHaveText([new RegExp(running.batch.title), new RegExp(open.batch.title), new RegExp(closed.batch.title)])
  // Lô đang nuôi: ngày nuôi và phần vốn đã chốt.
  await expect(rows.nth(0)).toHaveAttribute('href', `/nha-dau-tu/danh-muc/${RUN}`)
  await expect(rows.nth(0)).toContainText(`${RUN} · HTX Năm Căn`)
  await expect(rows.nth(0)).toContainText('Đang lưu nuôi')
  await expect(rows.nth(0)).toContainText('1 cảnh báo')
  await expect(rows.nth(0)).toContainText('Ngày nuôi 12 / 30')
  await expect(rows.nth(0)).toContainText(vnd(30_000_000))
  await expect(rows.nth(0)).toContainText('15% vốn của Lô')
  await expect(rows.nth(0)).not.toContainText('chưa chốt')
  // Lô còn gọi vốn: hạn góp vốn, phần vốn còn thay đổi.
  await expect(rows.nth(1)).toContainText('Đang gọi vốn')
  await expect(rows.nth(1)).toContainText(`Hạn góp vốn ${viDate(open.batch.fundingDeadline!)}`)
  await expect(rows.nth(1)).toContainText('16,67% vốn của Lô, chưa chốt')
  await expect(rows.nth(1)).not.toContainText('cảnh báo')
  // Lô đã đóng: số thực nhận theo bảng quyết toán đã duyệt thay cho phần vốn.
  await expect(rows.nth(2)).toContainText('Đã đóng')
  await expect(rows.nth(2)).toContainText(`Thực nhận ${vnd(21_757_500)}`)
  await expect(rows.nth(2)).not.toContainText('vốn của Lô')

  expect(api.sent('GET', '/api/investor/portfolio').map((c) => c.query)).toEqual([{ page: '1', pageSize: '20' }])
  expect(api.writes()).toEqual([])

  await rows.nth(2).click()
  await expect(page).toHaveURL(new RegExp(`/nha-dau-tu/danh-muc/${DONE}$`))
  await expect(page.getByRole('heading', { name: closed.batch.title, level: 1 })).toBeVisible()
})

test('lọc theo trạng thái và tìm theo chữ gửi tham số cho máy chủ; tổng của danh mục không đổi', async ({ page, api }) => {
  await page.goto('/nha-dau-tu/danh-muc')
  const rows = lots(page)
  await expect(rows).toHaveCount(3)

  await page.getByLabel('Trạng thái Lô').selectOption({ label: 'Đang lưu nuôi' })
  await expect(rows).toHaveText([new RegExp(running.batch.title)])
  await expect(fact(page, 'Vốn đã xác nhận')).toContainText(vnd(60_000_000))

  await page.getByLabel('Tìm Lô').fill('  Ngọc Hiển ')
  await expect(page.getByText('Không có Lô nào khớp bộ lọc')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Xem Lô đang gọi vốn' })).toHaveCount(0)
  await expect(fact(page, 'Lô đang chạy')).toContainText('2 / 3')

  await page.getByLabel('Trạng thái Lô').selectOption({ label: 'Mọi trạng thái' })
  await expect(rows).toHaveText([new RegExp(open.batch.title)])
  await expect(rows).toHaveAttribute('href', `/nha-dau-tu/danh-muc/${OPEN}`)

  expect(api.sent('GET', '/api/investor/portfolio').map((c) => c.query)).toEqual([
    { page: '1', pageSize: '20' },
    { status: 'InProduction', page: '1', pageSize: '20' },
    { q: 'Ngọc Hiển', status: 'InProduction', page: '1', pageSize: '20' },
    { q: 'Ngọc Hiển', page: '1', pageSize: '20' },
  ])
})

test('nhiều hơn một trang thì có nút chuyển trang; đổi bộ lọc quay về trang 1', async ({ page, api }) => {
  // 45 Lô, mỗi trang 20: trang 2 chỉ trả một Lô khác để thấy danh sách đã đổi.
  api.get('/api/investor/portfolio', (call): PortfolioPage => {
    const pageNo = Number(call.query.page)
    return portfolioPage(pageNo === 2 ? [closed] : [running, open], { page: pageNo, pageSize: 20, total: 45 })
  })
  await page.goto('/nha-dau-tu/danh-muc')
  const rows = lots(page)
  await expect(page.getByText('45 Lô', { exact: true })).toBeVisible()
  await expect(page.getByText('Trang 1 / 3')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Trang trước' })).toBeDisabled()

  await page.getByRole('button', { name: 'Trang sau' }).click()
  await expect(page.getByText('Trang 2 / 3')).toBeVisible()
  await expect(rows).toHaveText([new RegExp(closed.batch.title)])
  await expect(page.getByRole('button', { name: 'Trang trước' })).toBeEnabled()

  await page.getByLabel('Trạng thái Lô').selectOption('Funding')
  await expect(page.getByText('Trang 1 / 3')).toBeVisible()
  expect(api.sent('GET', '/api/investor/portfolio').map((c) => c.query)).toEqual([
    { page: '1', pageSize: '20' },
    { page: '2', pageSize: '20' },
    { status: 'Funding', page: '1', pageSize: '20' },
  ])
})

test('một trang thì không có thanh phân trang; danh sách vừa màn hình điện thoại', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/nha-dau-tu/danh-muc')
  await expect(lots(page)).toHaveCount(portfolioItems.length)
  await expect(page.getByRole('button', { name: 'Trang sau' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('Lô chưa tính được phần vốn và Lô thả cua chưa tới ngày nuôi đầu: hiện gạch và ngày thả, không tự suy số', async ({ page, api }) => {
  const stocked = { ...open, batch: { ...open.batch, status: 'Stocked', stockedAt: open.batch.fundingDeadline, fundingDeadline: null }, capitalRatio: null }
  api.get('/api/investor/portfolio', portfolioPage([stocked, { ...open, batch: { ...open.batch, code: 'P-2611-08', status: 'Sourcing', fundingDeadline: null } }]))
  await page.goto('/nha-dau-tu/danh-muc')
  const rows = lots(page)
  await expect(rows.nth(0)).toContainText('Đã thả nuôi')
  await expect(rows.nth(0)).toContainText(`Thả cua ${viDate(stocked.batch.stockedAt!)}`)
  await expect(rows.nth(0)).toContainText('— vốn của Lô, chưa chốt')
  await expect(rows.nth(1)).toContainText('Đang mua nguồn')
  await expect(rows.nth(1)).toContainText('Chưa thả cua')
})

test('chưa góp Lô nào thì các số là 0 và có nút sang Lô đang gọi vốn', async ({ page, api }) => {
  api.get('/api/investor/portfolio', portfolioPage([], { summary: { totalConfirmedAmount: 0, activeConfirmedAmount: 0, totalBatches: 0, activeBatches: 0, approvedNetPayout: 0 } }))
  await page.goto('/nha-dau-tu/danh-muc')
  await expect(page.getByText('Bạn chưa góp vốn vào Lô nào')).toBeVisible()
  await expect(fact(page, 'Vốn đã xác nhận')).toContainText(vnd(0))
  await expect(fact(page, 'Lô đang chạy')).toContainText('0 / 0')
  await page.getByRole('link', { name: 'Xem Lô đang gọi vốn' }).click()
  await expect(page).toHaveURL(/\/nha-dau-tu\/lo$/)
})
