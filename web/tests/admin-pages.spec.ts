/* Mọi trang trong ADMIN_PAGES dựng đủ chỉ với signIn(role) và mockAdmin(api): không gọi API nào ngoài bộ giả lập mặc định,
   chỉ đọc dữ liệu, và dòng chữ `ready` có đúng một chỗ trên trang (spec soát chữ của cả ứng dụng dựa vào điều này). */
import { expect, signIn, test } from './support/app'
import { ADMIN_PAGES, mockAdmin } from './support/admin'

for (const { role, path, ready } of ADMIN_PAGES) {
  test(`${path} dựng đủ với dữ liệu mặc định`, async ({ page, api }) => {
    mockAdmin(api)
    if (role) await signIn(page, role)
    await page.goto(path)
    await expect(page.getByText(ready)).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(api.writes()).toEqual([])
  })
}
