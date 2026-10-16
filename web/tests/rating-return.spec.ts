import { test, expect, type Page } from '@playwright/test'

async function signInCustomer(page: Page) {
  await page.addInitScript(() => localStorage.setItem('crabshare-auth', JSON.stringify({ state: {
    token: 'test-token', expiresAt: '2099-01-01T00:00:00Z',
    user: { userId: 7, email: 'customer@test.local', fullName: 'Võ Khách Hàng', phone: null, status: 'Active', roles: ['Customer'], operatorId: null },
  }, version: 0 })))
}

const shipment = {
  carrierName: 'Nhà xe Phương Trang', vehiclePlate: '69B-123.45', driverPhone: '0901234567',
  expectedArrivalAt: '2026-10-16T07:00:00Z', note: 'Gửi chuyến 14h', shippedAt: '2026-10-15T07:00:00Z',
  deliveredAt: '2026-10-15T09:00:00Z', receivedAt: '2026-10-15T09:00:00Z',
  returnWindowEndsAt: '2026-10-18T09:00:00Z', completedAt: null,
}

function makeOrder(orderNo: string, status: string, canReturn: boolean) {
  return {
    orderNo, batchCode: 'TEST-02', farmName: 'HTX Năm Căn', status, totalAmount: 1_040_000,
    placedAt: '2026-10-14T02:00:00Z', recipientName: 'Võ Khách Hàng', recipientPhone: '0900000000', shippingAddress: '12 Lý Thường Kiệt, Cà Mau',
    cancelledAt: null, cancelReason: null, canCancel: false,
    lines: [{ listingId: 3, title: 'Cua gạch son', gradeCode: 'L1', gradeName: 'Loại 1', quantityKg: 2, unitPrice: 520_000, amount: 1_040_000 }],
    payment: null,
    timeline: [
      { step: 'placed', at: '2026-10-14T02:00:00Z', done: true },
      { step: 'paid', at: '2026-10-14T02:05:00Z', done: true },
      { step: 'packed', at: null, done: true },
      { step: 'shipped', at: '2026-10-15T07:00:00Z', done: true },
      { step: 'delivered', at: '2026-10-15T09:00:00Z', done: true },
      { step: 'completed', at: status === 'Completed' ? '2026-10-18T09:00:00Z' : null, done: status === 'Completed' },
    ],
    canConfirmReceipt: false,
    shipment,
    canReturn,
  }
}

test('customer rates a completed order once', async ({ page }) => {
  await signInCustomer(page)
  let rated = false
  await page.route('**/api/orders/ODRATE0000001', route =>
    route.fulfill({ json: makeOrder('ODRATE0000001', 'Completed', false) }))
  await page.route('**/api/orders/ODRATE0000001/rating', route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      expect(body.stars).toBe(4)
      expect(body.comment).toBe('Đóng gói kín')
      rated = true
      return route.fulfill({
        status: 201,
        json: { ratingId: 10, orderNo: 'ODRATE0000001', stars: 4, comment: 'Đóng gói kín', createdAt: '2026-10-18T10:00:00Z' },
      })
    }
    return route.fulfill({
      json: rated
        ? { canRate: false, rating: { ratingId: 10, orderNo: 'ODRATE0000001', stars: 4, comment: 'Đóng gói kín', createdAt: '2026-10-18T10:00:00Z' } }
        : { canRate: true, rating: null },
    })
  })

  await page.goto('/danh-gia-don-hang/ODRATE0000001')
  await page.getByRole('button', { name: '4 sao' }).click()
  await page.getByLabel(/Nhận xét/).fill('  Đóng gói kín  ')
  await page.getByRole('button', { name: 'Gửi đánh giá' }).click()
  await expect(page.getByText('Bạn đã đánh giá 4 sao')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Gửi đánh giá' })).toHaveCount(0)
})

test('already rated order hides submit button and shows existing rating', async ({ page }) => {
  await signInCustomer(page)
  await page.route('**/api/orders/ODRATE0000002', route =>
    route.fulfill({ json: makeOrder('ODRATE0000002', 'Completed', false) }))
  await page.route('**/api/orders/ODRATE0000002/rating', route =>
    route.fulfill({
      json: {
        canRate: false,
        rating: { ratingId: 11, orderNo: 'ODRATE0000002', stars: 5, comment: 'Cua tươi sống', createdAt: '2026-10-18T10:00:00Z' },
      },
    }))

  await page.goto('/danh-gia-don-hang/ODRATE0000002')
  await expect(page.getByText('Bạn đã đánh giá 5 sao')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Gửi đánh giá' })).toHaveCount(0)
})

test('customer returns a delivered order within return window', async ({ page }) => {
  await signInCustomer(page)
  await page.route('**/api/orders/ODRET00000001/complaints', route => route.fulfill({ status: 404, json: null }))
  await page.route('**/api/orders/ODRET00000001', route =>
    route.fulfill({ json: makeOrder('ODRET00000001', 'Delivered', true) }))
  await page.route('**/api/orders/ODRET00000001/return', route => {
    const body = route.request().postDataJSON()
    expect(body.reason).toBe('Cua chết khi mở thùng nhận hàng')
    return route.fulfill({
      json: { orderNo: 'ODRET00000001', status: 'Returned', refundAmount: 1040000, refundInstructionId: 9 },
    })
  })

  await page.goto('/theo-doi-don-hang/ODRET00000001')
  const region = page.getByRole('region', { name: 'Trả hàng' })
  await expect(region).toBeVisible()
  const openFormBtn = region.getByRole('button', { name: /Trả hàng/ })
  if (await openFormBtn.isVisible()) {
    await openFormBtn.click()
  }
  await region.getByLabel('Lý do trả hàng').fill('Cua chết khi mở thùng nhận hàng')
  await region.getByRole('button', { name: 'Gửi yêu cầu trả hàng' }).click()
  await expect(page.getByText(/Đã ghi nhận trả hàng/)).toBeVisible()
})

test('return form is hidden when canReturn is false and rating link appears on completed order', async ({ page }) => {
  await signInCustomer(page)
  await page.route('**/api/orders/ODRET00000002/complaints', route => route.fulfill({ status: 404, json: null }))
  await page.route('**/api/orders/ODRET00000002', route =>
    route.fulfill({ json: makeOrder('ODRET00000002', 'Completed', false) }))

  await page.goto('/theo-doi-don-hang/ODRET00000002')
  await expect(page.getByRole('button', { name: 'Gửi yêu cầu trả hàng' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Đánh giá đơn' })).toBeVisible()
})
