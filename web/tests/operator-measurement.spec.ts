/* Mục "Thu hoạch và phân hạng" của một Lô (/operator/batches/:code/thu-hoach): bốn số phân hạng, bảng kết quả từng con,
   bắt đầu thu hoạch, mở lượt đo ở trạm hoặc đo tay, các trạng thái của một lượt đo, nhập số đo tay và huỷ lượt đo. */
import type { BatchResponse, MeasurementValuesRequest, OpenSessionRequest, SessionMeasurementsResponse } from '../src/shared/api/api.gen'
import { expect, reply, signIn, test, type Page } from './support/app'
import {
  CODE, SESSION_NO, batch, batchOf, batchTabs, crabOf, decisionOf, decisions, deviceOf, fact, grading, measuredSession, measurementsOf, mockOperator, noDevReload, more, panel, sessionOf,
} from './support/operator'

const URL = `/operator/batches/${CODE}/thu-hoach`
const SESSIONS = '/api/measurement-sessions'
const SESSION = `${SESSIONS}/${SESSION_NO}`

/** Chọn một con trong ô "Con cua cần đo". */
const pickCrab = (page: Page, crabCode: string) => page.getByLabel(/^Con cua cần đo/).selectOption(crabCode)

/** Lượt đo của con C-000103 đã có số đo và đề xuất phân hạng. */
const measured: SessionMeasurementsResponse = {
  ...measuredSession,
  session: { ...measuredSession.session, sessionNo: SESSION_NO, crabCode: 'C-000103' },
  decision: decisionOf({ decisionNo: 'GD-2611-0140', crabCode: 'C-000103', sessionNo: SESSION_NO }),
}

test.beforeEach(async ({ page, api }) => {
  mockOperator(api)
  await noDevReload(page)
  await signIn(page, 'OperatorMember')
})

test('bốn số phân hạng và bảng kết quả từng con, lọc theo trạng thái', async ({ page, api }) => {
  await page.goto(URL)
  await expect(fact(page, 'Chờ đo')).toHaveText(String(grading.notMeasured))
  await expect(fact(page, 'Chờ kiểm phẩm duyệt')).toHaveText(String(grading.draft + grading.hold))
  await expect(fact(page, 'Đã duyệt hạng')).toHaveText(String(grading.approved))
  await expect(fact(page, 'Loại bỏ')).toHaveText(String(grading.rejected))

  const results = panel(page, 'Kết quả từng con')
  const row = (crabCode: string) => results.getByRole('row').filter({ hasText: crabCode })
  await expect(row('C-000101').getByRole('cell')).toHaveText([/C-000101.*452 g · mai 9,4 cm/, 'Size L · Cấp 1', '—', 'Đề xuất, chờ duyệt'])
  await expect(row('C-000102').getByRole('cell')).toHaveText([/C-000102.*398 g/, /Size M.*Cần đo thước kẹp/, '—', 'Giữ lại kiểm thêm'])
  await expect(row('C-000090').getByRole('cell')).toHaveText([/C-000090/, 'Size XL · Đặc cấp', 'Size XL · Đặc cấp', 'Đã duyệt hạng'])
  await expect(row('C-000091').getByRole('cell').last()).toHaveText(/Loại bỏ.*Cua yếu, gãy càng/)

  const filter = page.getByRole('tablist', { name: 'Lọc kết quả' })
  await expect(filter.getByRole('tab')).toHaveText(['Tất cả4', 'Chờ duyệt1', 'Giữ lại1', 'Đã duyệt1', 'Loại bỏ1'])
  await filter.getByRole('tab', { name: /^Giữ lại/ }).click()
  await expect(row('C-000102')).toBeVisible()
  await expect(results.getByRole('row').filter({ hasText: /C-0000(90|91)|C-000101/ })).toHaveCount(0)

  await filter.getByRole('tab', { name: /^Tất cả/ }).click()
  await more(results, 'Đã duyệt theo quy cách').click()
  await expect(results.getByRole('row').filter({ hasText: 'RC-XL-SP' }).getByRole('cell')).toHaveText(['RC-XL-SP', 'Size XL · Đặc cấp', '23'])
  await expect(results.getByRole('row').filter({ hasText: 'Dưới chuẩn' }).first()).toContainText('3')

  // Lô có lưu nuôi chỉ đo cua đang ở hộp; người nuôi chỉ đo và xem nên trang không ghi gì.
  expect(api.sent('GET', `/api/batches/${CODE}/crab-units`).map((c) => c.query)).toEqual([{ status: 'Holding' }])
  expect(api.writes()).toEqual([])
})

test('ô chọn cua xếp con chưa đo lên trước và ghi rõ con đã đo', async ({ page }) => {
  await page.goto(URL)
  const select = page.getByLabel('Con cua cần đo (còn 2 con chưa đo)')
  await expect(select.locator('option')).toHaveText(['Chọn mã cua', 'C-000103 · hộp 0103', 'C-000104 · hộp 0104', 'C-000101 · hộp 0101 · đã đo', 'C-000102 · hộp 0102 · đã đo'])
  // Chưa chọn cua thì chưa mở được lượt đo.
  await expect(page.getByRole('button', { name: 'Mở lượt đo ở trạm ST-01' })).toBeDisabled()
})

test('mở lượt đo ở trạm: chờ đặt cua, trạm gửi bản tin, xử lý lại rồi có đề xuất phân hạng', async ({ page, api }) => {
  let state = measurementsOf(sessionOf())
  api.post(SESSIONS, () => reply(201, state.session))
  api.get(`${SESSION}/measurements`, () => state)
  api.post(`${SESSION}/process`, () => (state = measured))
  await page.clock.install()
  await page.goto(URL)

  await pickCrab(page, 'C-000103')
  await page.getByRole('button', { name: 'Mở lượt đo ở trạm ST-01' }).click()
  const open: OpenSessionRequest = { crabCode: 'C-000103', procedure: 'Station', stationCode: 'ST-01' }
  await expect.poll(() => api.sent('POST', SESSIONS).map((c) => c.body)).toEqual([open])
  await expect(page).toHaveURL(new RegExp(`${URL}\\?luot=${SESSION_NO}$`))

  // 1. Vừa mở: chờ người nuôi đặt cua lên trạm.
  const session = panel(page, 'Cua C-000103')
  await expect(session.getByText('Chờ đặt cua vào trạm')).toBeVisible()
  await expect(session.getByRole('listitem')).toHaveText([/Đã mở lượt đo/, /Đặt cua lên trạm ST-01/, /Trạm cân và chụp ảnh, hệ thống xử lý/])
  await expect(session.getByRole('button', { name: 'Huỷ lượt đo' })).toBeVisible()
  await expect(session.getByRole('button', { name: 'Xử lý lại' })).toHaveCount(0)
  // Form mở lượt đo vẫn còn để đo con kế tiếp, ô chọn đã về trống.
  await expect(page.getByRole('heading', { name: 'Đo con tiếp theo' })).toBeVisible()
  await expect(page.getByLabel(/^Con cua cần đo/)).toHaveValue('')

  // 2. Trang tự hỏi lại sau 4 giây: trạm đã gửi bản tin nhưng chưa có số đo.
  state = measurementsOf(sessionOf({ status: 'Received', receivedAt: new Date().toISOString(), weightG: 452, hasWhiteImage: true }))
  await page.clock.fastForward(4_000)
  await expect(session.getByText('Đã nhận bản tin')).toBeVisible()
  await expect(session.getByRole('button', { name: 'Huỷ lượt đo' })).toHaveCount(0)
  await expect(session.getByRole('img', { name: 'Ảnh đèn trắng của C-000103' })).toBeVisible()

  // 3. Xử lý lại thì có số đo và đề xuất phân hạng.
  await session.getByRole('button', { name: 'Xử lý lại' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã xử lý lại lượt đo.' })).toBeVisible()
  expect(api.sent('POST', `${SESSION}/process`).map((c) => c.body)).toEqual([null])
  await expect(session.getByText('Đã có số đo')).toBeVisible()
  await expect(session.locator('.op-big')).toHaveText('Size L · Cấp 1 452 g')
  await expect(session.getByText('Đề xuất, chờ duyệt')).toBeVisible()
  await expect(session.getByRole('img', { name: 'Ảnh soi đỏ của C-000103' })).toBeVisible()
  await expect(session.getByRole('button', { name: 'Xử lý lại' })).toHaveCount(0)

  // Số đo chi tiết và kết quả AI nằm trong khối gấp.
  await more(session, 'Số đo chi tiết').click()
  await expect(session.getByRole('row').filter({ hasText: 'Khối lượng' }).getByRole('cell')).toHaveText(['Khối lượng', '452 g', 'Cân của trạm'])
  await expect(session.getByRole('row').filter({ hasText: 'Dài mai' }).getByRole('cell')).toHaveText(['Dài mai', '9,4 cm', /AI đọc ảnh.*Độ tin cậy 0,93/])
  await expect(session.getByText('AI đọc ảnh đèn trắng')).toBeVisible()
  await expect(session.getByText('Số giả lập')).toBeVisible()
  await expect(session.getByText('AI đọc được')).toBeVisible()

  // Đóng thẻ lượt đo thì đường dẫn bỏ mã lượt đo.
  await session.getByRole('button', { name: 'Đóng' }).click()
  await expect(page).toHaveURL(new RegExp(`${URL}$`))
  await expect(session).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Đo cua' })).toBeVisible()
})

test('huỷ lượt đo đang chờ đặt cua', async ({ page, api }) => {
  let state = measurementsOf(sessionOf())
  api.get(`${SESSION}/measurements`, () => state)
  api.post(`${SESSION}/cancel`, () => {
    state = measurementsOf(sessionOf({ status: 'Cancelled' }))
    return state.session
  })
  await page.goto(`${URL}?luot=${SESSION_NO}`)
  const session = panel(page, 'Cua C-000103')
  await session.getByRole('button', { name: 'Huỷ lượt đo' }).click()
  const dialog = page.getByRole('dialog', { name: 'Huỷ lượt đo' })
  await expect(dialog.getByText('Cua C-000103')).toBeVisible()
  await dialog.getByRole('button', { name: 'Huỷ lượt đo' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã huỷ lượt đo.' })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  expect(api.sent('POST', `${SESSION}/cancel`).map((c) => c.body)).toEqual([null])
  await expect(session.getByText('Đã huỷ', { exact: true })).toBeVisible()
  await expect(session.getByRole('listitem')).toHaveCount(0)
  await expect(session.getByRole('button', { name: 'Huỷ lượt đo' })).toHaveCount(0)
})

test('trạm đã gửi bản tin thì máy chủ không cho huỷ: lỗi hiện trong hộp thoại', async ({ page, api }) => {
  api.get(`${SESSION}/measurements`, measurementsOf(sessionOf()))
  api.post(`${SESSION}/cancel`, () => reply(409, { status: 409, detail: 'Lượt đo đã nhận bản tin của trạm nên không huỷ được (BR-224).' }))
  await page.goto(`${URL}?luot=${SESSION_NO}`)
  await panel(page, 'Cua C-000103').getByRole('button', { name: 'Huỷ lượt đo' }).click()
  const dialog = page.getByRole('dialog', { name: 'Huỷ lượt đo' })
  await dialog.getByRole('button', { name: 'Huỷ lượt đo' }).click()
  await expect(dialog.getByText('Lượt đo đã nhận bản tin của trạm nên không huỷ được.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Đóng' }).last().click()
  await expect(panel(page, 'Cua C-000103').getByText('Chờ đặt cua vào trạm')).toBeVisible()
})

test('trại chưa có trạm đo: mở lượt đo tay rồi nhập cân và thước kẹp', async ({ page, api }) => {
  let state = measurementsOf(sessionOf({ procedure: 'Manual', stationCode: null }))
  api.get('/api/operators/me/devices', [deviceOf({ deviceCode: 'WS-01', deviceType: 'WaterSensor' }), deviceOf({ deviceCode: 'ST-00', status: 'Removed' })])
  api.post(SESSIONS, () => reply(201, state.session))
  api.get(`${SESSION}/measurements`, () => state)
  api.post(`${SESSION}/values`, () => {
    state = {
      ...measured,
      session: sessionOf({ procedure: 'Manual', stationCode: null, status: 'Measured', weightG: 452 }),
      values: [
        { metric: 'WeightG', value: 452, unit: 'g', method: 'ManualScale', confidence: null, verificationStatus: 'Unverified', recordedAt: new Date().toISOString() },
        { metric: 'CarapaceLengthCm', value: 9.4, unit: 'cm', method: 'Caliper', confidence: null, verificationStatus: 'Unverified', recordedAt: new Date().toISOString() },
      ],
      inferences: [],
    }
    return state
  })
  await page.goto(URL)
  await expect(page.getByText('Chưa có trạm đo, sẽ đo tay')).toBeVisible()
  await pickCrab(page, 'C-000103')
  await page.getByRole('button', { name: 'Mở lượt đo tay' }).click()
  const open: OpenSessionRequest = { crabCode: 'C-000103', procedure: 'Manual', stationCode: null }
  await expect.poll(() => api.sent('POST', SESSIONS).map((c) => c.body)).toEqual([open])

  const session = panel(page, 'Cua C-000103')
  await expect(session.getByRole('listitem')).toHaveText([/Đã mở lượt đo/, /Cân tay, đo mai rồi nhập số đo bên dưới/])
  const save = session.getByRole('button', { name: 'Ghi số đo' })
  // Lượt đo tay cần khối lượng trước.
  await session.getByLabel('Chiều dài mai').fill('9,4')
  await expect(save).toBeDisabled()
  await session.getByLabel('Khối lượng cân tay').fill('452')
  // Cua gạch có ô dải mép ngay cạnh; chiều rộng mai nằm trong "Tuỳ chọn thêm".
  await session.getByLabel('Dải mép khi soi đỏ').fill('3,2')
  await more(session, 'Tuỳ chọn thêm').click()
  await session.getByLabel('Chiều rộng mai').fill('12,8')
  await save.click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã ghi số đo.' })).toBeVisible()
  const values: MeasurementValuesRequest = { weightG: 452, carapaceLengthCm: 9.4, carapaceWidthCm: 12.8, edgeBandMm: 3.2 }
  expect(api.sent('POST', `${SESSION}/values`).map((c) => c.body)).toEqual([values])
  await expect(session.locator('.op-big')).toHaveText('Size L · Cấp 1 452 g')
  // Lượt đo tay đã có số đo vẫn sửa lại được, form nằm trong khối gấp.
  await expect(more(session, 'Sửa số đo tay')).toBeVisible()
  await more(session, 'Số đo chi tiết').click()
  await expect(session.getByText('Đo tay', { exact: true })).toBeVisible()
  await expect(session.getByRole('row').filter({ hasText: 'Khối lượng' })).toContainText('Cân tay')
})

test('có trạm vẫn chọn được đo tay hoặc đổi sang trạm khác', async ({ page, api }) => {
  api.get('/api/operators/me/devices', [deviceOf(), deviceOf({ deviceCode: 'ST-02', status: 'Offline' })])
  api.post(SESSIONS, (call) => {
    const body = call.body as OpenSessionRequest
    return reply(201, sessionOf({ procedure: body.procedure, stationCode: body.stationCode ?? null }))
  })
  api.get(`${SESSION}/measurements`, () => {
    const body = api.sent('POST', SESSIONS).at(-1)!.body as OpenSessionRequest
    return measurementsOf(sessionOf({ procedure: body.procedure, stationCode: body.stationCode ?? null }))
  })
  await page.goto(URL)
  const form = panel(page, 'Đo cua')
  await pickCrab(page, 'C-000104')
  await more(form, 'Tuỳ chọn thêm').click()
  await expect(form.getByLabel('Trạm đo').locator('option')).toHaveText(['ST-01 · Đang hoạt động', 'ST-02 · Mất kết nối'])
  await form.getByLabel('Trạm đo').selectOption('ST-02')
  await form.getByRole('button', { name: 'Mở lượt đo ở trạm ST-02' }).click()
  await expect(panel(page, 'Cua C-000103').getByText('Đặt cua lên trạm ST-02')).toBeVisible()

  await pickCrab(page, 'C-000104')
  await page.getByLabel('Đo tay bằng cân và thước kẹp').check()
  // Đo tay thì không còn chọn trạm.
  await expect(page.getByLabel('Trạm đo')).toHaveCount(0)
  await page.getByRole('button', { name: 'Mở lượt đo tay' }).click()
  await expect(panel(page, 'Cua C-000103').getByText('Cân tay, đo mai rồi nhập số đo bên dưới')).toBeVisible()

  const sent: OpenSessionRequest[] = [
    { crabCode: 'C-000104', procedure: 'Station', stationCode: 'ST-02' },
    { crabCode: 'C-000104', procedure: 'Manual', stationCode: null },
  ]
  expect(api.sent('POST', SESSIONS).map((c) => c.body)).toEqual(sent)
})

test('đề xuất bị giữ vì cần thước kẹp: bấm dòng để mở lượt đo, ô thước kẹp mở sẵn', async ({ page, api }) => {
  const held = decisions[1]
  const station = sessionOf({ sessionNo: held.sessionNo, crabCode: held.crabCode, status: 'Measured', weightG: 398, hasWhiteImage: true })
  let state = measurementsOf(station, {
    values: [{ metric: 'WeightG', value: 398, unit: 'g', method: 'Scale', confidence: null, verificationStatus: 'Verified', recordedAt: new Date().toISOString() }],
    decision: held,
  })
  const path = `${SESSIONS}/${held.sessionNo}`
  api.get(`${path}/measurements`, () => state)
  api.post(`${path}/values`, () => {
    state = { ...state, values: [...state.values, { metric: 'CarapaceLengthCm', value: 8.7, unit: 'cm', method: 'Caliper', confidence: null, verificationStatus: 'Unverified', recordedAt: new Date().toISOString() }], decision: { ...held, status: 'Draft', holdReasons: [], proposedGrade: 'G1' } }
    return state
  })
  await page.goto(URL)
  await panel(page, 'Kết quả từng con').getByRole('row').filter({ hasText: held.crabCode }).click()
  await expect(page).toHaveURL(new RegExp(`\\?luot=${held.sessionNo}$`))

  const session = panel(page, `Cua ${held.crabCode}`)
  await expect(session.locator('.op-big')).toHaveText('Size M 398 g')
  await expect(session.getByText('Giữ lại kiểm thêm')).toBeVisible()
  await expect(session.getByText('Cần đo thước kẹp')).toBeVisible()
  // Lượt đo bằng trạm chỉ bổ sung số thước kẹp, không có ô cân tay.
  await expect(session.getByLabel('Chiều dài mai')).toBeVisible()
  await expect(session.getByLabel('Khối lượng cân tay')).toHaveCount(0)
  await session.getByLabel('Chiều dài mai').fill('8,7')
  await session.getByLabel('Dải mép khi soi đỏ').fill('2,9')
  await session.getByRole('button', { name: 'Ghi số đo' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã ghi số đo.' })).toBeVisible()
  const values: MeasurementValuesRequest = { weightG: null, carapaceLengthCm: 8.7, carapaceWidthCm: null, edgeBandMm: 2.9 }
  expect(api.sent('POST', `${path}/values`).map((c) => c.body)).toEqual([values])
  await expect(session.locator('.op-big')).toHaveText('Size M · Cấp 1 398 g')
  await expect(session.getByText('Cần đo thước kẹp')).toHaveCount(0)
})

test('lượt đo lỗi ghi rõ lý do và không còn nút huỷ', async ({ page, api }) => {
  api.get(`${SESSION}/measurements`, measurementsOf(sessionOf({ status: 'Failed', failReason: 'Trạm không cân được: tải trọng dao động.' })))
  await page.goto(`${URL}?luot=${SESSION_NO}`)
  const session = panel(page, 'Cua C-000103')
  await expect(session.getByText('Đo lỗi', { exact: true })).toBeVisible()
  await expect(session.getByRole('listitem')).toHaveText([/Lượt đo lỗi, mở lượt đo mới.*Trạm không cân được: tải trọng dao động\./])
  await expect(session.getByRole('button', { name: 'Huỷ lượt đo' })).toHaveCount(0)
  await expect(session.getByRole('button', { name: 'Ghi số đo' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Đo con tiếp theo' })).toBeVisible()
})

test('máy chủ không cho mở lượt đo thì báo lỗi ở góc và không mở thẻ lượt đo', async ({ page, api }) => {
  api.post(SESSIONS, () => reply(409, { status: 409, detail: 'Con cua này đang có một lượt đo chưa xong.' }))
  await page.goto(URL)
  await pickCrab(page, 'C-000103')
  await page.getByRole('button', { name: 'Mở lượt đo ở trạm ST-01' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Con cua này đang có một lượt đo chưa xong.' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${URL}$`))
  await expect(page.getByLabel(/^Con cua cần đo/)).toHaveValue('C-000103')
})

test('Lô đang lưu nuôi: bắt đầu thu hoạch rồi mới đo được', async ({ page, api }) => {
  let current: BatchResponse = batchOf({ status: 'InProduction' })
  api.get(`/api/operators/me/batches/${CODE}`, () => current)
  api.post(`/api/batches/${CODE}/start-harvest`, () => {
    current = batch
    return { status: 'Harvesting' }
  })
  await page.goto(URL)
  await expect(page.getByRole('heading', { name: 'Đo cua' })).toHaveCount(0)
  expect(api.sent('GET', /crab-units$/)).toEqual([])

  await page.getByRole('button', { name: 'Bắt đầu thu hoạch' }).click()
  const dialog = page.getByRole('dialog', { name: 'Bắt đầu thu hoạch' })
  await expect(dialog.getByText(`Lô ${CODE}`)).toBeVisible()
  await expect(dialog.getByText('Lô chuyển sang đang thu hoạch và không quay lại được.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Bắt đầu thu hoạch' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã bắt đầu thu hoạch.' })).toBeVisible()
  expect(api.sent('POST', `/api/batches/${CODE}/start-harvest`).map((c) => c.body)).toEqual([null])
  await expect(page.locator('.op-heading').getByText('Đang thu hoạch')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Đo cua' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bắt đầu thu hoạch' })).toHaveCount(0)
  // Lô sang thu hoạch thì có thêm mục bán có hoá đơn.
  await expect(batchTabs(page).getByRole('link', { name: 'Bán có hoá đơn' })).toBeVisible()
})

test('chưa đủ điều kiện thu hoạch: lỗi của máy chủ hiện trong hộp thoại', async ({ page, api }) => {
  api.get(`/api/operators/me/batches/${CODE}`, batchOf({ status: 'InProduction' }))
  api.post(`/api/batches/${CODE}/start-harvest`, () => reply(422, { status: 422, detail: 'Lô còn cảnh báo chưa xử lý nên chưa thu hoạch được.' }))
  await page.goto(URL)
  await page.getByRole('button', { name: 'Bắt đầu thu hoạch' }).click()
  const dialog = page.getByRole('dialog', { name: 'Bắt đầu thu hoạch' })
  await dialog.getByRole('button', { name: 'Bắt đầu thu hoạch' }).click()
  await expect(dialog.getByText('Lô còn cảnh báo chưa xử lý nên chưa thu hoạch được.')).toBeVisible()
  await expect(page.locator('.op-heading').getByText('Đang lưu nuôi')).toBeVisible()
})

test('Lô không lưu nuôi đo ngay sau khi nhận cua, không có bước bắt đầu thu hoạch', async ({ page, api }) => {
  api.get(`/api/operators/me/batches/${CODE}`, batchOf({ batchMode: 'T', status: 'Sourcing', hasHolding: false, holdingDays: null }))
  api.get(`/api/batches/${CODE}/crab-units`, [crabOf('C-000301', null, { inventoryStatus: 'Received' })])
  api.get(`/api/batches/${CODE}/grade-decisions`, [])
  await page.goto(URL)
  await expect(page.getByRole('heading', { name: 'Đo cua' })).toBeVisible()
  await expect(page.getByLabel('Con cua cần đo (còn 1 con chưa đo)').locator('option')).toHaveText(['Chọn mã cua', 'C-000301'])
  await expect(page.getByRole('button', { name: 'Bắt đầu thu hoạch' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Kết quả từng con' })).toHaveCount(0)
  expect(api.sent('GET', `/api/batches/${CODE}/crab-units`).map((c) => c.query)).toEqual([{ status: 'Received' }])
})

test('Lô đã đóng mà chưa đo con nào thì chỉ có một dòng trống', async ({ page, api }) => {
  api.get(`/api/operators/me/batches/${CODE}`, batchOf({ status: 'Closed' }))
  api.get(`/api/batches/${CODE}/grade-decisions`, [])
  api.get(`/api/batches/${CODE}/grading`, { ...grading, received: 0, notMeasured: 0, draft: 0, hold: 0, approved: 0, rejected: 0, substandard: 0, bySpec: [] })
  await page.goto(URL)
  await expect(page.getByText('Lô chưa có con cua nào được đo')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Đo cua' })).toHaveCount(0)
  await expect(page.locator('dl.op-facts')).toHaveCount(0)
})
