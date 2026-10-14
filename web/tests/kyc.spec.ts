import { test, expect, type Page } from '@playwright/test'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=', 'base64')
const account = (userId = 1) => ({ userId, email: `kyc-${userId}@test.local`, fullName: 'KYC Test', roles: ['Investor'], phone: null, status: 'Active', operatorId: null })
const unverified = { verificationStatus: 'Unverified', verifiedAt: null, lastCheck: null }
const verified = { verificationStatus: 'Verified', verifiedAt: '2026-10-12T08:00:00Z', lastCheck: { id: 1, result: 'Passed', failureReason: null } }

async function signIn(page: Page) {
  await page.route('**/api/investor/portfolio**', (route) => route.fulfill({ json: {
    items: [], page: 1, pageSize: 5, total: 0,
    summary: { totalConfirmedAmount: 0, activeConfirmedAmount: 0, totalBatches: 0, activeBatches: 0, approvedNetPayout: 0 },
  } }))
  await page.addInitScript((user) => localStorage.setItem('crabshare-auth', JSON.stringify({
    state: { token: 'test-token', user, expiresAt: '2099-01-01T00:00:00Z' }, version: 0,
  })), account())
}

async function choosePhotos(page: Page) {
  for (const label of ['CCCD mặt trước', 'CCCD mặt sau', 'Ảnh khuôn mặt']) {
    await page.getByLabel(label, { exact: true }).setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: png })
  }
}

test('requires three photos and consent, then sends multipart and refreshes the overview', async ({ page }) => {
  await signIn(page)
  let state: object = unverified
  let uploads = 0
  await page.route('**/api/me/kyc', (route) => route.fulfill({ json: state }))
  await page.route('**/api/kyc/ekyc', async (route) => {
    uploads++
    const request = route.request()
    expect(request.headers()['authorization']).toBe('Bearer test-token')
    expect(request.headers()['content-type']).toContain('multipart/form-data; boundary=')
    const body = request.postDataBuffer()!.toString('latin1')
    expect(body).toMatch(/name="consent"\r\n\r\ntrue/)
    for (const name of ['idCardFront', 'idCardBack', 'selfie']) expect(body).toContain(`name="${name}"; filename="${name}.png"`)
    expect((body.match(/Content-Type: image\/png/g) ?? []).length).toBe(3)
    state = verified
    await route.fulfill({ json: verified })
  })
  await page.goto('/nha-dau-tu/ho-so')
  const submit = page.getByRole('button', { name: 'Gửi xác minh', exact: true })
  await expect(submit).toBeDisabled()
  if (process.env.CAPTURE_KYC_SCREENSHOTS === '1') {
    await page.screenshot({ path: '../docs/validation/assets/cs27-kyc-web.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: '../docs/validation/assets/cs27-kyc-web-small.png', fullPage: true })
    await page.setViewportSize({ width: 1280, height: 720 })
  }
  await choosePhotos(page)
  await expect(submit).toBeDisabled()
  expect(uploads).toBe(0)
  await page.getByRole('checkbox').check()
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(page.getByText('Đã xác minh danh tính', { exact: true })).toBeVisible()
  if (process.env.CAPTURE_KYC_SCREENSHOTS === '1') {
    await page.screenshot({ path: '../docs/validation/assets/cs27-kyc-web-verified.png', fullPage: true })
  }
  expect(uploads).toBe(1)
  await expect(page.getByLabel('CCCD mặt trước', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Tổng quan', exact: true }).click()
  await expect(page.getByText('Đã xác minh danh tính', { exact: true })).toBeVisible()
})

test('displays server validation errors without claiming success', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/me/kyc', (route) => route.fulfill({ json: unverified }))
  await page.route('**/api/kyc/ekyc', (route) => route.fulfill({ status: 400, json: { errors: { Consent: ['Consent is required.'] } } }))
  await page.goto('/nha-dau-tu/ho-so')
  await choosePhotos(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Gửi xác minh', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Consent is required.')
  await expect(page.getByText('Đã xác minh danh tính', { exact: true })).toHaveCount(0)
})

test('switching accounts fetches the new account status', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/me/kyc', (route) => route.fulfill({ json: route.request().headers()['authorization'] === 'Bearer second-token' ? unverified : verified }))
  await page.goto('/nha-dau-tu/ho-so')
  await expect(page.getByText('Đã xác minh danh tính', { exact: true })).toBeVisible()
  await page.evaluate(async () => {
    const { useAuthStore } = await import('/src/shared/auth/authStore.ts')
    useAuthStore.getState().setSession('second-token', '2099-01-01T00:00:00Z', { userId: 2, email: 'kyc-2@test.local', fullName: 'Second Test', roles: ['Investor'], phone: null, status: 'Active', operatorId: null })
  })
  await expect(page.getByText('Chưa xác minh danh tính', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Gửi xác minh', exact: true })).toBeDisabled()
})
