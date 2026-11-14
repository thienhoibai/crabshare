/* Không trang nào được hứa lợi nhuận hay dẫn số quy tắc nghiệp vụ.
   Spec này mở lại mọi trang mà các spec khác kiểm thử (danh sách *_PAGES của từng tệp support), bấm mở hết phần giải thích sau nút (i),
   rồi soát toàn bộ chữ của trang, kể cả phần đang gấp lại: không có "ROI", "lợi suất", "lợi nhuận kỳ vọng", không có "BR-xxx".
   Ngoài spec này, fixture `api` cũng soát màn hình cuối của mọi test (xem support/app.ts). */
import { expect, forbiddenWords, signIn, test, type Api, type PageUnderTest } from './support/app'
import { ADMIN_PAGES, mockAdmin } from './support/admin'
import { CUSTOMER_PAGES, mockCustomer } from './support/customer'
import { INVESTOR_PAGES, mockInvestor } from './support/investor'
import { OPERATOR_PAGES, mockOperator } from './support/operator'
import { PUBLIC_PAGES, mockPublic } from './support/public'
import { QC_PAGES, mockQc } from './support/qc'

const AREAS: { name: string; mock: (api: Api) => void; pages: PageUnderTest[] }[] = [
  { name: 'công khai', mock: mockPublic, pages: PUBLIC_PAGES },
  { name: 'khách hàng', mock: mockCustomer, pages: CUSTOMER_PAGES },
  { name: 'nhà đầu tư', mock: mockInvestor, pages: INVESTOR_PAGES },
  { name: 'người nuôi', mock: mockOperator, pages: OPERATOR_PAGES },
  { name: 'kiểm phẩm', mock: mockQc, pages: QC_PAGES },
  { name: 'quản trị', mock: mockAdmin, pages: ADMIN_PAGES },
]

test('bộ soát chữ nhận ra đúng các cụm bị cấm', async ({ page }) => {
  await page.setContent('<p>Lợi suất 12%/năm, ROI cao, lợi nhuận kỳ vọng 30 triệu (BR-219).</p><p>HEROIC trời ơi</p>')
  const found = await forbiddenWords(page)
  expect(found.map((f) => f.split(' trong ')[0])).toEqual(['ROI', 'Lợi suất', 'lợi nhuận kỳ vọng', 'BR-219'])
  await page.setContent('<p>HEROIC, trời ơi, lợi ích, doanh thu đã ghi nhận, phần được chia theo bảng quyết toán.</p>')
  expect(await forbiddenWords(page)).toEqual([])
})

for (const area of AREAS) {
  test.describe(`cổng ${area.name}`, () => {
    for (const target of area.pages) {
      test(`${target.path} không có ROI, lợi suất, lợi nhuận kỳ vọng hay số quy tắc`, async ({ page, api }) => {
        area.mock(api)
        if (target.role) await signIn(page, target.role)
        await page.goto(target.path)
        await expect(page.getByText(target.ready).first()).toBeVisible()
        // Lời giải thích nằm sau nút (i): bấm mở hết để soát cả phần đó.
        for (const help of await page.locator('button.op-help').all()) {
          if ((await help.getAttribute('aria-expanded')) === 'false') await help.click()
        }
        await expect(page.locator('button.op-help[aria-expanded="false"]')).toHaveCount(0)
        expect(await forbiddenWords(page)).toEqual([])
      })
    }
  })
}
