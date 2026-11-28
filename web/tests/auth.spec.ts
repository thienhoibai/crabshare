/* Đăng nhập (/dang-nhap) và chuyển hướng theo vai trò; chặn trang theo vai trò (RequireRole). */
import { kycUnverified, party } from './support/investor'
import type { AuthResponse, LoginRequest, PartyDocumentResponse } from '../src/shared/api/api.gen'
import type { Page } from '@playwright/test'
import { expect, file, photo, reply, signIn, test, TOKEN, userOf, type Api, type Role } from './support/app'

const session = (role: Role): AuthResponse => ({ accessToken: `token-${role}`, expiresAt: '2099-01-01T00:00:00Z', user: userOf(role) })

/** Trang đích sau đăng nhập gọi nhiều API riêng; ở đây chỉ kiểm tra chuyển hướng và khung cổng nên cho mọi GET trả 404. */
const noData = (api: Api) => api.get(/^\/api\//, () => reply(404, { status: 404, detail: 'Không có dữ liệu.' }))


/** Mở cửa sổ điều khoản, cuộn hết rồi xác nhận đã đọc; ô tick được bật sẵn. */
async function acceptTerms(page: Page) {
  await page.getByRole('button', { name: 'điều khoản sử dụng' }).click()
  await page.locator('.terms-dialog__body').evaluate((el) => { el.scrollTop = el.scrollHeight })
  await page.getByRole('button', { name: 'Tôi đã đọc xong' }).click()
  await expect(page.getByRole('checkbox', { name: 'Tôi đồng ý điều khoản sử dụng' })).toBeChecked()
}
test('chuyển qua lại giữa đăng ký và đăng nhập trên màn hình nhỏ bằng bàn phím', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/dang-ky')
  const modes = page.getByRole('navigation', { name: 'Đăng ký và đăng nhập' })
  await expect(modes.locator('[aria-current="page"]')).toHaveText('Đăng ký')
  await modes.getByRole('link', { name: 'Đăng nhập' }).press('Enter')
  await expect(page).toHaveURL(/\/dang-nhap$/)
  await expect(modes.locator('[aria-current="page"]')).toHaveText('Đăng nhập')
  await modes.getByRole('link', { name: 'Đăng ký' }).press('Enter')
  await expect(page).toHaveURL(/\/dang-ky$/)
  await expect(page.getByRole('heading', { name: 'Đăng ký', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
})

test('các ô đăng ký thẳng hàng và cùng chiều cao khi có gợi ý mật khẩu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/dang-ky')

  const email = await page.getByRole('textbox', { name: 'Email', exact: true }).boundingBox()
  const password = await page.getByLabel(/^Mật khẩu/).boundingBox()
  expect(email).not.toBeNull()
  expect(password).not.toBeNull()
  expect(email!.y).toBeCloseTo(password!.y, 0)
  expect(email!.height).toBeCloseTo(password!.height, 0)
  expect(email!.x).toBeLessThan(password!.x)
})

test('đăng ký báo lỗi tại ô nhập, hiện mật khẩu và gửi đúng loại tài khoản', async ({ page, api }) => {
  api.get('/api/me/kyc', kycUnverified)
  api.get('/api/me/party', party)
  api.post('/api/auth/register', session('Investor'))
  await page.goto('/dang-ky')
  const submit = page.getByRole('button', { name: 'Tạo tài khoản' })
  await expect(page.getByText('Bạn đăng ký với tư cách nào?')).toHaveCount(0)
  const fullName = page.getByRole('textbox', { name: 'Họ và tên', exact: true })
  const password = page.getByLabel(/^Mật khẩu/)

  await submit.click()
  await expect(fullName).toBeFocused()
  await expect(fullName).toHaveAccessibleDescription('Nhập họ và tên của bạn.')
  await expect(password).toHaveAccessibleDescription('Mật khẩu cần ít nhất 8 ký tự.')
  expect(api.writes()).toEqual([])

  await page.getByText('Nhà đầu tư', { exact: true }).click()
  await expect(page.getByText('Xác minh danh tính sau khi tạo tài khoản.')).toBeVisible()
  await expect(page.getByLabel('Bạn mua cho')).toHaveCount(0)
  await fullName.fill('Người dùng thử')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('nhadautu@test.local')
  await password.fill('mat-khau-thu')
  await page.getByRole('button', { name: 'Hiện mật khẩu' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Ẩn mật khẩu' }).click()
  await expect(password).toHaveAttribute('type', 'password')
  await acceptTerms(page)
  await submit.click()

  await expect(page).toHaveURL(/\/hoan-thien-ho-so$/)
  await expect(page.getByRole('heading', { name: 'Thông tin hồ sơ' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Thông tin liên hệ' })).toBeVisible()
  const household = page.getByRole('radio', { name: 'Hộ kinh doanh' })
  const contact = page.getByLabel('Số điện thoại liên hệ')
  await expect(household).toBeDisabled()
  await expect(contact).toBeDisabled()
  await page.getByRole('button', { name: 'Tiếp tục' }).focus()
  await page.keyboard.press('Tab')
  await expect(contact).not.toBeFocused()
  await page.getByRole('button', { name: 'Tiếp tục' }).click()
  await expect(household).toBeEnabled()
  await expect(page.getByRole('heading', { name: 'Xác minh danh tính', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Hướng dẫn/ })).toHaveCount(0)
  await expect(contact).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled()
  await page.getByText('Hộ kinh doanh', { exact: true }).click()
  await expect(page.getByLabel('Tên pháp lý')).toBeVisible()
  await expect(page.getByLabel('Mã số thuế hoặc số đăng ký')).toBeVisible()
  await expect(page.getByRole('complementary').getByRole('heading', { name: 'Giấy chứng nhận đăng ký hộ kinh doanh' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Giấy chứng nhận đăng ký hộ kinh doanh, ảnh mẫu' })).toHaveAttribute('src', '/profile-samples/household.jpg')
  await page.getByText('Doanh nghiệp', { exact: true }).first().click()
  await expect(page.getByRole('complementary').getByRole('heading', { name: 'Giấy chứng nhận đăng ký doanh nghiệp' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Giấy chứng nhận đăng ký doanh nghiệp, ảnh mẫu' })).toHaveAttribute('src', '/profile-samples/company.jpg')
  await expect(page.getByText('Hợp tác xã')).toHaveCount(0)
  expect(api.sent('POST', '/api/auth/register').map((c) => c.body)).toEqual([{
    email: 'nhadautu@test.local', password: 'mat-khau-thu', fullName: 'Người dùng thử', role: 'Investor', partyType: 'Individual',
  }])
})

test('chọn giấy tờ trước khi lưu, gửi lại ảnh nếu tải lên lỗi', async ({ page, api }) => {
  let profile = { ...party, verificationStatus: 'Unverified' }
  const document = { documentId: 500, docType: 'BusinessRegistration', contentType: 'image/png', uploadedAt: '2026-11-23T07:00:00Z' }
  let documents: typeof document[] = []
  let attempts = 0
  api.get('/api/me/party', () => profile)
  api.put('/api/me/party', () => (profile = { ...profile, partyType: 'Company', legalName: 'HTX Mẫu', representative: 'Đại diện' }))
  api.get('/api/me/party/documents', () => documents)
  api.get('/api/me/party/documents/500/file', () => reply(404))
  api.post('/api/me/party/documents', () => {
    attempts += 1
    if (attempts === 1) return reply(503, { detail: 'Không thể tải ảnh lên. Hãy thử lại.' })
    documents = [document]
    profile = { ...profile, verificationStatus: 'Pending' }
    return document
  })
  await signIn(page, 'Customer')
  await page.goto('/hoan-thien-ho-so')
  await page.getByRole('button', { name: 'Tiếp tục' }).click()
  await page.getByText('Doanh nghiệp', { exact: true }).first().click()
  const documentPicker = page.getByLabel('Chọn ảnh hoặc PDF: Giấy chứng nhận đăng ký doanh nghiệp')
  await expect(page.locator('input[type="file"]')).toHaveCount(1)
  await expect(documentPicker).toHaveAttribute('accept', /image\/png/)
  await expect(documentPicker).toHaveAttribute('accept', /application\/pdf/)
  await documentPicker.setInputFiles(photo('giay-htx.png'))
  await page.getByLabel('Tên pháp lý').fill('HTX Mẫu')
  await page.getByLabel('Người đại diện').fill('Đại diện')
  await page.getByRole('button', { name: 'Lưu hồ sơ và gửi giấy tờ' }).click()
  await expect(page.getByText('Không thể tải ảnh lên. Hãy thử lại.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled()
  await page.getByRole('button', { name: 'Gửi giấy tờ', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Tiếp tục' })).toBeEnabled()
  expect(api.calls.filter(({ method }) => method === 'PUT' || method === 'POST').map(({ method }) => method)).toEqual(['PUT', 'POST', 'POST'])
  expect(api.sent('POST', '/api/me/party/documents').every(({ multipart }) => multipart)).toBe(true)
})

test('hồ sơ tổ chức đã bị từ chối không mở bước liên hệ dù còn giấy tờ cũ', async ({ page, api }) => {
  api.get('/api/me/party', {
    ...party, partyType: 'Company', representative: 'Người đại diện', verificationStatus: 'Rejected',
    rejectReason: 'Ảnh bị mờ', legalDossierVerified: false,
  })
  api.get('/api/me/party/documents', [
    { documentId: 1, docType: 'BusinessRegistration', contentType: 'image/png', uploadedAt: '2026-11-22T07:00:00Z' },
  ])
  api.get('/api/me/party/documents/1/file', () => reply(404))
  await signIn(page, 'Investor')
  await page.goto('/hoan-thien-ho-so')
  await page.getByRole('button', { name: 'Tiếp tục' }).click()
  await expect(page.getByText(/Hồ sơ bị từ chối.*Ảnh bị mờ/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled()
  await expect(page.getByLabel('Số điện thoại liên hệ')).toBeDisabled()
})

test('tổ chức gửi giấy đăng ký dạng PDF trong bước xác minh rồi tải lại bản đã gửi', async ({ page, api }) => {
  const path = '/api/me/party/documents'
  const pdf = Buffer.from('%PDF-1.4\n%%EOF\n')
  const document: PartyDocumentResponse = {
    documentId: 501, docType: 'BusinessRegistration', contentType: 'application/pdf', note: null, uploadedAt: '2026-11-23T07:00:00Z',
  }
  let uploaded = false
  api.get('/api/me/party', () => ({
    ...party, partyType: 'Company', representative: 'Người đại diện', verificationStatus: uploaded ? 'Pending' : 'Unverified',
  }))
  api.get(path, () => uploaded ? [document] : [])
  api.post(path, () => { uploaded = true; return document })
  api.get(`${path}/501/file`, file(pdf, 'application/pdf'))

  await signIn(page, 'Customer')
  await page.goto('/hoan-thien-ho-so')
  await page.getByRole('button', { name: 'Tiếp tục' }).click()
  const documentPicker = page.getByLabel('Chọn ảnh hoặc PDF: Giấy chứng nhận đăng ký doanh nghiệp')
  await expect(page.locator('input[type="file"]')).toHaveCount(1)
  await expect(documentPicker).toHaveAttribute('accept', /image\/png/)
  await expect(documentPicker).toHaveAttribute('accept', /application\/pdf/)
  await documentPicker.setInputFiles({ name: 'giay-dang-ky.pdf', mimeType: 'application/pdf', buffer: pdf })
  await expect(page.getByText('giay-dang-ky.pdf', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Gửi giấy tờ', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Tiếp tục' })).toBeEnabled()
  expect(api.sent('POST', path)).toMatchObject([{ multipart: true, body: { DocType: 'BusinessRegistration', File: 'file:giay-dang-ky.pdf' } }])

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Tải PDF/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.pdf$/)
  expect(api.sent('GET', `${path}/501/file`)).toMatchObject([{ auth: `Bearer ${TOKEN}` }])
})

test('đăng ký với số điện thoại đã dùng báo lỗi ngay tại ô số điện thoại', async ({ page, api }) => {
  api.post('/api/auth/register', () => reply(409, {
    status: 409, code: 'db.unique', detail: "Dữ liệu bị trùng: Cannot insert duplicate key with unique index 'ux_app_user_phone'.",
  }))
  await page.goto('/dang-ky')
  await page.getByRole('textbox', { name: 'Họ và tên', exact: true }).fill('Người dùng thử')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('khach@test.local')
  await page.getByLabel(/^Mật khẩu/).fill('mat-khau-thu')
  const phone = page.getByLabel('Số điện thoại (không bắt buộc)', { exact: true })
  await phone.fill('0901234567')
  await acceptTerms(page)
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click()
  await expect(phone).toHaveAccessibleDescription('Số điện thoại này đã được dùng cho một tài khoản khác.')
  await expect(phone).toBeFocused()
  await expect(page.getByText(/ux_app_user_phone/)).toHaveCount(0)
  await phone.fill('0901234568')
  await expect(phone).not.toHaveAttribute('aria-invalid', 'true')
})

const PORTALS: { role: Role; home: string; menu: string; link: string }[] = [
  { role: 'Customer', home: '/khach', menu: 'Menu Khách hàng', link: 'Đơn của tôi' },
  { role: 'Investor', home: '/nha-dau-tu', menu: 'Menu Nhà đầu tư', link: 'Lô đang gọi vốn' },
  { role: 'OperatorMember', home: '/operator', menu: 'Menu Người nuôi', link: 'Lô của tôi' },
  { role: 'QcInspector', home: '/qc', menu: 'Menu Nhân viên kiểm phẩm', link: 'Duyệt phân hạng' },
  { role: 'PlatformAdmin', home: '/admin', menu: 'Menu Quản trị nền tảng', link: 'Duyệt và tạo Lô' },
  { role: 'EvidenceReviewer', home: '/admin/evidence', menu: 'Menu Quản trị nền tảng', link: 'Thẩm định bằng chứng' },
]

for (const portal of PORTALS) {
  test(`đăng nhập vai trò ${portal.role} thì vào ${portal.home}`, async ({ page, api }) => {
    noData(api)
    api.post('/api/auth/login', session(portal.role))
    await page.goto('/dang-nhap')
    await expect(page.getByRole('heading', { name: 'Đăng nhập', level: 1 })).toBeVisible()
    await page.getByLabel('Email').fill(`${portal.role.toLowerCase()}@test.local`)
    await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-thu')
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()

    await expect(page).toHaveURL(new RegExp(`${portal.home}$`))
    const menu = page.getByRole('navigation', { name: portal.menu })
    await expect(menu.getByRole('link', { name: portal.link, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible()

    const body: LoginRequest = { email: `${portal.role.toLowerCase()}@test.local`, password: 'mat-khau-thu' }
    expect(api.sent('POST', '/api/auth/login').map((c) => c.body)).toEqual([body])
    // Phiên được lưu để tải lại trang không bị đăng xuất, và các lời gọi sau đó mang token mới.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('crabshare-auth')!).state.token)).toBe(`token-${portal.role}`)
    expect(api.calls.filter((c) => c.method === 'GET').every((c) => c.auth === `Bearer token-${portal.role}`)).toBe(true)
  })
}

test('Kiểm định bằng chứng chỉ thấy mục thẩm định, không thấy menu của Quản trị', async ({ page, api }) => {
  noData(api)
  await signIn(page, 'EvidenceReviewer')
  await page.goto('/admin/evidence')
  const menu = page.getByRole('navigation', { name: 'Menu Quản trị nền tảng' })
  await expect(menu.getByRole('link', { name: 'Thẩm định bằng chứng' })).toBeVisible()
  await expect(menu.getByRole('link')).toHaveCount(1)
})

test('thiếu email hoặc mật khẩu thì báo ngay, không gọi API', async ({ page, api }) => {
  await page.goto('/dang-nhap')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.getByText('Vui lòng nhập email và mật khẩu.')).toBeVisible()
  expect(api.calls).toEqual([])
})

test('sai mật khẩu thì hiện lỗi của máy chủ và ở lại trang đăng nhập', async ({ page, api }) => {
  api.post('/api/auth/login', () => reply(401, { status: 401, detail: 'Email hoặc mật khẩu không đúng.' }))
  await page.goto('/dang-nhap')
  await page.getByLabel('Email').fill('khach@test.local')
  await page.getByLabel('Mật khẩu', { exact: true }).fill('sai')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.getByText('Email hoặc mật khẩu không đúng.')).toBeVisible()
  await expect(page).toHaveURL(/\/dang-nhap$/)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('crabshare-auth') ?? '{"state":{}}').state.token ?? null)).toBeNull()
})

test('khách chưa hoàn tất quay lại hồ sơ khi đăng nhập và chỉ vào cổng sau khi lưu', async ({ page, api }) => {
  noData(api)
  const customer = session('Customer')
  let complete = false
  api.post('/api/auth/login', () => ({ ...customer, user: { ...customer.user, customerProfileRequired: !complete } }))
  api.get('/api/me/party', party)
  api.put('/api/me/party', () => {
    complete = true
    return party
  })
  await page.goto('/dang-nhap?next=%2Fkhach%2Fdia-diem')
  await page.getByLabel('Email').fill('customer@test.local')
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-thu')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL(/\/hoan-thien-ho-so$/)
  await page.goto('/khach/dia-diem')
  await expect(page).toHaveURL(/\/hoan-thien-ho-so$/)

  await page.getByRole('button', { name: 'Tiếp tục' }).click()
  await page.getByRole('button', { name: 'Tiếp tục' }).click()
  await page.getByRole('button', { name: 'Hoàn tất' }).click()
  await expect(page.getByRole('link', { name: 'Vào trang chính' })).toBeVisible()
  expect(api.sent('PUT', '/api/me/party')[0].body).toMatchObject({ completeCustomerProfile: true })

  await page.getByRole('link', { name: 'Vào trang chính' }).click()
  await expect(page).toHaveURL(/\/khach$/)
  await page.goto('/dang-nhap')
  await page.getByLabel('Email').fill('customer@test.local')
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-thu')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL(/\/khach$/)
})

test('nút hiện mật khẩu đổi kiểu ô nhập', async ({ page }) => {
  await page.goto('/dang-nhap')
  const password = page.getByLabel('Mật khẩu', { exact: true })
  await password.fill('bi-mat')
  await expect(password).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Hiện mật khẩu' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Ẩn mật khẩu' }).click()
  await expect(password).toHaveAttribute('type', 'password')
})

test('chưa đăng nhập mà mở trang của cổng thì về đăng nhập, đăng nhập xong quay lại đúng trang', async ({ page, api }) => {
  noData(api)
  api.post('/api/auth/login', session('Customer'))
  await page.goto('/khach/dia-diem')
  await expect(page).toHaveURL(/\/dang-nhap\?next=%2Fkhach%2Fdia-diem$/)
  await page.getByLabel('Email').fill('customer@test.local')
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-thu')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL(/\/khach\/dia-diem$/)
  await expect(page.getByRole('navigation', { name: 'Menu Khách hàng' })).toBeVisible()
})

const FOREIGN: { role: Role; path: string }[] = [
  { role: 'Customer', path: '/admin' },
  { role: 'Customer', path: '/nha-dau-tu' },
  { role: 'Investor', path: '/operator' },
  { role: 'OperatorMember', path: '/qc' },
  { role: 'QcInspector', path: '/khach' },
  { role: 'PlatformAdmin', path: '/admin/evidence' },
]

for (const { role, path } of FOREIGN) {
  test(`${role} không vào được ${path} và trang đó không gọi API`, async ({ page, api }) => {
    await signIn(page, role)
    await page.goto(path)
    await expect(page).not.toHaveURL(new RegExp(`${path}$`))
    expect(api.calls).toEqual([])
  })
}

async function mockGoogleButton(page: import('@playwright/test').Page, credential = 'mock-google-id-token') {
  await page.addInitScript((token) => {
    let onCredential: ((res: { credential?: string }) => void) | null = null
    const w = window as unknown as {
      __googleClientId?: string
      google?: {
        accounts: {
          id: {
            initialize: (cfg: { callback: (res: { credential?: string }) => void }) => void
            renderButton: (parent: HTMLElement, opts: { text?: string }) => void
          }
        }
      }
    }
    w.__googleClientId = 'test-client.apps.googleusercontent.com'
    w.google = {
      accounts: {
        id: {
          initialize: (cfg) => { onCredential = cfg.callback },
          renderButton: (parent, opts) => {
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.textContent = opts.text === 'signup_with' ? 'Đăng ký bằng Google' : 'Tiếp tục với Google'
            btn.onclick = () => onCredential?.({ credential: token })
            parent.appendChild(btn)
          },
        },
      },
    }
  }, credential)
}

test('đăng nhập bằng Google chuyển khách mới về hoàn thiện hồ sơ và báo lỗi khi bị từ chối', async ({ page, api }) => {
  await mockGoogleButton(page, 'google-jwt-login')
  api.get('/api/me/party', party)
  let allow = false
  api.post('/api/auth/google', () => allow
    ? ({ ...session('Customer'), user: { ...userOf('Customer'), customerProfileRequired: true } })
    : reply(401, { status: 401, code: 'auth.invalid_google_token', detail: 'Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn.' }))

  await page.goto('/dang-nhap')
  await page.getByRole('button', { name: 'Tiếp tục với Google' }).click()
  await expect(page.getByText('Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn.')).toBeVisible()
  await expect(page).toHaveURL(/\/dang-nhap$/)

  allow = true
  await page.getByRole('button', { name: 'Tiếp tục với Google' }).click()
  await expect(page).toHaveURL(/\/hoan-thien-ho-so$/)
  expect(api.sent('POST', '/api/auth/google').map((c) => c.body)).toEqual([
    { idToken: 'google-jwt-login' },
    { idToken: 'google-jwt-login' },
  ])
})

test('đăng ký bằng Google gửi đúng vai trò Nhà đầu tư đang chọn', async ({ page, api }) => {
  await mockGoogleButton(page, 'google-jwt-investor')
  api.get('/api/me/kyc', kycUnverified)
  api.get('/api/me/party', party)
  api.post('/api/auth/google', session('Investor'))

  await page.goto('/dang-ky')
  await page.getByText('Nhà đầu tư', { exact: true }).click()
  await page.getByRole('button', { name: 'Đăng ký bằng Google' }).click()

  await expect(page).toHaveURL(/\/hoan-thien-ho-so$/)
  expect(api.sent('POST', '/api/auth/google').map((c) => c.body)).toEqual([
    { idToken: 'google-jwt-investor', role: 'Investor' },
  ])
})

