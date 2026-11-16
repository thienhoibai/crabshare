/* /nha-dau-tu — Tổng quan của nhà đầu tư: ba số tiền thật trên các Lô đã chốt vốn, việc cần làm, các Lô đã góp. */
import type { ContributionResponse, SettlementSummary } from '../src/shared/api/api.gen'
import { daysFromNow, expect, reply, signIn, test, vnd } from './support/app'
import {
  DONE, NEW, OPEN, RUN, contributions, kycUnverified, mockInvestor, panel, portfolioPage, reserved, running, settlementPaid, viDateTime,
} from './support/investor'

test.beforeEach(async ({ page, api }) => {
  mockInvestor(api)
  await signIn(page, 'Investor')
})

test('tổng quan cộng ba số tiền của các Lô đã chốt vốn và liệt kê Lô đã góp', async ({ page, api }) => {
  await page.goto('/nha-dau-tu')
  await expect(page.getByRole('heading', { name: 'Chào Lê Minh Khôi', level: 1 })).toBeVisible()

  // Đã góp 30 + 20 triệu ở hai Lô đã chốt vốn; 10 triệu ở Lô còn gọi vốn chỉ ghi là chờ chốt.
  await expect(page.getByText('50.000.000đ')).toBeVisible()
  await expect(page.getByText(`2 Lô đã chốt vốn · thêm ${vnd(10_000_000)} chờ chốt vốn`)).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Đã giải ngân theo mốc' })).toContainText(vnd(32_000_000))
  await expect(page.getByRole('listitem').filter({ hasText: 'Còn giữ' })).toContainText(vnd(18_000_000))

  const lots = panel(page, 'Lô tôi đã góp')
  await expect(lots.getByRole('link', { name: 'Xem tất cả' })).toHaveAttribute('href', '/nha-dau-tu/danh-muc')
  const row = lots.getByRole('link', { name: /Cua gạch Năm Căn tháng 11/ })
  await expect(row).toHaveAttribute('href', `/nha-dau-tu/danh-muc/${RUN}`)
  await expect(row).toContainText('Đang lưu nuôi')
  await expect(row).toContainText('1 cảnh báo')
  await expect(row).toContainText(vnd(30_000_000))
  await expect(row).toContainText('15% vốn của Lô')
  await expect(lots.getByRole('link', { name: /Cua thịt Ngọc Hiển tháng 12/ })).toContainText('16,67% vốn của Lô')
  await expect(lots.getByRole('link', { name: /Cua gạch Đầm Dơi tháng 9/ })).toContainText('Đã đóng')

  // Ba số tiền và biểu quyết chỉ hỏi cho Lô đã chốt vốn; trang chỉ đọc, không ghi.
  expect(api.sent('GET', '/api/investor/portfolio').map((c) => c.query)).toEqual([{ pageSize: '100' }])
  expect(api.sent('GET', /\/money-summary$/).map((c) => c.path).sort()).toEqual([`/api/batches/${DONE}/money-summary`, `/api/batches/${RUN}/money-summary`])
  expect(api.sent('GET', /\/decisions$/).map((c) => c.path).sort()).toEqual([`/api/batches/${DONE}/decisions`, `/api/batches/${RUN}/decisions`])
  expect(api.writes()).toEqual([])
  expect(api.calls.every((c) => c.auth === 'Bearer test-token')).toBe(true)

  await row.click()
  await expect(page).toHaveURL(new RegExp(`/nha-dau-tu/danh-muc/${RUN}$`))
  await expect(page.getByRole('heading', { name: running.batch.title, level: 1 })).toBeVisible()
})

test('việc cần làm gom đủ: xác minh, khoản đang giữ chỗ, hợp đồng chờ ký, biểu quyết, bảng quyết toán đang lấy góp ý', async ({ page, api }) => {
  // Khoản giữ chỗ đã quá hạn không còn là việc cần làm.
  const reservation = reserved()
  const lapsed: ContributionResponse = reserved({ contributionId: 906, batchCode: OPEN, expiresAt: daysFromNow(-1) })
  const proposed: SettlementSummary = { ...settlementPaid, settlementId: 32, batchCode: RUN, batchTitle: running.batch.title, status: 'Proposed', myNetPayout: 31_200_000, feedbackDeadline: daysFromNow(5), feedbackOpen: true }
  api.get('/api/me/kyc', kycUnverified)
  api.get('/api/me/contributions', [...contributions, reservation, lapsed])
  api.get('/api/me/settlements', [settlementPaid, proposed])
  await page.goto('/nha-dau-tu')

  const todo = panel(page, 'Việc cần làm').getByRole('link')
  await expect(todo).toHaveText([
    /Xác minh danh tính.*Cần có trước khi góp vốn/,
    new RegExp(`Chuyển khoản cho Lô ${NEW}`),
    /Ký hợp đồng HD-2611-0731/,
    /Biểu quyết QD-2610-04-02: Thanh lý sớm/,
    new RegExp(`Xem bảng quyết toán Lô ${RUN}`),
  ])
  await expect(todo.nth(0)).toHaveAttribute('href', '/nha-dau-tu/ho-so')
  await expect(todo.nth(1)).toHaveAttribute('href', `/nha-dau-tu/gop-von/${NEW}`)
  await expect(todo.nth(1)).toContainText(`${vnd(10_000_000)} · giữ chỗ tới ${viDateTime(reservation.expiresAt)}`)
  await expect(todo.nth(2)).toHaveAttribute('href', '/nha-dau-tu/hop-dong?id=731')
  await expect(todo.nth(2)).toContainText(`Lô ${OPEN} · ${vnd(10_000_000)}`)
  await expect(todo.nth(3)).toHaveAttribute('href', '/nha-dau-tu/bieu-quyet')
  await expect(todo.nth(3)).toContainText(`Lô ${RUN} · hạn `)
  await expect(todo.nth(4)).toHaveAttribute('href', '/nha-dau-tu/quyet-toan/32')
  await expect(todo.nth(4)).toContainText(`Góp ý tới ${viDateTime(proposed.feedbackDeadline!)}`)

  // Bấm việc đầu tiên: người chưa xác minh vào thẳng mục xác minh danh tính của hồ sơ.
  await todo.nth(0).click()
  await expect(page).toHaveURL(/\/nha-dau-tu\/ho-so$/)
  await expect(page.getByRole('tab', { name: 'Xác minh danh tính' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: 'Gửi xác minh' })).toBeDisabled()
})

test('đã xác minh và không còn gì chờ thì ghi rõ không có việc', async ({ page, api }) => {
  api.get('/api/me/contracts', [])
  api.get(`/api/batches/${RUN}/decisions`, [])
  await page.goto('/nha-dau-tu')
  await expect(panel(page, 'Việc cần làm').getByText('Không có việc nào đang chờ.')).toBeVisible()
  await expect(panel(page, 'Việc cần làm').getByRole('link')).toHaveCount(0)
})

test('chưa góp Lô nào thì số tiền là 0 và có lối sang Lô đang gọi vốn', async ({ page, api }) => {
  api.get('/api/investor/portfolio', portfolioPage([]))
  api.get('/api/me/contracts', [])
  api.get('/api/me/contributions', [])
  api.get('/api/me/settlements', [])
  await page.goto('/nha-dau-tu')

  await expect(page.getByText('Bạn chưa góp vốn vào Lô nào')).toBeVisible()
  await expect(page.getByText('0 Lô đã chốt vốn', { exact: true })).toBeVisible()
  await expect(page.getByText('0đ', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Lô tôi đã góp' })).toHaveCount(0)
  expect(api.sent('GET', /^\/api\/batches\//)).toEqual([])

  await page.getByRole('main').getByRole('link', { name: 'Lô đang gọi vốn' }).click()
  await expect(page).toHaveURL(/\/nha-dau-tu\/lo$/)
  await expect(page.getByRole('heading', { name: 'Lô đang gọi vốn', level: 1 })).toBeVisible()
})

test('một Lô không lấy được số tiền thì báo rõ và không cộng số của Lô đó', async ({ page, api }) => {
  api.get(`/api/batches/${DONE}/money-summary`, () => reply(500, { status: 500, detail: 'Máy chủ đang bận.' }))
  await page.goto('/nha-dau-tu')
  await expect(page.getByText('Chưa lấy được số tiền của 1 Lô.')).toBeVisible()
  await expect(page.getByText('30.000.000đ')).toBeVisible()
  await expect(page.getByText(/^1 Lô đã chốt vốn/)).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Đã giải ngân theo mốc' })).toContainText(vnd(12_000_000))
})

test('không tải được danh mục thì hiện lỗi của máy chủ và nút thử lại', async ({ page, api }) => {
  let down = true
  api.get('/api/investor/portfolio', () => (down ? reply(503, { status: 503, detail: 'Chưa tải được danh mục.' }) : portfolioPage()))
  await page.goto('/nha-dau-tu')

  const error = page.getByRole('alert')
  await expect(error).toContainText('Không tải được dữ liệu')
  await expect(error).toContainText('Chưa tải được danh mục.')
  await expect(page.getByText('Tôi đã góp', { exact: true })).toHaveCount(0)

  down = false
  await error.getByRole('button', { name: 'Thử lại' }).click()
  await expect(page.getByText('50.000.000đ')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
