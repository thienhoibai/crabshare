import { test, expect, type Page } from '@playwright/test'

async function signIn(page: Page, roles = ['Investor']) {
  await page.addInitScript(roles => localStorage.setItem('crabshare-auth', JSON.stringify({ state: {
    token: 'test-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 1, email: 'profile@test.local', fullName: 'Trần Đăng Khôi', phone: null, status: 'Active', roles, operatorId: roles.includes('OperatorMember') ? 3 : null },
  }, version: 0 })), roles)
  await page.route('**/api/me/kyc', route => route.fulfill({ json: { verificationStatus: 'Verified', verifiedAt: null, lastCheck: null } }))
}
const emptyProfile = { ownerType: 'Investor', expectedHolderName: 'Trần Đăng Khôi', account: null }

test('investor saves payout account with explicit scope and sees the real result', async ({ page }) => {
  await signIn(page)
  let profile: object = emptyProfile
  let saves = 0
  await page.route('**/api/me/payout-account?*', async route => {
    expect(new URL(route.request().url()).searchParams.get('ownerType')).toBe('Investor')
    if (route.request().method() === 'PUT') {
      saves++
      const input = route.request().postDataJSON()
      expect(input).toEqual({ bankCode: 'VCB', accountNo: '1234567890', accountHolderName: 'TRAN DANG KHOI' })
      expect(route.request().headers().authorization).toBe('Bearer test-token')
      profile = { ...emptyProfile, account: { ...input, payoutAccountId: 1, nameMatchStatus: 'Matched', status: 'Active', updatedAt: '2026-10-12T09:00:00Z' } }
    }
    await route.fulfill({ json: profile })
  })
  await page.goto('/nha-dau-tu/ho-so')
  await page.getByLabel('Mã ngân hàng', { exact: true }).fill('vcb')
  await page.getByLabel('Số tài khoản', { exact: true }).fill('1234567890')
  await page.getByLabel('Tên chủ tài khoản', { exact: true }).fill('TRAN DANG KHOI')
  await page.getByRole('button', { name: 'Lưu tài khoản nhận tiền', exact: true }).click()
  await expect(page.getByText('Tài khoản sẵn sàng nhận tiền')).toBeVisible()
  expect(saves).toBe(1)
  if (process.env.CAPTURE_ACCOUNT_SCREENSHOTS) {
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: '../docs/validation/assets/kh03-payout-web.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: '../docs/validation/assets/kh03-payout-web-small.png', fullPage: true })
  }
})

test('mismatched name is shown as locked and never as ready to receive money', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/me/payout-account?*', route => route.fulfill({ json: route.request().method() === 'GET' ? emptyProfile : {
    ...emptyProfile, account: { bankCode: 'VCB', accountNo: '1234567890', accountHolderName: 'OTHER NAME', nameMatchStatus: 'Mismatched', status: 'Locked', updatedAt: '2026-10-12T09:00:00Z' },
  } }))
  await page.goto('/nha-dau-tu/ho-so')
  await page.getByLabel('Mã ngân hàng', { exact: true }).fill('VCB')
  await page.getByLabel('Số tài khoản', { exact: true }).fill('1234567890')
  await page.getByLabel('Tên chủ tài khoản', { exact: true }).fill('OTHER NAME')
  await page.getByRole('button', { name: 'Lưu tài khoản nhận tiền', exact: true }).click()
  await expect(page.getByText('Tên chủ tài khoản chưa khớp', { exact: true })).toBeVisible()
  await expect(page.getByText('Tài khoản sẵn sàng nhận tiền')).toHaveCount(0)
})

test('payout API conflict keeps the entered details and shows the error', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/me/payout-account?*', route => route.request().method() === 'GET'
    ? route.fulfill({ json: emptyProfile }) : route.fulfill({ status: 409, json: { detail: 'Tài khoản ngân hàng này đã được đăng ký cho chủ sở hữu khác.' } }))
  await page.goto('/nha-dau-tu/ho-so')
  await page.getByLabel('Mã ngân hàng', { exact: true }).fill('VCB')
  await page.getByLabel('Số tài khoản', { exact: true }).fill('1234567890')
  await page.getByRole('button', { name: 'Lưu tài khoản nhận tiền', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('chủ sở hữu khác')
  await expect(page.getByLabel('Số tài khoản', { exact: true })).toHaveValue('1234567890')
})

test('dual-role operator page uses operator scope and presents owner permission failures', async ({ page }) => {
  await signIn(page, ['Investor', 'OperatorMember'])
  await page.route('**/api/operators/me', route => route.fulfill({ json: { operatorId: 3, legalName: 'HTX Cua Cà Mau', memberRole: 'Staff', status: 'Approved' } }))
  await page.route('**/api/me/payout-account?*', route => {
    expect(new URL(route.request().url()).searchParams.get('ownerType')).toBe('Operator')
    return route.fulfill({ status: 403, json: { detail: 'Chỉ chủ hộ nuôi được quản lý tài khoản nhận tiền của hộ nuôi.' } })
  })
  await page.goto('/operator/payout-account')
  await expect(page.getByRole('alert')).toContainText('Chỉ chủ hộ nuôi')
  await expect(page.getByRole('button', { name: 'Lưu tài khoản nhận tiền' })).toHaveCount(0)
})

test('customer can create edit switch default and delete an address', async ({ page }) => {
  await signIn(page, ['Customer'])
  let addresses: Array<Record<string, unknown>> = []
  let nextId = 1
  await page.route('**/api/me/addresses**', async route => {
    const req = route.request()
    const id = Number(new URL(req.url()).pathname.split('/').at(-1))
    if (req.method() === 'GET') return route.fulfill({ json: addresses })
    if (req.method() === 'DELETE') {
      addresses = addresses.filter(a => a.addressId !== id)
      if (addresses.length && !addresses.some(a => a.isDefault)) addresses[0].isDefault = true
      return route.fulfill({ status: 204 })
    }
    const input = req.postDataJSON()
    expect(req.headers().authorization).toBe('Bearer test-token')
    const makeDefault = input.isDefault || addresses.find(a => a.addressId === id)?.isDefault || !addresses.length
    if (makeDefault) addresses.forEach(a => { a.isDefault = false })
    const address = { ...input, addressId: req.method() === 'POST' ? nextId++ : id, isDefault: makeDefault, createdAt: '2026-10-12T09:00:00Z' }
    addresses = [...addresses.filter(a => a.addressId !== id), address]
    return route.fulfill({ status: req.method() === 'POST' ? 201 : 200, json: address })
  })
  await page.goto('/tai-khoan/dia-chi')
  await expect(page.getByText('Chưa có địa chỉ giao hàng')).toBeVisible()
  await page.getByRole('button', { name: 'Thêm địa chỉ', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Tên người nhận').fill('Trần Đăng Khôi')
  await dialog.getByLabel('Số điện thoại').fill('+84901234567')
  await dialog.getByLabel('Địa chỉ chi tiết').fill('12 Đường A')
  await dialog.getByLabel('Tỉnh / thành phố').fill('Cà Mau')
  await dialog.getByRole('button', { name: 'Lưu địa chỉ' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('article').filter({ hasText: '12 Đường A' })).toBeVisible()
  await page.getByRole('button', { name: 'Sửa', exact: true }).click()
  await dialog.getByLabel('Địa chỉ chi tiết').fill('14 Đường B')
  await dialog.getByRole('button', { name: 'Lưu địa chỉ' }).click()
  await expect(page.getByRole('article').filter({ hasText: '14 Đường B' })).toBeVisible()
  if (process.env.CAPTURE_ACCOUNT_SCREENSHOTS) {
    await page.screenshot({ path: '../docs/validation/assets/kh03-addresses-web.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: '../docs/validation/assets/kh03-addresses-web-small.png', fullPage: true })
  }
  await page.getByRole('button', { name: 'Thêm địa chỉ', exact: true }).click()
  await dialog.getByLabel('Tên người nhận').fill('Nguyễn An')
  await dialog.getByLabel('Số điện thoại').fill('0901234567')
  await dialog.getByLabel('Địa chỉ chi tiết').fill('16 Đường C')
  await dialog.getByLabel('Tỉnh / thành phố').fill('Cần Thơ')
  await dialog.getByLabel('Đặt làm địa chỉ mặc định').check()
  await dialog.getByRole('button', { name: 'Lưu địa chỉ' }).click()
  await expect(page.getByText('Mặc định', { exact: true })).toHaveCount(1)
  const card = page.getByRole('article').filter({ hasText: '16 Đường C' })
  await expect(card.getByText('Mặc định', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'Xoá', exact: true }).click()
  await dialog.getByRole('button', { name: 'Xác nhận xoá' }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByText('Mặc định', { exact: true })).toBeVisible()
})

test('customer address page handles server failure without showing sample data', async ({ page }) => {
  await signIn(page, ['Customer'])
  await page.route('**/api/me/addresses', route => route.fulfill({ status: 500, json: { detail: 'Không tải được địa chỉ.' } }))
  await page.goto('/tai-khoan/dia-chi')
  await expect(page.getByRole('alert')).toContainText('Không tải được địa chỉ')
  await expect(page.getByRole('button', { name: 'Thêm địa chỉ', exact: true })).toBeDisabled()
})
