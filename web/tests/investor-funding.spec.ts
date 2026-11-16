/* /nha-dau-tu/lo và /nha-dau-tu/lo/:code — Các Lô đang mở gọi vốn và trang một Lô với nút góp vốn. */
import type { FundingBatchResponse } from '../src/shared/api/api.gen'
import { expect, reply, signIn, test, vnd } from './support/app'
import { NEW, OPEN, contributions, fact, fundingNew, mockInvestor, more, panel, reserved, viDate, viDateTime } from './support/investor'

test.beforeEach(async ({ page, api }) => {
  mockInvestor(api)
  await signIn(page, 'Investor')
})

test('danh sách Lô đang gọi vốn: phần còn nhận, vốn đã xác nhận, mức góp tối thiểu, hạn', async ({ page, api }) => {
  await page.goto('/nha-dau-tu/lo')
  await expect(page.getByRole('heading', { name: 'Lô đang gọi vốn', level: 1 })).toBeVisible()

  const cards = page.getByRole('main').getByRole('link').filter({ hasText: 'Còn nhận' })
  await expect(cards).toHaveCount(2)
  const card = cards.filter({ hasText: fundingNew.title })
  await expect(card).toHaveAttribute('href', `/nha-dau-tu/lo/${NEW}`)
  await expect(card).toContainText(`Còn nhận ${vnd(90_000_000)}`)
  await expect(card).toContainText(`${NEW} · Cua gạch · HTX Phú Tân`)
  await expect(card).toContainText(`${vnd(55_000_000)} / ${vnd(120_000_000)}`)
  await expect(card).toContainText(`Góp từ ${vnd(2_000_000)}`)
  await expect(card).toContainText(`Hạn ${viDate(fundingNew.fundingDeadline!)}`)
  // Không có khoản nào đang giữ chỗ thì không có dòng nhắc chuyển khoản.
  await expect(page.getByText('Đang giữ chỗ')).toHaveCount(0)
  expect(api.calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual(['GET /api/funding/batches', 'GET /api/me/contributions'])

  await card.click()
  await expect(page).toHaveURL(new RegExp(`/nha-dau-tu/lo/${NEW}$`))
  await expect(page.getByRole('heading', { name: fundingNew.title, level: 1 })).toBeVisible()
})

test('đang giữ chỗ ở một Lô thì đầu danh sách nhắc chuyển khoản', async ({ page, api }) => {
  const spot = reserved()
  api.get('/api/me/contributions', [...contributions, spot])
  await page.goto('/nha-dau-tu/lo')
  await expect(page.getByText(`Đang giữ chỗ ${vnd(10_000_000)} ở Lô ${NEW} tới ${viDateTime(spot.expiresAt)}.`)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Chuyển khoản', exact: true })).toHaveAttribute('href', `/nha-dau-tu/gop-von/${NEW}`)
})

test('chưa có Lô nào mở gọi vốn', async ({ page, api }) => {
  api.get('/api/funding/batches', [])
  await page.goto('/nha-dau-tu/lo')
  await expect(page.getByText('Chưa có Lô nào mở gọi vốn')).toBeVisible()
  await expect(page.getByText('Xem các Lô bạn đã góp ở mục Lô tôi đã góp.')).toBeVisible()
})

test('trang một Lô đang gọi vốn: số liệu gọi vốn, chi phí chuẩn, điều kiện của tôi và nút góp vốn', async ({ page, api }) => {
  await page.goto(`/nha-dau-tu/lo/${NEW}`)
  await expect(page.getByRole('heading', { name: fundingNew.title, level: 1 })).toBeVisible()
  await expect(page.getByText(`${NEW} · Cua gạch · HTX Phú Tân`)).toBeVisible()
  await expect(page.getByRole('main').getByText('Đang gọi vốn', { exact: true })).toBeVisible()

  const funding = panel(page, 'Gọi vốn')
  await expect(funding.getByText('6 nhà đầu tư đã góp')).toBeVisible()
  await expect(funding.getByText(`${vnd(55_000_000)} / ${vnd(120_000_000)}`)).toBeVisible()
  await expect(fact(funding, 'Còn nhận')).toContainText(vnd(90_000_000))
  await expect(fact(funding, 'Góp tối thiểu')).toContainText(vnd(2_000_000))
  await expect(fact(funding, 'Hạn góp vốn').first()).toContainText(viDate(fundingNew.fundingDeadline!))
  // Lời giải thích nằm sau nút (i), bấm mới hiện.
  await expect(funding.getByText(/thì Lô huỷ và hoàn toàn bộ khoản đã góp/)).toHaveCount(0)
  await funding.getByRole('button', { name: 'Giải thích: Gọi vốn' }).click()
  await expect(funding.getByText(`Tới hạn mà chưa đủ ${vnd(80_000_000)} thì Lô huỷ và hoàn toàn bộ khoản đã góp.`)).toBeVisible()
  const details = more(funding, 'Chi tiết gọi vốn')
  await details.locator('summary').click()
  await expect(fact(details, 'Đang giữ chỗ')).toContainText(vnd(5_000_000))
  await expect(fact(details, 'Trần vốn')).toContainText(vnd(150_000_000))

  const costs = panel(page, 'Chi phí chuẩn')
  await expect(costs.getByText(vnd(100_000_000))).toBeVisible()
  await expect(costs.getByText('Mua cua nguồn')).toBeVisible()
  await expect(costs.getByText(vnd(70_000_000))).toBeVisible()
  await expect(costs.getByText('Thức ăn')).toBeVisible()
  await expect(costs.getByText('Nhân công')).toBeVisible()
  const info = more(costs, 'Thông tin Lô')
  await info.locator('summary').click()
  await expect(fact(info, 'Số cua dự kiến')).toContainText('500 con')
  await expect(fact(info, 'Lưu nuôi')).toContainText('30 ngày')
  await expect(fact(info, 'Bên cam kết thu mua')).toContainText('Công ty Hải sản Đất Mũi')
  await expect(fact(info, 'Phí nền tảng')).toContainText('3% doanh thu')
  await expect(fact(info, 'Trừ chi phí khi quyết toán')).toContainText('Theo chi phí chuẩn')

  // Bốn bước của tôi: đã xác minh và đã xác nhận rủi ro, còn giữ chỗ và ký hợp đồng.
  const steps = page.getByRole('complementary').getByRole('listitem')
  await expect(steps).toHaveText([/^✓Xác minh danh tính$/, /^✓Xác nhận công bố rủi ro$/, /^3Giữ chỗ và chuyển khoản$/, /^4Ký hợp đồng$/])
  await expect(page.getByText('Bạn có thể mất toàn bộ số tiền đã góp.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Trang công khai của Lô' })).toHaveAttribute('href', `/lo/${NEW}`)
  expect(api.calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual([`GET /api/batches/${NEW}`, `GET /api/funding/batches/${NEW}`])

  await page.getByRole('link', { name: 'Góp vốn vào Lô' }).click()
  await expect(page).toHaveURL(new RegExp(`/nha-dau-tu/gop-von/${NEW}$`))
  await expect(page.getByRole('button', { name: 'Giữ chỗ 15 phút' })).toBeVisible()
})

test('đang giữ chỗ thì nút đổi thành tiếp tục chuyển khoản; chưa xác minh danh tính thì các bước bắt đầu từ xác minh', async ({ page, api }) => {
  const spot = reserved()
  const holding: FundingBatchResponse = { ...fundingNew, myActiveReservation: spot }
  api.get(`/api/funding/batches/${NEW}`, holding)
  await page.goto(`/nha-dau-tu/lo/${NEW}`)
  const aside = page.getByRole('complementary')
  await expect(aside.getByRole('listitem').nth(2)).toContainText(`Đang giữ ${vnd(10_000_000)}`)
  await expect(fact(aside, 'Hết hạn giữ chỗ')).toContainText(viDateTime(spot.expiresAt))
  await expect(aside.getByRole('link', { name: 'Tiếp tục chuyển khoản' })).toHaveAttribute('href', `/nha-dau-tu/gop-von/${NEW}`)

  api.get(`/api/funding/batches/${OPEN}`, { ...fundingNew, batchCode: OPEN, me: { kycVerified: false, riskAcknowledged: false } })
  await page.goto(`/nha-dau-tu/lo/${OPEN}`)
  await expect(page.getByRole('complementary').getByRole('listitem')).toHaveText([/^1Xác minh danh tính$/, /^2Xác nhận công bố rủi ro$/, /^3Giữ chỗ/, /^4Ký hợp đồng$/])
  await expect(page.getByRole('link', { name: 'Góp vốn vào Lô' })).toBeVisible()
})

test('Lô đã hết hạn góp vốn thì không còn nút góp; thiếu thông tin công khai của Lô thì trang vẫn dùng được', async ({ page, api }) => {
  api.get(`/api/funding/batches/${NEW}`, { ...fundingNew, isOpen: false })
  api.get(`/api/batches/${NEW}`, () => reply(404, { status: 404, detail: 'Không tìm thấy Lô.' }))
  await page.goto(`/nha-dau-tu/lo/${NEW}`)
  await expect(page.getByText('Lô đã hết hạn hoặc đã chốt vốn.')).toBeVisible()
  await expect(page.getByRole('link', { name: /Góp vốn vào Lô|Tiếp tục chuyển khoản/ })).toHaveCount(0)
  await expect(fact(panel(page, 'Gọi vốn'), 'Còn nhận')).toContainText(vnd(90_000_000))
  await expect(page.getByRole('heading', { name: 'Chi phí chuẩn' })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('Lô không còn gọi vốn hoặc không tồn tại: hiện lỗi của máy chủ', async ({ page, api }) => {
  api.get('/api/funding/batches/P-2609-99', () => reply(404, { status: 404, detail: 'Lô này không mở gọi vốn.' }))
  api.get('/api/batches/P-2609-99', () => reply(404, { status: 404, detail: 'Không tìm thấy Lô.' }))
  await page.goto('/nha-dau-tu/lo/P-2609-99')
  await expect(page.getByRole('alert')).toContainText('Lô này không mở gọi vốn.')
  await expect(page.getByRole('link', { name: 'Góp vốn vào Lô' })).toHaveCount(0)
})
