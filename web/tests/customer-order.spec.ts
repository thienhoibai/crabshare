/* Cổng khách hàng: danh sách đơn (/khach) và chi tiết một đơn (/khach/don/:orderNo) với đặt cọc, nghiệm thu, từ chối nhận, huỷ đơn. */
import type { CancelPreorderRequest, PreorderResponse, RefuseDeliveryRequest, SplitTranchesRequest } from '../src/shared/api/api.gen'
import { aside, dateFromNow, expect, reply, signIn, test, vnd, type Api, type Page } from './support/app'
import {
  deliveriesAccepted, deliveriesToAccept, mockCustomer, orderDelivering, orderPending, ordersPage, shipmentToAccept,
} from './support/customer'
import { trace } from './support/public'

const SHIP = shipmentToAccept.shipmentNo
const panel = (page: Page, title: string | RegExp) => page.locator('section', { has: page.getByRole('heading', { name: title }) })

async function open(page: Page, api: Api, path: string) {
  mockCustomer(api)
  await signIn(page, 'Customer')
  await page.goto(path)
}

test.describe('/khach', () => {
  test('đầu trang là việc cần làm, bên dưới là các đơn đang chạy', async ({ page, api }) => {
    await open(page, api, '/khach')
    await expect(page.getByRole('heading', { name: 'Đơn của tôi' })).toBeVisible()

    const todo = panel(page, 'Việc cần làm')
    const pay = todo.getByRole('link', { name: `Đặt cọc đơn ${orderPending.orderNo}` })
    await expect(pay).toHaveAttribute('href', `/khach/don/${orderPending.orderNo}#coc`)
    await expect(pay).toContainText(vnd(2_685_600))
    const accept = todo.getByRole('link', { name: `Nghiệm thu chuyến ${SHIP}` })
    await expect(accept).toHaveAttribute('href', `/khach/don/${orderDelivering.orderNo}#chuyen-${SHIP}`)
    await expect(accept).toContainText(`Đơn ${orderDelivering.orderNo} · đợt 1`)

    const facts = page.locator('dl.op-facts')
    await expect(facts).toContainText('Chờ đặt cọc1')
    await expect(facts).toContainText('Chờ nghiệm thu1')
    await expect(facts).toContainText(`Còn phải trả${vnd(0)}`)
    await expect(facts).toContainText('Đơn đang chạy2')

    const pending = page.getByRole('row', { name: new RegExp(orderPending.orderNo) })
    await expect(pending).toContainText('Lô P-2611-01')
    await expect(pending).toContainText('44 con')
    await expect(pending).toContainText(vnd(8_952_000))
    await expect(pending).toContainText('Chưa cọc')
    await expect(pending).toContainText('Chờ đặt cọc')
    const delivering = page.getByRole('row', { name: new RegExp(orderDelivering.orderNo) })
    await expect(delivering).toContainText('Đang giữ cọc')
    await expect(delivering).toContainText('Đợt 1')
    await expect(delivering).toContainText('Đã xuất hàng')
    await expect(delivering).toContainText('Đang giao theo đợt')

    expect(api.sent('GET', '/api/preorders')[0].query).toEqual({ page: '1', pageSize: '100' })
    // Chỉ đơn đã tới giai đoạn giao mới cần hỏi chuyến giao.
    expect(api.sent('GET', /\/deliveries$/).map((c) => c.path)).toEqual([`/api/preorders/${orderDelivering.orderNo}/deliveries`])

    await page.getByRole('tab', { name: /Đã xong/ }).click()
    await expect(page.getByText('Không có đơn nào ở mục này')).toBeVisible()

    await accept.click()
    await expect(page).toHaveURL(new RegExp(`/khach/don/${orderDelivering.orderNo}#chuyen-${SHIP}$`))
    await expect(page.getByRole('heading', { name: `Nghiệm thu chuyến ${SHIP}` })).toBeVisible()
  })

  test('chưa có đơn nào thì dẫn tới danh sách Lô nhận đặt trước', async ({ page, api }) => {
    mockCustomer(api)
    api.get('/api/preorders', ordersPage([]))
    await signIn(page, 'Customer')
    await page.goto('/khach')
    await expect(page.getByText('Bạn chưa có đơn đặt trước nào')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Xem Lô nhận đặt trước' })).toHaveAttribute('href', '/khach/lo')
  })
})

test.describe('/khach/don/:orderNo', () => {
  test('xác nhận nghiệm thu: thấy số cân và tiền hàng, xác nhận xong có mã QR trả phần còn lại và hoá đơn đợt', async ({ page, api }) => {
    await open(page, api, `/khach/don/${orderDelivering.orderNo}`)
    let accepted = false
    api.get(`/api/preorders/${orderDelivering.orderNo}/deliveries`, () => (accepted ? deliveriesAccepted : deliveriesToAccept))
    api.post(`/api/shipments/${SHIP}/acceptance/confirm`, () => {
      accepted = true
      return deliveriesAccepted.shipments[0]
    })

    await expect(page.getByRole('heading', { name: `Đơn ${orderDelivering.orderNo}` })).toBeVisible()
    await expect(page.getByText('Lô T-2611-02 · Cua thịt Ngọc Hiển đợt 2')).toBeVisible()
    await expect(page.locator('header.op-heading')).toContainText('Đang giao theo đợt')

    const todo = panel(page, `Nghiệm thu chuyến ${SHIP}`)
    await expect(todo).toContainText('Đợt 1')
    await expect(todo).toContainText('Nghiệm thu29 con · 10,1 kg')
    await expect(todo).toContainText('Từ chối1 con')
    await expect(todo).toContainText(`Tiền hàng${vnd(3_636_000)}`)
    await expect(todo).toContainText('Chênh lệch: Một con yếu khi nhận')
    // Số liệu cân hai lần gấp lại, mở ra mới thấy.
    await todo.getByText('Số liệu cân').click()
    const weights = todo.getByRole('row', { name: /Cua thịt L hạng A/ })
    await expect(weights).toContainText('30 con · 10,6 kg')
    await expect(weights).toContainText('hao hụt 0,2 kg')
    await expect(weights).toContainText('từ chối 1 con')

    const facts = page.locator('main dl.op-facts').last()
    await expect(facts).toContainText('Số lượng60 con')
    await expect(facts).toContainText(`Giá trị ước tính${vnd(7_560_000)}`)
    await expect(facts).toContainText(`Tiền cọc 30%${vnd(2_268_000)}`)
    await expect(facts).toContainText(`Cọc chưa dùng${vnd(2_268_000)}`)

    const tranches = panel(page, 'Đợt giao')
    await expect(tranches.getByRole('row', { name: /Đợt 1/ })).toContainText('Đã xuất hàng')
    await expect(tranches.getByRole('row', { name: /Đợt 2/ })).toContainText('Đã lên lịch')
    // Đơn đang giao: không còn chia lại đợt, không còn tự huỷ.
    await expect(tranches.getByRole('button', { name: 'Chia lại' })).toHaveCount(0)
    await expect(aside(page).getByRole('button', { name: 'Huỷ đơn' })).toHaveCount(0)

    // QR gắn theo đơn: dẫn tới trang truy xuất của đơn.
    await expect(aside(page).getByRole('link', { name: /QR truy xuất của đơn/ })).toHaveAttribute('href', `/truy-xuat/${trace.traceCode}`)
    await expect(aside(page).getByRole('img', { name: `Mã QR truy xuất của đơn ${orderDelivering.orderNo}` })).toBeVisible()
    await expect(aside(page)).toContainText('Nhà hàng Biển Xanh, 12 Lê Lợi, Quận 1')
    await expect(aside(page)).toContainText('298 km')

    await todo.getByRole('button', { name: 'Xác nhận nghiệm thu' }).click()
    const dialog = page.getByRole('dialog', { name: `Xác nhận nghiệm thu chuyến ${SHIP}` })
    await expect(dialog).toContainText('Nghiệm thu29 con · 10,1 kg')
    await expect(dialog).toContainText(`Tiền hàng${vnd(3_636_000)}`)
    await expect(dialog).toContainText(`Trừ vào tiền cọc${vnd(2_268_000)}`)
    await expect(dialog).toContainText(`Còn phải trả${vnd(1_368_000)}`)
    expect(api.writes()).toEqual([])
    await dialog.getByRole('button', { name: 'Xác nhận nghiệm thu' }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Đã xác nhận nghiệm thu.' })).toBeVisible()
    await expect(dialog).toHaveCount(0)
    expect(api.sent('POST', `/api/shipments/${SHIP}/acceptance/confirm`).map((c) => c.body)).toEqual([null])
    expect(api.writes()).toEqual([`POST /api/shipments/${SHIP}/acceptance/confirm`])

    const balance = panel(page, `Trả phần còn lại · ${SHIP}`)
    await expect(balance).toContainText('Đã nghiệm thu')
    await expect(balance).toContainText(`Tiền hàng (10,1 kg)${vnd(3_636_000)}`)
    await expect(balance).toContainText(`Tiền cọc đã trừ${vnd(2_268_000)}`)
    await expect(balance).toContainText(`Còn phải trả${vnd(1_368_000)}`)
    await expect(balance.getByRole('img', { name: `Mã VietQR chuyển ${vnd(1_368_000)}, nội dung CSB7Q2K9` })).toBeVisible()
    await expect(page.locator('main dl.op-facts').last()).toContainText(`Cọc chưa dùng${vnd(0)}`)

    await page.getByRole('tab', { name: /Hoá đơn/ }).click()
    const invoice = panel(page, 'Hoá đơn').getByRole('row', { name: /INV-2611-0007/ })
    await expect(invoice).toContainText('Đợt 1')
    await expect(invoice).toContainText('Trại cua Tư Bền')
    await expect(invoice).toContainText(vnd(3_636_000))
    await expect(invoice).toContainText('Còn hiệu lực')
    await expect(page.getByRole('tab', { name: 'Khiếu nại, đánh giá' })).toBeVisible()
  })

  test('từ chối nhận hàng phải có lý do và báo trước là mất cọc', async ({ page, api }) => {
    await open(page, api, `/khach/don/${orderDelivering.orderNo}`)
    let refused = false
    const refusedShipment = { ...shipmentToAccept, status: 'Refused', acceptance: { ...shipmentToAccept.acceptance!, status: 'Refused' } }
    const forfeited: PreorderResponse = { ...orderDelivering, status: 'Forfeited', cancelReason: 'Khách từ chối nhận chuyến 1.' }
    api.get(`/api/preorders/${orderDelivering.orderNo}`, () => (refused ? forfeited : orderDelivering))
    api.get(`/api/preorders/${orderDelivering.orderNo}/deliveries`, () => (refused ? { ...deliveriesToAccept, status: 'Forfeited', shipments: [refusedShipment] } : deliveriesToAccept))
    api.post(`/api/shipments/${SHIP}/acceptance/refuse`, () => {
      refused = true
      return refusedShipment
    })

    await panel(page, `Nghiệm thu chuyến ${SHIP}`).getByRole('button', { name: 'Từ chối nhận' }).click()
    const dialog = page.getByRole('dialog', { name: `Từ chối nhận chuyến ${SHIP}` })
    await expect(dialog).toContainText(`Bạn mất tiền cọc chưa dùng (${vnd(2_268_000)}). Các đợt chưa giao bị huỷ. Không rút lại được.`)
    const confirm = dialog.getByRole('button', { name: 'Từ chối và chịu mất cọc' })
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel('Lý do từ chối').fill('ok')
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel('Lý do từ chối').fill('  Cua yếu, không đạt hạng đã đặt  ')
    await confirm.click()

    const body: RefuseDeliveryRequest = { reason: 'Cua yếu, không đạt hạng đã đặt' }
    await expect(page.getByRole('status').filter({ hasText: 'Đã ghi nhận từ chối nhận hàng.' })).toBeVisible()
    expect(api.sent('POST', `/api/shipments/${SHIP}/acceptance/refuse`).map((c) => c.body)).toEqual([body])
    expect(api.writes()).toEqual([`POST /api/shipments/${SHIP}/acceptance/refuse`])
    await expect(page.getByText('Đơn đã mất cọc. Khách từ chối nhận chuyến 1.')).toBeVisible()
    await expect(page.locator('header.op-heading')).toContainText('Mất cọc')
    await expect(page.getByRole('button', { name: 'Xác nhận nghiệm thu' })).toHaveCount(0)
  })

  test('đơn chờ cọc hiện mã QR đặt cọc; huỷ đơn báo đúng hậu quả và hiện lỗi của máy chủ ngay trong hộp thoại', async ({ page, api }) => {
    await open(page, api, `/khach/don/${orderPending.orderNo}`)
    let attempts = 0
    const cancelled: PreorderResponse = { ...orderPending, status: 'Cancelled', deposit: null, holdExpiresAt: null, cancelReason: 'Đổi kế hoạch nhập hàng' }
    api.get(`/api/preorders/${orderPending.orderNo}`, () => (attempts >= 2 ? cancelled : orderPending))
    api.post(`/api/preorders/${orderPending.orderNo}/cancel`, () => (++attempts === 1 ? reply(409, { status: 409, detail: 'Đơn đang được xử lý, thử lại sau.' }) : cancelled))

    await expect(page.locator('header.op-heading')).toContainText('Chờ đặt cọc')
    const pay = panel(page, 'Chuyển cọc để giữ đơn')
    await expect(pay.getByRole('img', { name: `Mã VietQR chuyển ${vnd(2_685_600)}, nội dung CSD4M8T2` })).toBeVisible()
    await expect(page.locator('main dl.op-facts').last()).toContainText('Giữ đơn tới')

    await aside(page).getByRole('button', { name: 'Huỷ đơn' }).click()
    const dialog = page.getByRole('dialog', { name: `Huỷ đơn ${orderPending.orderNo}` })
    await expect(dialog).toContainText('Đơn chưa cọc nên huỷ không mất gì.')
    await dialog.getByRole('button', { name: 'Huỷ đơn' }).click()
    await expect(dialog).toContainText('Đơn đang được xử lý, thử lại sau.')

    await dialog.getByLabel('Lý do huỷ').fill('Đổi kế hoạch nhập hàng')
    await dialog.getByRole('button', { name: 'Huỷ đơn' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Đã ghi nhận huỷ đơn.' })).toBeVisible()
    const bodies: CancelPreorderRequest[] = [{ reason: null }, { reason: 'Đổi kế hoạch nhập hàng' }]
    expect(api.sent('POST', `/api/preorders/${orderPending.orderNo}/cancel`).map((c) => c.body)).toEqual(bodies)

    await expect(page.locator('header.op-heading')).toContainText('Đã huỷ')
    await expect(page.getByText('Lý do đóng đơn: Đổi kế hoạch nhập hàng')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Chuyển cọc để giữ đơn' })).toHaveCount(0)
    await expect(aside(page).getByRole('button', { name: 'Huỷ đơn' })).toHaveCount(0)
  })

  test('chia lại đợt giao khi Lô chưa bán: tổng các đợt phải khớp số đã đặt', async ({ page, api }) => {
    await open(page, api, `/khach/don/${orderPending.orderNo}`)
    api.put(`/api/preorders/${orderPending.orderNo}/tranches`, orderPending)

    await panel(page, 'Đợt giao').getByRole('button', { name: 'Chia lại' }).click()
    const dialog = page.getByRole('dialog', { name: 'Chia lại đợt giao' })
    const save = dialog.getByRole('button', { name: 'Lưu các đợt giao' })
    await expect(dialog.getByLabel('Ngày đến hạn giao')).toHaveValue(orderPending.tranches[0].dueDate)
    await expect(dialog.getByLabel('Cua gạch L hạng A')).toHaveValue('30')
    await expect(dialog.getByLabel('Cua gạch M hạng A')).toHaveValue('5')

    await dialog.getByLabel('Cua gạch L hạng A').fill('10')
    await expect(dialog).toContainText('Tổng các đợt của Cua gạch L hạng A phải bằng đúng')
    await expect(save).toBeDisabled()

    await dialog.getByRole('button', { name: 'Thêm đợt' }).click()
    await dialog.getByLabel('Ngày đến hạn giao').nth(1).fill(dateFromNow(28))
    await dialog.getByLabel('Cua gạch L hạng A').nth(1).fill('20')
    await save.click()

    const body: SplitTranchesRequest = {
      tranches: [
        { seq: 1, dueDate: orderPending.tranches[0].dueDate, lines: [{ specCode: 'RC-L-A', qtyCrabs: 10 }, { specCode: 'RC-M-A', qtyKg: 5 }] },
        { seq: 2, dueDate: dateFromNow(28), lines: [{ specCode: 'RC-L-A', qtyCrabs: 20 }] },
      ],
    }
    await expect(page.getByRole('status').filter({ hasText: 'Đã lưu các đợt giao.' })).toBeVisible()
    expect(api.sent('PUT', `/api/preorders/${orderPending.orderNo}/tranches`).map((c) => c.body)).toEqual([body])
    await expect(dialog).toHaveCount(0)
  })
})
