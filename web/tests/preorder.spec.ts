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

const preListing = {
  listingId: 31, title: 'Cua thịt đặt trước', status: 'Published', crabType: 'FatteningMudCrab', gradeCode: 'L1',
  gradeName: 'Loại 1', minWeightG: 500, maxWeightG: null, storageType: 'Fresh', batchCode: 'CS-2610-01',
  farmName: 'HTX Năm Căn', harvestedAt: null, pricePerKg: 400_000, availableQtyKg: 60, inStock: true,
  imageUrl: null, publishedAt: '2026-10-10T00:00:00Z', averageStars: null, ratingCount: 0,
  batchStatus: 'InProduction', isPreorder: true, remainingPreorderKg: 60, depositPct: 15,
  expectedHarvestDate: '2026-12-20',
}

const address = { addressId: 11, recipientName: 'Võ Khách Hàng', recipientPhone: '0900000000', addressLine: '12 Lý Thường Kiệt', province: 'Cà Mau', isDefault: true, createdAt: '2026-10-12T09:00:00Z' }

test('store preorder card goes to deposit checkout and never uses retail cart', async ({ page }) => {
  await signInCustomer(page)
  await page.route('**/api/listings?*', route => route.fulfill({ json: { items: [preListing], page: 1, pageSize: 12, total: 1 } }))
  await page.route('**/api/listings/31', route => route.fulfill({ json: {
    listing: preListing, batchTitle: 'Lô đang nuôi', frozenAt: null, sellUntil: null, traceTagCode: null, priceHistory: [], reviews: [],
  } }))
  await page.route('**/api/me/addresses', route => route.fulfill({ json: [address] }))
  await page.route('**/api/preorders', async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = route.request().postDataJSON()
    expect(body).toEqual({ listingId: 31, quantityKg: 1, addressId: 11 })
    const expiresAt = '2099-01-01T00:00:00Z'
    return route.fulfill({ status: 201, json: {
      orderNo: 'ODPREORDER01A', batchCode: 'CS-2610-01', farmName: 'HTX Năm Căn', status: 'PendingPayment',
      totalAmount: 400_000, depositAmount: 60_000, depositPct: 15, expiresAt,
      lines: [{ listingId: 31, title: 'Cua thịt đặt trước', quantityKg: 1, unitPrice: 400_000, amount: 400_000 }],
      payment: { referenceCode: 'DC7K2M9QX4R1T', accountNo: '9704000000000002', amount: 60_000,
        qrContent: 'VIETQR|SANDBOX|9704000000000002|60000|DC7K2M9QX4R1T', expiresAt, paymentRequestId: 801 },
    } })
  })
  await page.route('**/api/payment-requests/801', route => route.fulfill({ json: {
    paymentRequestId: 801, purpose: 'PreOrderDeposit', status: 'Pending', batchCode: 'CS-2610-01',
    referenceCode: 'DC7K2M9QX4R1T', amount: 60_000, qrContent: 'VIETQR|SANDBOX|9704000000000002|60000|DC7K2M9QX4R1T',
    expiresAt: '2099-01-01T00:00:00Z', providerName: 'Sandbox', accountNo: '9704000000000002',
  } }))

  await page.goto('/cua-hang')
  await expect(page.getByRole('button', { name: 'Thêm Cua thịt đặt trước vào giỏ' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Đặt trước Cua thịt đặt trước' }).click()
  await expect(page).toHaveURL(/\/dat-truoc\/31$/)
  await expect(page.getByText('Thanh toán hôm nay')).toBeVisible()
  await expect(page.getByRole('button', { name: /Đặt trước · cọc/ })).toBeVisible()
  await page.getByRole('button', { name: /Đặt trước · cọc/ }).click()
  await expect(page).toHaveURL(/\/xac-nhan-dat-truoc$/)
  await expect(page.getByText('DC7K2M9QX4R1T', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Cọc phải chuyển')).toBeVisible()
})

test('retail listing still adds to cart', async ({ page }) => {
  await signInCustomer(page)
  const retail = { ...preListing, listingId: 7, title: 'Cua thịt loại 1', isPreorder: false, batchStatus: 'Harvesting', remainingPreorderKg: null, depositPct: null, harvestedAt: '2026-10-10T00:00:00Z' }
  await page.route('**/api/listings?*', route => route.fulfill({ json: { items: [retail], page: 1, pageSize: 12, total: 1 } }))
  await page.goto('/cua-hang')
  await expect(page.getByRole('button', { name: 'Thêm Cua thịt loại 1 vào giỏ' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Đặt trước Cua thịt loại 1' })).toHaveCount(0)
})
