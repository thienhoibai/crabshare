/* Xác minh danh tính eKYC của nhà đầu tư ở /nha-dau-tu/ho-so (mục Xác minh danh tính): GET /api/me/kyc, POST /api/kyc/ekyc (multipart). */
import type { AuthResponse, KycStatusResponse } from '../src/shared/api/api.gen'
import { daysFromNow, expect, photo, reply, signIn, test, userOf, type Page } from './support/app'
import { fact, kycUnverified, kycVerified, mockInvestor, more, panel, payoutEmpty } from './support/investor'

const PHOTOS = [
  { label: 'CCCD mặt trước', file: 'truoc.png' },
  { label: 'CCCD mặt sau', file: 'sau.png' },
  { label: 'Ảnh khuôn mặt', file: 'mat.png' },
]

async function choosePhotos(page: Page) {
  for (const p of PHOTOS) await page.getByLabel(p.label, { exact: true }).setInputFiles(photo(p.file))
}

const consent = (page: Page) => page.getByRole('checkbox', { name: /Tôi đồng ý gửi ảnh cho nhà cung cấp eKYC/ })
const submit = (page: Page) => page.getByRole('button', { name: 'Gửi xác minh' })

test.beforeEach(async ({ page, api }) => {
  mockInvestor(api)
  api.get('/api/me/kyc', kycUnverified)
  await signIn(page, 'Investor')
})

test('cần đủ ba ảnh và ô đồng ý; gửi dạng multipart; xác minh xong thì tổng quan hết nhắc', async ({ page, api }) => {
  let kyc: KycStatusResponse = kycUnverified
  api.get('/api/me/kyc', () => kyc)
  api.post('/api/kyc/ekyc', () => (kyc = { ...kycVerified, verifiedAt: daysFromNow(0) }))

  // Người chưa xác minh được tổng quan nhắc và đưa thẳng tới mục xác minh.
  await page.goto('/nha-dau-tu')
  await panel(page, 'Việc cần làm').getByRole('link', { name: /Xác minh danh tính/ }).click()
  await expect(page).toHaveURL(/\/nha-dau-tu\/ho-so$/)
  await expect(page.getByRole('tab', { name: 'Xác minh danh tính' })).toHaveAttribute('aria-selected', 'true')
  const kycPanel = panel(page, 'Xác minh danh tính')
  await expect(kycPanel.getByText('Chưa xác minh', { exact: true })).toBeVisible()

  await expect(submit(page)).toBeDisabled()
  await choosePhotos(page)
  for (const p of PHOTOS) await expect(kycPanel.getByText(p.file)).toBeVisible()
  await expect(submit(page)).toBeDisabled()
  expect(api.writes()).toEqual([])
  await consent(page).check()
  await submit(page).click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã xác minh danh tính.' })).toBeVisible()
  const sent = api.sent('POST', '/api/kyc/ekyc')
  expect(sent.map((c) => c.body)).toEqual([{ IdCardFront: 'file:truoc.png', IdCardBack: 'file:sau.png', Selfie: 'file:mat.png', Consent: 'true' }])
  expect(sent[0].multipart).toBe(true)
  expect(sent[0].auth).toBe('Bearer test-token')

  // Xác minh xong, trang chuyển sang việc kế tiếp là tài khoản nhận tiền; mục xác minh chỉ còn kết quả.
  await expect(page.getByRole('tab', { name: 'Tài khoản nhận tiền' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Xác minh danh tính' }).click()
  await expect(kycPanel.getByText('Đã xác minh', { exact: true })).toBeVisible()
  await expect(kycPanel.getByText(/^Xác minh lúc /)).toBeVisible()
  await expect(submit(page)).toHaveCount(0)
  await expect(page.getByLabel('CCCD mặt trước', { exact: true })).toHaveCount(0)
  const last = more(kycPanel, 'Lần kiểm tra gần nhất')
  await last.locator('summary').click()
  await expect(fact(last, 'Kết quả')).toContainText('Đạt')
  await expect(fact(last, 'Mã tham chiếu')).toContainText('EKYC-7F3A21')

  await page.getByRole('navigation', { name: 'Menu Nhà đầu tư' }).getByRole('link', { name: 'Tổng quan' }).click()
  await expect(page.getByRole('heading', { name: 'Việc cần làm' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Xác minh danh tính/ })).toHaveCount(0)
  expect(api.writes()).toEqual(['POST /api/kyc/ekyc'])
})

test('máy chủ từ chối yêu cầu: hiện lỗi, giữ ảnh đã chọn, không báo đã xác minh', async ({ page, api }) => {
  api.post('/api/kyc/ekyc', () => reply(400, { status: 400, errors: { Consent: ['Cần đồng ý gửi ảnh thì mới xác minh được.'] } }))
  await page.goto('/nha-dau-tu/ho-so?tab=xac-minh')
  await choosePhotos(page)
  await consent(page).check()
  await submit(page).click()

  await expect(page.getByRole('alert')).toContainText('Cần đồng ý gửi ảnh thì mới xác minh được.')
  const kycPanel = panel(page, 'Xác minh danh tính')
  await expect(kycPanel.getByText('Chưa xác minh', { exact: true })).toBeVisible()
  await expect(kycPanel.getByText('Đã xác minh', { exact: true })).toHaveCount(0)
  await expect(kycPanel.getByText('truoc.png')).toBeVisible()
  await expect(submit(page)).toBeEnabled()
})

test('eKYC không đạt: nêu lý do của nhà cung cấp và cho gửi lại ảnh mới', async ({ page, api }) => {
  let kyc: KycStatusResponse = kycUnverified
  api.get('/api/me/kyc', () => kyc)
  api.post('/api/kyc/ekyc', () => (kyc = {
    verificationStatus: 'Rejected', verifiedAt: null,
    lastCheck: { id: 13, checkType: 'EkycIdFace', result: 'Failed', providerReference: 'EKYC-00B1', consentAt: daysFromNow(0), checkedAt: daysFromNow(0), failureReason: 'Ảnh CCCD mờ, không đọc được số.' },
  }))
  await page.goto('/nha-dau-tu/ho-so?tab=xac-minh')
  await choosePhotos(page)
  await consent(page).check()
  await submit(page).click()

  await expect(page.getByRole('status').filter({ hasText: 'Xác minh chưa đạt. Gửi lại ảnh rõ hơn.' })).toBeVisible()
  const kycPanel = panel(page, 'Xác minh danh tính')
  await expect(kycPanel.getByText('Bị từ chối', { exact: true })).toBeVisible()
  await expect(kycPanel.getByText('Ảnh CCCD mờ, không đọc được số.')).toBeVisible()
  // Ảnh cũ bị bỏ: phải chọn lại đủ ba ảnh mới gửi tiếp được.
  await expect(kycPanel.getByText('truoc.png')).toHaveCount(0)
  await expect(submit(page)).toBeDisabled()
  const last = more(kycPanel, 'Lần kiểm tra gần nhất')
  await last.locator('summary').click()
  await expect(fact(last, 'Kết quả')).toContainText('Không đạt')
})

test('tệp không phải ảnh hoặc quá 5 MB bị từ chối ngay, không gửi đi', async ({ page, api }) => {
  await page.goto('/nha-dau-tu/ho-so?tab=xac-minh')
  const front = page.getByLabel('CCCD mặt trước', { exact: true })
  const problem = page.getByText('Mỗi ảnh phải là JPEG, PNG hoặc WebP và không quá 5 MB.')

  await front.setInputFiles({ name: 'cccd.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })
  await expect(problem).toBeVisible()
  await expect(page.getByText('cccd.pdf')).toHaveCount(0)

  await front.setInputFiles({ name: 'qua-lon.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) })
  await expect(problem).toBeVisible()
  await expect(page.getByText('qua-lon.png')).toHaveCount(0)

  await front.setInputFiles(photo('truoc.png'))
  await expect(problem).toHaveCount(0)
  await expect(page.getByText('truoc.png')).toBeVisible()
  await consent(page).check()
  await expect(submit(page)).toBeDisabled()
  expect(api.writes()).toEqual([])
})

/* Bộ nhớ đệm truy vấn có khoá [url, params], không gắn với người dùng; app/providers.tsx xoá bộ nhớ đệm mỗi khi phiên đổi
   (đăng nhập, đăng xuất, token hết hạn) để người đăng nhập sau trên cùng tab không thấy dữ liệu của người trước. */
test('phiên hết hạn rồi người khác đăng nhập trên cùng tab thì thấy trạng thái xác minh của chính họ', async ({ page, api }) => {
  // Người thứ nhất đã xác minh.
  api.get('/api/me/kyc', (call) => (call.auth === 'Bearer token-b' ? kycUnverified : kycVerified))
  await page.goto('/nha-dau-tu/ho-so?tab=xac-minh')
  await expect(panel(page, 'Xác minh danh tính').getByText('Đã xác minh', { exact: true })).toBeVisible()

  // Token hết hạn: lời gọi kế tiếp trả 401, ứng dụng tự đăng xuất về trang đăng nhập.
  api.get('/api/me/payout-account', (call) => (call.auth === 'Bearer token-b' ? payoutEmpty : reply(401, { status: 401, detail: 'Phiên đã hết hạn.' })))
  await page.getByRole('tab', { name: 'Tài khoản nhận tiền' }).click()
  await expect(page).toHaveURL(/\/dang-nhap\?next=/)

  // Người thứ hai (chưa xác minh) đăng nhập trên cùng tab.
  const other = userOf('Investor', { userId: 202, email: 'trang@test.local', fullName: 'Phạm Thu Trang' })
  const session: AuthResponse = { accessToken: 'token-b', expiresAt: '2099-01-01T00:00:00Z', user: other }
  api.post('/api/auth/login', session)
  await page.getByLabel('Email').fill(other.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-thu')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL(/\/nha-dau-tu\/ho-so/)

  await page.getByRole('tab', { name: 'Xác minh danh tính' }).click()
  const kycPanel = panel(page, 'Xác minh danh tính')
  await expect(kycPanel.getByText('Chưa xác minh', { exact: true })).toBeVisible()
  await expect(kycPanel.getByText('Đã xác minh', { exact: true })).toHaveCount(0)
})
