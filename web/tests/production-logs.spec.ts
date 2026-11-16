/* Nhật ký chăm sóc hôm nay của mọi Lô đang lưu nuôi (/operator/log): Lô nào chưa ghi, ghi một lần mỗi ngày, các bản đã ghi.
   Nhật ký trong trang làm việc của từng Lô và khoảng chỉ số nước nằm ở operator-care-log.spec.ts. */
import type { ProductionBatchResponse, ProductionLogRequest, ProductionLogResponse } from '../src/shared/api/api.gen'
import { dateFromNow, daysFromNow, expect, paged, reply, signIn, test, type Page } from './support/app'
import { BUSINESS_DATE, CODE, batch, batchRaising, careLog, careLogs, mockOperator, more, noDevReload, productionBatches, vnDay } from './support/operator'

const URL = '/operator/log'
const BATCHES = '/api/operators/me/production-batches'
const HISTORY = '/api/operators/me/production-logs'
const LOGS = `/api/batches/${CODE}/production-logs`

/** Dòng của một Lô: là nút khi còn phải ghi hôm nay, là liên kết tới nhật ký của Lô khi đã ghi hoặc không ghi được. */
const dueRow = (page: Page, title: string) => page.getByRole('button').filter({ hasText: title })
const doneRow = (page: Page, title: string) => page.getByRole('link').filter({ hasText: title })
const careDialog = (page: Page) => page.getByRole('dialog', { name: 'Nhật ký hôm nay' })

test.beforeEach(async ({ page, api }) => {
  mockOperator(api)
  await noDevReload(page)
  await signIn(page, 'OperatorMember')
})

test('mỗi Lô đang nuôi một dòng: ngày nuôi, bản ghi gần nhất, đã ghi hôm nay hay chưa', async ({ page, api }) => {
  await page.goto(URL)
  await expect(page.getByRole('heading', { name: 'Nhật ký chăm sóc', level: 1 })).toBeVisible()
  await expect(page.locator('.op-heading').getByText('1 Lô chưa ghi hôm nay')).toBeVisible()

  const due = dueRow(page, batch.title)
  await expect(due).toContainText(`${CODE} · ngày nuôi 30/30`)
  await expect(due).toContainText(`${vnDay(dateFromNow(-1))}: 3,5 kg thức ăn · pH 8,1 · 28,5 °C · 20 ‰`)
  await expect(due).toContainText('Ghi hôm nay')
  const done = doneRow(page, batchRaising.title)
  await expect(done).toContainText('Đã ghi')
  await expect(done).toHaveAttribute('href', `/operator/batches/${batchRaising.batchCode}/nhat-ky`)

  expect(api.sent('GET', BATCHES).map((c) => c.query)).toEqual([{ pageSize: '100' }])
  expect(api.sent('GET', HISTORY).map((c) => c.query)).toEqual([{ page: '1', pageSize: '20' }])
  expect(api.writes()).toEqual([])
})

test('ghi đủ bốn số một lần trong lúc chờ máy chủ, xong thì dòng của Lô và các bản đã ghi tự cập nhật', async ({ page, api }) => {
  let rows = productionBatches
  let history: ProductionLogResponse[] = careLogs
  let finish!: () => void
  const gate = new Promise<void>((resolve) => { finish = resolve })
  api.get(BATCHES, () => paged(rows, 100))
  api.get(HISTORY, () => paged(history, 20))
  api.post(LOGS, async (call) => {
    await gate
    const body = call.body as ProductionLogRequest
    const saved = careLog({ id: 52, logDate: BUSINESS_DATE, ...body, note: body.note ?? null, createdAt: daysFromNow(0) })
    rows = rows.map((b): ProductionBatchResponse => (b.batchCode === CODE ? { ...b, loggedToday: true, latestLog: saved } : b))
    history = [saved, ...careLogs]
    return reply(201, saved)
  })
  await page.goto(URL)
  await dueRow(page, batch.title).click()

  const dialog = careDialog(page)
  await expect(dialog.getByText(batch.title)).toBeVisible()
  await dialog.getByLabel('Thức ăn đã cho').fill('1,234')
  await dialog.getByLabel('pH').fill('7,4')
  await dialog.getByLabel('Nhiệt độ').fill('28,5')
  await dialog.getByLabel('Độ mặn').fill('15')
  await more(dialog, 'Ghi chú').click()
  await dialog.getByLabel('Ghi chú chăm sóc').fill('Kiểm tra nước buổi sáng')
  await dialog.getByRole('button', { name: 'Ghi nhật ký' }).click()

  // Đang gửi thì nút khoá lại; gửi lại form cũng không tạo lời gọi thứ hai.
  await expect(dialog.getByRole('button', { name: 'Đang gửi…' })).toBeDisabled()
  await dialog.locator('form').evaluate((form: HTMLFormElement) => form.requestSubmit())
  expect(api.sent('POST', LOGS)).toHaveLength(1)
  finish()

  await expect(page.getByRole('status').filter({ hasText: `Đã ghi nhật ký Lô ${CODE}.` })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  const body: ProductionLogRequest = { feedKg: 1.234, ph: 7.4, waterTempC: 28.5, salinityPpt: 15, note: 'Kiểm tra nước buổi sáng' }
  expect(api.sent('POST', LOGS).map((c) => c.body)).toEqual([body])

  // Lô vừa ghi chuyển thành "Đã ghi" và không còn bấm để ghi lần hai trong ngày.
  await expect(doneRow(page, batch.title)).toContainText('Đã ghi')
  await expect(doneRow(page, batch.title)).toContainText(`${vnDay(BUSINESS_DATE)}: 1,234 kg thức ăn · pH 7,4`)
  await expect(dueRow(page, batch.title)).toHaveCount(0)
  await expect(page.getByText(/Lô chưa ghi hôm nay/)).toHaveCount(0)
  await more(page, 'Các bản đã ghi').click()
  const saved = page.getByRole('row').filter({ hasText: 'Kiểm tra nước buổi sáng' })
  await expect(saved.getByRole('cell')).toHaveText([new RegExp(`${vnDay(BUSINESS_DATE)} · ${CODE}`), '1,234 kg', '7,4', '28,5 °C', '15 ‰'])
})

test('Lô đã có nhật ký hôm nay: máy chủ báo trùng, hộp thoại giữ nguyên mọi số đã nhập', async ({ page, api }) => {
  api.post(LOGS, () => reply(409, { status: 409, code: 'production.log_exists', detail: 'Lô đã có nhật ký ghi tay cho ngày hôm nay.' }))
  await page.goto(URL)
  await dueRow(page, batch.title).click()
  const dialog = careDialog(page)
  await dialog.getByLabel('Thức ăn đã cho').fill('1,234')
  await dialog.getByLabel('pH').fill('7,4')
  await more(dialog, 'Ghi chú').click()
  await dialog.getByLabel('Ghi chú chăm sóc').fill('Kiểm tra nước buổi sáng')
  await dialog.getByRole('button', { name: 'Ghi nhật ký' }).click()

  await expect(dialog.getByText('Lô đã có nhật ký ghi tay cho ngày hôm nay.')).toBeVisible()
  await expect(dialog.getByLabel('Thức ăn đã cho')).toHaveValue('1,234')
  await expect(dialog.getByLabel('pH')).toHaveValue('7,4')
  await expect(dialog.getByLabel('Nhiệt độ')).toHaveValue('28,6')
  await expect(dialog.getByLabel('Độ mặn')).toHaveValue('20,3')
  await expect(dialog.getByLabel('Ghi chú chăm sóc')).toHaveValue('Kiểm tra nước buổi sáng')
  await expect(dialog.getByRole('button', { name: 'Ghi nhật ký' })).toBeEnabled()
})

test('số đo ngoài khoảng vẫn ghi được và được đánh dấu trong các bản đã ghi', async ({ page, api }) => {
  let history: ProductionLogResponse[] = careLogs
  api.get(HISTORY, () => paged(history, 20))
  api.post(LOGS, (call) => {
    const saved = careLog({ id: 52, logDate: BUSINESS_DATE, ...(call.body as ProductionLogRequest), note: 'pH cao sau mưa', plausibilityFlag: 'OutOfRange' })
    history = [saved]
    return reply(201, saved)
  })
  await page.goto(URL)
  await dueRow(page, batch.title).click()
  const dialog = careDialog(page)
  await dialog.getByLabel('Thức ăn đã cho').fill('3')
  await dialog.getByLabel('pH').fill('9,1')
  // Chỉ số nước chỉ để theo dõi: form không chặn số nằm ngoài khoảng đã đặt.
  await expect(dialog.getByRole('button', { name: 'Ghi nhật ký' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Ghi nhật ký' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã ghi nhật ký' })).toBeVisible()
  expect((api.sent('POST', LOGS)[0].body as ProductionLogRequest).ph).toBe(9.1)

  await more(page, 'Các bản đã ghi').click()
  const row = page.getByRole('row').filter({ hasText: 'pH cao sau mưa' })
  await expect(row).toContainText('Ngoài khoảng đã đặt')
  await expect(row.getByRole('cell').nth(2)).toHaveText('9,1')
  await expect(row.getByRole('link', { name: CODE })).toHaveAttribute('href', `/operator/batches/${CODE}/nhat-ky`)
})

test('Lô mới thả chưa ghi được nhật ký: không có nút ghi, bấm dòng thì mở nhật ký của Lô', async ({ page, api }) => {
  const stocked: ProductionBatchResponse = { ...productionBatches[0], status: 'Stocked', dayOfCycle: null, latestLog: null, canRecord: false }
  api.get(BATCHES, paged([stocked, { ...productionBatches[1], loggedToday: false }], 100))
  await page.goto(URL)
  const row = doneRow(page, batch.title)
  await expect(row).toHaveAttribute('href', `/operator/batches/${CODE}/nhat-ky`)
  await expect(row).not.toContainText('Ghi hôm nay')
  await expect(row).not.toContainText('Đã ghi')
  // Chỉ Lô đang lưu nuôi hoặc đang thu hoạch mới được tính là còn thiếu nhật ký.
  await expect(page.locator('.op-heading').getByText('1 Lô chưa ghi hôm nay')).toBeVisible()
  await expect(dueRow(page, batchRaising.title)).toContainText('Ghi hôm nay')
})

test('các bản đã ghi: lọc theo ngày và chuyển trang đều gửi lên máy chủ', async ({ page, api }) => {
  api.get(HISTORY, (call) => {
    const pageNo = Number(call.query.page)
    const items = call.query.from
      ? [careLog({ id: 30 + pageNo, logDate: dateFromNow(-10 * pageNo), note: `Trang ${pageNo} đã lọc`, plausibilityFlag: 'Inconsistent', thresholdVersion: null, thresholdsApplied: null })]
      : careLogs
    return { items, page: pageNo, pageSize: 20, total: call.query.from ? 21 : careLogs.length }
  })
  await page.goto(URL)
  await more(page, 'Các bản đã ghi').click()
  await expect(page.getByText('Thay 30% nước dàn 1')).toBeVisible()
  await page.getByLabel('Từ ngày').fill(dateFromNow(-30))
  await page.getByLabel('Đến ngày').fill(dateFromNow(-5))
  await expect(page.getByRole('row').filter({ hasText: 'Trang 1 đã lọc' })).toContainText('Không nhất quán')
  await page.getByRole('button', { name: 'Trang sau' }).click()
  await expect(page.getByText('Trang 2 đã lọc')).toBeVisible()
  await expect(page.getByText(vnDay(dateFromNow(-20)))).toBeVisible()
  expect(api.sent('GET', HISTORY).at(-1)!.query).toEqual({ from: dateFromNow(-30), to: dateFromNow(-5), page: '2', pageSize: '20' })

  await page.getByRole('button', { name: 'Bỏ lọc' }).click()
  await expect(page.getByText('Thay 30% nước dàn 1')).toBeVisible()
})

test('không tải được Lô thì báo lỗi của máy chủ; thử lại, hộ nuôi chưa có Lô đang nuôi thì không có dữ liệu mẫu', async ({ page, api }) => {
  let failing = true
  api.get(BATCHES, () => (failing ? reply(500, { status: 500, detail: 'Không tải được Lô đang nuôi.' }) : paged([], 100)))
  api.get(HISTORY, paged([], 20))
  await page.goto(URL)
  const error = page.getByRole('alert').filter({ hasText: 'Không tải được dữ liệu' })
  await expect(error).toContainText('Không tải được Lô đang nuôi.')
  failing = false
  await error.getByRole('button', { name: 'Thử lại' }).click()
  await expect(page.getByText('Chưa có Lô nào đang lưu nuôi')).toBeVisible()
  await expect(page.getByRole('button', { name: /Ghi hôm nay/ })).toHaveCount(0)
  await more(page, 'Các bản đã ghi').click()
  await expect(page.getByText('Chưa có nhật ký nào')).toBeVisible()
})
