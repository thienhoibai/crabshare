/* Trang chủ (/): trang landing tĩnh. Không gọi máy chủ, mọi liên kết trỏ tới trang có thật, mục video không vỡ khi chưa có tệp. */
import { expect, signIn, test } from './support/app'

/** Các đường dẫn trang chủ được phép trỏ tới; đều có trong src/app/router.tsx. */
const ROUTES = ['/lo', '/chuan-phan-hang', '/dang-nhap', '/dang-ky', '/dang-ky-ho-nuoi']

test('trang chủ hiện mục video và bốn mục bên dưới mà không gọi máy chủ', async ({ page, api }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Góp vốn nuôi cua hộp. Thấy từng hộp, rõ từng đồng.')
  for (const title of ['Bốn chỗ dễ mất lòng tin', 'Một lô cua đi qua bốn bước', 'Máy đo thay cho lời khai', 'Bạn tham gia với vai nào?']) {
    await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible()
  }
  await expect(page.getByRole('listitem').filter({ hasText: 'Với CrabShare' })).toHaveCount(4)
  expect(api.calls).toEqual([])
})

test('chưa có tệp video thì chỉ hiện ảnh bìa với nhãn sắp có', async ({ page }) => {
  await page.route('**/landing/gioi-thieu.mp4', (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/')
  await expect(page.getByText('Sắp có', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Xem video giới thiệu/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('mọi liên kết của trang chủ trỏ tới mục có trong trang hoặc trang có thật', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const hrefs = await page.locator('a[href]').evaluateAll((links) => [...new Set(links.map((a) => a.getAttribute('href')!))])
  for (const href of hrefs) {
    if (href.startsWith('#')) await expect(page.locator(`[id="${href.slice(1)}"]`), `mục ${href}`).toHaveCount(1)
    else expect(ROUTES, `đường dẫn ${href}`).toContain(href)
  }
  // Chân trang của các trang công khai dẫn tới /#chia.
  await expect(page.locator('#chia')).toHaveCount(1)

  await page.getByRole('banner').getByRole('link', { name: 'Đăng ký' }).click()
  await expect(page).toHaveURL(/\/dang-ky$/)
  await expect(page.getByRole('heading', { name: 'Đăng ký', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Về trang chủ' }).click()
  await page.getByRole('banner').getByRole('link', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(/\/dang-nhap$/)
})

test('người đã đăng nhập thấy một nút về cổng của mình', async ({ page }) => {
  await signIn(page, 'Investor')
  await page.goto('/')
  const actions = page.getByRole('banner').getByRole('link', { name: 'Vào trang của tôi' })
  await expect(actions).toHaveAttribute('href', '/nha-dau-tu')
  await expect(page.getByRole('banner').getByRole('link', { name: 'Đăng nhập' })).toHaveCount(0)
})

test('trang chủ không tràn ngang ở bề ngang 390 và 320', async ({ page }) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  }
})
