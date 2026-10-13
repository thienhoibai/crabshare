import { test, expect, type Page } from '@playwright/test'

async function signInCustomer(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem('crabshare-auth', JSON.stringify({ state: {
      token: 'test-token', expiresAt: '2099-01-01T00:00:00Z',
      user: { userId: 7, email: 'customer@test.local', fullName: 'Võ Khách Hàng', phone: null, status: 'Active', roles: ['Customer'], operatorId: null },
    }, version: 0 }))
  })
}

const listing = (listingId: number, title: string, batchCode: string, farmName: string, pricePerKg: number) => ({
  listingId, title, status: 'Published', crabType: 'RoeCrab', gradeCode: 'L1', gradeName: 'Loại 1', minWeightG: 500, maxWeightG: null,
  storageType: 'Fresh', batchCode, farmName, harvestedAt: '2026-10-10T00:00:00Z', pricePerKg, availableQtyKg: 8, inStock: true,
  imageUrl: null, publishedAt: '2026-10-10T00:00:00Z',
})
const listings = [listing(3, 'Cua gạch son', 'TEST-02', 'HTX Năm Căn', 520_000), listing(7, 'Cua thịt loại 1', 'TEST-05', 'HTX Ngọc Hiển', 430_000)]
const address = { addressId: 11, recipientName: 'Võ Khách Hàng', recipientPhone: '0900000000', addressLine: '12 Lý Thường Kiệt', province: 'Cà Mau', isDefault: true, createdAt: '2026-10-12T09:00:00Z' }

async function mockStore(page: Page, addresses: object[] = [address]) {
  await page.route('**/api/listings?*', route => route.fulfill({ json: { items: listings, page: 1, pageSize: 12, total: listings.length } }))
  await page.route('**/api/me/addresses', route => route.fulfill({ json: addresses }))
}

async function addToCartAndCheckout(page: Page) {
  await page.goto('/cua-hang')
  await page.getByRole('button', { name: 'Thêm Cua gạch son vào giỏ' }).click()
  await page.getByRole('button', { name: 'Thêm Cua gạch son vào giỏ' }).click()
  await page.getByRole('button', { name: 'Thêm Cua thịt loại 1 vào giỏ' }).click()
  await page.getByRole('button', { name: 'Giỏ hàng, 3 món' }).click()
  await page.getByRole('button', { name: 'Thanh toán', exact: true }).click()
  await expect(page).toHaveURL(/\/thanh-toan$/)
}

/** Kết quả checkout giả: mỗi đơn một yêu cầu thu tiền (paymentRequestId) để trang hỏi lại trạng thái. */
function placedOrders(expiresAt: string) {
  const order = (orderNo: string, paymentRequestId: number, batchCode: string, farmName: string, line: object, amount: number, accountNo: string) => ({
    orderNo, batchCode, farmName, status: 'PendingPayment', totalAmount: amount, expiresAt, lines: [line],
    payment: { referenceCode: orderNo, accountNo, amount, qrContent: `VIETQR|SANDBOX|${accountNo}|${amount}|${orderNo}`, expiresAt, paymentRequestId },
  })
  return [
    order('OD7K2M9QX4R1T', 501, 'TEST-02', 'HTX Năm Căn', { listingId: 3, title: 'Cua gạch son', quantityKg: 2, unitPrice: 520_000, amount: 1_040_000 }, 1_040_000, '9704000000000002'),
    order('ODB3N8PZ5W6YH', 502, 'TEST-05', 'HTX Ngọc Hiển', { listingId: 7, title: 'Cua thịt loại 1', quantityKg: 1, unitPrice: 430_000, amount: 430_000 }, 430_000, '9704000000000005'),
  ]
}
type Placed = ReturnType<typeof placedOrders>[number]

/** GET /api/payment-requests/{id} như backend trả: Paid thì không còn qrContent. */
function paymentRequestJson(o: Placed, status: 'Pending' | 'Paid' | 'Expired') {
  return {
    paymentRequestId: o.payment.paymentRequestId, purpose: 'OrderPayment', status, batchCode: o.batchCode,
    referenceCode: o.payment.referenceCode, amount: o.payment.amount, qrContent: status === 'Pending' ? o.payment.qrContent : null,
    expiresAt: o.payment.expiresAt, providerName: 'Sandbox', accountNo: o.payment.accountNo,
  }
}

async function mockPaymentRequests(page: Page, orders: Placed[], paid: Set<number>) {
  await page.route('**/api/payment-requests/*', route => {
    const id = Number(route.request().url().split('/').pop())
    const o = orders.find((x) => x.payment.paymentRequestId === id)
    return o ? route.fulfill({ json: paymentRequestJson(o, paid.has(id) ? 'Paid' : 'Pending') }) : route.fulfill({ status: 404, json: { status: 404, code: 'payment.not_found' } })
  })
}

test('customer checks out a two-batch cart and gets one order and one transfer per batch', async ({ page }) => {
  await signInCustomer(page)
  await mockStore(page)
  const orders = placedOrders(new Date(Date.now() + 15 * 60_000).toISOString())
  await mockPaymentRequests(page, orders, new Set())
  let calls = 0
  await page.route('**/api/orders/checkout', async route => {
    calls++
    expect(route.request().headers().authorization).toBe('Bearer test-token')
    expect(route.request().postDataJSON()).toEqual({ lines: [{ listingId: 3, quantityKg: 2 }, { listingId: 7, quantityKg: 1 }], addressId: 11 })
    await route.fulfill({ json: { orders } })
  })

  await addToCartAndCheckout(page)
  await expect(page.getByRole('radio', { name: /12 Lý Thường Kiệt/ })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('Hàng từ 2 lô sẽ tạo 2 đơn, mỗi đơn một mã QR.')).toBeVisible()
  await page.getByRole('button', { name: /^Đặt hàng · / }).click()

  await expect(page).toHaveURL(/\/xac-nhan-don-hang$/)
  await expect(page.getByRole('heading', { name: 'Đã tạo 2 đơn, mỗi lô một đơn' })).toBeVisible()
  const first = page.getByRole('article', { name: 'Đơn OD7K2M9QX4R1T' })
  await expect(first.getByText('Chờ chuyển khoản')).toBeVisible()
  // Mã VietQR thật (TH-05): số tiền + nội dung cạnh mã, đồng hồ hạn; số tài khoản chỉ hiện sau "chuyển khoản thủ công" (TL-10 §6.1)
  await expect(first.locator('svg.vq-code__svg')).toBeVisible()
  await expect(first.locator('.vq-info__amount')).toHaveText('1.040.000 đ')
  await expect(first.getByRole('timer')).toContainText(/1[45]:\d\d/)
  await expect(first.getByText('9704000000000002')).toBeHidden()
  await first.getByRole('button', { name: 'Không quét được mã? Chuyển khoản thủ công' }).click()
  await expect(first.getByText('9704000000000002')).toBeVisible()
  await expect(page.getByRole('article', { name: 'Đơn ODB3N8PZ5W6YH' })).toBeVisible()
  expect(calls).toBe(1)

  await page.reload()
  await expect(page.getByRole('article', { name: 'Đơn OD7K2M9QX4R1T' })).toBeVisible()
  await page.goto('/thanh-toan')
  await expect(page.getByText('Giỏ hàng đang trống.')).toBeVisible()
})

test('simulated transfer flips the order to paid through the live payment status', async ({ page }) => {
  await signInCustomer(page)
  await mockStore(page)
  const orders = placedOrders(new Date(Date.now() + 15 * 60_000).toISOString())
  const paid = new Set<number>()
  await mockPaymentRequests(page, orders, paid)
  await page.route('**/api/orders/checkout', route => route.fulfill({ json: { orders } }))
  const simulated: string[] = []
  // POST /api/dev/payments/simulate (chỉ dev): backend đi đúng luồng webhook rồi khoản thu đổi sang Paid
  await page.route('**/api/dev/payments/simulate', route => {
    const { referenceCode } = route.request().postDataJSON() as { referenceCode: string }
    simulated.push(referenceCode)
    const o = orders.find((x) => x.payment.referenceCode === referenceCode)!
    paid.add(o.payment.paymentRequestId)
    return route.fulfill({ json: { outcome: 'Matched', transactionId: 9001, referenceCode, paymentRequestId: o.payment.paymentRequestId, purpose: 'OrderPayment', refundInstructionId: null } })
  })

  await addToCartAndCheckout(page)
  await page.getByRole('button', { name: /^Đặt hàng · / }).click()
  await expect(page).toHaveURL(/\/xac-nhan-don-hang$/)

  const first = page.getByRole('article', { name: 'Đơn OD7K2M9QX4R1T' })
  const second = page.getByRole('article', { name: 'Đơn ODB3N8PZ5W6YH' })
  await expect(first.getByText('Chờ chuyển khoản')).toBeVisible()
  await first.getByRole('button', { name: 'Giả lập đã chuyển khoản' }).click()

  await expect(first.getByText('Đã thanh toán')).toBeVisible()
  await expect(first.getByRole('status')).toContainText('Đã nhận 1.040.000 đ')
  await expect(first.getByRole('timer')).toHaveCount(0)
  await expect(first.getByRole('button', { name: 'Giả lập đã chuyển khoản' })).toHaveCount(0)
  expect(simulated).toEqual(['OD7K2M9QX4R1T'])
  // Đơn của lô kia vẫn chờ: mỗi đơn một khoản thu riêng (BR-67)
  await expect(second.getByText('Chờ chuyển khoản')).toBeVisible()
  await expect(second.getByRole('button', { name: 'Giả lập đã chuyển khoản' })).toBeVisible()

  // Tải lại trang: trạng thái lấy từ API nên vẫn là đã thanh toán
  await page.reload()
  await expect(page.getByRole('article', { name: 'Đơn OD7K2M9QX4R1T' }).getByText('Đã thanh toán')).toBeVisible()
})

test('out-of-stock checkout keeps the cart and shows the server message', async ({ page }) => {
  await signInCustomer(page)
  await mockStore(page)
  await page.route('**/api/orders/checkout', route => route.fulfill({ status: 409, json: {
    status: 409, code: 'order.insufficient_stock', detail: '"Cua gạch son" không còn đủ 2 kg. Giỏ hàng chưa được đặt.',
  } }))

  await addToCartAndCheckout(page)
  await page.getByRole('button', { name: /^Đặt hàng · / }).click()
  await expect(page.getByRole('alert')).toContainText('không còn đủ 2 kg')
  await expect(page).toHaveURL(/\/thanh-toan$/)
  await expect(page.getByRole('region', { name: 'Lô TEST-02' })).toBeVisible()
})

test('checkout without a saved address cannot be placed and links to the address book', async ({ page }) => {
  await signInCustomer(page)
  await mockStore(page, [])
  await addToCartAndCheckout(page)
  await expect(page.getByText('Bạn chưa có địa chỉ giao hàng.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Thêm địa chỉ' })).toHaveAttribute('href', '/tai-khoan/dia-chi')
  await expect(page.getByRole('button', { name: /^Đặt hàng · / })).toBeDisabled()
})
