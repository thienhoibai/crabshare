/* Giao hàng của một Lô: mục "Đặt trước và giao hàng" (/operator/batches/:code/giao-hang) với lập chuyến và huỷ đợt giao,
   rồi trang một chuyến giao (/operator/deliveries/:shipmentNo) với xuất hàng (cân lần một) và nhận hàng (cân lần hai, lập biên bản nghiệm thu). */
import type {
  AcceptanceResponse, CreateShipmentRequest, DispatchRequest, ReceiptRequest, ShipmentResponse, TrancheStatusResponse,
} from '../src/shared/api/api.gen'
import { daysFromNow, expect, paged, reply, signIn, test, vnd, type Page } from './support/app'
import {
  CODE, SHIPMENT_NO, fact, localInput, mockOperator, noDevReload, more, orderScheduled, orderToShip, panel, shipment, shipmentDispatched, shipmentOf, shippedAllocations,
  trancheDone, trancheScheduled, trancheToShip, tranches, vnDay,
} from './support/operator'

const TAB = `/operator/batches/${CODE}/giao-hang`
const SHIP_URL = `/operator/deliveries/${SHIPMENT_NO}`
const SHIP_API = `/api/shipments/${SHIPMENT_NO}`
const [L, XL] = orderScheduled.lines.map((l) => l.specName)

/** Cột phải của trang chuyến giao: tiến trình, thông tin giao, mã QR của đơn. */
const side = (page: Page) => page.locator('aside.op-aside')

/** Biên bản nghiệm thu do người nuôi vừa lập, chờ khách xác nhận. */
const acceptance = (extra: Partial<AcceptanceResponse> = {}): AcceptanceResponse => ({
  status: 'Pending', acceptedCrabs: 42, acceptedKg: 18.8, rejectedCrabs: 0, discrepancyReason: null, operatorRecordedAt: daysFromNow(0), customerConfirmedAt: null,
  goodsValue: 10_768_000, depositApplied: orderScheduled.depositAmount, balanceDue: 10_768_000 - orderScheduled.depositAmount, balanceDueAt: null, balancePaidAt: null, ...extra,
})

/** Chuyến SH-2611-0031 sau khi ghi cân lần hai 12,6 kg và 6,2 kg, khách nhận đủ. */
const shipmentReceived: ShipmentResponse = {
  ...shipmentDispatched,
  lines: shipmentDispatched.lines.map((l, i) => ({
    ...l, receivedCrabs: l.dispatchedCrabs, receivedKg: [12.6, 6.2][i], acceptedCrabs: l.dispatchedCrabs, acceptedKg: [12.6, 6.2][i], rejectedCrabs: 0,
    transportLossKg: [0.2, 0.1][i], goodsValue: [6_552_000, 4_216_000][i],
  })),
  acceptance: acceptance(),
}

test.beforeEach(async ({ page, api }) => {
  mockOperator(api)
  await noDevReload(page)
  await signIn(page, 'OperatorMember')
})

test.describe('mục Đặt trước và giao hàng của Lô', () => {
  test('đợt cần lập chuyến đứng đầu, rồi chuyến đang chạy; phần còn lại gấp lại', async ({ page, api }) => {
    await page.goto(TAB)
    await expect(fact(page, 'Cần lập chuyến')).toHaveText('1')
    await expect(fact(page, 'Chuyến đang chạy')).toHaveText('1')
    await expect(fact(page, 'Đợt đã xong')).toHaveText('1')
    await expect(fact(page, 'Đơn đặt trước')).toHaveText('3')

    const todo = panel(page, 'Cần lập chuyến giao').getByRole('row').filter({ hasText: orderToShip.orderNo })
    await expect(todo).toContainText(`Hạn ${vnDay(trancheToShip.dueDate)}`)
    await expect(todo).toContainText(`${orderToShip.orderNo} · đợt 1`)
    await expect(todo).toContainText('Nhà hàng Biển Đông')
    await expect(todo).toContainText('RC-L-G1: 40 / 40 con')
    await expect(todo).toContainText('RC-XL-SP: 18 / 20 con · 2 thay hạng')
    await expect(todo).toContainText('Đã phân bổ cua')
    await expect(todo.getByRole('button', { name: 'Lập chuyến' })).toBeVisible()
    await expect(todo.getByRole('button', { name: 'Huỷ đợt giao' })).toBeVisible()

    const running = panel(page, 'Chuyến đang chạy').getByRole('row').filter({ hasText: orderScheduled.orderNo })
    await expect(running).toContainText('Chờ xuất')
    await expect(running.getByRole('link', { name: 'Mở chuyến' })).toHaveAttribute('href', SHIP_URL)
    await expect(running.getByRole('button', { name: 'Lập chuyến' })).toHaveCount(0)

    await more(page, 'Đợt đã xong hoặc đã huỷ').click()
    await expect(page.getByRole('row').filter({ hasText: trancheDone.recipientName })).toContainText('Đã nghiệm thu')

    await more(page, 'Đơn đặt trước').click()
    const order = page.getByRole('row').filter({ has: page.getByRole('link', { name: orderToShip.orderNo }) })
    await expect(order).toContainText(`${L}: 40 con`)
    await expect(order).toContainText(vnd(orderToShip.estimatedValue))
    await expect(order).toContainText(`${vnd(orderToShip.depositAmount)}Đã cọc`)
    await expect(order).toContainText(`Đợt 1 · ${vnDay(trancheToShip.dueDate)}`)
    await expect(order).toContainText('Đã xác nhận')

    await more(page, 'Phân bổ cua').click()
    await expect(page.getByRole('row').filter({ hasText: 'C-000150' })).toContainText('Thay hạng')
    await expect(page.getByRole('row').filter({ hasText: 'C-000099' })).toContainText(/Đã nhả.*Cua chết trước khi xuất/)

    expect(api.sent('GET', '/api/operators/me/preorders').map((c) => c.query)).toEqual([{ batchCode: CODE, pageSize: '100' }])
    expect(api.writes()).toEqual([])
  })

  test('lập chuyến cho một đợt rồi chuyển sang trang của chuyến', async ({ page, api }) => {
    const created = shipmentOf(orderToShip, 'SH-2611-0040', { traceCode: 'TRC4H8N2WP' })
    let list: TrancheStatusResponse[] = tranches
    api.get(`/api/batches/${CODE}/delivery-tranches`, () => list)
    api.get(`/api/shipments/${created.shipmentNo}`, created)
    api.post(`/api/delivery-tranches/${trancheToShip.trancheId}/shipments`, () => {
      list = tranches.map((t) => (t.trancheId === trancheToShip.trancheId ? { ...t, shipmentNo: created.shipmentNo, shipmentStatus: 'Scheduled' } : t))
      return reply(201, created)
    })
    await page.goto(TAB)
    await panel(page, 'Cần lập chuyến giao').getByRole('button', { name: 'Lập chuyến', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Lập chuyến giao' })
    await expect(dialog.getByText(`Nhà hàng Biển Đông · hạn ${vnDay(trancheToShip.dueDate)}`)).toBeVisible()
    // Giờ xuất mặc định là một giờ nữa; điều kiện vận chuyển và thay hạng nằm trong "Tuỳ chọn thêm".
    await expect(dialog.getByLabel('Dự kiến xuất hàng lúc')).toHaveValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    await dialog.getByRole('button', { name: 'Lập chuyến' }).click()

    await expect(page.getByRole('status').filter({ hasText: `Đã lập chuyến giao ${created.shipmentNo}.` })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/operator/deliveries/${created.shipmentNo}$`))
    await expect(page.getByRole('heading', { name: 'Giao cho Nhà hàng Biển Đông', level: 1 })).toBeVisible()
    // Số con xuất của từng dòng lấy theo số đã phân bổ: 40 con L và 18 con XL.
    await expect(page.getByLabel(`${L} · 40 con`)).toBeVisible()
    await expect(page.getByLabel(`${XL} · 18 con`)).toBeVisible()

    const sent = api.sent('POST', `/api/delivery-tranches/${trancheToShip.trancheId}/shipments`)
    expect(sent).toHaveLength(1)
    const body = sent[0].body as CreateShipmentRequest
    expect(body).toEqual({ scheduledAt: expect.any(String), transportCondition: null, allowSubstitution: true })
    expect(Math.abs(Date.parse(body.scheduledAt!) - (Date.now() + 3_600_000))).toBeLessThan(5 * 60_000)
  })

  test('chọn giờ xuất, điều kiện vận chuyển, không thay hạng; máy chủ từ chối thì lỗi hiện trong hộp thoại', async ({ page, api }) => {
    api.post(`/api/delivery-tranches/${trancheToShip.trancheId}/shipments`, () => reply(422, { status: 422, detail: 'Dòng RC-XL-SP còn thiếu 2 con đã duyệt hạng (BR-164).' }))
    await page.goto(TAB)
    await panel(page, 'Cần lập chuyến giao').getByRole('button', { name: 'Lập chuyến', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Lập chuyến giao' })
    const when = new Date(Date.now() + 26 * 3_600_000)
    when.setSeconds(0, 0)
    await dialog.getByLabel('Dự kiến xuất hàng lúc').fill(localInput(when))
    await more(dialog, 'Tuỳ chọn thêm').click()
    await dialog.getByLabel('Điều kiện vận chuyển').fill('  Thùng xốp, đá khô  ')
    await expect(dialog.getByLabel('Thiếu cua thì thay bằng cua cùng size, hạng cao hơn')).toBeChecked()
    await dialog.getByLabel('Thiếu cua thì thay bằng cua cùng size, hạng cao hơn').uncheck()
    await dialog.getByRole('button', { name: 'Lập chuyến' }).click()

    await expect(dialog.getByText('Dòng RC-XL-SP còn thiếu 2 con đã duyệt hạng.')).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${TAB}$`))
    const body: CreateShipmentRequest = { scheduledAt: when.toISOString(), transportCondition: 'Thùng xốp, đá khô', allowSubstitution: false }
    expect(api.sent('POST', `/api/delivery-tranches/${trancheToShip.trancheId}/shipments`).map((c) => c.body)).toEqual([body])

    // Xoá giờ xuất thì không gửi được.
    await dialog.getByLabel('Dự kiến xuất hàng lúc').fill('')
    await expect(dialog.getByRole('button', { name: 'Lập chuyến' })).toBeDisabled()
  })

  test('huỷ đợt giao vì thiếu cua cần lý do từ ba ký tự', async ({ page, api }) => {
    let list: TrancheStatusResponse[] = tranches
    api.get(`/api/batches/${CODE}/delivery-tranches`, () => list)
    api.post(`/api/delivery-tranches/${trancheToShip.trancheId}/cancel`, () => {
      list = tranches.map((t) => (t.trancheId === trancheToShip.trancheId ? { ...t, status: 'Cancelled', lines: t.lines.map((l) => ({ ...l, allocatedCrabs: 0, substitutedCrabs: 0 })) } : t))
      return { orderNo: orderToShip.orderNo, status: 'Confirmed', depositAmount: orderToShip.depositAmount, depositApplied: 0, traceCode: null, shipments: [], invoices: [], returnWindowEndsAt: null }
    })
    await page.goto(TAB)
    await panel(page, 'Cần lập chuyến giao').getByRole('button', { name: 'Huỷ đợt giao' }).click()
    const dialog = page.getByRole('dialog', { name: 'Huỷ đợt giao vì thiếu cua' })
    await expect(dialog.getByText(`Đơn ${orderToShip.orderNo} · đợt 1`)).toBeVisible()
    await expect(dialog.getByText('Cua đã phân bổ quay về tồn. Đợt cuối thì hoàn cọc chưa dùng.')).toBeVisible()
    const confirm = dialog.getByRole('button', { name: 'Huỷ đợt giao' })
    await dialog.getByLabel('Lý do').fill('ít')
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel('Lý do').fill(' Cua XL chết hai con, không đủ hàng ')
    await confirm.click()

    await expect(page.getByRole('status').filter({ hasText: 'Đã huỷ đợt giao.' })).toBeVisible()
    await expect(dialog).toHaveCount(0)
    expect(api.sent('POST', `/api/delivery-tranches/${trancheToShip.trancheId}/cancel`).map((c) => c.body)).toEqual([{ reason: 'Cua XL chết hai con, không đủ hàng' }])
    await expect(fact(page, 'Cần lập chuyến')).toHaveText('0')
    await expect(fact(page, 'Đợt đã xong')).toHaveText('2')
    await expect(page.getByRole('heading', { name: 'Cần lập chuyến giao' })).toHaveCount(0)
  })

  test('Lô chưa có đơn đặt trước thì chỉ có một dòng trống', async ({ page, api }) => {
    api.get('/api/operators/me/preorders', paged([], 100))
    api.get(`/api/batches/${CODE}/delivery-tranches`, [])
    api.get(`/api/batches/${CODE}/allocations`, [])
    await page.goto(TAB)
    await expect(page.getByText('Lô chưa có đơn đặt trước nào')).toBeVisible()
    await expect(page.locator('dl.op-facts')).toHaveCount(0)
  })
})

test.describe('trang một chuyến giao', () => {
  test('chuyến chờ xuất: người nhận, tiến trình, hàng trong chuyến và một mã QR của đơn', async ({ page, api }) => {
    await page.goto(SHIP_URL)
    await expect(page.getByRole('heading', { name: `Giao cho ${trancheScheduled.recipientName}`, level: 1 })).toBeVisible()
    const heading = page.locator('.op-heading')
    await expect(heading.getByText(`Đơn ${orderScheduled.orderNo} · đợt 1`)).toBeVisible()
    await expect(heading.getByText('Chờ xuất')).toBeVisible()
    await expect(heading.getByRole('link', { name: 'Giao hàng' })).toHaveAttribute('href', '/operator/deliveries')
    await expect(heading.getByRole('button', { name: 'In phiếu' })).toBeVisible()

    await expect(side(page).getByRole('listitem')).toHaveText([/Xuất hàng.*Dự kiến/, /Nhận hàng, cân lần hai/, /Khách xác nhận nghiệm thu/, /Thu phần còn lại/])
    await expect(side(page)).toContainText(trancheScheduled.recipientPhone)
    await expect(side(page)).toContainText(orderScheduled.deliveryAddress)
    await expect(side(page)).toContainText('Thùng xốp, đá khô')
    // QR gắn theo đơn: đúng một mã, dẫn tới trang truy xuất của đơn.
    await expect(page.getByRole('img', { name: /QR/ })).toHaveCount(1)
    await expect(side(page).getByRole('img', { name: `Mã QR của đơn ${orderScheduled.orderNo}` })).toBeVisible()
    await expect(side(page).getByRole('link', { name: 'Mở trang truy xuất' })).toHaveAttribute('href', `/truy-xuat/${shipment.traceCode}`)
    await expect(side(page).getByRole('link', { name: `Lô ${CODE}` })).toHaveAttribute('href', TAB)

    const goods = panel(page, 'Hàng trong chuyến')
    await expect(goods.getByRole('row').filter({ hasText: L }).getByRole('cell')).toHaveText([`${L}${vnd(520_000)} / kg`, '30 con', '—', '—', '—'])
    await expect(goods.getByRole('row').filter({ hasText: XL }).getByRole('cell')).toHaveText([`${XL}${vnd(680_000)} / kg`, '12 con', '—', '—', '—'])
    // Người nuôi tìm đơn trong danh sách đơn của hộ nuôi, không đọc đơn của khách.
    expect(api.sent('GET', '/api/operators/me/preorders').map((c) => c.query)).toEqual([{ pageSize: '100' }])
    expect(api.sent('GET', /^\/api\/preorders\//)).toEqual([])
  })

  test('xuất hàng: cân lần một cho từng dòng, xác nhận rồi mới gửi', async ({ page, api }) => {
    let current = shipment
    api.get(SHIP_API, () => current)
    api.post(`${SHIP_API}/dispatch`, () => (current = shipmentDispatched))
    await page.goto(SHIP_URL)
    const form = panel(page, 'Xuất hàng')
    const submit = form.getByRole('button', { name: 'Xuất hàng' })
    await expect(submit).toBeDisabled()
    await form.getByLabel(`${L} · 30 con`).fill('12,8')
    await expect(submit).toBeDisabled()
    await form.getByLabel(`${XL} · 12 con`).fill('6,3')
    await submit.click()

    const dialog = page.getByRole('dialog', { name: 'Xuất hàng' })
    await expect(dialog.getByText('42 con · 19,1 kg')).toBeVisible()
    await expect(dialog.getByText('Sau khi xuất không sửa được số cân lần một.')).toBeVisible()
    expect(api.writes()).toEqual([])
    await dialog.getByRole('button', { name: 'Xuất hàng' }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Đã xuất hàng.' })).toBeVisible()
    const body: DispatchRequest = {
      lines: [{ lineId: 311, dispatchedCrabs: 30, dispatchedKg: 12.8 }, { lineId: 312, dispatchedCrabs: 12, dispatchedKg: 6.3 }],
      transportCondition: 'Thùng xốp, đá khô',
    }
    expect(api.sent('POST', `${SHIP_API}/dispatch`).map((c) => c.body)).toEqual([body])
    // Chuyến sang đang giao: form xuất hàng nhường chỗ cho form nhận hàng.
    await expect(page.locator('.op-heading').getByText('Đang giao')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Nhận hàng', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Xuất hàng' })).toHaveCount(0)
    await expect(panel(page, 'Hàng trong chuyến').getByRole('row').filter({ hasText: L }).getByRole('cell').nth(1)).toHaveText('30 con12,8 kg')
  })

  test('đổi điều kiện vận chuyển lúc xuất; máy chủ từ chối thì số cân còn nguyên', async ({ page, api }) => {
    api.post(`${SHIP_API}/dispatch`, () => reply(409, { status: 409, detail: 'Chuyến giao đã được xuất trước đó.' }))
    await page.goto(SHIP_URL)
    const form = panel(page, 'Xuất hàng')
    await form.getByLabel(`${L} · 30 con`).fill('12,8')
    await form.getByLabel(`${XL} · 12 con`).fill('6,3')
    await more(form, 'Tuỳ chọn thêm').click()
    await expect(form.getByLabel('Điều kiện vận chuyển')).toHaveValue('Thùng xốp, đá khô')
    await form.getByLabel('Điều kiện vận chuyển').fill('Xe lạnh 18 độ')
    await form.getByRole('button', { name: 'Xuất hàng' }).click()
    const dialog = page.getByRole('dialog', { name: 'Xuất hàng' })
    await dialog.getByRole('button', { name: 'Xuất hàng' }).click()
    await expect(dialog.getByText('Chuyến giao đã được xuất trước đó.')).toBeVisible()
    expect((api.sent('POST', `${SHIP_API}/dispatch`)[0].body as DispatchRequest).transportCondition).toBe('Xe lạnh 18 độ')
    await dialog.getByRole('button', { name: 'Đóng' }).last().click()
    await expect(form.getByLabel(`${L} · 30 con`)).toHaveValue('12,8')
  })

  test('đợt chưa được phân bổ con nào thì chưa xuất được', async ({ page, api }) => {
    api.get(`/api/batches/${CODE}/delivery-tranches`, tranches.map((t) => (t.trancheId === trancheScheduled.trancheId ? { ...t, lines: t.lines.map((l) => ({ ...l, allocatedCrabs: 0 })) } : t)))
    await page.goto(SHIP_URL)
    await expect(page.getByText('Chưa có cua nào được phân bổ cho đợt này nên chưa xuất được.')).toBeVisible()
    await expect(panel(page, 'Xuất hàng').getByRole('button', { name: 'Xuất hàng' })).toBeDisabled()
    await expect(panel(page, 'Hàng trong chuyến').getByRole('row').filter({ hasText: L }).getByRole('cell').nth(1)).toHaveText('0 con')
  })

  test('nhận hàng, khách nhận đủ: chỉ nhập cân lần hai rồi lập biên bản nghiệm thu', async ({ page, api }) => {
    let current = shipmentDispatched
    api.get(SHIP_API, () => current)
    api.post(`${SHIP_API}/receipt`, () => (current = shipmentReceived))
    await page.goto(SHIP_URL)
    const form = panel(page, 'Nhận hàng')
    const submit = form.getByRole('button', { name: 'Lập biên bản nghiệm thu' })
    await expect(form.getByText('Cân lần một 12,8 kg')).toBeVisible()
    await expect(form.getByText('Cân lần một 6,3 kg')).toBeVisible()
    await form.getByLabel(`${L} · 30 con`).fill('12,6')
    // Dòng thứ hai chưa có cân lần hai thì chưa lập được biên bản.
    await expect(submit).toBeDisabled()
    await form.getByLabel(`${XL} · 12 con`).fill('6,2')
    await submit.click()

    const dialog = page.getByRole('dialog', { name: 'Lập biên bản nghiệm thu' })
    await expect(dialog.getByText('Khách chấp nhận 42 con · 18,8 kg')).toBeVisible()
    await dialog.getByRole('button', { name: 'Lập biên bản' }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Đã lập biên bản. Chờ khách xác nhận.' })).toBeVisible()
    const body: ReceiptRequest = {
      lines: [
        { lineId: 311, receivedCrabs: 30, receivedKg: 12.6, acceptedCrabs: 30, acceptedKg: 12.6 },
        { lineId: 312, receivedCrabs: 12, receivedKg: 6.2, acceptedCrabs: 12, acceptedKg: 6.2 },
      ],
      rejectedCrabCodes: null,
      discrepancyReason: null,
    }
    expect(api.sent('POST', `${SHIP_API}/receipt`).map((c) => c.body)).toEqual([body])

    // Biên bản chờ khách xác nhận: bảng hàng có số nhận, số chấp nhận và tiền; người nuôi còn ghi lại được cân lần hai.
    const goods = panel(page, 'Hàng trong chuyến')
    await expect(goods.getByText('Chờ khách xác nhận')).toBeVisible()
    await expect(goods.getByRole('row').filter({ hasText: L }).getByRole('cell')).toHaveText([/./, '30 con12,8 kg', '30 con12,6 kg · hao 0,2 kg', '30 con12,6 kg', vnd(6_552_000)])
    await expect(goods.locator('dl.op-dl')).toHaveText(['Tiền hàng', vnd(10_768_000), 'Trừ cọc', vnd(orderScheduled.depositAmount), 'Khách còn phải trả', vnd(10_768_000 - orderScheduled.depositAmount)].join(''))
    await expect(page.getByRole('heading', { name: 'Ghi lại cân lần hai' })).toBeVisible()
    await expect(panel(page, 'Ghi lại cân lần hai').getByLabel(`${L} · 30 con`)).toHaveValue('12,6')
  })

  test('khách từ chối một phần: ghi số con, kg chấp nhận, mã cua bị từ chối và lý do', async ({ page, api }) => {
    let current = shipmentDispatched
    api.get(SHIP_API, () => current)
    api.get(`/api/batches/${CODE}/allocations`, shippedAllocations)
    api.post(`${SHIP_API}/receipt`, (call) => {
      const sent = call.body as ReceiptRequest
      current = {
        ...shipmentReceived,
        lines: shipmentReceived.lines.map((l, i) => ({ ...l, ...sent.lines[i], rejectedCrabs: [2, 0][i], goodsValue: [6_136_000, 4_216_000][i] })),
        acceptance: acceptance({ acceptedCrabs: 40, acceptedKg: 18, rejectedCrabs: 2, discrepancyReason: sent.discrepancyReason ?? null, goodsValue: 10_352_000, balanceDue: 10_352_000 - orderScheduled.depositAmount }),
      }
      return current
    })
    await page.goto(SHIP_URL)
    const form = panel(page, 'Nhận hàng')
    const submit = form.getByRole('button', { name: 'Lập biên bản nghiệm thu' })
    await form.getByLabel('Thiếu cua hoặc khách từ chối một phần').check()
    // Mỗi dòng mở bốn ô; số con điền sẵn bằng số đã xuất, còn thiếu kg.
    await expect(form.getByText('Đã xuất 30 con · 12,8 kg')).toBeVisible()
    await expect(form.getByLabel('Số con nhận').first()).toHaveValue('30')
    await expect(form.getByText(`${L}: thiếu kg chấp nhận.`)).toBeVisible()
    await expect(submit).toBeDisabled()

    await form.getByLabel('Cân lần hai').nth(0).fill('12,6')
    await form.getByLabel('Số con chấp nhận').nth(0).fill('28')
    await form.getByLabel('Kg chấp nhận').nth(0).fill('13')
    await expect(form.getByText(`${L}: kg chấp nhận vượt kg nhận.`)).toBeVisible()
    await form.getByLabel('Kg chấp nhận').nth(0).fill('11,8')
    await form.getByLabel('Cân lần hai').nth(1).fill('6,2')
    await form.getByLabel('Kg chấp nhận').nth(1).fill('6,2')
    await form.getByRole('checkbox', { name: /C-000201/ }).check()
    await form.getByRole('checkbox', { name: /C-000202/ }).check()
    // Có chênh lệch thì bắt buộc ghi lý do.
    await expect(submit).toBeDisabled()
    await form.getByLabel('Lý do chênh lệch').fill('Hai con yếu, khách không nhận')
    await submit.click()

    const dialog = page.getByRole('dialog', { name: 'Lập biên bản nghiệm thu' })
    await expect(dialog.getByText('Khách chấp nhận 40 con · 18 kg · từ chối 2 con')).toBeVisible()
    await dialog.getByRole('button', { name: 'Lập biên bản' }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Đã lập biên bản. Chờ khách xác nhận.' })).toBeVisible()
    const body: ReceiptRequest = {
      lines: [
        { lineId: 311, receivedCrabs: 30, receivedKg: 12.6, acceptedCrabs: 28, acceptedKg: 11.8 },
        { lineId: 312, receivedCrabs: 12, receivedKg: 6.2, acceptedCrabs: 12, acceptedKg: 6.2 },
      ],
      rejectedCrabCodes: ['C-000201', 'C-000202'],
      discrepancyReason: 'Hai con yếu, khách không nhận',
    }
    expect(api.sent('POST', `${SHIP_API}/receipt`).map((c) => c.body)).toEqual([body])
    const goods = panel(page, 'Hàng trong chuyến')
    await expect(goods.getByText('Chênh lệch: Hai con yếu, khách không nhận')).toBeVisible()
    await expect(goods.getByRole('row').filter({ hasText: L }).getByRole('cell').nth(3)).toHaveText('28 con11,8 kg · từ chối 2')
    // Biên bản có chênh lệch thì form ghi lại mở sẵn phần chi tiết.
    await expect(panel(page, 'Ghi lại cân lần hai').getByLabel('Thiếu cua hoặc khách từ chối một phần')).toBeChecked()
  })

  test('khách đã xác nhận nghiệm thu: không còn form, hiện tiền còn phải thu và hạn đổi trả', async ({ page, api }) => {
    const accepted: ShipmentResponse = {
      ...shipmentReceived, status: 'Accepted', deliveredAt: daysFromNow(-0.1), returnWindowEndsAt: daysFromNow(0.9),
      acceptance: acceptance({ status: 'Confirmed', customerConfirmedAt: daysFromNow(-0.1), balanceDueAt: daysFromNow(-0.01) }),
      balance: { paymentRequestId: 91, referenceCode: 'CSB0031', amount: 10_768_000 - orderScheduled.depositAmount, qrContent: '000201', expiresAt: daysFromNow(2), accountNo: '9704000031', status: 'Pending' },
    }
    api.get(SHIP_API, accepted)
    await page.goto(SHIP_URL)
    await expect(page.locator('.op-heading').getByText('Đã nghiệm thu')).toBeVisible()
    const goods = panel(page, 'Hàng trong chuyến')
    await expect(goods.getByText('Khách đã xác nhận')).toBeVisible()
    await expect(goods.locator('dl.op-dl')).toContainText(`Khách còn phải trả${vnd(10_768_000 - orderScheduled.depositAmount)}Chờ chuyển khoản`)
    // Hạn thu phần còn lại đã qua thì bước cuối báo quá hạn.
    await expect(side(page).getByRole('listitem').last()).toHaveText(/Thu phần còn lại.*quá hạn \d+ (phút|giờ)/)
    await expect(side(page)).toContainText('Hạn đổi trả')
    await expect(page.getByRole('heading', { name: 'Xuất hàng' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /Nhận hàng|Ghi lại cân lần hai/ })).toHaveCount(0)
    expect(api.writes()).toEqual([])
  })

  test('khách từ chối nhận: báo mất cọc và cua quay về tồn', async ({ page, api }) => {
    api.get(SHIP_API, { ...shipmentReceived, status: 'Refused', acceptance: acceptance({ status: 'Refused', acceptedCrabs: 0, acceptedKg: 0, goodsValue: null, depositApplied: null, balanceDue: null }) })
    await page.goto(SHIP_URL)
    await expect(page.getByText('Khách từ chối nhận. Đơn mất cọc, cua quay về tồn để bán lại.')).toBeVisible()
    await expect(page.locator('.op-heading').getByText('Khách từ chối nhận')).toBeVisible()
    await expect(side(page).getByRole('listitem').nth(2)).toHaveText(/Khách từ chối nhận/)
    await expect(page.getByRole('heading', { name: /Nhận hàng|Ghi lại cân lần hai/ })).toHaveCount(0)
  })

  test('mã chuyến không có thì báo lỗi của máy chủ', async ({ page, api }) => {
    api.get('/api/shipments/SH-0000-0000', () => reply(404, { status: 404, detail: 'Không tìm thấy chuyến giao.' }))
    await page.goto('/operator/deliveries/SH-0000-0000')
    await expect(page.getByRole('alert').filter({ hasText: 'Không tải được dữ liệu' })).toContainText('Không tìm thấy chuyến giao.')
    expect(api.sent('GET', '/api/operators/me/preorders')).toEqual([])
  })
})
