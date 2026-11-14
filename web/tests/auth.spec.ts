/* Đăng nhập (/dang-nhap) và chuyển hướng theo vai trò; chặn trang theo vai trò (RequireRole). */
import type { AuthResponse, LoginRequest } from '../src/shared/api/api.gen'
import { expect, reply, signIn, test, userOf, type Api, type Role } from './support/app'

const session = (role: Role): AuthResponse => ({ accessToken: `token-${role}`, expiresAt: '2099-01-01T00:00:00Z', user: userOf(role) })

/** Trang đích sau đăng nhập gọi nhiều API riêng; ở đây chỉ kiểm tra chuyển hướng và khung cổng nên cho mọi GET trả 404. */
const noData = (api: Api) => api.get(/^\/api\//, () => reply(404, { status: 404, detail: 'Không có dữ liệu.' }))

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
    await expect(page.getByRole('button', { name: /^Tài khoản: / })).toBeVisible()

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
