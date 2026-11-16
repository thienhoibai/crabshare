/* Trang làm việc của một Lô (/operator/batches/:code/:tab?): mục nào hiện theo trạng thái và việc Lô có lưu nuôi hay không,
   mục mặc định, đổi mục thì đổi đường dẫn, nội dung mục Tổng quan, huỷ Lô trước khi mở. */
import type { BatchResponse, CancelBatchRequest } from '../src/shared/api/api.gen'
import { expect, reply, signIn, test, vnd } from './support/app'
import { CODE, batch, batchDraft, batchOf, batchTabs, fact, mockOperator, noDevReload, money, more, panel, progress, vnDay } from './support/operator'

const HOME = `/operator/batches/${CODE}`

test.beforeEach(async ({ page, api }) => {
  mockOperator(api)
  await noDevReload(page)
  await signIn(page, 'OperatorMember')
})

const T = { overview: 'Tổng quan', cost: 'Chi phí', sourcing: 'Nguồn cua', holding: 'Lưu nuôi', log: 'Nhật ký', devices: 'Thiết bị', harvest: 'Thu hoạch và phân hạng', delivery: 'Đặt trước và giao hàng', sales: 'Bán có hoá đơn', money: 'Giải ngân và quyết toán' }

/** Trạng thái Lô → các mục phải hiện, đúng thứ tự trên màn hình. */
const CASES: { name: string; lot: Partial<BatchResponse>; badge: string; tabs: string[] }[] = [
  { name: 'Lô P nháp', lot: { status: 'Draft' }, badge: 'Bản nháp', tabs: [T.overview, T.cost] },
  { name: 'Lô P đang gọi vốn', lot: { status: 'Funding' }, badge: 'Đang gọi vốn', tabs: [T.overview, T.cost, T.delivery, T.money] },
  { name: 'Lô có lưu nuôi đang mua nguồn', lot: { status: 'Sourcing' }, badge: 'Đang mua nguồn', tabs: [T.overview, T.cost, T.sourcing, T.holding, T.delivery, T.money] },
  {
    name: 'Lô T không lưu nuôi đang mua nguồn', lot: { status: 'Sourcing', batchMode: 'T', hasHolding: false, holdingDays: null }, badge: 'Đang mua nguồn',
    tabs: [T.overview, T.cost, T.sourcing, T.harvest, T.delivery, T.sales, T.money],
  },
  {
    name: 'Lô đang lưu nuôi', lot: { status: 'InProduction' }, badge: 'Đang lưu nuôi',
    tabs: [T.overview, T.cost, T.sourcing, T.holding, T.log, T.devices, T.harvest, T.delivery, T.money],
  },
  { name: 'Lô đang thu hoạch', lot: { status: 'Harvesting' }, badge: 'Đang thu hoạch', tabs: Object.values(T) },
  {
    name: 'Lô A không lưu nuôi đang bán', lot: { status: 'Selling', batchMode: 'A', hasHolding: false, holdingDays: null }, badge: 'Đang bán và giao',
    tabs: [T.overview, T.cost, T.sourcing, T.harvest, T.delivery, T.sales, T.money],
  },
  { name: 'Lô đã đóng', lot: { status: 'Closed' }, badge: 'Đã đóng', tabs: Object.values(T) },
  { name: 'Lô đã huỷ', lot: { status: 'Cancelled', cancelReason: 'Không gọi đủ vốn tối thiểu' }, badge: 'Đã huỷ', tabs: [T.overview, T.cost] },
]

for (const c of CASES) {
  test(`${c.name}: hiện ${c.tabs.length} mục`, async ({ page, api }) => {
    api.get(`/api/operators/me/batches/${CODE}`, batchOf(c.lot))
    await page.goto(HOME)
    await expect(page.getByRole('heading', { name: batch.title, level: 1 })).toBeVisible()
    await expect(batchTabs(page).getByRole('link')).toHaveText(c.tabs)
    // Chưa chọn mục thì mở Tổng quan.
    await expect(batchTabs(page).getByRole('link', { name: T.overview })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.op-heading').getByText(c.badge, { exact: true })).toBeVisible()
  })
}

test('đầu trang ghi mã Lô, loại cua, phương thức và trạng thái', async ({ page }) => {
  await page.goto(HOME)
  const heading = page.locator('.op-heading')
  await expect(heading.getByText(`${CODE} · Cua gạch`)).toBeVisible()
  await expect(heading.getByText('Lô P · góp vốn')).toBeVisible()
  await expect(heading.getByText('Đang thu hoạch')).toBeVisible()
  await expect(heading.getByRole('link', { name: 'Lô của tôi' })).toHaveAttribute('href', '/operator/batches')
})

test('đổi mục thì đổi đường dẫn, mở thẳng đường dẫn của một mục thì vào đúng mục đó', async ({ page }) => {
  await page.goto(HOME)
  await batchTabs(page).getByRole('link', { name: T.log }).click()
  await expect(page).toHaveURL(new RegExp(`${HOME}/nhat-ky$`))
  await expect(batchTabs(page).getByRole('link', { name: T.log })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: 'Ghi nhật ký hôm nay' })).toBeVisible()

  await batchTabs(page).getByRole('link', { name: T.harvest }).click()
  await expect(page).toHaveURL(new RegExp(`${HOME}/thu-hoach$`))
  await expect(page.getByRole('heading', { name: 'Kết quả từng con' })).toBeVisible()

  await page.goto(`${HOME}/giao-hang`)
  await expect(batchTabs(page).getByRole('link', { name: T.delivery })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Cần lập chuyến giao' })).toBeVisible()

  await batchTabs(page).getByRole('link', { name: T.overview }).click()
  await expect(page).toHaveURL(new RegExp(`${HOME}/tong-quan$`))
  await expect(page.getByRole('heading', { name: 'Đo và phân hạng từng con' })).toBeVisible()
})

test('đường dẫn tới mục chưa dùng tới thì hiện Tổng quan và không gọi API của mục đó', async ({ page, api }) => {
  api.get(`/api/operators/me/batches/${CODE}`, batchOf({ status: 'Funding' }))
  await page.goto(`${HOME}/nhat-ky`)
  await expect(page.getByRole('heading', { name: /^Đang gọi vốn tới/ })).toBeVisible()
  await expect(batchTabs(page).getByRole('link', { name: T.overview })).toHaveAttribute('aria-current', 'page')
  expect(api.calls.filter((c) => c.path.includes('production-'))).toEqual([])
})

test('Tổng quan của Lô P đang thu hoạch: việc tiếp theo, bốn số tiến độ, ba số tiền', async ({ page }) => {
  await page.goto(HOME)
  const next = panel(page, 'Đo và phân hạng từng con')
  await expect(next.getByText('Giai đoạn 4 trên 5')).toBeVisible()
  await expect(next.getByRole('link', { name: 'Thu hoạch' })).toHaveAttribute('href', `${HOME}/thu-hoach`)
  await expect(next.getByRole('link', { name: 'Giao hàng' })).toHaveAttribute('href', `${HOME}/giao-hang`)

  await expect(fact(page, 'Cua đang ở trại')).toHaveText(`${progress.crabsAlive} con`)
  await expect(fact(page, 'Ngày nuôi')).toHaveText(String(progress.daysRaised))
  await expect(fact(page, 'Đã chết')).toHaveText(String(progress.deadCrabs))
  await expect(fact(page, 'Đã duyệt hạng')).toHaveText(String(progress.gradedCrabs))
  await expect(fact(page, 'Đã góp')).toHaveText(vnd(money.batch.contributed))
  await expect(fact(page, 'Đã giải ngân')).toHaveText(vnd(money.batch.disbursed))
  await expect(fact(page, 'Còn giữ ở tài khoản Lô')).toHaveText(vnd(money.batch.heldInAccount))

  const aside = page.getByRole('complementary').filter({ hasText: 'Vốn mục tiêu' })
  await expect(aside.getByText(vnd(batch.targetCapital))).toBeVisible()
  await expect(aside.getByText(vnd(batch.costPlan!.costPerCrab))).toBeVisible()
  await expect(aside.getByText(vnd(batch.minContribution))).toBeVisible()
  await expect(aside.getByRole('link', { name: 'Trang công khai' })).toHaveAttribute('href', `/lo/${CODE}`)
  // Lô đã mở thì không còn sửa hay huỷ được.
  await expect(page.getByRole('link', { name: 'Sửa Lô' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Huỷ Lô' })).toHaveCount(0)

  // Thông tin Lô và bảng chào giá nằm trong khối gấp.
  await more(page, 'Thông tin Lô').click()
  await expect(page.getByText('Công ty Hải sản Đất Mũi')).toBeVisible()
  await expect(page.getByText(`${vnd(batch.floorPricePerKg!)} / kg`)).toBeVisible()
  await more(page, 'Bảng chào giá').click()
  const offers = page.getByRole('row').filter({ hasText: 'Cua gạch · Size XL · Đặc cấp' })
  await expect(offers).toContainText(vnd(680_000))
  await expect(offers).toContainText('180 con')
})

test('Lô T không gọi tóm tắt tiền và không hiện khối vốn', async ({ page, api }) => {
  api.get(`/api/operators/me/batches/${CODE}`, batchOf({ batchMode: 'T', status: 'InProduction', targetCapital: 0, minContribution: 0, fundingDeadline: null }))
  await page.goto(HOME)
  await expect(page.locator('.op-heading').getByText('Lô T · thương mại')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Chăm sóc và ghi nhật ký mỗi ngày' })).toBeVisible()
  await expect(page.getByText('Cua đang ở trại')).toBeVisible()
  await expect(page.getByText('Vốn mục tiêu')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Tiền của Lô' })).toHaveCount(0)
  expect(api.sent('GET', /money-summary$/)).toEqual([])
})

test('Lô nháp chưa mở: không gọi tiến độ, có nút sửa, gửi duyệt và huỷ', async ({ page, api }) => {
  await page.goto(`/operator/batches/${batchDraft.batchCode}`)
  const edit = `/operator/batches/${batchDraft.batchCode}/edit`
  await expect(page.getByRole('heading', { name: 'Hoàn tất Lô và gửi Admin duyệt' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sửa Lô' })).toHaveAttribute('href', edit)
  await expect(page.getByRole('link', { name: 'Gửi duyệt' })).toHaveAttribute('href', `${edit}?buoc=gui-duyet`)
  await expect(page.getByRole('link', { name: 'Trang công khai' })).toHaveCount(0)
  await expect(page.getByText('Cua đang ở trại')).toHaveCount(0)
  expect(api.calls.filter((c) => /\/(progress|money-summary)$/.test(c.path))).toEqual([])
})

test('Lô cần sửa lại hiện lý do của Admin', async ({ page, api }) => {
  api.get(`/api/operators/me/batches/${CODE}`, batchOf({ status: 'NeedsRevision', rejectionReason: 'Giá sàn cao hơn giá chào thấp nhất.', canEdit: true, canSubmit: true, canCancel: true }))
  await page.goto(HOME)
  await expect(page.getByText('Giá sàn cao hơn giá chào thấp nhất.')).toBeVisible()
  await expect(page.locator('.op-heading').getByText('Cần sửa lại')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sửa Lô' })).toBeVisible()
})

test('huỷ Lô nháp cần lý do và gửi đúng lý do đã gõ', async ({ page, api }) => {
  let current = batchDraft
  api.get(`/api/operators/me/batches/${batchDraft.batchCode}`, () => current)
  api.post(`/api/batches/${batchDraft.batchCode}/cancel`, (call) => {
    current = { ...batchDraft, status: 'Cancelled', cancelReason: (call.body as CancelBatchRequest).reason, canEdit: false, canSubmit: false, canCancel: false }
    return current
  })
  await page.goto(`/operator/batches/${batchDraft.batchCode}`)
  await page.getByRole('button', { name: 'Huỷ Lô' }).click()
  const dialog = page.getByRole('dialog', { name: 'Huỷ Lô' })
  await expect(dialog.getByText(batchDraft.title)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Huỷ Lô' })).toBeDisabled()
  await dialog.getByLabel('Lý do huỷ').fill('  Dời sang vụ sau  ')
  await dialog.getByRole('button', { name: 'Huỷ Lô' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã huỷ Lô.' })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Lô đã huỷ' })).toBeVisible()
  await expect(page.getByText('Dời sang vụ sau')).toBeVisible()
  const body: CancelBatchRequest = { reason: 'Dời sang vụ sau' }
  expect(api.sent('POST', `/api/batches/${batchDraft.batchCode}/cancel`).map((c) => c.body)).toEqual([body])
})

test('máy chủ từ chối huỷ thì lỗi hiện trong hộp thoại và Lô giữ nguyên', async ({ page, api }) => {
  api.post(`/api/batches/${batchDraft.batchCode}/cancel`, () => reply(409, { status: 409, detail: 'Lô đã có khoản góp nên không huỷ được (BR-054).' }))
  await page.goto(`/operator/batches/${batchDraft.batchCode}`)
  await page.getByRole('button', { name: 'Huỷ Lô' }).click()
  const dialog = page.getByRole('dialog', { name: 'Huỷ Lô' })
  await dialog.getByLabel('Lý do huỷ').fill('Thử huỷ')
  await dialog.getByRole('button', { name: 'Huỷ Lô' }).click()
  // Số quy tắc trong câu lỗi của máy chủ bị bỏ đi trước khi hiện.
  await expect(dialog.getByText('Lô đã có khoản góp nên không huỷ được.')).toBeVisible()
  await expect(page.locator('.op-heading').getByText('Bản nháp')).toBeVisible()
})

test('Lô không thuộc hộ nuôi thì báo lỗi của máy chủ, có nút thử lại', async ({ page, api }) => {
  api.get('/api/operators/me/batches/P-0000-00', () => reply(404, { status: 404, detail: 'Không tìm thấy Lô của hộ nuôi.' }))
  await page.goto('/operator/batches/P-0000-00')
  const error = page.getByRole('alert').filter({ hasText: 'Không tải được dữ liệu' })
  await expect(error).toContainText('Không tìm thấy Lô của hộ nuôi.')
  await expect(error.getByRole('button', { name: 'Thử lại' })).toBeVisible()
  await expect(batchTabs(page)).toHaveCount(0)
})

test('hạn góp vốn của Lô đang gọi vốn hiện ở việc tiếp theo', async ({ page, api }) => {
  const funding = batchOf({ status: 'Funding' })
  api.get(`/api/operators/me/batches/${CODE}`, funding)
  await page.goto(HOME)
  await expect(page.getByRole('heading', { name: `Đang gọi vốn tới ${vnDay(funding.fundingDeadline!)}` })).toBeVisible()
  await expect(page.getByText('Giai đoạn 2 trên 5')).toBeVisible()
  await expect(panel(page, /^Đang gọi vốn tới/).getByRole('link', { name: 'Tiền của Lô' })).toHaveAttribute('href', `${HOME}/tien`)
})
