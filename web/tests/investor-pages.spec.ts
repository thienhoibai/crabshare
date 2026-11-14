/* Mọi trang trong INVESTOR_PAGES tải đủ dữ liệu chỉ với signIn + mockInvestor: không gọi API nào ngoài bộ giả lập mặc định,
   dòng `ready` chỉ khớp đúng một chỗ, trang không ghi gì khi mới mở. Fixture `api` soát thêm chữ cấm ở màn hình cuối. */
import { expect, signIn, test } from './support/app'
import { INVESTOR_PAGES, mockInvestor } from './support/investor'

for (const target of INVESTOR_PAGES) {
  test(`${target.path} tải xong với dữ liệu giả lập mặc định`, async ({ page, api }) => {
    mockInvestor(api)
    await signIn(page, target.role!)
    await page.goto(target.path)

    await expect(page.getByText(target.ready)).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Menu Nhà đầu tư' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Đang tải' })).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(api.writes()).toEqual([])
    expect(api.calls.every((c) => c.auth === 'Bearer test-token')).toBe(true)
  })
}
