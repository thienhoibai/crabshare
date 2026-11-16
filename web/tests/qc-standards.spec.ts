/* /qc/chuan — Chuẩn phân hạng và bộ quy tắc đang áp dụng, để tra nhanh khi duyệt hạng (GET /api/grading/standards).
   Trang chỉ đọc. Đây là chuẩn nội bộ tham chiếu, không phải giấy chứng nhận; ghi chú của backend có dẫn số quy tắc thì không đưa lên màn hình. */
import { expect, signIn, test } from './support/app'
import { mockQc, noDevReload, ruleSet, standards, vnDate } from './support/qc'

test.beforeEach(async ({ page, api }) => {
  await noDevReload(page)
  await signIn(page, 'QcInspector')
  mockQc(api)
})

test('hiện chuẩn tham chiếu và bộ quy tắc đang áp dụng của từng loại cua', async ({ page, api }) => {
  await page.goto('/qc/chuan')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Chuẩn phân hạng', level: 1 })).toBeVisible()
  await expect(main.getByText('Chuẩn nội bộ tham chiếu, không phải giấy chứng nhận.')).toBeVisible()
  await expect(main.getByText(`Tham chiếu ${standards[0].standardCode} · ${standards[0].issuer} · áp dụng từ ${vnDate(standards[0].effectiveFrom)}`)).toBeVisible()

  // Cua thịt: size theo khối lượng, hạng theo chỉ số C, và điều kiện loại bỏ.
  const fattening = main.locator('section').filter({ has: page.getByRole('heading', { name: 'Cua thịt vỗ béo', level: 2 }) })
  await expect(fattening.getByText('Đang áp dụng')).toBeVisible()
  for (const kind of ['Phân size theo khối lượng', 'Chỉ số độ chắc', 'Điều kiện loại bỏ']) await expect(fattening.getByText(kind, { exact: true })).toBeVisible()
  await expect(fattening.getByRole('row')).toHaveText([
    /Chỉ tiêu.*Khoảng giá trị.*Kết quả/,
    /Khối lượng.*từ 200 tới dưới 300 g.*Size M/,
    /Khối lượng.*từ 300 tới dưới 350 g.*Size L/,
    /Khối lượng.*≥ 350 g.*Size XL/,
    /Chỉ tiêu/,
    /Chỉ số C.*≥ 0[.,]66.*Đặc cấp/,
    /Chỉ số C.*từ 0[.,]62 tới dưới 0[.,]66.*Cấp 1/,
    /Chỉ số C.*< 0[.,]62.*Dưới chuẩn/,
    /Chỉ tiêu/,
    /Còn sống.*Loại/,
    /An toàn thực phẩm.*Loại/,
  ])

  // Cua gạch: không xếp theo chỉ số C mà theo dải mép khi soi đỏ.
  const roe = main.locator('section').filter({ has: page.getByRole('heading', { name: 'Cua gạch', level: 2 }) })
  await expect(roe.getByText('Kiểm cảm quan', { exact: true })).toBeVisible()
  await expect(roe.getByText('Chỉ số độ chắc')).toHaveCount(0)
  await expect(roe.getByRole('row')).toHaveText([
    /Chỉ tiêu/,
    /Khối lượng.*từ 200 tới dưới 250 g.*Size M/,
    /Khối lượng.*từ 250 tới dưới 350 g.*Size L/,
    /Khối lượng.*≥ 350 g.*Size XL/,
    /Chỉ tiêu/,
    /Dải mép khi soi đỏ.*< 2 mm.*Đặc cấp/,
    /Dải mép khi soi đỏ.*từ 2 đến 4 mm.*Cấp 1/,
    /Dải mép khi soi đỏ.*> 4 mm.*Dưới chuẩn/,
  ])

  // Phiên bản và biên độ sát ngưỡng nằm sau nút giải thích.
  const help = `Phiên bản ${ruleSet.versionNo}, áp dụng từ ${vnDate(ruleSet.effectiveFrom)}. Số đo cách ngưỡng trong 2% được đánh dấu để kiểm kỹ.`
  await expect(fattening.getByText(help)).toHaveCount(0)
  await fattening.getByRole('button', { name: 'Giải thích: Cua thịt vỗ béo' }).click()
  await expect(fattening.getByText(help)).toBeVisible()

  // Chuẩn nội bộ tham chiếu: chữ "chứng nhận" chỉ có trong câu nói rõ đây không phải giấy chứng nhận;
  // ghi chú nội bộ của bộ quy tắc (dẫn bảng, số quy tắc) không lên màn hình.
  const text = await main.innerText()
  expect(text.match(/chứng nhận/gi)).toHaveLength(1)
  expect(text).not.toMatch(/BR-|Bảng 3\./)

  // Trang chỉ đọc, một lời gọi API.
  await expect(main.getByRole('button', { name: /Sửa|Thêm|Lưu|Duyệt|Xoá/ })).toHaveCount(0)
  expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /api/grading/standards'])
})

test('chưa công bố chuẩn nào thì chỉ có một câu, vẫn ghi rõ đây không phải giấy chứng nhận', async ({ page, api }) => {
  api.get('/api/grading/standards', [])
  await page.goto('/qc/chuan')
  const main = page.getByRole('main')
  await expect(main.getByText('Chưa có chuẩn phân hạng nào được công bố')).toBeVisible()
  await expect(main.getByText('Chuẩn nội bộ tham chiếu, không phải giấy chứng nhận.')).toBeVisible()
  await expect(main.getByRole('table')).toHaveCount(0)
})
