/* Mở các trang trong danh sách *_PAGES với dữ liệu mặc định. Kiểm tra trạng thái ban đầu của các cổng có bài kiểm tra tải trang,
   mở hết phần giải thích sau nút (i), rồi soát toàn bộ chữ của trang để tìm các cụm hứa lợi nhuận hoặc số quy tắc nghiệp vụ.
   Ngoài spec này, fixture `api` cũng soát màn hình cuối của mọi test (xem support/app.ts). */
import { TOKEN, expect, forbiddenWords, signIn, test, type Api, type Page, type PageUnderTest } from './support/app'
import { ADMIN_PAGES, mockAdmin } from './support/admin'
import { CUSTOMER_PAGES, mockCustomer } from './support/customer'
import { INVESTOR_PAGES, mockInvestor } from './support/investor'
import { OPERATOR_PAGES, mockOperator } from './support/operator'
import { PUBLIC_PAGES, mockPublic } from './support/public'
import { QC_PAGES, mockQc } from './support/qc'

const QC_MENU: [prefix: string, label: string][] = [
  ['/qc/kiem-dau-vao', 'Kiểm đầu vào'],
  ['/qc/phan-hang', 'Duyệt phân hạng'],
  ['/qc/tham-trai', 'Thăm trại giữa vụ'],
  ['/qc/chuan', 'Chuẩn phân hạng'],
  ['/qc', 'Tất cả việc'],
]

const AREAS: {
  name: string
  mock: (api: Api) => void
  pages: PageUnderTest[]
  checkInitialPage?: (page: Page, api: Api, path: string) => Promise<void>
}[] = [
  { name: 'công khai', mock: mockPublic, pages: PUBLIC_PAGES },
  { name: 'khách hàng', mock: mockCustomer, pages: CUSTOMER_PAGES },
  {
    name: 'nhà đầu tư', mock: mockInvestor, pages: INVESTOR_PAGES,
    checkInitialPage: async (page, api) => {
      await expect(page.getByRole('navigation', { name: 'Menu Nhà đầu tư' })).toBeVisible()
      await expect(page.getByRole('status').filter({ hasText: 'Đang tải' })).toHaveCount(0)
      await expect(page.getByRole('alert')).toHaveCount(0)
      expect(api.calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true)
    },
  },
  { name: 'người nuôi', mock: mockOperator, pages: OPERATOR_PAGES },
  {
    name: 'kiểm phẩm', mock: mockQc, pages: QC_PAGES,
    checkInitialPage: async (page, api, path) => {
      await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
      const menu = page.getByRole('navigation', { name: 'Menu Nhân viên kiểm phẩm' })
      await expect(menu.locator('[aria-current="page"]')).toHaveText(QC_MENU.find(([prefix]) => path.startsWith(prefix))![1])
      expect(api.calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true)
    },
  },
  {
    name: 'quản trị', mock: mockAdmin, pages: ADMIN_PAGES,
    checkInitialPage: async (page) => {
      await expect(page.getByRole('alert')).toHaveCount(0)
    },
  },
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
        const ready = page.getByText(target.ready)
        await expect(area.checkInitialPage ? ready : ready.first()).toBeVisible()
        if (area.checkInitialPage) {
          await area.checkInitialPage(page, api, target.path)
          expect(api.writes()).toEqual([])
        }
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
