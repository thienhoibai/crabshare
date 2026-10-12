import { test, expect, type Page } from '@playwright/test'

const user = { userId: 42, fullName: 'Nguyễn An', email: 'nguyen-an@test.local', phone: '0901234567', status: 'Active', roles: ['Investor', 'Customer'], verificationStatus: 'Rejected', createdAt: '2026-10-12T08:00:00Z', lastLoginAt: null }
const failed = { id: 7, userId: 42, fullName: user.fullName, email: user.email, checkType: 'EkycIdFace', result: 'Failed', providerReference: 'TEST-ONLY', consentAt: '2026-10-12T08:00:00Z', checkedAt: '2026-10-12T08:01:00Z', failureReason: 'Không khớp khuôn mặt', reviewedBy: null as number | null, canApproveException: true }
const paged = (items: unknown[], total = items.length, page = 1) => ({ items, total, page, pageSize: 10 })
async function signIn(page: Page, role = 'PlatformAdmin') {
  await page.addInitScript(role => localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token: 'admin-test-token', expiresAt: '2099-01-01T00:00:00Z', user: {
    userId: 1, fullName: 'Quản trị thử nghiệm', email: 'admin@test.local', roles: [role], status: 'Active', phone: null, operatorId: null,
  } }, version: 0 })), role)
}

test('user list reads API, filters searches and paginates', async ({ page }) => {
  await signIn(page)
  const requests: URL[] = []
  await page.route('**/api/admin/users?*', route => {
    const url = new URL(route.request().url()); requests.push(url)
    expect(route.request().headers().authorization).toBe('Bearer admin-test-token')
    return route.fulfill({ json: paged([user], 12, Number(url.searchParams.get('page'))) })
  })
  await page.goto('/admin/users?tab=users')
  await expect(page.getByRole('row').filter({ hasText: user.email })).toBeVisible()
  await page.getByLabel('Vai trò', { exact: true }).selectOption('Investor')
  await page.getByLabel('Trạng thái tài khoản', { exact: true }).selectOption('Active')
  await page.getByLabel('Tìm người dùng', { exact: true }).fill('Nguyễn An')
  await page.getByRole('button', { name: 'Tìm', exact: true }).click()
  await expect(page).toHaveURL(/q=Nguy/)
  await page.getByRole('button', { name: 'Sau', exact: true }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect.poll(() => requests.at(-1)?.searchParams.get('page')).toBe('2')
  expect(requests.at(-1)?.searchParams.get('role')).toBe('Investor')
  expect(requests.at(-1)?.searchParams.get('status')).toBe('Active')
  expect(requests.at(-1)?.searchParams.get('q')).toBe('Nguyễn An')
})

test('lock and unlock require a reason and refresh actual account status', async ({ page }) => {
  await signIn(page)
  let state = { ...user }
  let changes = 0
  await page.route('**/api/admin/users?*', route => route.fulfill({ json: paged([state]) }))
  await page.route('**/api/admin/users/42/*', async route => {
    changes++
    expect(route.request().postDataJSON().reason).toBe('Kiểm tra tài khoản')
    state = { ...state, status: route.request().url().endsWith('/lock') ? 'Locked' : 'Active' }
    await route.fulfill({ json: state })
  })
  await page.goto('/admin/users?tab=users')
  await page.getByRole('button', { name: 'Khoá Nguyễn An', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Lý do khoá tài khoản', { exact: true }).fill('   ')
  await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Vui lòng nhập lý do')
  expect(changes).toBe(0)
  await dialog.getByLabel('Lý do khoá tài khoản', { exact: true }).fill('Kiểm tra tài khoản')
  await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Mở khoá Nguyễn An', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Mở khoá Nguyễn An', exact: true }).click()
  await dialog.getByLabel('Lý do mở khoá tài khoản', { exact: true }).fill('Kiểm tra tài khoản')
  await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Khoá Nguyễn An', exact: true })).toBeVisible()
  expect(changes).toBe(2)
})

test('detail approves eligible latest KYC and displays Verified without identity photos', async ({ page }) => {
  await signIn(page)
  let detail = { user: { ...user }, verifiedAt: null as string | null, kycChecks: [{ ...failed }] }
  await page.route('**/api/admin/users/42', route => route.fulfill({ json: detail }))
  await page.route('**/api/admin/kyc-checks/7/approve-exception', async route => {
    expect(route.request().postDataJSON()).toEqual({ reason: 'Đã đối chiếu thông tin' })
    detail = { user: { ...user, verificationStatus: 'Verified' }, verifiedAt: '2026-10-12T09:00:00Z', kycChecks: [{ ...failed, result: 'ExceptionApproved', reviewedBy: 1, canApproveException: false }] }
    await route.fulfill({ json: detail.kycChecks[0] })
  })
  await page.goto('/admin/users/detail?id=42')
  await expect(page.getByRole('heading', { name: user.fullName, exact: true })).toBeVisible()
  await expect(page.getByText('Không khớp khuôn mặt', { exact: false })).toBeVisible()
  await expect(page.getByRole('img')).toHaveCount(0)
  if (process.env.CAPTURE_ADMIN_SCREENSHOTS) {
    await page.screenshot({ path: '../docs/validation/assets/kh04-admin-detail.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: '../docs/validation/assets/kh04-admin-detail-small.png', fullPage: true })
  }
  await page.getByRole('button', { name: 'Duyệt ngoại lệ KYC lần #7', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Lý do duyệt ngoại lệ KYC', { exact: true }).fill('Đã đối chiếu thông tin')
  await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Đã xác minh', { exact: true })).toBeVisible()
  await expect(page.getByText('Đã duyệt ngoại lệ', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Duyệt ngoại lệ KYC lần/ })).toHaveCount(0)
})

test('KYC queue filters failed checks and blocks ineligible bank checks', async ({ page }) => {
  await signIn(page)
  const bank = { ...failed, id: 8, checkType: 'BankNameMatch', canApproveException: false }
  await page.route('**/api/admin/kyc-checks?*', route => {
    const url = new URL(route.request().url())
    expect(url.searchParams.get('result')).toBe('Failed')
    return route.fulfill({ json: paged(url.searchParams.get('checkType') ? [failed] : [failed, bank]) })
  })
  await page.goto('/admin/users?tab=kyc')
  await expect(page.getByRole('button', { name: 'Duyệt ngoại lệ Nguyễn An', exact: true })).toBeVisible()
  await page.getByLabel('Loại xác minh', { exact: true }).selectOption('')
  await expect(page.getByRole('row').filter({ hasText: 'Tên tài khoản ngân hàng' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Duyệt ngoại lệ Nguyễn An', exact: true })).toHaveCount(1)
  if (process.env.CAPTURE_ADMIN_SCREENSHOTS) {
    await page.screenshot({ path: '../docs/validation/assets/kh04-admin-queue.png', fullPage: true })
  }
})

test('stale exception decision displays API rejection and refreshes eligibility', async ({ page }) => {
  await signIn(page)
  let eligible = true
  await page.route('**/api/admin/users/42', route => route.fulfill({ json: { user, verifiedAt: null, kycChecks: [{ ...failed, canApproveException: eligible }] } }))
  await page.route('**/api/admin/kyc-checks/7/approve-exception', route => {
    eligible = false
    return route.fulfill({ status: 422, json: { detail: 'Lần eKYC này không còn đủ điều kiện duyệt ngoại lệ.' } })
  })
  await page.goto('/admin/users/detail?id=42')
  await page.getByRole('button', { name: 'Duyệt ngoại lệ KYC lần #7', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Lý do duyệt ngoại lệ KYC', { exact: true }).fill('Kiểm tra')
  await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('không còn đủ điều kiện')
  await expect(page.getByText('Đã xác minh', { exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click()
  await expect(page.getByRole('button', { name: /Duyệt ngoại lệ KYC lần/ })).toHaveCount(0)
})

test('unavailable user and invalid ID show errors instead of sample profiles', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/admin/users/42', route => route.fulfill({ status: 404, json: { detail: 'Không tìm thấy người dùng.' } }))
  await page.goto('/admin/users/detail?id=42')
  await expect(page.getByRole('alert')).toContainText('Không tìm thấy người dùng')
  await page.goto('/admin/users/detail?id=USR-802')
  await expect(page.getByRole('alert')).toContainText('Mã người dùng không hợp lệ')
})

test('evidence reviewer cannot open account administration or request its data', async ({ page }) => {
  await signIn(page, 'EvidenceReviewer')
  let reads = 0
  await page.route('**/api/admin/users**', route => { reads++; return route.fulfill({ json: paged([user]) }) })
  await page.goto('/admin/users?tab=users')
  await expect(page).toHaveURL('/')
  expect(reads).toBe(0)
})
