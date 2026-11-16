/* Kiểm đầu vào: /qc/kiem-dau-vao (phiếu nhận chờ tôi kiểm) và /qc/kiem-dau-vao/:receiptNo (kiểm từng con của một phiếu).
   Mỗi con: nhập khối lượng rồi ghi (POST /api/goods-receipts/{no}/inspections). Máy chủ kết luận; con đạt được cấp mã cua nội bộ,
   con không đạt hỏi lại một lần rồi mới ghi. Người kiểm được phân tự bấm hoàn tất phiếu (POST …/complete).
   Mã cua nội bộ chỉ là mã chữ để tra trong hệ thống, không có tem hay QR cho từng con. */
import type { GoodsReceiptResponse, IncomingInspectionRequest, InspectionResponse } from '../src/shared/api/api.gen'
import { expect, reply, signIn, test, type Api } from './support/app'
import {
  OTHER_QC, batchGrading, batchIncoming, crab, mockQc, noDevReload, order, pick, receipt, receiptDone, stockedCrabs, taskGrading, valueOf, vnDate,
} from './support/qc'

const PAGE = `/qc/kiem-dau-vao/${receipt.receiptNo}?lo=${batchIncoming.batchCode}`
const RECEIPT = `/api/goods-receipts/${receipt.receiptNo}`
const INSPECTIONS = `${RECEIPT}/inspections`

/** Bản ghi kiểm một con với mọi lựa chọn mặc định của trang cho Lô cua thịt. */
const inspection = (weightG: number, over: Partial<IncomingInspectionRequest> = {}): IncomingInspectionRequest => ({
  species: 'Scylla paramamosain', sex: 'Male', maturity: 'Mature', speciesOk: true, alive: true, healthy: true, twoClaws: true, foodSafe: true, weightG, note: null,
  ...over,
})

/**
 * Máy chủ giả cho một phiếu nhận. Kết luận từng con như backend: đủ năm điều kiện và đúng loại cua của Lô thì đạt, được cấp mã cua nội bộ
 * và vào tồn của Lô; ngược lại bị loại kèm lý do. Số đạt, số loại cộng dồn vào phiếu nên trang thấy tiến độ mới sau mỗi lần ghi.
 */
function liveReceipt(api: Api, start: GoodsReceiptResponse = receipt, crabType = batchIncoming.crabType) {
  const state = { receipt: { ...start }, crabs: [...stockedCrabs] }
  const codes = ['CU2X6B8M', 'CU3Y7C9N', 'CU4Z8D0P']
  api.get(RECEIPT, () => state.receipt)
  api.get(`/api/batches/${batchIncoming.batchCode}/crab-units`, () => state.crabs)
  api.post(INSPECTIONS, (call): InspectionResponse => {
    const req = call.body as IncomingInspectionRequest
    const weightG = req.weightG ?? 0
    const female = crabType === 'RoeCrab' || crabType === 'OilRoeCrab' || crabType === 'YoungFemaleCrab'
    const rightType = !female || (req.sex === 'Female' && req.maturity === (crabType === 'YoungFemaleCrab' ? 'Immature' : 'Mature'))
    const reasons = [
      !req.speciesOk && 'sai loài', !rightType && 'giới tính hoặc độ trưởng thành không đúng loại cua của Lô', !req.alive && 'chết', !req.healthy && 'yếu',
      !req.twoClaws && 'thiếu càng', !req.foodSafe && 'dấu hiệu mất an toàn thực phẩm',
    ].filter(Boolean)
    const inspectionNo = `QC5T8W2K0${state.receipt.acceptedCount + state.receipt.rejectedCount + 1}`
    if (reasons.length > 0) {
      state.receipt = { ...state.receipt, rejectedCount: state.receipt.rejectedCount + 1 }
      return { inspectionNo, conclusion: 'Rejected', rejectReason: `Không đạt: ${reasons.join(', ')}`, crabCode: null, weightG }
    }
    const crabCode = codes[state.crabs.length - stockedCrabs.length]
    state.crabs = [...state.crabs, crab({ crabCode, sex: req.sex, maturity: req.maturity, receivedWeightG: weightG, receivedAt: new Date().toISOString() })]
    state.receipt = { ...state.receipt, acceptedCount: state.receipt.acceptedCount + 1, acceptedWeightG: state.receipt.acceptedWeightG + Math.round(weightG) }
    return { inspectionNo, conclusion: 'Accepted', rejectReason: null, crabCode, weightG }
  })
  api.post(`${RECEIPT}/complete`, (): GoodsReceiptResponse => (state.receipt = { ...state.receipt, status: 'Completed', completedAt: new Date().toISOString() }))
  return state
}

const sentInspections = (api: Api) => api.sent('POST', INSPECTIONS).map((c) => c.body)

test.beforeEach(async ({ page, api }) => {
  await noDevReload(page)
  await signIn(page, 'QcInspector')
  mockQc(api)
})

/* ---------- danh sách phiếu chờ kiểm ---------- */

test('danh sách chỉ có phiếu nhận đang chờ tôi kiểm, bấm vào thì mở phiếu', async ({ page, api }) => {
  await page.goto('/qc/kiem-dau-vao')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Kiểm đầu vào', level: 1 })).toBeVisible()
  const row = main.getByRole('link', { name: new RegExp(receipt.receiptNo) })
  await expect(row).toContainText(`Lô ${batchIncoming.batchCode} · ${batchIncoming.title}`)
  await expect(row).toContainText('3 / 20 con')
  await expect(row).toContainText('Loại 1')
  // Phiếu người khác đã kiểm xong và việc của loại khác (buổi đo, thăm trại) không nằm ở đây.
  await expect(main.getByText(receiptDone.receiptNo)).toHaveCount(0)
  await expect(main.getByText(batchGrading.batchCode)).toHaveCount(0)
  expect(api.calls.filter((c) => c.path.endsWith('/grading'))).toEqual([])

  await row.click()
  await expect(page).toHaveURL((url) => url.pathname + url.search === PAGE)
  await expect(page.getByRole('heading', { name: receipt.receiptNo, level: 1 })).toBeVisible()
})

test('không có phiếu nào chờ kiểm thì chỉ hiện một câu', async ({ page, api }) => {
  api.get('/api/qc/tasks', [taskGrading])
  await page.goto('/qc/kiem-dau-vao')
  await expect(page.getByRole('main').getByText('Chưa có phiếu nhận nào chờ bạn kiểm')).toBeVisible()
  expect(api.calls.map((c) => c.path)).toEqual(['/api/qc/tasks'])
})

/* ---------- kiểm một phiếu ---------- */

test('phiếu đang kiểm hiện tiến độ, lô nguồn và các con đã đạt kèm mã cua nội bộ', async ({ page, api }) => {
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: receipt.receiptNo, level: 1 })).toBeVisible()
  await expect(main.getByText(`Lô ${batchIncoming.batchCode} · Cua thịt vỗ béo`)).toBeVisible()
  await expect(main.getByText('Đang kiểm đầu vào')).toBeVisible()
  await expect(main.getByText('Đã kiểm 3 / 20 con')).toBeVisible()
  await expect(main.getByText('Đạt 2 · Loại 1')).toBeVisible()
  await expect(main.getByRole('heading', { name: 'Con thứ 4', level: 2 })).toBeVisible()

  // Lô nguồn: nhà cung cấp lấy từ đơn mua nguồn của Lô, phần còn lại từ phiếu.
  const source = main.getByRole('complementary')
  await expect(valueOf(source, 'Nhà cung cấp')).toHaveText(order.supplierName)
  await expect(valueOf(source, 'Vùng xuất xứ')).toHaveText(receipt.originRegion)
  await expect(valueOf(source, 'Ngày thu')).toHaveText(vnDate(receipt.harvestedOn))
  await expect(valueOf(source, 'Khai báo')).toHaveText('20 con · 6,4 kg')
  await source.getByText('Chi tiết').click()
  await expect(valueOf(source, 'Quy cách thoả thuận')).toHaveText(order.agreedSpec)
  await expect(valueOf(source, 'Mã lô nguồn')).toHaveText(receipt.lotCode)
  await expect(valueOf(source, 'Đơn mua nguồn')).toHaveText(receipt.poNo)
  await expect(valueOf(source, 'Khối lượng cua đạt')).toHaveText('0,66 kg')

  // Cua đã đạt của đúng lô nguồn này, con nhận sau đứng trước; cua của phiếu trước không lẫn vào.
  await main.getByText('Cua đã đạt').click()
  const accepted = main.getByRole('group').filter({ hasText: 'Cua đã đạt' }).getByRole('listitem')
  await expect(accepted).toHaveText([/CU9H3W6P.*Đực · Trưởng thành.*323,5 g/, /CU4T7N2K.*Đực · Trưởng thành.*331,5 g/])
  await expect(main.getByText('CU1D5F8G')).toHaveCount(0)

  // Mã cua là mã chữ nội bộ: trang không có hình mã QR hay tem cho từng con.
  await expect(main.getByRole('img')).toHaveCount(0)
  await expect(main).not.toContainText(/QR|tem cua/i)
  expect(api.writes()).toEqual([])
})

test('con đạt: nhập khối lượng rồi ghi, máy chủ cấp mã cua nội bộ và trang sang con kế tiếp', async ({ page, api }) => {
  liveReceipt(api)
  await page.goto(PAGE)
  const main = page.getByRole('main')
  const weight = main.getByLabel('Khối lượng')
  const save = main.getByRole('button', { name: 'Ghi: đạt' })
  await expect(main.getByRole('heading', { name: 'Con thứ 4', level: 2 })).toBeVisible()
  await expect(weight).toBeFocused()
  await expect(save).toBeDisabled()

  await weight.fill('312,5')
  await save.click()
  // Kết luận của máy chủ hiện ngay: đạt, khối lượng và mã cua vừa cấp.
  await expect(main.getByText('Đạt · 312,5 g · CU2X6B8M')).toBeVisible()
  await expect(main.getByRole('heading', { name: 'Con thứ 5', level: 2 })).toBeVisible()
  await expect(main.getByText('Đã kiểm 4 / 20 con')).toBeVisible()
  await expect(main.getByText('Đạt 3 · Loại 1')).toBeVisible()
  // Ô khối lượng trống lại và giữ con trỏ để cân con sau.
  await expect(weight).toHaveValue('')
  await expect(weight).toBeFocused()

  // Con thứ hai là cua cái: chọn giới tính rồi bấm Enter ở ô khối lượng.
  await pick(main, 'Giới tính', 'Cái')
  await weight.fill('298')
  await weight.press('Enter')
  await expect(main.getByText('Đạt · 298 g · CU3Y7C9N')).toBeVisible()
  // Giới tính giữ nguyên cho con sau, không phải chọn lại.
  await expect(main.getByRole('radio', { name: 'Cái' })).toBeChecked()
  await weight.fill('305')
  await weight.press('Enter')
  await expect(main.getByText('Đạt · 305 g · CU4Z8D0P')).toBeVisible()
  await expect(main.getByRole('heading', { name: 'Con thứ 7', level: 2 })).toBeVisible()

  expect(sentInspections(api)).toEqual([inspection(312.5), inspection(298, { sex: 'Female' }), inspection(305, { sex: 'Female' })])
  expect(api.writes()).toEqual(Array(3).fill(`POST ${INSPECTIONS}`))

  // Ba con vừa đạt vào danh sách cua đã đạt của phiếu với mã cua nội bộ; vẫn không có QR cho từng con.
  await main.getByText('Cua đã đạt').click()
  const accepted = main.getByRole('group').filter({ hasText: 'Cua đã đạt' }).getByRole('listitem')
  await expect(accepted).toHaveCount(5)
  await expect(accepted.filter({ hasText: 'CU2X6B8M' })).toContainText('312,5 g')
  await expect(accepted.filter({ hasText: 'CU3Y7C9N' })).toContainText('Cái · Trưởng thành')
  await expect(main.getByRole('img')).toHaveCount(0)
})

test('tuỳ chọn thêm: loài, độ trưởng thành và ghi chú đi kèm bản ghi; ghi chú xoá sau khi ghi, loài thì giữ', async ({ page, api }) => {
  liveReceipt(api)
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await main.getByText('Tuỳ chọn thêm').click()
  await pick(main, 'Độ trưởng thành', 'Chưa trưởng thành')
  await main.getByLabel('Loài', { exact: true }).fill('  Scylla olivacea ')
  await main.getByLabel('Ghi chú').fill('Mai hơi mềm')
  await main.getByLabel('Khối lượng').fill('276')
  await main.getByRole('button', { name: 'Ghi: đạt' }).click()
  await expect(main.getByText('Đạt · 276 g · CU2X6B8M')).toBeVisible()
  expect(sentInspections(api)).toEqual([inspection(276, { species: 'Scylla olivacea', maturity: 'Immature', note: 'Mai hơi mềm' })])

  await expect(main.getByLabel('Ghi chú')).toHaveValue('')
  await expect(main.getByLabel('Loài', { exact: true })).toHaveValue('  Scylla olivacea ')
  await expect(main.getByRole('radio', { name: 'Chưa trưởng thành' })).toBeChecked()
  // Thiếu tên loài thì không ghi được.
  await main.getByLabel('Khối lượng').fill('280')
  await main.getByLabel('Loài', { exact: true }).fill(' ')
  await expect(main.getByRole('button', { name: 'Ghi: đạt' })).toBeDisabled()
})

test('con không đạt: bấm ô điều kiện thành không đạt, hỏi lại một lần rồi mới ghi loại, không cấp mã cua', async ({ page, api }) => {
  liveReceipt(api)
  await page.goto(PAGE)
  const main = page.getByRole('main')
  const checks = main.getByRole('group', { name: 'Điều kiện kiểm' })
  // Năm điều kiện mặc định đạt.
  for (const name of ['Đúng loài', 'Còn sống', 'Khoẻ', 'Đủ hai càng', 'An toàn']) await expect(checks.getByRole('checkbox', { name })).toBeChecked()

  await checks.getByText('Còn sống').click()
  await checks.getByText('Đủ hai càng').click()
  await expect(checks.getByRole('checkbox', { name: 'Đã chết' })).not.toBeChecked()
  await expect(checks.getByRole('checkbox', { name: 'Thiếu càng' })).not.toBeChecked()
  await main.getByLabel('Khối lượng').fill('289')
  await expect(main.getByRole('button', { name: 'Ghi: đạt' })).toHaveCount(0)

  // Bấm ghi chưa gửi gì: hộp xác nhận nêu lý do loại.
  await main.getByRole('button', { name: 'Ghi: loại' }).click()
  const dialog = page.getByRole('dialog', { name: 'Loại con cua này' })
  await expect(dialog).toContainText('Không đạt: đã chết, thiếu càng. Ghi rồi không sửa được.')
  expect(api.writes()).toEqual([])
  // Đóng hộp thì vẫn chưa ghi và các lựa chọn còn nguyên.
  await dialog.getByText('Đóng', { exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(api.writes()).toEqual([])
  await expect(checks.getByRole('checkbox', { name: 'Đã chết' })).not.toBeChecked()

  await main.getByRole('button', { name: 'Ghi: loại' }).click()
  await dialog.getByRole('button', { name: 'Ghi: loại' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(main.getByText('Loại · 289 g · Không đạt: chết, thiếu càng')).toBeVisible()
  expect(sentInspections(api)).toEqual([inspection(289, { alive: false, twoClaws: false })])

  // Con bị loại không vào tồn: không có mã cua, số loại của phiếu tăng, các ô điều kiện trở về đạt cho con sau.
  await expect(main.getByText('CU2X6B8M')).toHaveCount(0)
  await expect(main.getByText('Đạt 2 · Loại 2')).toBeVisible()
  await expect(main.getByRole('heading', { name: 'Con thứ 5', level: 2 })).toBeVisible()
  await expect(checks.getByRole('checkbox', { name: 'Còn sống' })).toBeChecked()
  await expect(checks.getByRole('checkbox', { name: 'Đủ hai càng' })).toBeChecked()
  await main.getByText('Vừa loại').click()
  const justRejected = main.getByRole('group').filter({ hasText: 'Vừa loại' }).getByRole('listitem')
  await expect(justRejected).toHaveText([/289 g.*Không đạt: chết, thiếu càng/])
})

test('Lô cua gạch: mặc định cua cái trưởng thành; chọn cua đực thì trang báo loại vì không đúng loại cua của Lô', async ({ page, api }) => {
  api.get(`/api/batches/${batchIncoming.batchCode}`, { ...batchIncoming, crabType: 'RoeCrab' })
  liveReceipt(api, receipt, 'RoeCrab')
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await expect(main.getByText(`Lô ${batchIncoming.batchCode} · Cua gạch`)).toBeVisible()
  await expect(main.getByRole('radio', { name: 'Cái' })).toBeChecked()

  await main.getByLabel('Khối lượng').fill('365')
  await main.getByRole('button', { name: 'Ghi: đạt' }).click()
  await expect(main.getByText('Đạt · 365 g · CU2X6B8M')).toBeVisible()

  await pick(main, 'Giới tính', 'Đực')
  await main.getByLabel('Khối lượng').fill('371')
  await main.getByRole('button', { name: 'Ghi: loại' }).click()
  const dialog = page.getByRole('dialog', { name: 'Loại con cua này' })
  await expect(dialog).toContainText('Không đạt: không đúng loại cua của Lô. Ghi rồi không sửa được.')
  await dialog.getByRole('button', { name: 'Ghi: loại' }).click()
  await expect(main.getByText('Loại · 371 g · Không đạt: giới tính hoặc độ trưởng thành không đúng loại cua của Lô')).toBeVisible()

  // Năm điều kiện vẫn đạt; máy chủ loại vì giới tính không khớp loại cua của Lô.
  expect(sentInspections(api)).toEqual([inspection(365, { sex: 'Female' }), inspection(371)])
})

test('khối lượng phải từ 1 đến 5.000 g mới ghi được', async ({ page, api }) => {
  await page.goto(PAGE)
  const main = page.getByRole('main')
  const weight = main.getByLabel('Khối lượng')
  const save = main.getByRole('button', { name: 'Ghi: đạt' })
  await expect(save).toBeDisabled()
  for (const typed of ['0', '0,5', '5001', 'abc']) {
    await weight.fill(typed)
    await expect(save, `khối lượng ${typed}`).toBeDisabled()
  }
  for (const typed of ['1', '5000', '312.5']) {
    await weight.fill(typed)
    await expect(save, `khối lượng ${typed}`).toBeEnabled()
  }
  // Bấm Enter khi khối lượng chưa hợp lệ cũng không gửi.
  await weight.fill('0')
  await weight.press('Enter')
  expect(api.writes()).toEqual([])
})

test('máy chủ từ chối bản ghi thì hiện lý do, không dẫn số quy tắc, và giữ nguyên số đang nhập', async ({ page, api }) => {
  api.post(INSPECTIONS, () => reply(403, { status: 403, detail: 'Bạn không được phân công kiểm phiếu nhận này (BR-017).' }))
  await page.goto(PAGE)
  const main = page.getByRole('main')
  const weight = main.getByLabel('Khối lượng')
  await weight.fill('310')
  await main.getByRole('button', { name: 'Ghi: đạt' }).click()
  await expect(main.getByText('Bạn không được phân công kiểm phiếu nhận này.')).toBeVisible()
  await expect(weight).toHaveValue('310')
  await expect(main.getByRole('heading', { name: 'Con thứ 4', level: 2 })).toBeVisible()

  // Với con bị loại, lỗi hiện ngay trong hộp xác nhận; đóng hộp thì trang không còn dòng lỗi cũ.
  await main.getByRole('group', { name: 'Điều kiện kiểm' }).getByText('Khoẻ').click()
  await main.getByRole('button', { name: 'Ghi: loại' }).click()
  const dialog = page.getByRole('dialog', { name: 'Loại con cua này' })
  // Hộp vừa mở chưa gửi gì nên chưa có lỗi nào để báo.
  await expect(dialog).toContainText('Không đạt: yếu.')
  await expect(dialog.getByText('Bạn không được phân công kiểm phiếu nhận này.')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Ghi: loại' }).click()
  await expect(dialog.getByText('Bạn không được phân công kiểm phiếu nhận này.')).toBeVisible()
  await dialog.getByText('Đóng', { exact: true }).click()
  await expect(main.getByText('Bạn không được phân công kiểm phiếu nhận này.')).toHaveCount(0)
  expect(sentInspections(api)).toEqual([inspection(310), inspection(310, { healthy: false })])
})

/* ---------- hoàn tất phiếu ---------- */

test('hoàn tất khi còn con chưa kiểm: hộp xác nhận cảnh báo số con còn lại, xác nhận rồi phiếu thành đã kiểm xong', async ({ page, api }) => {
  liveReceipt(api)
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await main.getByRole('button', { name: 'Hoàn tất phiếu' }).click()
  const dialog = page.getByRole('dialog', { name: 'Hoàn tất phiếu' })
  await expect(dialog).toContainText(receipt.receiptNo)
  await expect(valueOf(dialog, 'Đạt')).toHaveText('2 con')
  await expect(valueOf(dialog, 'Loại')).toHaveText('1 con')
  await expect(valueOf(dialog, 'Chưa kiểm')).toHaveText('17 con')
  await expect(dialog.getByText('Còn 17 con chưa kiểm. Hoàn tất rồi không kiểm thêm được.')).toBeVisible()
  expect(api.writes()).toEqual([])

  await dialog.getByRole('button', { name: 'Hoàn tất', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã hoàn tất phiếu nhận hàng.' })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  // POST không có body: máy chủ tự chốt số đạt, số loại đã ghi.
  expect(api.sent('POST', `${RECEIPT}/complete`).map((c) => c.body)).toEqual([null])
  expect(api.writes()).toEqual([`POST ${RECEIPT}/complete`])

  // Phiếu đã đóng: không còn ô nhập, không còn nút hoàn tất; danh sách cua đã đạt mở sẵn để đối chiếu.
  await expect(main.getByText('Đã kiểm xong')).toBeVisible()
  await expect(main.getByLabel('Khối lượng')).toHaveCount(0)
  await expect(main.getByRole('button', { name: 'Hoàn tất phiếu' })).toHaveCount(0)
  await expect(main.getByRole('listitem').filter({ hasText: 'CU4T7N2K' })).toBeVisible()
})

test('đã kiểm đủ số con khai báo: không còn ô nhập, hộp hoàn tất không cảnh báo; lỗi của máy chủ hiện trong hộp', async ({ page, api }) => {
  api.get(RECEIPT, { ...receipt, acceptedCount: 18, rejectedCount: 2, acceptedWeightG: 5810 } satisfies GoodsReceiptResponse)
  api.post(`${RECEIPT}/complete`, () => reply(422, { status: 422, detail: 'Phiếu nhận hàng đã đóng.' }))
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await expect(main.getByText('Đã kiểm 20 / 20 con')).toBeVisible()
  await expect(main.getByRole('heading', { name: /Con thứ/ })).toHaveCount(0)
  await expect(main.getByLabel('Khối lượng')).toHaveCount(0)

  await main.getByRole('button', { name: 'Hoàn tất phiếu' }).click()
  const dialog = page.getByRole('dialog', { name: 'Hoàn tất phiếu' })
  await expect(valueOf(dialog, 'Chưa kiểm')).toHaveText('0 con')
  await expect(dialog.getByText(/chưa kiểm\. Hoàn tất rồi/)).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Hoàn tất', exact: true }).click()
  await expect(dialog.getByText('Phiếu nhận hàng đã đóng.')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Đã hoàn tất' })).toHaveCount(0)
})

test('chưa kiểm con nào thì chưa hoàn tất được phiếu', async ({ page, api }) => {
  api.get(RECEIPT, { ...receipt, acceptedCount: 0, rejectedCount: 0, acceptedWeightG: 0 } satisfies GoodsReceiptResponse)
  api.get(`/api/batches/${batchIncoming.batchCode}/crab-units`, [])
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Con thứ 1', level: 2 })).toBeVisible()
  await expect(main.getByRole('button', { name: 'Hoàn tất phiếu' })).toBeDisabled()
  await expect(main.getByText('Cua đã đạt')).toHaveCount(0)
})

/* ---------- quyền và đường dẫn ---------- */

test('phiếu phân cho người kiểm khác thì chỉ xem, không có ô nhập hay nút hoàn tất', async ({ page, api }) => {
  api.get(RECEIPT, { ...receipt, qcUserId: OTHER_QC } satisfies GoodsReceiptResponse)
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await expect(main.getByText('Phiếu này phân cho người kiểm khác.')).toBeVisible()
  await expect(main.getByText('Đã kiểm 3 / 20 con')).toBeVisible()
  await expect(main.getByLabel('Khối lượng')).toHaveCount(0)
  await expect(main.getByRole('button', { name: /Ghi|Hoàn tất/ })).toHaveCount(0)
})

test('mở phiếu không kèm mã Lô thì trang tự tra Lô qua việc đang chờ của tôi', async ({ page, api }) => {
  await page.goto(`/qc/kiem-dau-vao/${receipt.receiptNo}`)
  const main = page.getByRole('main')
  await expect(main.getByText(`Lô ${batchIncoming.batchCode} · Cua thịt vỗ béo`)).toBeVisible()
  await expect(valueOf(main.getByRole('complementary'), 'Nhà cung cấp')).toHaveText(order.supplierName)
  expect(api.sent('GET', `/api/batches/${batchIncoming.batchCode}/goods-receipts`)).toHaveLength(1)
})

test('không tra được Lô của phiếu thì vẫn kiểm được, phần lô nguồn chỉ thiếu nhà cung cấp', async ({ page, api }) => {
  api.get('/api/qc/tasks', [taskGrading])
  await page.goto(`/qc/kiem-dau-vao/${receipt.receiptNo}`)
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: receipt.receiptNo, level: 1 })).toBeVisible()
  await expect(main.getByText('Phiếu nhận hàng', { exact: true })).toBeVisible()
  await expect(valueOf(main.getByRole('complementary'), 'Nhà cung cấp')).toHaveText('—')
  await expect(valueOf(main.getByRole('complementary'), 'Vùng xuất xứ')).toHaveText(receipt.originRegion)
  await expect(main.getByRole('button', { name: 'Ghi: đạt' })).toBeVisible()
  expect(api.calls.map((c) => c.path).sort()).toEqual(['/api/qc/tasks', RECEIPT].sort())
})

test('số phiếu không tồn tại thì báo lỗi của máy chủ', async ({ page, api }) => {
  api.get('/api/goods-receipts/GR0000000000', () => reply(404, { status: 404, detail: 'Không tìm thấy phiếu nhận hàng.' }))
  await page.goto(`/qc/kiem-dau-vao/GR0000000000?lo=${batchIncoming.batchCode}`)
  const error = page.getByRole('main').getByRole('alert')
  await expect(error).toContainText('Không tải được dữ liệu')
  await expect(error).toContainText('Không tìm thấy phiếu nhận hàng.')
  await expect(page.getByRole('main').getByLabel('Khối lượng')).toHaveCount(0)
})
