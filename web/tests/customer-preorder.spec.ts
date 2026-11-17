/* /khach/dat-truoc/:code — khách đặt trước theo quy cách ở một Lô, tới bước chuyển cọc qua VietQR. */
import type { PreorderRequest, SimulatePaymentRequest, WebhookResult } from '../src/shared/api/api.gen'
import { aside, dateFromNow, expect, reply, signIn, test, vnd, type Api, type Page } from './support/app'
import { depositRequest, mockCustomer, noDeliveries, orderDeposited, orderPending, sites } from './support/customer'
import { party } from './support/investor'
import { availabilityP, batchP, batchPNoOffers } from './support/public'

const URL = `/khach/dat-truoc/${batchP.batchCode}`
const submit = (page: Page) => aside(page).getByRole('button', { name: 'Đặt trước' })

async function open(page: Page, api: Api) {
  mockCustomer(api)
  await signIn(page, 'Customer')
  await page.goto(URL)
  await expect(page.getByRole('heading', { name: 'Đặt trước', level: 1 })).toBeVisible()
}

test('chọn lô và đặt trước trong cổng khách hàng', async ({ page, api }) => {
  mockCustomer(api)
  await signIn(page, 'Customer')
  await page.goto('/khach')
  const menu = page.getByRole('navigation', { name: 'Menu Khách hàng' })
  const catalog = menu.getByRole('link', { name: 'Lô nhận đặt trước' })
  await catalog.click()
  await expect(page).toHaveURL(/\/khach\/lo$/)
  await expect(catalog).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: batchPNoOffers.title })).toHaveCount(0)

  await page.getByRole('link', { name: batchP.title }).click()
  await expect(page).toHaveURL(new RegExp(`/khach/lo/${batchP.batchCode}$`))
  await expect(catalog).toHaveAttribute('aria-current', 'page')
  await page.getByRole('main').getByRole('link', { name: 'Đặt trước', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${URL}$`))
  await expect(catalog).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Quy cách và số lượng' })).toBeVisible()
  await expect(page.getByRole('link', { name: `Lô ${batchP.batchCode}`, exact: true })).toHaveAttribute('href', `/khach/lo/${batchP.batchCode}`)
})

test('trên điện thoại nhìn thấy nút đặt trước và nhập số lượng ngay dưới tên quy cách', async ({ page, api }) => {
  mockCustomer(api)
  await signIn(page, 'Customer')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/khach/lo/${batchP.batchCode}`)
  const action = page.getByRole('main').getByRole('link', { name: 'Đặt trước', exact: true })
  await expect(action).toBeInViewport({ ratio: 1 })
  await action.click()
  await page.setViewportSize({ width: 320, height: 760 })
  const spec = page.getByRole('heading', { name: 'Cua gạch L hạng A', exact: true })
  const quantity = page.getByLabel('Số con Cua gạch L hạng A', { exact: true })
  await expect(spec).toBeVisible()
  await quantity.fill('30')
  expect((await quantity.boundingBox())!.y).toBeGreaterThan((await spec.boundingBox())!.y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
})

test('cổng khách hàng mở hồ sơ và thông báo ở góc phải', async ({ page, api }) => {
  mockCustomer(api)
  api.get('/api/me/party', { ...party, legalName: 'Hồ sơ khách hàng thử' })
  await signIn(page, 'Customer')
  await page.goto('/khach')
  const menu = page.getByRole('navigation', { name: 'Menu Khách hàng' })
  await expect(menu.getByRole('link', { name: 'Hồ sơ', exact: true })).toHaveCount(0)
  await expect(menu.getByRole('link', { name: 'Thông báo', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Hồ sơ người dùng' }).click()
  await expect(page).toHaveURL(/\/khach\/ho-so$/)
  await expect(page.getByRole('heading', { name: 'Hồ sơ', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Hồ sơ khách hàng thử' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('link', { name: 'Hồ sơ người dùng' })).toBeVisible()
  await page.getByRole('link', { name: 'Cảnh báo và thông báo' }).click()
  await expect(page).toHaveURL(/\/khach\/thong-bao$/)
  await expect(page.getByRole('heading', { name: 'Thông báo', level: 1 })).toBeVisible()
})

test('đặt theo số con và theo kg, chọn nơi nhận, gửi đơn, quét QR đặt cọc rồi sang trang đơn', async ({ page, api }) => {
  await open(page, api)
  let paid = false
  api.post('/api/preorders', () => reply(201, orderPending))
  api.get(`/api/payment-requests/${depositRequest.paymentRequestId}`, () => (paid ? { ...depositRequest, status: 'Paid', qrContent: null } : depositRequest))
  api.post('/api/dev/payments/simulate', (): WebhookResult => {
    paid = true
    return { outcome: 'Matched', transactionId: 5001, referenceCode: depositRequest.referenceCode, paymentRequestId: depositRequest.paymentRequestId, purpose: 'PreOrderDeposit', refundInstructionId: null }
  })
  api.get(`/api/preorders/${orderPending.orderNo}`, () => (paid ? orderDeposited : orderPending))
  api.get(`/api/preorders/${orderPending.orderNo}/deliveries`, noDeliveries(orderDeposited))

  await expect(page.getByText('P-2611-01 · Cua gạch')).toBeVisible()
  const largeSpec = page.getByRole('group', { name: 'Cua gạch L hạng A', exact: true })
  const mediumSpec = page.getByRole('group', { name: 'Cua gạch M hạng A', exact: true })
  await expect(largeSpec).toContainText(`${vnd(520_000)} / kg · Còn 200 con`)
  // Chưa nhập gì: nút gửi khoá, không có câu báo lỗi nào.
  await expect(submit(page)).toBeDisabled()
  await expect(aside(page)).toContainText('Số lượng0 con · 0 kg')

  await page.getByLabel('Số con Cua gạch L hạng A', { exact: true }).fill('30')
  await expect(largeSpec).toContainText(vnd(6_552_000))
  await expect(largeSpec).toContainText('30 con · 12,6 kg')
  await page.getByLabel('Đơn vị đặt Cua gạch M hạng A', { exact: true }).selectOption('ByKg')
  await page.getByLabel('Số kg Cua gạch M hạng A', { exact: true }).fill('5')
  // 5 kg quy ra số con theo khối lượng quy đổi 380 g, làm tròn lên.
  await expect(mediumSpec).toContainText(vnd(2_400_000))
  await expect(mediumSpec).toContainText('14 con · 5 kg')

  await expect(aside(page)).toContainText('Số lượng44 con · 17,6 kg')
  await expect(aside(page)).toContainText(`Giá trị ước tính${vnd(8_952_000)}`)
  await expect(aside(page)).toContainText(`Tiền cọc 30%${vnd(2_685_600)}`)
  await expect(aside(page)).toContainText('Đơn được giữ 30 phút để bạn chuyển cọc.')

  // Nơi nhận: mặc định là địa chỉ mặc định; địa chỉ thiếu toạ độ không chọn được.
  await expect(page.getByRole('radio', { name: /Nhà hàng Biển Xanh/ })).toBeChecked()
  await expect(page.getByRole('radio', { name: /Kho Thủ Đức/ })).toBeDisabled()
  await expect(page.getByText('Thiếu toạ độ', { exact: true })).toBeVisible()
  // Có thể bổ sung vị trí của địa chỉ ngay trong form đặt trước.
  await expect(page.getByRole('button', { name: 'Bổ sung vị trí cho Kho Thủ Đức' })).toBeVisible()
  // Mỗi địa chỉ là một thẻ bấm: ô radio nằm ẩn dưới nhãn, người dùng bấm vào thẻ.
  await page.getByText('Bếp trung tâm Quận 7', { exact: true }).click()
  await expect(page.getByRole('radio', { name: /Bếp trung tâm Quận 7/ })).toBeChecked()

  await submit(page).click()
  const body: PreorderRequest = {
    batchCode: batchP.batchCode,
    deliverySiteId: 12,
    lines: [{ specCode: 'RC-L-A', mode: 'ByCount', qtyCrabs: 30 }, { specCode: 'RC-M-A', mode: 'ByKg', qtyKg: 5 }],
    tranches: null,
  }
  expect(api.sent('POST', '/api/preorders').map((c) => c.body)).toEqual([body])
  expect(api.sent('GET', '/api/me/sites')[0].query).toEqual({ siteType: 'DeliveryAddress' })

  // Bước chuyển cọc: mã QR của đơn, số tiền, nội dung chuyển khoản.
  await expect(page.getByRole('heading', { name: 'Chuyển cọc để giữ đơn' })).toBeVisible()
  await expect(page.getByText(`Đơn ${orderPending.orderNo}`)).toBeVisible()
  await expect(page.getByRole('img', { name: `Mã VietQR chuyển ${vnd(2_685_600)}, nội dung CSD4M8T2` })).toBeVisible()
  await expect(page.getByText('Nội dung chuyển khoản', { exact: true })).toBeVisible()
  await expect(page.getByText('CSD4M8T2', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Mã thử nghiệm, không chuyển tiền thật.')).toBeVisible()
  await expect(page.getByRole('timer')).toContainText('Mã hết hạn sau')
  await expect(aside(page)).toContainText(`Tiền cọc 30%${vnd(2_685_600)}`)
  await expect(aside(page).getByRole('link', { name: 'Xem đơn' })).toHaveAttribute('href', `/khach/don/${orderPending.orderNo}`)
  // Số tài khoản nằm sau bước "chuyển khoản thủ công".
  await expect(page.getByText('9704000000456')).toBeHidden()
  await page.getByRole('button', { name: 'Không quét được mã? Chuyển khoản thủ công' }).click()
  await expect(page.getByText('9704000000456')).toBeVisible()
  await expect(page.locator('dd', { hasText: `Lô ${batchP.batchCode}` })).toBeVisible()

  // Tiền về (giả lập ngân hàng báo có): trang tự sang chi tiết đơn.
  await page.getByRole('button', { name: 'Giả lập đã chuyển khoản' }).click()
  const simulate: SimulatePaymentRequest = { referenceCode: 'CSD4M8T2' }
  await expect(page).toHaveURL(new RegExp(`/khach/don/${orderPending.orderNo}$`))
  expect(api.sent('POST', '/api/dev/payments/simulate').map((c) => c.body)).toEqual([simulate])
  await expect(page.getByRole('status').filter({ hasText: 'Đã nhận tiền cọc.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: `Đơn ${orderPending.orderNo}` })).toBeVisible()
  await expect(page.getByText('Đã đặt cọc', { exact: true })).toBeVisible()
  expect(api.writes()).toEqual(['POST /api/preorders', 'POST /api/dev/payments/simulate'])
})

test('đơn dưới mức tối thiểu hoặc vượt số còn đặt được thì không gửi được', async ({ page, api }) => {
  await open(page, api)
  const count = page.getByLabel('Số con Cua gạch L hạng A', { exact: true })
  await count.fill('10')
  await expect(aside(page)).toContainText('Đơn tối thiểu 20 con, hiện có 10 con.')
  await expect(submit(page)).toBeDisabled()

  // Ô số con không cho nhập quá số còn lại của quy cách (200 con).
  await count.fill('250')
  await expect(count).toHaveValue('200')

  // Theo kg thì không chặn được ở ô nhập: 90 kg là 237 con, quá 200 con còn lại.
  await page.getByLabel('Đơn vị đặt Cua gạch M hạng A', { exact: true }).selectOption('ByKg')
  await page.getByLabel('Số kg Cua gạch M hạng A', { exact: true }).fill('90')
  await expect(aside(page)).toContainText('Cua gạch M hạng A chỉ còn 200 con.')
  await expect(submit(page)).toBeDisabled()
  expect(api.writes()).toEqual([])
})

test('chưa có nơi nhận hàng thì phải thêm địa chỉ trước khi đặt', async ({ page, api }) => {
  mockCustomer(api)
  api.get('/api/me/sites', [])
  await signIn(page, 'Customer')
  await page.goto(URL)
  await page.getByLabel('Số con Cua gạch L hạng A', { exact: true }).fill('30')
  await expect(aside(page)).toContainText('Chọn hoặc thêm nơi nhận hàng.')
  await expect(submit(page)).toBeDisabled()
  await page.getByRole('button', { name: 'Thêm địa chỉ' }).click()
  await expect(page.getByRole('dialog', { name: 'Thêm địa điểm nhận hàng' })).toBeVisible()
})

test('bổ sung vị trí nhận hàng trong form đặt trước và giữ số lượng đã nhập', async ({ page, api }) => {
  mockCustomer(api)
  let dropOff = sites[2]
  api.get('/api/me/sites', () => [dropOff])
  api.put('/api/me/sites/13', () => {
    dropOff = { ...dropOff, latitude: 10.7993, longitude: 106.6802 }
    return dropOff
  })
  await signIn(page, 'Customer')
  await page.goto(URL)
  const count = page.getByLabel('Số con Cua gạch L hạng A', { exact: true })
  await count.fill('30')
  await expect(submit(page)).toBeDisabled()
  await page.getByRole('button', { name: 'Bổ sung vị trí cho Kho Thủ Đức' }).click()
  const dialog = page.getByRole('dialog', { name: 'Sửa Kho Thủ Đức' })
  await dialog.getByLabel('Toạ độ').fill('10.7993, 106.6802')
  await dialog.getByRole('button', { name: 'Lưu địa điểm' }).click()
  await expect(page.getByRole('radio', { name: /Kho Thủ Đức/ })).toBeChecked()
  await expect(count).toHaveValue('30')
  await expect(submit(page)).toBeEnabled()
  await expect(page).toHaveURL(new RegExp(`${URL}$`))
})

test('chia hai đợt giao thì gửi kèm ngày và số lượng từng đợt', async ({ page, api }) => {
  await open(page, api)
  api.post('/api/preorders', () => reply(201, orderPending))
  await page.getByLabel('Số con Cua gạch L hạng A', { exact: true }).fill('30')
  await page.getByRole('button', { name: 'Chia nhiều đợt giao' }).click()

  const split = page.locator('section', { has: page.getByRole('heading', { name: 'Đợt giao' }) })
  // Gợi ý chia đôi: mỗi đợt 15 con; đợt đầu lấy ngày Lô dự kiến nhận cua, đợt sau chưa có ngày nên chưa gửi được.
  await expect(split.getByLabel('Ngày đến hạn giao').nth(0)).toHaveValue(batchP.expectedReceiptDate!)
  await expect(split.getByLabel('Cua gạch L hạng A').nth(0)).toHaveValue('15')
  await expect(split.getByLabel('Cua gạch L hạng A').nth(1)).toHaveValue('15')
  await expect(aside(page)).toContainText('Chọn ngày đến hạn cho đợt 2.')
  await expect(submit(page)).toBeDisabled()

  await split.getByLabel('Ngày đến hạn giao').nth(1).fill(dateFromNow(27))
  await split.getByLabel('Cua gạch L hạng A').nth(0).fill('10')
  await expect(aside(page)).toContainText('Tổng các đợt của Cua gạch L hạng A phải bằng đúng')
  await split.getByLabel('Cua gạch L hạng A').nth(1).fill('20')
  await submit(page).click()

  const body: PreorderRequest = {
    batchCode: batchP.batchCode,
    deliverySiteId: 11,
    lines: [{ specCode: 'RC-L-A', mode: 'ByCount', qtyCrabs: 30 }],
    tranches: [
      { seq: 1, dueDate: batchP.expectedReceiptDate!, lines: [{ specCode: 'RC-L-A', qtyCrabs: 10 }] },
      { seq: 2, dueDate: dateFromNow(27), lines: [{ specCode: 'RC-L-A', qtyCrabs: 20 }] },
    ],
  }
  await expect(page.getByRole('heading', { name: 'Chuyển cọc để giữ đơn' })).toBeVisible()
  expect(api.sent('POST', '/api/preorders').map((c) => c.body)).toEqual([body])
})

test('máy chủ từ chối thì hiện lý do, không kèm số quy tắc, và vẫn ở lại trang', async ({ page, api }) => {
  await open(page, api)
  api.post('/api/preorders', () => reply(422, { status: 422, code: 'preorder.spec_sold_out', detail: 'Cua gạch L hạng A vừa hết lượt đặt trước (BR-089).' }))
  await page.getByLabel('Số con Cua gạch L hạng A', { exact: true }).fill('30')
  await submit(page).click()
  await expect(aside(page)).toContainText('Cua gạch L hạng A vừa hết lượt đặt trước.')
  await expect(page.getByText(/BR-\d+/)).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`${URL}$`))
  await expect(page.getByRole('heading', { name: 'Chuyển cọc để giữ đơn' })).toHaveCount(0)
})

test('Lô không còn nhận đặt trước thì không có form, chỉ dẫn về danh sách Lô', async ({ page, api }) => {
  mockCustomer(api)
  api.get(`/api/batches/${batchP.batchCode}/availability`, { ...availabilityP, acceptingPreorders: false })
  await signIn(page, 'Customer')
  await page.goto(URL)
  await expect(page.getByText('Lô này hiện không nhận đặt trước')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Xem Lô nhận đặt trước' })).toHaveAttribute('href', '/khach/lo')
  await expect(page.getByRole('button', { name: 'Đặt trước' })).toHaveCount(0)
})
