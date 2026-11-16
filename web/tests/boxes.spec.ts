/* Hộp nuôi của trại (/operator/boxes): bốn số đếm, lưới hộp, bộ lọc, thêm một hộp, đánh số nhiều hộp, đổi trạng thái bảo trì. */
import type { BoxRangeRequest, CreateBoxRequest, UpdateBoxRequest } from '../src/shared/api/api.gen'
import { expect, reply, signIn, test, type Page } from './support/app'
import { CODE, batchRaising, boxOf, boxPage, boxes, fact, mockOperator, more, noDevReload, type FarmBox } from './support/operator'

const URL = '/operator/boxes'
const API = '/api/boxes'

/** Một ô trong lưới hộp, tìm theo số hộp. */
const box = (page: Page, slotCode: string) => page.getByRole('button', { name: new RegExp(`^${slotCode}`) })
/** Mọi ô trong lưới hộp (số hộp gồm bốn chữ số). */
const grid = (page: Page) => page.getByRole('button', { name: /^\d{4}/ })
const numbered = (count: number, status = 'Available'): FarmBox[] => Array.from({ length: count }, (_, i) => boxOf(String(i + 1).padStart(4, '0'), status))

test.beforeEach(async ({ page, api }) => {
  mockOperator(api)
  await noDevReload(page)
  await signIn(page, 'OperatorMember')
})

test('bốn số đếm, lưới hộp và ba bộ lọc gửi lên máy chủ', async ({ page, api }) => {
  await page.goto(URL)
  await expect(fact(page, 'Tổng số hộp')).toHaveText('6')
  await expect(fact(page, 'Đang có cua')).toHaveText('3')
  await expect(fact(page, 'Trống')).toHaveText('2')
  await expect(fact(page, 'Bảo trì')).toHaveText('1')
  await expect(grid(page)).toHaveText([`0101${CODE}`, `0102${CODE}`, `0103${batchRaising.batchCode}`, '0104Trống', '0105Trống', '0106Bảo trì'])

  await page.getByLabel('Lọc theo trạng thái hộp').selectOption({ label: 'Bảo trì' })
  await expect(grid(page)).toHaveText(['0106Bảo trì'])
  await page.getByLabel('Lọc theo trạng thái hộp').selectOption('')
  await page.getByLabel('Lọc theo Lô đang dùng').selectOption(batchRaising.batchCode)
  await expect(grid(page)).toHaveText([`0103${batchRaising.batchCode}`])
  await page.getByLabel('Tìm hộp').fill('0199')
  await expect(page.getByText('Không có hộp nào khớp bộ lọc')).toBeVisible()

  const queries = api.sent('GET', API).map((c) => c.query)
  expect(queries).toContainEqual({ status: 'Maintenance', page: '1', pageSize: '100' })
  expect(queries).toContainEqual({ batchCode: batchRaising.batchCode, page: '1', pageSize: '100' })
  expect(queries.at(-1)).toEqual({ batchCode: batchRaising.batchCode, search: '0199', page: '1', pageSize: '100' })
  expect(api.writes()).toEqual([])
})

test('đánh số nhiều hộp có thêm số 0 ở đầu, rồi chuyển một hộp sang bảo trì và lọc', async ({ page, api }) => {
  let all: FarmBox[] = []
  api.get(API, (call) => boxPage(all)(call))
  api.post(`${API}/range`, () => {
    all = numbered(1200)
    return reply(201, { created: 1200, from: '0001', to: '1200' })
  })
  api.patch(`${API}/0001`, (call) => {
    all = all.map((b) => (b.slotCode === '0001' ? { ...b, status: (call.body as UpdateBoxRequest).status } : b))
    return all[0]
  })
  await page.goto(URL)
  await expect(page.getByText('Trại chưa có hộp nào')).toBeVisible()
  await page.locator('.op-heading').getByRole('button', { name: 'Đánh số nhiều hộp' }).click()

  const dialog = page.getByRole('dialog', { name: 'Đánh số nhiều hộp' })
  await expect(dialog.getByRole('button', { name: 'Tạo hộp' })).toBeDisabled()
  await dialog.getByLabel('Từ số').fill('1')
  await dialog.getByLabel('Đến số').fill('1200')
  await expect(dialog.getByText('Từ 0001 tới 1200')).toBeVisible()
  await dialog.getByRole('button', { name: 'Tạo 1.200 hộp' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã tạo 1200 hộp, từ 0001 tới 1200.' })).toBeVisible()
  const range: BoxRangeRequest = { from: 1, to: 1200, width: 4 }
  expect(api.sent('POST', `${API}/range`).map((c) => c.body)).toEqual([range])
  await expect(fact(page, 'Tổng số hộp')).toHaveText('1.200')
  await expect(grid(page)).toHaveCount(100)
  await expect(page.getByText('1–100 trong 1.200 hộp')).toBeVisible()

  await box(page, '0001').click()
  const one = page.getByRole('dialog', { name: 'Hộp 0001' })
  await expect(one.getByText('Dàn 1 · tầng 1 · cột 1 · dãy A')).toBeVisible()
  await one.getByRole('button', { name: 'Chuyển sang bảo trì' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Hộp 0001 chuyển sang bảo trì.' })).toBeVisible()
  const update: UpdateBoxRequest = { status: 'Maintenance' }
  expect(api.sent('PATCH', `${API}/0001`).map((c) => c.body)).toEqual([update])
  await expect(box(page, '0001')).toHaveText('0001Bảo trì')
  await expect(fact(page, 'Bảo trì')).toHaveText('1')

  await page.getByLabel('Lọc theo trạng thái hộp').selectOption({ label: 'Trống' })
  await expect(box(page, '0002')).toBeVisible()
  await expect(box(page, '0001')).toHaveCount(0)
})

test('vượt sức chứa đã duyệt: lỗi hiện trong hộp thoại, số đã nhập còn nguyên', async ({ page, api }) => {
  api.post(`${API}/range`, () => reply(422, { status: 422, code: 'box.over_capacity', detail: 'Tổng số hộp vượt sức chứa đã được duyệt.' }))
  await page.goto(URL)
  await page.getByRole('button', { name: 'Đánh số nhiều hộp' }).click()
  const dialog = page.getByRole('dialog', { name: 'Đánh số nhiều hộp' })
  await dialog.getByLabel('Từ số').fill('200')
  // Số cuối nhỏ hơn số đầu thì chưa gửi được.
  await dialog.getByLabel('Đến số').fill('120')
  await expect(dialog.getByText('Phải từ số đầu trở lên.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Tạo hộp' })).toBeDisabled()

  await dialog.getByLabel('Đến số').fill('1399')
  await more(dialog, 'Tuỳ chọn thêm').click()
  await dialog.getByLabel('Số chữ số').fill('5')
  await expect(dialog.getByText('Từ 00200 tới 01399')).toBeVisible()
  await dialog.getByRole('button', { name: 'Tạo 1.200 hộp' }).click()
  await expect(dialog.getByText('Tổng số hộp vượt sức chứa đã được duyệt.')).toBeVisible()
  await expect(dialog.getByLabel('Từ số')).toHaveValue('200')
  await expect(dialog.getByLabel('Đến số')).toHaveValue('1.399')
  const range: BoxRangeRequest = { from: 200, to: 1399, width: 5 }
  expect(api.sent('POST', `${API}/range`).map((c) => c.body)).toEqual([range])
  await expect(fact(page, 'Tổng số hộp')).toHaveText('6')
})

test('thêm một hộp kèm vị trí trên dàn, dùng được trên màn hình điện thoại', async ({ page, api }) => {
  let all: FarmBox[] = boxes
  api.get(API, (call) => boxPage(all)(call))
  api.post(API, (call) => {
    const body = call.body as CreateBoxRequest
    const created: FarmBox = { slotCode: body.slotCode, status: 'Available', rowCode: body.rowCode ?? null, rackNo: body.rackNo ?? null, tierNo: body.tierNo ?? null, columnNo: body.columnNo ?? null, batchCode: null, latestEvidence: null }
    all = [...all, created]
    return reply(201, created)
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(URL)
  await page.getByRole('button', { name: 'Thêm một hộp' }).click()
  const dialog = page.getByRole('dialog', { name: 'Thêm một hộp' })
  await dialog.getByLabel('Số hộp').fill('A 01/')
  await expect(dialog.getByText('Chỉ dùng chữ, số, gạch ngang.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Thêm' })).toBeDisabled()
  await dialog.getByLabel('Số hộp').fill(' 0207 ')
  await more(dialog, 'Vị trí trên dàn').click()
  await dialog.getByLabel('Dàn').fill('2')
  await dialog.getByLabel('Tầng').fill('1')
  await dialog.getByLabel('Dãy').fill(' B ')
  await dialog.getByRole('button', { name: 'Thêm' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã thêm hộp 0207.' })).toBeVisible()
  const body: CreateBoxRequest = { slotCode: '0207', rowCode: 'B', rackNo: 2, tierNo: 1, columnNo: null }
  expect(api.sent('POST', API).map((c) => c.body)).toEqual([body])
  await expect(box(page, '0207')).toHaveText('0207Trống')
  await expect(fact(page, 'Tổng số hộp')).toHaveText('7')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('hộp đang có cua chỉ xem được: Lô đang dùng, ảnh gần nhất, không có nút đổi trạng thái', async ({ page, api }) => {
  await page.goto(URL)
  await box(page, '0101').click()
  const dialog = page.getByRole('dialog', { name: 'Hộp 0101' })
  await expect(dialog.getByText('Đang có cua')).toBeVisible()
  await expect(dialog.getByRole('link', { name: CODE })).toHaveAttribute('href', `/operator/batches/${CODE}/luu-nuoi`)
  await expect(dialog.getByText(/· Gắn cờ$/)).toBeVisible()
  // Chỉ còn nút đóng ở góc hộp thoại.
  await expect(dialog.getByRole('button')).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Đóng' }).click()
  await expect(dialog).toHaveCount(0)
  expect(api.writes()).toEqual([])
})

test('hộp bảo trì dùng lại được; máy chủ từ chối thì lỗi hiện trong hộp thoại', async ({ page, api }) => {
  let all: FarmBox[] = boxes
  let refuse = true
  api.get(API, (call) => boxPage(all)(call))
  api.patch(`${API}/0106`, (call) => {
    if (refuse) return reply(409, { status: 409, detail: 'Hộp vừa được người khác cập nhật.' })
    all = all.map((b) => (b.slotCode === '0106' ? { ...b, status: (call.body as UpdateBoxRequest).status } : b))
    return all.find((b) => b.slotCode === '0106')
  })
  await page.goto(URL)
  await box(page, '0106').click()
  const dialog = page.getByRole('dialog', { name: 'Hộp 0106' })
  await dialog.getByRole('button', { name: 'Dùng lại hộp' }).click()
  await expect(dialog.getByText('Hộp vừa được người khác cập nhật.')).toBeVisible()
  refuse = false
  await dialog.getByRole('button', { name: 'Dùng lại hộp' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Hộp 0106 dùng lại được.' })).toBeVisible()
  const update: UpdateBoxRequest = { status: 'Available' }
  expect(api.sent('PATCH', `${API}/0106`).map((c) => c.body)).toEqual([update, update])
  await expect(box(page, '0106')).toHaveText('0106Trống')
  await expect(fact(page, 'Bảo trì')).toHaveText('0')
})

test('hộp cuối của trang cuối rời bộ lọc thì quay về trang còn hộp', async ({ page, api }) => {
  let all = numbered(101)
  api.get(API, (call) => boxPage(all)(call))
  api.patch(`${API}/0101`, (call) => {
    all = all.map((b) => (b.slotCode === '0101' ? { ...b, status: (call.body as UpdateBoxRequest).status } : b))
    return all[100]
  })
  await page.goto(URL)
  await page.getByLabel('Lọc theo trạng thái hộp').selectOption({ label: 'Trống' })
  await expect(page.getByText('1–100 trong 101 hộp')).toBeVisible()
  await page.getByRole('button', { name: 'Trang sau' }).click()
  await expect(grid(page)).toHaveText(['0101Trống'])
  await box(page, '0101').click()
  await page.getByRole('dialog', { name: 'Hộp 0101' }).getByRole('button', { name: 'Chuyển sang bảo trì' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Hộp 0101 chuyển sang bảo trì.' })).toBeVisible()

  // Trang 2 không còn hộp trống nào: danh sách lùi về trang 1 thay vì báo "không có hộp".
  await expect(box(page, '0001')).toBeVisible()
  await expect(grid(page)).toHaveCount(100)
  await expect(page.getByLabel('Lọc theo trạng thái hộp')).toHaveValue('Available')
  await expect(page.getByText('Không có hộp nào khớp bộ lọc')).toHaveCount(0)
})

test('không tải được hộp thì báo lỗi của máy chủ, thử lại rồi chuyển trang', async ({ page, api }) => {
  let failing = true
  const all = numbered(101)
  api.get(API, (call) => (failing ? reply(500, { status: 500, detail: 'Tạm thời không tải được hộp.' }) : boxPage(all)(call)))
  await page.goto(URL)
  const error = page.getByRole('alert').filter({ hasText: 'Không tải được dữ liệu' })
  await expect(error).toContainText('Tạm thời không tải được hộp.')
  failing = false
  await error.getByRole('button', { name: 'Thử lại' }).click()
  await expect(box(page, '0001')).toBeVisible()
  await page.getByRole('button', { name: 'Trang sau' }).click()
  await expect(grid(page)).toHaveText(['0101Trống'])
  await expect(page.getByText('101–101 trong 101 hộp')).toBeVisible()
  expect(api.sent('GET', API).at(-1)!.query).toEqual({ page: '2', pageSize: '100' })
})
