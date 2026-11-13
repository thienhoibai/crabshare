/* Hai danh sách của cổng người nuôi: Lô của tôi (/operator/batches) và Giao hàng ở mọi Lô (/operator/deliveries). */
import type { OperatorResponse } from '../src/shared/api/api.gen'
import { expect, reply, signIn, test } from './support/app'
import {
  CODE, SHIPMENT_NO, batch, batchDraft, batchFunding, batchOf, batchRaising, batches, farm, mockOperator, noDevReload, orderDone, orderScheduled, orderToShip, trancheScheduled,
  trancheToShip, vnDay,
} from './support/operator'

test.beforeEach(async ({ page, api }) => {
  mockOperator(api)
  await noDevReload(page)
  await signIn(page, 'OperatorMember')
})

test.describe('Lô của tôi', () => {
  const URL = '/operator/batches'
  const LIST = '/api/operators/me/batches'

  test('mỗi Lô một dòng: mã, loại cua, phương thức, số con, trạng thái; bấm dòng mở trang làm việc', async ({ page, api }) => {
    await page.goto(URL)
    await expect(page.getByRole('heading', { name: 'Lô của tôi', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Tạo Lô P' })).toHaveAttribute('href', '/operator/batches/new')

    const row = (title: string) => page.getByRole('link').filter({ hasText: title })
    await expect(row(batch.title)).toContainText(`${CODE} · Cua gạch`)
    await expect(row(batch.title)).toContainText('Lô P')
    // Lô đã chốt vốn hiện số con được cấp vốn thay cho số con kế hoạch.
    await expect(row(batch.title)).toContainText('560 con · nuôi 30 ngày')
    await expect(row(batch.title)).toContainText('Đang thu hoạch')
    await expect(row(batchRaising.title)).toContainText('Lô T')
    await expect(row(batchRaising.title)).toContainText('400 con · nuôi 21 ngày')
    await expect(row(batchRaising.title)).toContainText('Đang lưu nuôi')
    await expect(row(batchFunding.title)).toContainText(`Hạn góp vốn ${vnDay(batchFunding.fundingDeadline!)}`)
    await expect(row(batchDraft.title)).toContainText('Bản nháp')
    expect(api.sent('GET', LIST).map((c) => c.query)).toEqual([{ page: '1', pageSize: '20' }])

    await row(batch.title).click()
    await expect(page).toHaveURL(new RegExp(`/operator/batches/${CODE}$`))
    await expect(page.getByRole('heading', { name: batch.title, level: 1 })).toBeVisible()
  })

  test('lọc theo trạng thái và phương thức do máy chủ làm', async ({ page, api }) => {
    await page.goto(URL)
    await page.getByLabel('Lọc theo trạng thái').selectOption({ label: 'Đang gọi vốn' })
    await expect(page.getByText(batchFunding.title)).toBeVisible()
    await expect(page.getByText(batch.title)).toHaveCount(0)
    await page.getByLabel('Lọc theo phương thức').selectOption({ label: 'Lô T · thương mại' })
    await expect(page.getByText('Không có Lô nào khớp bộ lọc')).toBeVisible()
    // Đang lọc thì không gợi ý tạo Lô đầu tiên.
    await expect(page.getByRole('link', { name: 'Tạo Lô P đầu tiên' })).toHaveCount(0)
    expect(api.sent('GET', LIST).map((c) => c.query)).toEqual([
      { page: '1', pageSize: '20' },
      { status: 'Funding', page: '1', pageSize: '20' },
      { status: 'Funding', batchMode: 'T', page: '1', pageSize: '20' },
    ])
  })

  test('hộ nuôi chưa có Lô thì gợi ý tạo Lô P đầu tiên', async ({ page, api }) => {
    api.get(LIST, { items: [], page: 1, pageSize: 20, total: 0 })
    await page.goto(URL)
    await expect(page.getByText('Chưa có Lô nào')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Tạo Lô P đầu tiên' })).toHaveAttribute('href', '/operator/batches/new')
  })

  test('Lô bị trả về có nhắc Admin yêu cầu sửa; danh sách dài thì chuyển trang ở máy chủ', async ({ page, api }) => {
    api.get(LIST, (call) => {
      const pageNo = Number(call.query.page)
      const items = pageNo === 1 ? [batchOf({ status: 'NeedsRevision', rejectionReason: 'Thiếu bên thu mua' })] : [batchOf({ batchCode: 'P-2609-01', title: 'Lô ở trang hai', status: 'Closed' })]
      return { items, page: pageNo, pageSize: 20, total: 21 }
    })
    await page.goto(URL)
    await expect(page.getByRole('link').filter({ hasText: batch.title })).toContainText('Cần sửa lạiAdmin yêu cầu sửa')
    await expect(page.getByText('1–20 trong 21 Lô')).toBeVisible()
    await page.getByRole('button', { name: 'Trang sau' }).click()
    await expect(page.getByText('Lô ở trang hai')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Trang sau' })).toBeDisabled()
    expect(api.sent('GET', LIST).at(-1)!.query).toEqual({ page: '2', pageSize: '20' })
  })

  test('không tải được danh sách thì báo lỗi của máy chủ và thử lại được', async ({ page, api }) => {
    let failing = true
    api.get(LIST, () => (failing ? reply(403, { status: 403, detail: 'Hồ sơ hộ nuôi đang bị tạm dừng.' }) : { items: batches, page: 1, pageSize: 20, total: batches.length }))
    await page.goto(URL)
    const error = page.getByRole('alert').filter({ hasText: 'Không tải được dữ liệu' })
    await expect(error).toContainText('Hồ sơ hộ nuôi đang bị tạm dừng.')
    failing = false
    await error.getByRole('button', { name: 'Thử lại' }).click()
    await expect(page.getByText(batch.title)).toBeVisible()
  })
})

test.describe('Giao hàng ở mọi Lô', () => {
  const URL = '/operator/deliveries'

  test('gộp đợt giao của các Lô đã mở, mở sẵn mục đang có việc', async ({ page, api }) => {
    await page.goto(URL)
    await expect(page.getByRole('heading', { name: 'Giao hàng', level: 1 })).toBeVisible()
    const filter = page.getByRole('tablist', { name: 'Lọc đợt giao' })
    await expect(filter.getByRole('tab')).toHaveText(['Cần lập chuyến1', 'Chờ xuất1', 'Đang giao', 'Đã nghiệm thu1', 'Tất cả3'])
    await expect(filter.getByRole('tab', { name: /^Cần lập chuyến/ })).toHaveAttribute('aria-selected', 'true')

    const row = (orderNo: string) => page.getByRole('row').filter({ hasText: orderNo })
    await expect(row(orderToShip.orderNo)).toContainText(trancheToShip.recipientName)
    await expect(row(orderToShip.orderNo).getByRole('link', { name: `Lô ${CODE}` })).toHaveAttribute('href', `/operator/batches/${CODE}/giao-hang`)
    await expect(row(orderToShip.orderNo).getByRole('button', { name: 'Lập chuyến' })).toBeVisible()
    await expect(row(orderScheduled.orderNo)).toHaveCount(0)

    await filter.getByRole('tab', { name: /^Chờ xuất/ }).click()
    await expect(row(orderScheduled.orderNo)).toContainText(trancheScheduled.recipientName)
    await expect(row(orderScheduled.orderNo).getByRole('link', { name: 'Mở chuyến' })).toHaveAttribute('href', `/operator/deliveries/${SHIPMENT_NO}`)

    await filter.getByRole('tab', { name: /^Đang giao/ }).click()
    await expect(page.getByText('Không có chuyến nào đang giao')).toBeVisible()

    // Mục "Tất cả" xếp theo hạn giao, đợt đến hạn sớm nhất ở trên.
    await filter.getByRole('tab', { name: /^Tất cả/ }).click()
    await expect(page.locator('tbody tr')).toHaveText([new RegExp(orderDone.orderNo), new RegExp(orderScheduled.orderNo), new RegExp(orderToShip.orderNo)])

    // Chỉ hỏi đợt giao của Lô đã mở; Lô nháp không được hỏi.
    const asked = api.sent('GET', /\/delivery-tranches$/).map((c) => c.path).sort()
    expect(asked).toEqual([batch, batchFunding, batchRaising].map((b) => `/api/batches/${b.batchCode}/delivery-tranches`).sort())
    expect(api.writes()).toEqual([])
  })

  test('không còn đợt chờ lập chuyến thì mở mục chờ xuất', async ({ page, api }) => {
    api.get(`/api/batches/${CODE}/delivery-tranches`, [trancheScheduled])
    await page.goto(URL)
    const filter = page.getByRole('tablist', { name: 'Lọc đợt giao' })
    await expect(filter.getByRole('tab', { name: /^Chờ xuất/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('row').filter({ hasText: orderScheduled.orderNo })).toBeVisible()
    await filter.getByRole('tab', { name: /^Cần lập chuyến/ }).click()
    await expect(page.getByText('Không có đợt nào chờ lập chuyến')).toBeVisible()
  })

  test('nhân viên hộ nuôi được nhắc chỉ chủ hộ lập chuyến và xuất hàng', async ({ page, api }) => {
    await page.goto(URL)
    await expect(page.getByRole('row').filter({ hasText: orderToShip.orderNo })).toBeVisible()
    await expect(page.getByText('Chỉ chủ hộ nuôi lập chuyến và xuất hàng.')).toHaveCount(0)

    const staff: OperatorResponse = { ...farm, memberRole: 'Staff' }
    api.get('/api/operators/me', staff)
    await page.reload()
    await expect(page.getByText('Chỉ chủ hộ nuôi lập chuyến và xuất hàng.')).toBeVisible()
    await expect(page.getByText('Nhân viên hộ nuôi')).toBeVisible()
  })

  test('chưa có đợt giao nào thì chỉ dẫn khi nào mới có', async ({ page, api }) => {
    api.get(/\/delivery-tranches$/, [])
    await page.goto(URL)
    await expect(page.getByText('Chưa có đợt giao nào')).toBeVisible()
    await expect(page.getByText('Đợt giao có khi Lô đã mở và đơn đặt trước được xác nhận.')).toBeVisible()
    await expect(page.getByRole('tablist', { name: 'Lọc đợt giao' })).toHaveCount(0)
  })

  test('một Lô không tải được đợt giao thì báo lỗi, thử lại thì hiện đủ', async ({ page, api }) => {
    let failing = true
    api.get(`/api/batches/${batchRaising.batchCode}/delivery-tranches`, () => (failing ? reply(500, { status: 500, detail: 'Máy chủ đang bận, thử lại sau.' }) : []))
    await page.goto(URL)
    const error = page.getByRole('alert').filter({ hasText: 'Không tải được dữ liệu' })
    await expect(error).toContainText('Máy chủ đang bận, thử lại sau.')
    failing = false
    await error.getByRole('button', { name: 'Thử lại' }).click()
    await expect(page.getByRole('row').filter({ hasText: orderToShip.orderNo })).toBeVisible()
  })
})
