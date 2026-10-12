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

test('customer checks out a two-batch cart and gets one order and one transfer per batch', async ({ page }) => {
  await signInCustomer(page)
  await mockStore(page)
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
  const order = (orderNo: string, batchCode: string, farmName: string, line: object, amount: number, accountNo: string) => ({
    orderNo, batchCode, farmName, status: 'PendingPayment', totalAmount: amount, expiresAt, lines: [line],
    payment: { referenceCode: orderNo, accountNo, amount, qrContent: `VIETQR|SANDBOX|${accountNo}|${amount}|${orderNo}`, expiresAt },
  })
  let calls = 0
  await page.route('**/api/orders/checkout', async route => {
    calls++
    expect(route.request().headers().authorization).toBe('Bearer test-token')
    expect(route.request().postDataJSON()).toEqual({ lines: [{ listingId: 3, quantityKg: 2 }, { listingId: 7, quantityKg: 1 }], addressId: 11 })
    await route.fulfill({ json: { orders: [
      order('OD7K2M9QX4R1T', 'TEST-02', 'HTX Năm Căn', { listingId: 3, title: 'Cua gạch son', quantityKg: 2, unitPrice: 520_000, amount: 1_040_000 }, 1_040_000, '9704000000000002'),
      order('ODB3N8PZ5W6YH', 'TEST-05', 'HTX Ngọc Hiển', { listingId: 7, title: 'Cua thịt loại 1', quantityKg: 1, unitPrice: 430_000, amount: 430_000 }, 430_000, '9704000000000005'),
    ] } })
  })

  await addToCartAndCheckout(page)
  await expect(page.getByRole('radio', { name: /12 Lý Thường Kiệt/ })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('Hàng từ 2 lô sẽ tạo 2 đơn, mỗi đơn một mã QR.')).toBeVisible()
  await page.getByRole('button', { name: /^Đặt hàng · / }).click()

  await expect(page).toHaveURL(/\/xac-nhan-don-hang$/)
  await expect(page.getByRole('heading', { name: 'Đã tạo 2 đơn, mỗi lô một đơn' })).toBeVisible()
  const first = page.getByRole('article', { name: 'Đơn OD7K2M9QX4R1T' })
  await expect(first.getByText('9704000000000002')).toBeVisible()
  await expect(first.getByText('Chờ chuyển khoản')).toBeVisible()
  await expect(first.getByRole('timer')).toContainText(/Còn 1[45]:\d\d/)
  await expect(page.getByRole('article', { name: 'Đơn ODB3N8PZ5W6YH' })).toBeVisible()
  expect(calls).toBe(1)

  await page.reload()
  await expect(page.getByRole('article', { name: 'Đơn OD7K2M9QX4R1T' })).toBeVisible()
  await page.goto('/thanh-toan')
  await expect(page.getByText('Giỏ hàng đang trống.')).toBeVisible()
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
