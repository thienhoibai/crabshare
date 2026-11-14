/* Phiên đăng nhập: interceptor 401 của shared/api/http.ts và authStore. */
import { expect, reply, signIn, test, userOf } from './support/app'

test('an old request returning 401 preserves the replacement login session', async ({ page }) => {
  await page.goto('/dang-nhap')
  const result = await page.evaluate(async () => {
    // Exercise the actual interceptor with a deferred adapter and the actual session store.
    const load = (path: string) => import(/* @vite-ignore */ path)
    const { http } = await load('/src/shared/api/http.ts')
    const { useAuthStore } = await load('/src/shared/auth/authStore.ts')
    const user = { userId: 1, email: 'test@test.local', fullName: 'Test', phone: null, status: 'Active', roles: ['Customer'], operatorId: null }
    useAuthStore.getState().setSession('old-token', '2099-01-01T00:00:00Z', user)
    let rejectRequest: (() => void) | undefined
    const request = http.get('/test-deferred', { adapter: (config: unknown) => new Promise((_, reject) => {
      rejectRequest = () => reject({ config, response: { status: 401 } })
    }) }).catch(() => undefined)
    while (!rejectRequest) await new Promise(resolve => setTimeout(resolve, 0))
    useAuthStore.getState().setSession('new-token', '2099-01-01T00:00:00Z', { ...user, userId: 2 })
    rejectRequest()
    await request
    return { token: useAuthStore.getState().token, userId: useAuthStore.getState().user?.userId }
  })
  expect(result).toEqual({ token: 'new-token', userId: 2 })
})

test('a 401 for the current authenticated request clears its session', async ({ page }) => {
  await page.goto('/dang-nhap')
  const token = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const { http } = await load('/src/shared/api/http.ts')
    const { useAuthStore } = await load('/src/shared/auth/authStore.ts')
    useAuthStore.getState().setSession('expired-token', '2099-01-01T00:00:00Z', { userId: 1, roles: ['Customer'] })
    await http.get('/test-expired', { adapter: (config: unknown) => Promise.reject({ config, response: { status: 401 } }) }).catch(() => undefined)
    return useAuthStore.getState().token
  })
  expect(token).toBeNull()
})

test('token hết hạn giữa chừng: trang trong cổng đưa về đăng nhập và nhớ đường quay lại', async ({ page, api }) => {
  api.get(/^\/api\//, () => reply(401, { status: 401, detail: 'Phiên đăng nhập đã hết hạn.' }))
  await signIn(page, 'Customer')
  await page.goto('/khach')
  await expect(page).toHaveURL(/\/dang-nhap\?next=%2Fkhach$/)
  await expect(page.getByRole('heading', { name: 'Đăng nhập', level: 1 })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('crabshare-auth')!).state.token)).toBeNull()
})

test('đăng xuất xoá phiên, về trang chủ, và trang trong cổng lại đòi đăng nhập', async ({ page, api }) => {
  api.get(/^\/api\//, () => reply(404, { status: 404, detail: 'Không có dữ liệu.' }))
  // Ghi phiên một lần (không dùng signIn, vì signIn ghi lại phiên ở mỗi lần tải trang).
  await page.goto('/dang-nhap')
  await page.evaluate((user) => localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token: 'test-token', user, expiresAt: '2099-01-01T00:00:00Z' }, version: 0 })), userOf('Customer'))
  await page.goto('/khach')
  await expect(page.getByRole('navigation', { name: 'Menu Khách hàng' })).toBeVisible()

  await page.getByRole('button', { name: /^Tài khoản: / }).click()
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click()
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('crabshare-auth')!).state.token)).toBeNull()
  await page.goto('/khach')
  await expect(page).toHaveURL(/\/dang-nhap\?next=%2Fkhach$/)
})
