/* Cổng khách hàng: "Lô nhận đặt trước" mở ngay trong cổng (giữ menu trái), không văng ra trang công khai;
   avatar ở góc phải mở menu tài khoản, menu trái không lặp lại hồ sơ và đăng xuất. */
import { expect, signIn, test } from './support/app'
import { mockCustomer } from './support/customer'
import { batchP, batchPNoOffers, batchT } from './support/public'

test.beforeEach(async ({ page, api }) => {
  mockCustomer(api)
  await signIn(page, 'Customer')
})

test('Lô nhận đặt trước nằm trong cổng: chỉ Lô có bảng chào giá, mở chi tiết vẫn giữ menu, đặt trước đi thẳng tới form', async ({ page }) => {
  await page.goto('/khach')
  const menu = page.getByRole('navigation', { name: 'Menu Khách hàng' })
  await expect(menu.getByRole('link', { name: 'Lô nhận đặt trước' })).toHaveAttribute('href', '/khach/lo')
  await menu.getByRole('link', { name: 'Lô nhận đặt trước' }).click()

  await expect(page).toHaveURL(/\/khach\/lo$/)
  await expect(page.getByRole('heading', { name: 'Lô nhận đặt trước', level: 1 })).toBeVisible()
  await expect(menu).toBeVisible()
  await expect(page.getByRole('link', { name: batchP.title })).toHaveAttribute('href', `/khach/lo/${batchP.batchCode}`)
  await expect(page.getByRole('link', { name: batchT.title })).toBeVisible()
  // Lô chưa có bảng chào giá không được liệt kê là nhận đặt trước.
  await expect(page.getByRole('link', { name: batchPNoOffers.title })).toHaveCount(0)

  await page.getByRole('link', { name: batchP.title }).click()
  await expect(page).toHaveURL(new RegExp(`/khach/lo/${batchP.batchCode}$`))
  await expect(menu).toBeVisible()
  await expect(page.getByRole('link', { name: 'Lô nhận đặt trước', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Đặt trước', exact: true })).toHaveAttribute('href', `/khach/dat-truoc/${batchP.batchCode}`)
})

test('avatar góc phải mở menu tài khoản; menu trái không có hồ sơ, thông báo hay đăng xuất', async ({ page }) => {
  await page.goto('/khach')
  const menu = page.getByRole('navigation', { name: 'Menu Khách hàng' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Hồ sơ' })).toHaveCount(0)
  await expect(menu.getByRole('link', { name: 'Thông báo' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toHaveCount(0)

  await page.getByRole('button', { name: /^Tài khoản: / }).click()
  await expect(page.getByRole('menuitem', { name: 'Hồ sơ' })).toHaveAttribute('href', '/khach/ho-so')
  await expect(page.getByRole('menuitem', { name: 'Đăng xuất' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
})
