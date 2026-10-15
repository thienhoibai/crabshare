import { test, expect, type Page } from '@playwright/test'

async function signInCustomer(page: Page) {
  await page.addInitScript(() => localStorage.setItem('crabshare-auth', JSON.stringify({ state: {
    token: 'test-token', expiresAt: '2099-01-01T00:00:00Z',
    user: { userId: 7, email: 'customer@test.local', fullName: 'Võ Khách Hàng', phone: null, status: 'Active', roles: ['Customer'], operatorId: null },
  }, version: 0 })))
}

async function signInOperator(page: Page) {
  await page.addInitScript(() => localStorage.setItem('crabshare-auth', JSON.stringify({ state: {
    token: 'test-token', expiresAt: '2099-01-01T00:00:00Z',
    user: { userId: 1, fullName: 'Viên', email: 'op@test.local', status: 'Active', roles: ['OperatorMember'], operatorId: 1 },
  }, version: 0 })))
  await page.route('**/api/operators/me', route => route.fulfill({ json: { operatorId: 1, legalName: 'Trại thử', status: 'Approved', memberRole: 'Owner', canEdit: false, canSubmit: false } }))
}

const shipment = {
  carrierName: 'Nhà xe Phương Trang', vehiclePlate: '69B-123.45', driverPhone: '0901234567',
  expectedArrivalAt: '2026-10-16T07:00:00Z', note: 'Gửi chuyến 14h', shippedAt: '2026-10-15T07:00:00Z',
  deliveredAt: null, receivedAt: null, returnWindowEndsAt: null, completedAt: null,
}

function tracking(status: string, extra: object = {}) {
  return {
    orderNo: 'ODSHIP0000001', batchCode: 'TEST-02', farmName: 'HTX Năm Căn', status, totalAmount: 1_040_000,
    placedAt: '2026-10-14T02:00:00Z', recipientName: 'Võ Khách Hàng', recipientPhone: '0900000000', shippingAddress: '12 Lý Thường Kiệt, Cà Mau',
    cancelledAt: null, cancelReason: null, canCancel: false,
    lines: [{ listingId: 3, title: 'Cua gạch son', gradeCode: 'L1', gradeName: 'Loại 1', quantityKg: 2, unitPrice: 520_000, amount: 1_040_000 }],
    payment: null,
    timeline: [
      { step: 'placed', at: '2026-10-14T02:00:00Z', done: true }, { step: 'paid', at: '2026-10-14T02:05:00Z', done: true },
      { step: 'packed', at: null, done: true }, { step: 'shipped', at: '2026-10-15T07:00:00Z', done: status !== 'Packed' },
      { step: 'delivered', at: null, done: status === 'Delivered' }, { step: 'completed', at: null, done: false },
    ],
    canConfirmReceipt: status === 'Shipping', shipment, ...extra,
  }
}

test('customer sees carrier details and confirms receipt', async ({ page }) => {
  await signInCustomer(page)
  let received = false
  await page.route('**/api/orders/ODSHIP0000001', route => route.fulfill({ json: received
    ? tracking('Delivered', { canConfirmReceipt: false, shipment: { ...shipment, deliveredAt: '2026-10-15T09:00:00Z', receivedAt: '2026-10-15T09:00:00Z', returnWindowEndsAt: '2026-10-18T09:00:00Z' } })
    : tracking('Shipping') }))
  await page.route('**/api/orders/ODSHIP0000001/receive', route => {
    expect(route.request().method()).toBe('POST')
    received = true
    return route.fulfill({ json: tracking('Delivered', { canConfirmReceipt: false, shipment: { ...shipment, deliveredAt: '2026-10-15T09:00:00Z', receivedAt: '2026-10-15T09:00:00Z', returnWindowEndsAt: '2026-10-18T09:00:00Z' } }) })
  })
  await page.goto('/theo-doi-don-hang/ODSHIP0000001')
  const ship = page.getByRole('region', { name: 'Thông tin giao hàng' })
  await expect(ship).toContainText('Nhà xe Phương Trang · 69B-123.45')
  await expect(ship.getByRole('link', { name: '0901234567' })).toHaveAttribute('href', 'tel:0901234567')
  await expect(page.getByText('quay video lúc mở thùng')).toBeVisible()
  await page.getByRole('button', { name: 'Đã nhận hàng' }).click()
  await page.getByRole('button', { name: 'Xác nhận đã nhận' }).click()
  await expect(page.getByRole('button', { name: 'Đã nhận hàng' })).toHaveCount(0)
  await expect(ship).toContainText('Bạn nhận lúc')
  await expect(ship).toContainText('sau mốc này đơn tự hoàn tất')
})

test('completed demo order without carrier info shows no empty fields', async ({ page }) => {
  await signInCustomer(page)
  await page.route('**/api/orders/ODSHIP0000001', route => route.fulfill({ json: tracking('Completed', {
    canConfirmReceipt: false,
    shipment: { carrierName: null, vehiclePlate: null, driverPhone: null, expectedArrivalAt: null, note: null,
      shippedAt: '2026-09-01T07:00:00Z', deliveredAt: '2026-09-02T07:00:00Z', receivedAt: null, returnWindowEndsAt: '2026-09-05T07:00:00Z', completedAt: '2026-09-05T08:00:00Z' },
  }) }))
  await page.goto('/theo-doi-don-hang/ODSHIP0000001')
  const ship = page.getByRole('region', { name: 'Thông tin giao hàng' })
  await expect(ship).toContainText('Gửi lúc')
  await expect(ship).not.toContainText('null')
  await expect(ship).not.toContainText('Nhà xe')
  await expect(page.getByRole('button', { name: 'Đã nhận hàng' })).toHaveCount(0)
})

test('operator ships a packed order then marks it delivered', async ({ page }) => {
  await signInOperator(page)
  const base = {
    orderNo: 'ODSHIP0000001', placedAt: '2026-10-14T02:00:00Z', paidAt: '2026-10-14T02:05:00Z', batchCode: 'TEST-02',
    customerName: 'Võ Khách Hàng', recipientName: 'Võ Khách Hàng', recipientPhone: '0900000000', shippingAddress: '12 Lý Thường Kiệt, Cà Mau',
    totalAmount: 1_040_000, totalKg: 1, lines: [{ orderLineId: 1, listingId: 3, title: 'Cua gạch son', batchCode: 'TEST-02', gradeCode: 'L1', gradeName: 'Loại 1',
      quantityKg: 1, assignedKg: 1, assignedCount: 2, tags: [{ tagCode: 'CSAB23CD45EF', weightG: 500, gradeCode: 'L1' }, { tagCode: 'CSAB23CD45EG', weightG: 500, gradeCode: 'L1' }] }],
  }
  let detail: object = { ...base, status: 'Packed', shipment: null }
  await page.route('**/api/operators/me/orders/ODSHIP0000001', route => route.fulfill({ json: detail }))
  await page.route('**/api/orders/ODSHIP0000001/ship', route => {
    const body = route.request().postDataJSON()
    expect(body.carrierName).toBe('Nhà xe Phương Trang')
    expect(body.driverPhone).toBe('0901234567')
    expect(body.vehiclePlate).toBe('69B-123.45')
    detail = { ...base, status: 'Shipping', shipment }
    return route.fulfill({ json: detail })
  })
  await page.route('**/api/orders/ODSHIP0000001/deliver', route => {
    detail = { ...base, status: 'Delivered', shipment: { ...shipment, deliveredAt: '2026-10-15T09:00:00Z', returnWindowEndsAt: '2026-10-18T09:00:00Z' } }
    return route.fulfill({ json: detail })
  })
  await page.goto('/operator/orders/ODSHIP0000001')
  await page.getByLabel('Tên nhà xe').fill('Nhà xe Phương Trang')
  await page.getByLabel('Biển số xe (không bắt buộc)').fill('69B-123.45')
  await page.getByLabel('Số điện thoại tài xế').fill('12345')
  await expect(page.getByText('Cần 10 chữ số bắt đầu bằng 0, hoặc dạng +84.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Giao cho nhà xe' })).toBeDisabled()
  await page.getByLabel('Số điện thoại tài xế').fill('0901234567')
  await page.getByRole('button', { name: 'Giao cho nhà xe' }).click()
  await expect(page.getByText('Tài xế: 0901234567')).toBeVisible()
  await page.getByRole('button', { name: 'Đã giao tới khách' }).click()
  await page.getByRole('button', { name: 'Xác nhận đã giao' }).click()
  await expect(page.getByText(/Hạn đổi trả:/)).toBeVisible()
})
