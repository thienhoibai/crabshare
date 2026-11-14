/* /truy-xuat/:traceCode — trang mở khi quét QR của đơn. QR gắn theo đơn và theo Lô: chỉ có Lô, trại, vùng xuất xứ,
   ngày thu của lô nguồn và quy cách đã duyệt; không có thông tin cá nhân, không có mã từng con cua. */
import { expect, reply, signIn, test } from './support/app'
import { mockPublic, trace } from './support/public'

test('ai quét QR cũng xem được Lô, trại, nguồn cua và quy cách của đơn', async ({ page, api }) => {
  mockPublic(api)
  await page.goto(`/truy-xuat/${trace.traceCode}`)
  await expect(page.getByRole('heading', { name: 'Đơn hàng này đến từ đâu' })).toBeVisible()
  await expect(page.getByText(`Mã truy xuất ${trace.traceCode}`)).toBeVisible()
  await expect(page.getByText(trace.batchTitle, { exact: true })).toBeVisible()
  await expect(page.getByText('T-2611-02 · Cua thịt vỗ béo')).toBeVisible()
  await expect(page.getByText('Trại cua Tư Bền', { exact: true })).toBeVisible()
  await expect(page.getByText('Trại thực hiện Lô T-2611-02')).toBeVisible()

  const facts = page.locator('dl.op-facts')
  await expect(facts).toContainText('Số đợt đã giao1')
  await expect(facts).toContainText('Số quy cách2')
  await expect(facts).toContainText('Tổng số con36')

  const lines = page.locator('section', { has: page.getByRole('heading', { name: 'Quy cách trong đơn' }) })
  await expect(lines.getByRole('row', { name: /Cua thịt L hạng A/ })).toContainText('24')
  await expect(lines.getByRole('row', { name: /Cua thịt XL hạng A/ })).toContainText('12')

  const sources = page.locator('section', { has: page.getByRole('heading', { name: 'Nguồn cua' }) })
  await expect(sources).toContainText('Ngọc Hiển, Cà Mau')
  await expect(sources).toContainText('Scylla paramamosain · thu ngày 2/11/2026')
  await expect(sources).toContainText('Chưa khai vùng xuất xứ')

  const deliveries = page.locator('section', { has: page.getByRole('heading', { name: 'Các đợt giao' }) })
  await expect(deliveries).toContainText(/09:30 8\/11\/(20)?26/) // 02:30 UTC là 09:30 giờ Việt Nam

  // Câu chú thích của backend có kèm số quy tắc; trang bỏ đi trước khi hiện.
  await expect(page.getByText('Hạng theo chuẩn nội bộ tham chiếu, không phải chứng nhận')).toBeVisible()
  await expect(page.getByText(/BR-\d+/)).toHaveCount(0)

  // Chỉ một lời gọi, không kèm token, và trang không dẫn tới mã của từng con cua.
  expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual([`GET /api/trace/orders/${trace.traceCode}`])
  expect(api.calls[0].auth).toBeUndefined()
  await expect(page.locator('a[href*="crab-units"], a[href*="/truy-xuat/"]')).toHaveCount(0)
})

test('đơn chưa giao đợt nào và lô nguồn chưa khai thì ẩn hai mục đó', async ({ page, api }) => {
  api.get(`/api/trace/orders/${trace.traceCode}`, { ...trace, sourceLots: [], deliveries: [] })
  await page.goto(`/truy-xuat/${trace.traceCode}`)
  await expect(page.getByText('Trại cua Tư Bền', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nguồn cua' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Các đợt giao' })).toHaveCount(0)
  await expect(page.locator('dl.op-facts')).toContainText('Số đợt đã giao0')
})

test('mã truy xuất sai thì báo lỗi, thử lại được', async ({ page, api }) => {
  let known = false
  api.get('/api/trace/orders/SAI-MA', () => (known ? trace : reply(404, { status: 404, detail: 'Không tìm thấy mã truy xuất.' })))
  await page.goto('/truy-xuat/SAI-MA')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Không tải được dữ liệu')
  await expect(alert).toContainText('Không tìm thấy mã truy xuất.')
  await expect(page.getByText('Trại cua Tư Bền')).toHaveCount(0)
  known = true
  await alert.getByRole('button', { name: 'Thử lại' }).click()
  await expect(page.getByText('Trại cua Tư Bền', { exact: true })).toBeVisible()
})

test('người đã đăng nhập mở trang truy xuất vẫn chỉ thấy cùng nội dung công khai', async ({ page, api }) => {
  mockPublic(api)
  await signIn(page, 'Customer')
  await page.goto(`/truy-xuat/${trace.traceCode}`)
  await expect(page.getByText('Trại cua Tư Bền', { exact: true })).toBeVisible()
  await expect(page.getByText('customer@test.local')).toHaveCount(0)
  await expect(page.getByText('Trần Thu Hà')).toHaveCount(0)
})
