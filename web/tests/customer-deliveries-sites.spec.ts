/* Cổng khách hàng: chuyến giao của mọi đơn (/khach/giao-hang) và địa điểm nhận hàng (/khach/dia-diem). */
import type { PartySiteResponse, SiteRequest } from '../src/shared/api/api.gen'
import { expect, reply, signIn, test, vnd, type Api, type Page } from './support/app'
import { deliveriesAccepted, mockCustomer, orderDelivering, orderPending, ordersPage, shipmentToAccept, sites } from './support/customer'

const SHIP = shipmentToAccept.shipmentNo

async function open(page: Page, api: Api, path: string) {
  mockCustomer(api)
  await signIn(page, 'Customer')
  await page.goto(path)
}

test.describe('/khach/giao-hang', () => {
  test('chuyến chờ nghiệm thu nằm ở mục cần xử lý và dẫn thẳng tới chuyến đó trong đơn', async ({ page, api }) => {
    await open(page, api, '/khach/giao-hang')
    await expect(page.getByRole('heading', { name: 'Giao hàng và nghiệm thu' })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Cần tôi xử lý/ })).toHaveAttribute('aria-selected', 'true')

    const row = page.getByRole('link', { name: new RegExp(`Chuyến ${SHIP}`) })
    await expect(row).toHaveAttribute('href', `/khach/don/${orderDelivering.orderNo}#chuyen-${SHIP}`)
    await expect(row).toContainText(`Đơn ${orderDelivering.orderNo} · đợt 1`)
    await expect(row).toContainText('Chờ bạn xác nhận nghiệm thu')
    await expect(row).toContainText('Đang giao')
    await expect(row).toContainText('29 con · 10,1 kg')
    // Đơn chờ cọc chưa tới bước giao nên không hỏi chuyến giao của nó.
    expect(api.sent('GET', /\/deliveries$/).map((c) => c.path)).toEqual([`/api/preorders/${orderDelivering.orderNo}/deliveries`])

    await page.getByRole('tab', { name: /Đang giao/ }).click()
    await expect(page.getByText('Không có chuyến nào đang giao')).toBeVisible()
    await page.getByRole('tab', { name: 'Đã nghiệm thu' }).click()
    await expect(page.getByText('Chưa có chuyến nào đã nghiệm thu')).toBeVisible()
  })

  test('chuyến đã nghiệm thu còn nợ thì báo số tiền còn phải trả', async ({ page, api }) => {
    mockCustomer(api)
    api.get(`/api/preorders/${orderDelivering.orderNo}/deliveries`, deliveriesAccepted)
    await signIn(page, 'Customer')
    await page.goto('/khach/giao-hang')
    const row = page.getByRole('link', { name: new RegExp(`Chuyến ${SHIP}`) })
    await expect(row).toContainText('Chờ trả phần còn lại')
    await expect(row).toContainText(`Còn phải trả ${vnd(1_368_000)}`)
    await expect(row).toContainText('Đã nghiệm thu')
  })

  test('chưa có đơn nào tới bước giao hàng thì dẫn về danh sách đơn', async ({ page, api }) => {
    mockCustomer(api)
    api.get('/api/preorders', ordersPage([orderPending]))
    await signIn(page, 'Customer')
    await page.goto('/khach/giao-hang')
    await expect(page.getByText('Chưa có đơn nào tới bước giao hàng')).toBeVisible()
    await expect(page.getByRole('main').getByRole('link', { name: 'Xem đơn của tôi' })).toHaveAttribute('href', '/khach')
    expect(api.sent('GET', /\/deliveries$/)).toEqual([])
  })
})

test.describe('/khach/dia-diem', () => {
  test('liệt kê địa điểm, đánh dấu mặc định và địa điểm thiếu toạ độ', async ({ page, api }) => {
    await open(page, api, '/khach/dia-diem')
    await expect(page.getByRole('heading', { name: 'Địa điểm nhận hàng' })).toBeVisible()
    const cards = page.locator('main .op-card')
    await expect(cards).toHaveCount(3)
    await expect(cards.filter({ hasText: 'Nhà hàng Biển Xanh' })).toContainText('Mặc định')
    await expect(cards.filter({ hasText: 'Nhà hàng Biển Xanh' })).toContainText('12 Lê Lợi, Quận 1, TP. Hồ Chí Minh')
    await expect(cards.filter({ hasText: 'Kho Thủ Đức' })).toContainText('Thiếu toạ độ')
    await expect(cards.filter({ hasText: 'Bếp trung tâm Quận 7' })).not.toContainText('Thiếu toạ độ')
    expect(api.sent('GET', '/api/me/sites')[0].query).toEqual({ siteType: 'DeliveryAddress' })
  })

  test('thêm địa điểm: toạ độ sai thì báo ngay, đúng thì gửi vĩ độ và kinh độ dạng số', async ({ page, api }) => {
    await open(page, api, '/khach/dia-diem')
    const created: PartySiteResponse = { ...sites[1], siteId: 14, siteCode: 'DA-14', name: 'Quán Hải Sản Bờ Kè', addressLine: '3 Trường Sa, Phú Nhuận' }
    api.post('/api/me/sites', () => reply(201, created))

    await page.getByRole('button', { name: 'Thêm địa điểm' }).click()
    const dialog = page.getByRole('dialog', { name: 'Thêm địa điểm nhận hàng' })
    const save = dialog.getByRole('button', { name: 'Thêm địa điểm' })
    await save.click()
    await expect(dialog).toContainText('Nhập tên địa điểm và địa chỉ.')

    await dialog.getByLabel('Tên địa điểm').fill('  Quán Hải Sản Bờ Kè ')
    await dialog.getByLabel('Địa chỉ').fill('3 Trường Sa, Phú Nhuận')
    await dialog.getByLabel('Toạ độ').fill('ở gần cầu')
    await save.click()
    await expect(dialog).toContainText('Toạ độ chưa đúng. Ví dụ: 10.7769, 106.7009.')
    expect(api.writes()).toEqual([])

    await dialog.getByLabel('Toạ độ').fill('10.7993, 106.6802')
    await dialog.getByLabel('Số điện thoại người nhận').fill('0909123456')
    await save.click()
    const body: SiteRequest = {
      siteType: 'DeliveryAddress', name: 'Quán Hải Sản Bờ Kè', addressLine: '3 Trường Sa, Phú Nhuận', province: null,
      latitude: 10.7993, longitude: 106.6802, contactName: null, contactPhone: '0909123456', isDefault: false,
    }
    await expect(page.getByRole('status').filter({ hasText: 'Đã thêm địa điểm nhận hàng.' })).toBeVisible()
    expect(api.sent('POST', '/api/me/sites').map((c) => c.body)).toEqual([body])
    await expect(dialog).toHaveCount(0)
  })

  test('sửa địa điểm gửi PUT theo mã địa điểm', async ({ page, api }) => {
    await open(page, api, '/khach/dia-diem')
    api.put('/api/me/sites/12', { ...sites[1], name: 'Bếp trung tâm Quận 7 (cổng sau)' })
    await page.locator('main .op-card').filter({ hasText: 'Bếp trung tâm Quận 7' }).getByRole('button', { name: 'Sửa' }).click()
    const dialog = page.getByRole('dialog', { name: 'Sửa Bếp trung tâm Quận 7' })
    await expect(dialog.getByLabel('Toạ độ')).toHaveValue('10.77, 106.7')
    await dialog.getByLabel('Tên địa điểm').fill('Bếp trung tâm Quận 7 (cổng sau)')
    await dialog.getByRole('button', { name: 'Lưu địa điểm' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Đã lưu địa điểm.' })).toBeVisible()
    const body: SiteRequest = {
      siteType: 'DeliveryAddress', name: 'Bếp trung tâm Quận 7 (cổng sau)', addressLine: '45 Nguyễn Thị Thập, Quận 7', province: 'TP. Hồ Chí Minh',
      latitude: 10.77, longitude: 106.7, contactName: null, contactPhone: null, isDefault: false,
    }
    expect(api.sent('PUT', '/api/me/sites/12').map((c) => c.body)).toEqual([body])
  })

  test('ngừng dùng một địa điểm phải xác nhận, rồi gửi DELETE', async ({ page, api }) => {
    await open(page, api, '/khach/dia-diem')
    api.delete('/api/me/sites/13', () => reply(204))
    await page.locator('main .op-card').filter({ hasText: 'Kho Thủ Đức' }).getByRole('button', { name: 'Ngừng dùng' }).click()
    const dialog = page.getByRole('dialog', { name: 'Ngừng dùng Kho Thủ Đức' })
    await expect(dialog).toContainText('Đơn đã đặt vẫn giao tới địa chỉ ghi trên đơn.')
    expect(api.writes()).toEqual([])
    await dialog.getByRole('button', { name: 'Ngừng dùng địa điểm' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Đã ngừng dùng địa điểm.' })).toBeVisible()
    expect(api.writes()).toEqual(['DELETE /api/me/sites/13'])
  })
})
