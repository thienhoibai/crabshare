/* Mục "Nhật ký" của trang làm việc một Lô (/operator/batches/:code/nhat-ky): các bản đã ghi, ghi nhật ký hôm nay,
   lọc theo ngày, nhật trình gộp và khoảng chỉ số nước để đối chiếu. Trang /operator/log nằm ở production-logs.spec.ts. */
import type { ProductionLogRequest, ProductionLogResponse, ProductionThresholdRequest, ProductionThresholdState } from '../src/shared/api/api.gen'
import { dateFromNow, daysFromNow, expect, paged, reply, signIn, test, type Page } from './support/app'
import { BUSINESS_DATE, CODE, batch, careLog, careLogs, mockOperator, noDevReload, more, panel, thresholdState, thresholds, vnDay } from './support/operator'

const URL = `/operator/batches/${CODE}/nhat-ky`
const LOGS = `/api/batches/${CODE}/production-logs`
const THRESHOLDS = `/api/batches/${CODE}/production-thresholds`

const careDialog = (page: Page) => page.getByRole('dialog', { name: 'Nhật ký hôm nay' })

test.beforeEach(async ({ page, api }) => {
  mockOperator(api)
  await noDevReload(page)
  await signIn(page, 'OperatorMember')
})

test('bảng nhật ký ghi đủ bốn số, đánh dấu bản ngoài khoảng và bản do thiết bị gửi', async ({ page, api }) => {
  await page.goto(URL)
  const yesterday = page.getByRole('row').filter({ hasText: vnDay(dateFromNow(-1)) })
  await expect(yesterday.getByRole('cell')).toHaveText([/Thay 30% nước dàn 1/, '3,5 kg', '8,1', '28,5 °C', '20 ‰'])
  await expect(page.getByRole('row').filter({ hasText: 'Ngoài khoảng đã đặt' })).toContainText('8,9')
  // Bản do thiết bị gửi không có lượng thức ăn.
  await expect(page.getByRole('row').filter({ hasText: 'Thiết bị' }).getByRole('cell').nth(1)).toHaveText('—')
  await expect(page.getByRole('button', { name: 'Ghi nhật ký hôm nay' })).toBeVisible()
  expect(api.sent('GET', LOGS).map((c) => c.query)).toEqual([{ page: '1', pageSize: '20' }])
  expect(api.writes()).toEqual([])
})

test('ghi nhật ký hôm nay: chỉ số nước lấy sẵn từ cảm biến, chỉ cần nhập lượng thức ăn', async ({ page, api }) => {
  let logs = careLogs
  api.get(LOGS, () => paged(logs, 20))
  api.post(LOGS, (call) => {
    const body = call.body as ProductionLogRequest
    const saved: ProductionLogResponse = careLog({ id: 52, logDate: BUSINESS_DATE, ...body, note: body.note ?? null, createdAt: daysFromNow(0) })
    logs = [saved, ...careLogs]
    return reply(201, saved)
  })
  await page.goto(URL)
  await page.getByRole('button', { name: 'Ghi nhật ký hôm nay' }).click()

  const dialog = careDialog(page)
  await expect(dialog.getByText(batch.title)).toBeVisible()
  // Số đo cảm biến mới nhất (8,04 · 28,64 °C · 20,26 ‰) được làm tròn một chữ số.
  await expect(dialog.getByLabel('pH')).toHaveValue('8')
  await expect(dialog.getByLabel('Nhiệt độ')).toHaveValue('28,6')
  await expect(dialog.getByLabel('Độ mặn')).toHaveValue('20,3')
  await expect(dialog.getByText(/^Chỉ số nước lấy từ cảm biến, đo lúc /)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Ghi nhật ký' })).toBeDisabled()

  await dialog.getByLabel('Thức ăn đã cho').fill('3,5')
  await dialog.getByRole('button', { name: 'Ghi nhật ký' }).click()

  await expect(page.getByRole('status').filter({ hasText: `Đã ghi nhật ký Lô ${CODE}.` })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  const body: ProductionLogRequest = { feedKg: 3.5, ph: 8, waterTempC: 28.6, salinityPpt: 20.3, note: null }
  expect(api.sent('POST', LOGS).map((c) => c.body)).toEqual([body])
  // Bảng tự tải lại, nút ghi đổi thành dấu đã ghi.
  await expect(page.getByText('Hôm nay đã ghi')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ghi nhật ký hôm nay' })).toHaveCount(0)
  await expect(page.getByRole('row').filter({ hasText: vnDay(BUSINESS_DATE) })).toContainText('20,3 ‰')
})

test('không có số đo cảm biến thì phải nhập đủ bốn số; ghi chú được cắt khoảng trắng', async ({ page, api }) => {
  api.get(`/api/batches/${CODE}/water-readings`, [])
  api.post(LOGS, (call) => reply(201, careLog({ id: 52, logDate: BUSINESS_DATE, ...(call.body as ProductionLogRequest) })))
  await page.goto(URL)
  await page.getByRole('button', { name: 'Ghi nhật ký hôm nay' }).click()
  const dialog = careDialog(page)
  const save = dialog.getByRole('button', { name: 'Ghi nhật ký' })
  await expect(dialog.getByLabel('pH')).toHaveValue('')
  await expect(dialog.getByText(/lấy từ cảm biến/)).toHaveCount(0)

  await dialog.getByLabel('Thức ăn đã cho').fill('2,25')
  await dialog.getByLabel('pH').fill('8,3')
  await dialog.getByLabel('Nhiệt độ').fill('29')
  await expect(save).toBeDisabled()
  await dialog.getByLabel('Độ mặn').fill('18,5')
  await more(dialog, 'Ghi chú').click()
  await dialog.getByLabel('Ghi chú chăm sóc').fill('  Vệ sinh hộp dàn 2  ')
  await save.click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã ghi nhật ký' })).toBeVisible()
  const body: ProductionLogRequest = { feedKg: 2.25, ph: 8.3, waterTempC: 29, salinityPpt: 18.5, note: 'Vệ sinh hộp dàn 2' }
  expect(api.sent('POST', LOGS).map((c) => c.body)).toEqual([body])
})

test('sửa tay chỉ số nước thì gửi số đã gõ thay cho số cảm biến', async ({ page, api }) => {
  api.post(LOGS, (call) => reply(201, careLog({ id: 52, logDate: BUSINESS_DATE, ...(call.body as ProductionLogRequest) })))
  await page.goto(URL)
  await page.getByRole('button', { name: 'Ghi nhật ký hôm nay' }).click()
  const dialog = careDialog(page)
  await dialog.getByLabel('Thức ăn đã cho').fill('4')
  await dialog.getByLabel('pH').fill('7,6')
  // Đã sửa tay một ô thì không còn ghi là số của cảm biến.
  await expect(dialog.getByText(/lấy từ cảm biến/)).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Ghi nhật ký' }).click()
  await expect(dialog).toHaveCount(0)
  const body: ProductionLogRequest = { feedKg: 4, ph: 7.6, waterTempC: 28.6, salinityPpt: 20.3, note: null }
  expect(api.sent('POST', LOGS).map((c) => c.body)).toEqual([body])
})

test('máy chủ báo đã có nhật ký hôm nay: lỗi hiện trong hộp thoại, số đã nhập còn nguyên', async ({ page, api }) => {
  api.post(LOGS, () => reply(409, { status: 409, code: 'production.log_exists', detail: 'Lô đã có nhật ký ghi tay cho ngày hôm nay.' }))
  await page.goto(URL)
  await page.getByRole('button', { name: 'Ghi nhật ký hôm nay' }).click()
  const dialog = careDialog(page)
  await dialog.getByLabel('Thức ăn đã cho').fill('3,5')
  await dialog.getByRole('button', { name: 'Ghi nhật ký' }).click()
  await expect(dialog.getByText('Lô đã có nhật ký ghi tay cho ngày hôm nay.')).toBeVisible()
  await expect(dialog.getByLabel('Thức ăn đã cho')).toHaveValue('3,5')
  await expect(dialog.getByLabel('Độ mặn')).toHaveValue('20,3')
  await dialog.getByRole('button', { name: 'Đóng' }).last().click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ghi nhật ký hôm nay' })).toBeVisible()
})

test('đã có bản ghi tay hôm nay hoặc Lô chưa được ghi thì không có nút ghi', async ({ page, api }) => {
  api.get(LOGS, paged([careLog({ id: 52, logDate: BUSINESS_DATE, note: null }), ...careLogs], 20))
  await page.goto(URL)
  await expect(page.getByText('Hôm nay đã ghi')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ghi nhật ký hôm nay' })).toHaveCount(0)

  const closed: ProductionThresholdState = { ...thresholdState, canRecord: false }
  api.get(THRESHOLDS, closed)
  await page.reload()
  await expect(page.getByText('Thay 30% nước dàn 1')).toBeVisible()
  await expect(page.getByText('Hôm nay đã ghi')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ghi nhật ký hôm nay' })).toHaveCount(0)
})

test('Lô chưa có nhật ký thì hiện một dòng trống, vẫn ghi được', async ({ page, api }) => {
  api.get(LOGS, paged([], 20))
  await page.goto(URL)
  await expect(page.getByText('Lô chưa có nhật ký chăm sóc')).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ghi nhật ký hôm nay' })).toBeVisible()
})

test('lọc theo ngày và chuyển trang đều do máy chủ làm', async ({ page, api }) => {
  api.get(LOGS, (call) => {
    const pageNo = Number(call.query.page)
    const items = call.query.from ? [careLog({ id: 30 + pageNo, logDate: dateFromNow(-10 * pageNo), note: `Trang ${pageNo} đã lọc` })] : careLogs
    return { items, page: pageNo, pageSize: 20, total: call.query.from ? 21 : careLogs.length }
  })
  await page.goto(URL)
  await more(page, 'Lọc theo ngày').click()
  await page.getByLabel('Từ ngày').fill(dateFromNow(-30))
  await page.getByLabel('Đến ngày').fill(dateFromNow(-5))
  await expect(page.getByText('Trang 1 đã lọc')).toBeVisible()
  await expect(page.getByText('1–20 trong 21 bản ghi')).toBeVisible()
  // Đang lọc thì không coi là "hôm nay đã ghi" hay chưa: nút ghi vẫn còn.
  await expect(page.getByRole('button', { name: 'Ghi nhật ký hôm nay' })).toBeVisible()

  await page.getByRole('button', { name: 'Trang sau' }).click()
  await expect(page.getByText('Trang 2 đã lọc')).toBeVisible()
  expect(api.sent('GET', LOGS).at(-1)!.query).toEqual({ from: dateFromNow(-30), to: dateFromNow(-5), page: '2', pageSize: '20' })

  await page.getByRole('button', { name: 'Bỏ lọc' }).click()
  await expect(page.getByText('Thay 30% nước dàn 1')).toBeVisible()
  await expect(page.getByLabel('Từ ngày')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Trang sau' })).toHaveCount(0)
})

test('nhật trình gộp nhật ký và sự kiện từng con theo ngày, đổi số ngày thì hỏi lại máy chủ', async ({ page, api }) => {
  await page.goto(URL)
  await page.getByRole('tab', { name: 'Nhật trình' }).click()
  const feed = panel(page, 'Nhật trình của Lô')
  await expect(feed.getByText(vnDay(dateFromNow(-1)))).toBeVisible()
  await expect(feed.getByText('Thức ăn 3,5 kg · pH 8,1 · 28,5 °C · 20 ‰ · Thay 30% nước dàn 1')).toBeVisible()
  await expect(feed.getByText('Lột xác · C-000117')).toBeVisible()
  await expect(feed.getByText(/hộp 0117$/)).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)

  await feed.getByLabel('Số ngày hiển thị').selectOption('30')
  await expect.poll(() => api.sent('GET', `/api/batches/${CODE}/timeline`).map((c) => c.query)).toEqual([{ days: '7' }, { days: '30' }])

  await page.getByRole('tab', { name: 'Nhật ký chăm sóc' }).click()
  await expect(page.getByRole('table')).toBeVisible()
})

test.describe('khoảng chỉ số nước để đối chiếu', () => {
  const body = (extra: Partial<ProductionThresholdRequest> = {}): ProductionThresholdRequest => ({
    expectedVersionNo: thresholds.versionNo, phMin: 7.5, phMax: 8.5, waterTempMinC: 26, waterTempMaxC: 31, salinityMinPpt: 15, salinityMaxPpt: 25, ...extra,
  })

  test('chủ hộ sửa khoảng và lưu thành phiên bản mới', async ({ page, api }) => {
    let state = thresholdState
    api.get(THRESHOLDS, () => state)
    api.put(THRESHOLDS, (call) => {
      const sent = call.body as ProductionThresholdRequest
      state = { ...thresholdState, current: { ...thresholds, id: 5, versionNo: 3, phMax: sent.phMax! } }
      return state.current
    })
    await page.goto(URL)
    await more(page, 'Khoảng chỉ số nước để đối chiếu').click()
    await expect(page.getByLabel('pH từ')).toHaveValue('7,5')
    await expect(page.getByLabel('Nhiệt độ đến')).toHaveValue('31')
    await expect(page.getByLabel('Độ mặn từ')).toHaveValue('15')

    // Số "từ" lớn hơn số "đến" thì chưa lưu được.
    await page.getByLabel('pH đến').fill('7')
    await expect(page.getByText('Số “từ” phải nhỏ hơn số “đến”')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Lưu khoảng' })).toBeDisabled()

    await page.getByLabel('pH đến').fill('8,8')
    await page.getByRole('button', { name: 'Lưu khoảng' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Đã lưu khoảng chỉ số nước.' })).toBeVisible()
    expect(api.sent('PUT', THRESHOLDS).map((c) => c.body)).toEqual([body({ phMax: 8.8 })])
    await expect(page.getByLabel('pH đến')).toHaveValue('8,8')
  })

  test('Lô chưa đặt khoảng: sáu ô trống, lưu lần đầu gửi phiên bản 0', async ({ page, api }) => {
    const blank: ProductionThresholdState = { ...thresholdState, current: null }
    api.get(THRESHOLDS, blank)
    api.put(THRESHOLDS, { ...thresholds, versionNo: 1 })
    await page.goto(URL)
    await more(page, 'Đặt khoảng chỉ số nước để đối chiếu').click()
    const save = page.getByRole('button', { name: 'Lưu khoảng' })
    for (const [label, value] of [['pH từ', '7,5'], ['pH đến', '8,5'], ['Nhiệt độ từ', '26'], ['Nhiệt độ đến', '31'], ['Độ mặn từ', '15'], ['Độ mặn đến', '25']]) {
      await expect(page.getByLabel(label)).toHaveValue('')
      await expect(save).toBeDisabled()
      await page.getByLabel(label).fill(value)
    }
    await save.click()
    await expect(page.getByRole('status').filter({ hasText: 'Đã lưu khoảng chỉ số nước.' })).toBeVisible()
    expect(api.sent('PUT', THRESHOLDS).map((c) => c.body)).toEqual([body({ expectedVersionNo: 0 })])
  })

  test('người khác vừa đổi khoảng: báo lỗi của máy chủ, số đang sửa còn nguyên', async ({ page, api }) => {
    api.put(THRESHOLDS, () => reply(409, { status: 409, code: 'production.thresholds_changed', detail: 'Khoảng chỉ số đã được người khác cập nhật.' }))
    await page.goto(URL)
    await more(page, 'Khoảng chỉ số nước để đối chiếu').click()
    await page.getByLabel('Độ mặn đến').fill('28')
    await page.getByRole('button', { name: 'Lưu khoảng' }).click()
    await expect(page.getByText('Khoảng chỉ số đã được người khác cập nhật.')).toBeVisible()
    await expect(page.getByLabel('Độ mặn đến')).toHaveValue('28')
    await expect(page.getByRole('button', { name: 'Lưu khoảng' })).toBeEnabled()
  })

  test('nhân viên chỉ xem được khoảng, không sửa và không có nút lưu', async ({ page, api }) => {
    const readOnly: ProductionThresholdState = { ...thresholdState, canConfigure: false }
    api.get(THRESHOLDS, readOnly)
    await page.goto(URL)
    await more(page, 'Khoảng chỉ số nước để đối chiếu').click()
    await expect(page.getByLabel('pH từ')).toHaveValue('7,5')
    await expect(page.getByLabel('pH từ')).toBeDisabled()
    await expect(page.getByLabel('Độ mặn đến')).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Lưu khoảng' })).toHaveCount(0)
  })
})
