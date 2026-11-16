/* Duyệt phân hạng: /qc/phan-hang (buổi đo và con chờ xác nhận lần hai được phân cho tôi) và /qc/phan-hang/:batchCode (hàng chờ của một Lô).
   Hệ thống chỉ đề xuất size và hạng từ số đo của trạm; Nhân viên kiểm phẩm kiểm cảm quan rồi mới duyệt hạng cuối, giữ lại cho người kiểm
   thứ hai, loại bỏ (kèm ảnh) hoặc nhập số thước kẹp. Con đã duyệt đổi size, hạng ở tab Đã xử lý (kèm ảnh và lý do, tạo phiên bản mới).
   Mỗi thao tác được kiểm tra bằng đúng lời gọi API đã gửi. */
import type {
  ApproveDecisionRequest, GradeDecisionResponse, HoldDecisionRequest, MeasurementValuesRequest, SessionMeasurementsResponse,
} from '../src/shared/api/api.gen'
import { PNG, TOKEN, expect, file, photo, reply, signIn, test, type Api } from './support/app'
import {
  ME, OTHER_QC, approved, approvedBelow, batchGrading, batchSecond, caliperHold, decision, decisions, draft, heldA, heldB, hoursAgo, measuredPoor,
  mockDecision, mockQc, nearHold, noDevReload, pick, rejected, revised, taskGrading, taskSecondA, valueOf,
} from './support/qc'

const PAGE = `/qc/phan-hang/${batchGrading.batchCode}`
const SECOND_PAGE = `/qc/phan-hang/${batchSecond.batchCode}`
const act = (d: GradeDecisionResponse, action: string) => `/api/grade-decisions/${d.decisionNo}/${action}`
const now = () => new Date().toISOString()

/** Quyết định hiện hành của một Lô, đổi được giữa chừng: handler của lời gọi ghi thay một quyết định rồi trang tự tải lại hàng chờ. */
function liveDecisions(api: Api, start: GradeDecisionResponse[] = decisions, batchCode = batchGrading.batchCode) {
  const queue = {
    list: [...start],
    /** Thay quyết định hiện hành của cùng con cua bằng bản mới. */
    replace(next: GradeDecisionResponse) {
      queue.list = queue.list.map((d) => (d.crabCode === next.crabCode ? next : d))
      return next
    },
  }
  api.get(`/api/batches/${batchCode}/grade-decisions`, () => queue.list)
  return queue
}

const approvedFrom = (d: GradeDecisionResponse, finalGrade = d.proposedGrade): GradeDecisionResponse => ({
  ...d, status: 'Approved', holdReasons: [], finalSize: d.proposedSize, finalGrade, liveStatus: 'Alive', foodSafety: 'Pass', decidedBy: ME, decidedAt: now(),
})

test.beforeEach(async ({ page, api }) => {
  await noDevReload(page)
  await signIn(page, 'QcInspector')
  mockQc(api)
})

/* ---------- /qc/phan-hang ---------- */

test('danh sách có buổi đo của tôi và các con chờ tôi xác nhận lần hai, gom theo Lô', async ({ page, api }) => {
  await page.goto('/qc/phan-hang')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Duyệt phân hạng', level: 1 })).toBeVisible()

  const session = main.getByRole('link', { name: new RegExp(batchGrading.batchCode) })
  await expect(session).toHaveAttribute('href', PAGE)
  await expect(session).toContainText(batchGrading.title)
  await expect(session).toContainText('Cua thịt vỗ béo · 5 chưa đo · 3 đã duyệt')
  await expect(session).toContainText('3 con chờ duyệt')

  const second = main.getByRole('link', { name: new RegExp(batchSecond.batchCode) })
  await expect(second).toHaveAttribute('href', SECOND_PAGE)
  await expect(second).toContainText('2 con chờ xác nhận')
  // Việc kiểm đầu vào, thăm trại không nằm ở trang này.
  await expect(main.getByRole('link')).toHaveCount(2)
  expect(api.calls.filter((c) => c.path.endsWith('/goods-receipts'))).toEqual([])

  await session.click()
  await expect(page).toHaveURL(new RegExp(`${PAGE}$`))
  await expect(page.getByRole('heading', { name: batchGrading.title, level: 1 })).toBeVisible()
})

test('mở Lô khác theo mã: tới hàng chờ của Lô đó; mã không có thì báo lỗi của máy chủ', async ({ page, api }) => {
  // Chưa được phân buổi đo nào vẫn mở được một Lô theo mã để xem lại hoặc đổi hạng con đã duyệt.
  api.get('/api/qc/tasks', [])
  await page.goto('/qc/phan-hang')
  const main = page.getByRole('main')
  await expect(main.getByText('Chưa có buổi đo nào được phân cho bạn')).toBeVisible()

  await main.getByText('Mở Lô khác theo mã').click()
  const open = main.getByRole('button', { name: 'Mở', exact: true })
  await expect(open).toBeDisabled()
  await main.getByLabel('Mã Lô').fill(`  ${batchGrading.batchCode} `)
  await open.click()
  await expect(page).toHaveURL(new RegExp(`${PAGE}$`))
  await expect(page.getByRole('heading', { name: batchGrading.title, level: 1 })).toBeVisible()

  const missing = { status: 404, detail: 'Không tìm thấy Lô.' }
  for (const path of ['', '/grading', '/grade-decisions']) api.get(`/api/batches/CS-0000-X9${path}`, () => reply(404, missing))
  await page.goto('/qc/phan-hang')
  await main.getByText('Mở Lô khác theo mã').click()
  await main.getByLabel('Mã Lô').fill('CS-0000-X9')
  await main.getByLabel('Mã Lô').press('Enter')
  await expect(page).toHaveURL(/\/qc\/phan-hang\/CS-0000-X9$/)
  await expect(main.getByRole('alert')).toContainText('Không tìm thấy Lô.')
})

/* ---------- thẻ của một con đang chờ ---------- */

test('hàng chờ của Lô: số liệu buổi đo và thẻ con đầu tiên với ảnh của trạm, đề xuất, ba số chính', async ({ page, api }) => {
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: batchGrading.title, level: 1 })).toBeVisible()
  await expect(main.getByText(`Lô ${batchGrading.batchCode} · Cua thịt vỗ béo`)).toBeVisible()
  await expect(main.getByText('Đang thu hoạch')).toBeVisible()
  for (const [label, value] of [['Chờ duyệt', '3'], ['Chưa đo', '5'], ['Đã duyệt', '3'], ['Loại bỏ', '1']]) await expect(valueOf(main, label)).toHaveText(value)
  await expect(main.getByRole('tab', { name: /Chờ duyệt/ })).toHaveAttribute('aria-selected', 'true')
  await expect(main.getByRole('tab', { name: /Chờ duyệt/ })).toContainText('3')
  await expect(main.getByRole('tab', { name: /Đã xử lý/ })).toContainText('4')

  // Mỗi lần một con, con đề xuất sớm nhất trước.
  await expect(main.getByText('Con 1 / 3')).toBeVisible()
  await expect(main.getByRole('button', { name: 'Con trước' })).toBeDisabled()
  await expect(main.getByText(draft.crabCode, { exact: true })).toBeVisible()
  await expect(main.getByText('Hộp R02-T3-05')).toBeVisible()
  await expect(main.getByText('Đề xuất, chờ duyệt')).toBeVisible()

  // Hai ảnh của trạm (đèn trắng, soi đỏ) tải qua API kèm phiên đăng nhập; trang không có hình nào khác như mã QR của con cua.
  await expect(main.getByRole('img', { name: `Ảnh đèn trắng của ${draft.crabCode}` })).toBeVisible()
  await expect(main.getByRole('img', { name: `Ảnh soi đỏ của ${draft.crabCode}` })).toBeVisible()
  await expect(main.getByRole('img')).toHaveCount(2)
  await expect(main).not.toContainText('QR')
  for (const kind of ['white', 'red']) expect(api.sent('GET', `/api/measurement-sessions/${draft.sessionNo}/images/${kind}`).map((c) => c.auth)).toEqual([`Bearer ${TOKEN}`])

  const proposal = main.getByText('Đề xuất', { exact: true }).locator('..')
  await expect(proposal).toContainText('Size XL')
  await expect(proposal).toContainText('Đặc cấp')
  await expect(valueOf(main, 'Khối lượng')).toHaveText('372,4 g')
  await expect(valueOf(main, 'Chỉ số C')).toHaveText('0,6754 g/cm³')
  await expect(valueOf(main, 'Dài mai')).toHaveText('8,2 cm')
  for (const name of ['Duyệt', 'Giữ lại', 'Loại bỏ']) await expect(main.getByRole('button', { name, exact: true })).toBeEnabled()

  // Số đo thô, kết quả AI và thông tin lượt đo nằm trong phần gấp lại.
  const more = main.getByRole('group').filter({ hasText: 'Số đo, AI và lượt đo' })
  await expect(more.getByRole('listitem').first()).toBeHidden()
  await main.getByText('Số đo, AI và lượt đo').click()
  await expect(more.getByRole('listitem')).toHaveText([
    /Khối lượng.*Cân của trạm.*372,4 g/,
    /Dài mai.*AI đọc ảnh · 93%.*8,2 cm/,
    /Chỉ số C.*Tính từ số đo.*0,68 g\/cm³/,
    /AI · đèn trắng.*carapace-seg 0\.3 · 93%.*Giả lập.*Ảnh tốt.*AI đọc được/,
  ])
  await expect(valueOf(more, 'Theo chỉ số C')).toHaveText('Đặc cấp')
  await expect(valueOf(more, 'Cách đo')).toHaveText('Trạm TRAM-01')
  await expect(valueOf(more, 'Lúc nhận')).toHaveText('298 g · Đực')
  await expect(valueOf(more, 'Lô nguồn')).toHaveText('Rạch Gốc, Ngọc Hiển, Cà Mau')
  await expect(valueOf(more, 'Lượt đo')).toHaveText(draft.sessionNo)
  await expect(valueOf(more, 'Bộ quy tắc')).toHaveText('Phiên bản 1 · đề xuất 1')
  // Lô cua thịt không xếp hạng theo soi đỏ nên không có dòng đó.
  await expect(more.getByRole('term').filter({ hasText: 'Theo soi đỏ' })).toHaveCount(0)
  await expect(more.getByRole('button', { name: 'Nhập thước kẹp' })).toBeVisible()

  // Bấm ảnh để xem lớn.
  await main.getByRole('button', { name: `Xem lớn: Ảnh đèn trắng của ${draft.crabCode}` }).click()
  const zoom = page.getByRole('dialog', { name: `Ảnh đèn trắng của ${draft.crabCode}` })
  await expect(zoom.getByRole('img')).toBeVisible()
  await zoom.getByRole('button', { name: 'Đóng' }).click()
  await expect(zoom).toHaveCount(0)
  expect(api.writes()).toEqual([])
})

test('số đo sát ngưỡng: thẻ chỉ ra số nào sát ngưỡng nào; hạng cuối chỉ chọn được từ hạng đề xuất trở xuống', async ({ page }) => {
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await main.getByRole('button', { name: 'Con sau' }).click()
  await expect(main.getByText('Con 2 / 3')).toBeVisible()
  await expect(main.getByText(nearHold.crabCode, { exact: true })).toBeVisible()
  await expect(main.getByText('Số đo sát ngưỡng')).toBeVisible()
  // 303,5 g cách ngưỡng 300 g của size L chưa tới 2%; chỉ số C 0,6396 thì không sát ngưỡng nào.
  await expect(valueOf(main, 'Khối lượng · sát ngưỡng 300')).toHaveText('303,5 g')
  await expect(valueOf(main, 'Chỉ số C')).toHaveText('0,6396 g/cm³')
  const proposal = main.getByText('Đề xuất', { exact: true }).locator('..')
  await expect(proposal).toContainText('Size L')
  await expect(proposal).toContainText('Cấp 1')

  // Đề xuất Cấp 1 thì không có lựa chọn Đặc cấp: không nâng hạng quá số đo.
  await main.getByRole('button', { name: 'Duyệt', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: `Duyệt ${nearHold.crabCode}` })
  const grades = dialog.getByRole('group', { name: 'Hạng cuối' })
  await expect(grades.getByRole('radio')).toHaveCount(2)
  await expect(grades.getByRole('radio', { name: /Cấp 1/ })).toBeChecked()
  await expect(grades.getByRole('radio', { name: /Dưới chuẩn/ })).not.toBeChecked()
  await expect(grades.getByText('Đặc cấp')).toHaveCount(0)
})

test('chỉ số C sát ngưỡng cũng được chỉ ra; bộ quy tắc không còn công bố thì chỉ còn nhãn lý do', async ({ page, api }) => {
  // 0,6612 cách ngưỡng 0,66 của Đặc cấp chưa tới 2%.
  const nearC = decision({
    decisionNo: 'GD4L7Y2Z9BHL', crabCode: 'CU7Y2Z9B', sessionNo: 'MS4L7Y2Z9BHL', status: 'Hold', holdReasons: ['NearThreshold'],
    weightG: 380, carapaceLengthCm: 8.3, cIndex: 0.6612,
  })
  mockDecision(api, nearC)
  api.get(`/api/batches/${batchGrading.batchCode}/grade-decisions`, [nearC])
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await expect(valueOf(main, 'Chỉ số C · sát ngưỡng 0,66')).toHaveText('0,6612 g/cm³')
  await expect(valueOf(main, 'Khối lượng')).toHaveText('380 g')

  api.get('/api/grading/standards', [])
  await page.reload()
  await expect(main.getByText('Số đo sát ngưỡng')).toBeVisible()
  await expect(valueOf(main, 'Chỉ số C')).toHaveText('0,6612 g/cm³')
})

test('con cần thước kẹp: chưa duyệt được; nhập dài mai thì đề xuất được tính lại và trang bám theo đúng con đó', async ({ page, api }) => {
  // Con cần thước kẹp được đo sớm nhất nên đứng đầu hàng chờ; bản đề xuất mới sau khi nhập thước kẹp sẽ xuống cuối hàng.
  const first: GradeDecisionResponse = { ...caliperHold, createdAt: hoursAgo(1) }
  const remeasured: GradeDecisionResponse = {
    ...first, decisionNo: 'GD7M0N3P5QRT', versionNo: 2, status: 'Draft', holdReasons: [], carapaceLengthCm: 7.8, cIndex: 0.6975,
    proposedCLevel: 'SPECIAL', proposedGrade: 'SPECIAL', createdAt: now(),
  }
  const queue = liveDecisions(api, [first, draft, nearHold, approved])
  const values = `/api/measurement-sessions/${first.sessionNo}/values`
  let session: SessionMeasurementsResponse = { ...measuredPoor, decision: first }
  api.get(`/api/measurement-sessions/${first.sessionNo}/measurements`, () => session)
  api.post(values, (): SessionMeasurementsResponse => {
    session = {
      ...measuredPoor,
      values: [
        ...measuredPoor.values,
        { metric: 'CarapaceLengthCm', value: 7.8, unit: 'cm', method: 'Caliper', confidence: null, verificationStatus: 'Unverified', recordedAt: now() },
        { metric: 'CIndex', value: 0.6975, unit: 'g/cm3', method: 'Computed', confidence: null, verificationStatus: 'Unverified', recordedAt: now() },
      ],
      decision: remeasured,
    }
    queue.list = [draft, nearHold, approved, remeasured]
    return session
  })

  await page.goto(PAGE)
  const main = page.getByRole('main')
  await expect(main.getByText('Con 1 / 3')).toBeVisible()
  await expect(main.getByText(first.crabCode, { exact: true })).toBeVisible()
  await expect(main.getByText('Ảnh chưa đạt')).toBeVisible()
  await expect(main.getByText('Cần đo thước kẹp')).toBeVisible()
  const proposal = main.getByText('Đề xuất', { exact: true }).locator('..')
  await expect(proposal).toContainText('Size L')
  await expect(proposal).toContainText('Chưa có hạng')
  await expect(valueOf(main, 'Khối lượng')).toHaveText('331 g')
  await expect(valueOf(main, 'Chỉ số C')).toHaveText('Chưa có')
  await expect(valueOf(main, 'Dài mai')).toHaveText('Chưa có')
  // Trạm không chụp được ảnh soi đỏ: chỉ tải ảnh đèn trắng.
  await expect(main.getByRole('img')).toHaveCount(1)
  expect(api.sent('GET', `/api/measurement-sessions/${first.sessionNo}/images/red`)).toEqual([])

  await main.getByText('Số đo, AI và lượt đo').click()
  await expect(main.getByRole('group').filter({ hasText: 'Số đo, AI và lượt đo' }).getByRole('listitem')).toHaveText([
    /Khối lượng.*Cân của trạm · cân chưa hiệu chuẩn.*331 g/,
    /AI · đèn trắng.*carapace-seg 0\.3 · 41% · Mai bị che một phần.*Ảnh kém.*AI chưa chắc/,
  ])

  // Nút Duyệt nhường chỗ cho nút nhập thước kẹp; vẫn giữ lại hoặc loại bỏ được.
  await expect(main.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0)
  await expect(main.getByRole('button', { name: 'Giữ lại', exact: true })).toBeEnabled()
  await expect(main.getByRole('button', { name: 'Loại bỏ', exact: true })).toBeEnabled()
  await main.getByRole('button', { name: 'Nhập thước kẹp' }).click()
  const dialog = page.getByRole('dialog', { name: `Thước kẹp ${first.crabCode}` })
  const save = dialog.getByRole('button', { name: 'Ghi số đo' })
  await expect(save).toBeDisabled()
  const length = dialog.getByLabel('Dài mai (CL)')
  for (const outOfRange of ['31', '0,5']) {
    await length.fill(outOfRange)
    await expect(save, `dài mai ${outOfRange} cm`).toBeDisabled()
  }
  await length.fill('7,8')
  await dialog.getByText('Tuỳ chọn thêm').click()
  await dialog.getByLabel('Rộng mai (CW)').fill('11,2')
  await dialog.getByLabel('Dải mép soi đỏ').fill('51')
  await expect(save).toBeDisabled()
  await dialog.getByLabel('Dải mép soi đỏ').fill('')
  await save.click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã ghi số đo. Đề xuất được tính lại.' })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  const body: MeasurementValuesRequest = { carapaceLengthCm: 7.8, carapaceWidthCm: 11.2, edgeBandMm: null }
  expect(api.sent('POST', values).map((c) => c.body)).toEqual([body])

  // Bản đề xuất mới của đúng con đó nằm cuối hàng chờ; trang nhảy theo nó thay vì ở lại vị trí đầu.
  await expect(main.getByText('Con 3 / 3')).toBeVisible()
  await expect(main.getByText(first.crabCode, { exact: true })).toBeVisible()
  await expect(main.getByText('Đề xuất, chờ duyệt')).toBeVisible()
  await expect(proposal).toContainText('Đặc cấp')
  await expect(valueOf(main, 'Chỉ số C')).toHaveText('0,6975 g/cm³')
  await expect(valueOf(main, 'Dài mai')).toHaveText('7,8 cm')
  await expect(main.getByRole('button', { name: 'Duyệt', exact: true })).toBeEnabled()
  // Bấm chuyển con thì thôi bám.
  await main.getByRole('button', { name: 'Con trước' }).click()
  await expect(main.getByText('Con 2 / 3')).toBeVisible()
  await expect(main.getByText(nearHold.crabCode, { exact: true })).toBeVisible()
})

/* ---------- duyệt, giữ lại, loại bỏ ---------- */

test('duyệt đúng hạng đề xuất sau kiểm cảm quan: gửi hạng cuối, con rời hàng chờ sang Đã xử lý', async ({ page, api }) => {
  const queue = liveDecisions(api)
  api.post(act(draft, 'approve'), () => queue.replace({ ...approvedFrom(draft), specCode: 'FAT-XL-SPECIAL', sensoryNote: 'Mai cứng, yếm chắc' }))
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await main.getByRole('button', { name: 'Duyệt', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: `Duyệt ${draft.crabCode}` })
  // Size lấy theo cân, không đổi ở bước này; hạng đề xuất được chọn sẵn.
  await expect(dialog).toContainText('Size XL')
  const grades = dialog.getByRole('group', { name: 'Hạng cuối' })
  await expect(grades.getByRole('radio')).toHaveCount(3)
  await expect(grades.getByRole('radio', { name: /Đặc cấp/ })).toBeChecked()
  await expect(grades.getByText('Đề xuất', { exact: true })).toBeVisible()
  await expect(dialog.getByLabel('Lý do hạ hạng')).toHaveCount(0)
  await dialog.getByText('Ghi chú cảm quan').click()
  await dialog.getByLabel('Ghi chú cảm quan').fill(' Mai cứng, yếm chắc ')
  expect(api.writes()).toEqual([])

  await dialog.getByRole('button', { name: 'Duyệt hạng' }).click()
  await expect(page.getByRole('status').filter({ hasText: `Đã duyệt ${draft.crabCode}: Size XL · Đặc cấp.` })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  const body: ApproveDecisionRequest = { finalGrade: 'SPECIAL', sensoryNote: 'Mai cứng, yếm chắc', reason: null }
  expect(api.sent('POST', act(draft, 'approve')).map((c) => c.body)).toEqual([body])
  expect(api.writes()).toEqual([`POST ${act(draft, 'approve')}`])

  // Hàng chờ còn hai con, con kế tiếp lên đầu; con vừa duyệt đứng đầu tab Đã xử lý.
  await expect(main.getByText('Con 1 / 2')).toBeVisible()
  await expect(main.getByText(nearHold.crabCode, { exact: true })).toBeVisible()
  await main.getByRole('tab', { name: /Đã xử lý/ }).click()
  await expect(main.getByRole('button', { name: /^CU/ })).toHaveCount(5)
  await expect(main.getByRole('button', { name: /^CU/ }).first()).toHaveText(new RegExp(`${draft.crabCode}.*372,4 g.*Size XL.*Đặc cấp`))
})

test('hạ hạng so với đề xuất phải ghi lý do; chọn Dưới chuẩn thì báo cua rời quy cách đặt trước', async ({ page, api }) => {
  const queue = liveDecisions(api)
  api.post(act(draft, 'approve'), () => queue.replace({ ...approvedFrom(draft, 'BELOW'), isSubstandard: true, reason: 'Bóp yếm thấy óp' }))
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await main.getByRole('button', { name: 'Duyệt', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: `Duyệt ${draft.crabCode}` })
  const submit = dialog.getByRole('button', { name: 'Duyệt hạng' })

  await pick(dialog, 'Hạng cuối', 'Cấp 1')
  await expect(dialog.getByLabel('Lý do hạ hạng')).toBeVisible()
  await expect(submit).toBeDisabled()
  await expect(dialog.getByText('Cua dưới chuẩn, không vào quy cách đặt trước.')).toHaveCount(0)
  await dialog.getByLabel('Lý do hạ hạng').fill('   ')
  await expect(submit).toBeDisabled()

  await pick(dialog, 'Hạng cuối', 'Dưới chuẩn')
  await expect(dialog.getByText('Cua dưới chuẩn, không vào quy cách đặt trước.')).toBeVisible()
  await dialog.getByLabel('Lý do hạ hạng').fill('Bóp yếm thấy óp')
  await submit.click()
  await expect(page.getByRole('status').filter({ hasText: `Đã duyệt ${draft.crabCode}: Size XL · Dưới chuẩn.` })).toBeVisible()
  const body: ApproveDecisionRequest = { finalGrade: 'BELOW', sensoryNote: null, reason: 'Bóp yếm thấy óp' }
  expect(api.sent('POST', act(draft, 'approve')).map((c) => c.body)).toEqual([body])

  // Chọn lại đúng hạng đề xuất thì ô lý do biến mất.
  await main.getByRole('button', { name: 'Duyệt', exact: true }).click()
  const next = page.getByRole('dialog', { name: `Duyệt ${nearHold.crabCode}` })
  await pick(next, 'Hạng cuối', 'Dưới chuẩn')
  await expect(next.getByLabel('Lý do hạ hạng')).toBeVisible()
  await pick(next, 'Hạng cuối', 'Cấp 1')
  await expect(next.getByLabel('Lý do hạ hạng')).toHaveCount(0)
  await expect(next.getByRole('button', { name: 'Duyệt hạng' })).toBeEnabled()
})

test('chưa có hạng đề xuất (chờ kiểm cảm quan): người kiểm tự chọn hạng cuối rồi mới duyệt được', async ({ page, api }) => {
  // Buổi đo của tôi ở Lô cua gạch; trạm chưa đọc được dải mép khi soi đỏ nên hệ thống chỉ đề xuất size.
  const pending = decision({
    decisionNo: 'GD9R2S5T8UVX', crabCode: 'CU2S5T8U', sessionNo: 'MS9R2S5T8UVX', batchCode: batchSecond.batchCode, status: 'Hold', holdReasons: ['SensoryPending'],
    weightG: 371, carapaceLengthCm: 8.5, cIndex: null, proposedCLevel: null, proposedGrade: null,
  })
  mockDecision(api, pending)
  api.get('/api/qc/tasks', [{ ...taskGrading, batchCode: batchSecond.batchCode }])
  const queue = liveDecisions(api, [pending], batchSecond.batchCode)
  api.post(act(pending, 'approve'), () => queue.replace({ ...approvedFrom(pending, 'G1'), specCode: 'ROE-XL-G1', sensoryNote: 'Gạch đầy, soi đỏ kín mép' }))
  await page.goto(SECOND_PAGE)
  const main = page.getByRole('main')
  await expect(main.getByText(pending.crabCode, { exact: true })).toBeVisible()
  await expect(main.getByText('Chờ kiểm cảm quan')).toBeVisible()
  const proposal = main.getByText('Đề xuất', { exact: true }).locator('..')
  await expect(proposal).toContainText('Size XL')
  await expect(proposal).toContainText('Chưa có hạng')

  await main.getByRole('button', { name: 'Duyệt', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: `Duyệt ${pending.crabCode}` })
  const grades = dialog.getByRole('group', { name: 'Hạng cuối' })
  // Cả ba hạng đều chọn được, chưa hạng nào được chọn sẵn và không ô nào mang chữ "Đề xuất".
  await expect(grades.getByRole('radio')).toHaveCount(3)
  await expect(grades.getByRole('radio', { checked: true })).toHaveCount(0)
  await expect(grades.getByText('Đề xuất', { exact: true })).toHaveCount(0)
  const submit = dialog.getByRole('button', { name: 'Duyệt hạng' })
  await expect(submit).toBeDisabled()

  await pick(dialog, 'Hạng cuối', 'Cấp 1')
  // Không có đề xuất để so nên không đòi lý do hạ hạng.
  await expect(dialog.getByLabel('Lý do hạ hạng')).toHaveCount(0)
  await dialog.getByText('Ghi chú cảm quan').click()
  await dialog.getByLabel('Ghi chú cảm quan').fill('Gạch đầy, soi đỏ kín mép')
  await submit.click()
  await expect(page.getByRole('status').filter({ hasText: `Đã duyệt ${pending.crabCode}: Size XL · Cấp 1.` })).toBeVisible()
  const body: ApproveDecisionRequest = { finalGrade: 'G1', sensoryNote: 'Gạch đầy, soi đỏ kín mép', reason: null }
  expect(api.sent('POST', act(pending, 'approve')).map((c) => c.body)).toEqual([body])
  await expect(main.getByText('Không có con nào chờ duyệt')).toBeVisible()
})

test('giữ lại để người kiểm thứ hai quyết định: gửi lý do, con xuống cuối hàng chờ và tôi không còn thao tác được', async ({ page, api }) => {
  const queue = liveDecisions(api)
  api.post(act(draft, 'hold'), (call) => queue.replace({ ...draft, status: 'Hold', holdReasons: ['QcHold'], heldBy: ME, reason: (call.body as HoldDecisionRequest).reason }))
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await main.getByRole('button', { name: 'Giữ lại', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: `Giữ lại ${draft.crabCode}` })
  await expect(dialog).toContainText('Người kiểm thứ hai sẽ quyết định con này.')
  const submit = dialog.getByRole('button', { name: 'Giữ lại', exact: true })
  await expect(submit).toBeDisabled()
  await dialog.getByLabel('Lý do').fill('ab')
  await expect(submit).toBeDisabled()
  await dialog.getByLabel('Lý do').fill('  Mai có vết nứt, cần người thứ hai xem ')
  await submit.click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã giữ lại, chờ người kiểm thứ hai.' })).toBeVisible()
  const body: HoldDecisionRequest = { reason: 'Mai có vết nứt, cần người thứ hai xem' }
  expect(api.sent('POST', act(draft, 'hold')).map((c) => c.body)).toEqual([body])

  // Con vừa giữ vẫn trong hàng chờ nhưng xếp sau các con tôi còn quyết định được.
  await expect(main.getByText('Con 1 / 3')).toBeVisible()
  await expect(main.getByText(nearHold.crabCode, { exact: true })).toBeVisible()
  await main.getByRole('button', { name: 'Con sau' }).click()
  await main.getByRole('button', { name: 'Con sau' }).click()
  await expect(main.getByText('Con 3 / 3')).toBeVisible()
  await expect(main.getByText(draft.crabCode, { exact: true })).toBeVisible()
  await expect(main.getByText('Kiểm phẩm giữ lại')).toBeVisible()
  await expect(main.getByText('Lý do giữ lại: Mai có vết nứt, cần người thứ hai xem')).toBeVisible()
  await expect(main.getByText('Bạn đã giữ lại con này. Chờ người kiểm thứ hai.')).toBeVisible()
  await expect(main.getByRole('button', { name: /^(Duyệt|Giữ lại|Loại bỏ|Xác nhận giữ)$/ })).toHaveCount(0)
})

test('loại bỏ con đang chờ: phải chọn tình trạng, an toàn thực phẩm, ghi lý do và chụp ảnh; gửi multipart', async ({ page, api }) => {
  const queue = liveDecisions(api)
  api.post(act(draft, 'reject'), () => queue.replace({
    ...draft, status: 'Rejected', liveStatus: 'Dead', foodSafety: 'Fail', reason: 'Chết trong lúc chờ đo', hasPhoto: true, decidedBy: ME, decidedAt: now(),
  }))
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await main.getByRole('button', { name: 'Loại bỏ', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: `Loại bỏ ${draft.crabCode}` })
  await expect(dialog).toContainText('Cua bị loại sẽ tiêu huỷ, không hoàn lại được.')
  const submit = dialog.getByRole('button', { name: 'Loại bỏ', exact: true })
  await expect(submit).toBeDisabled()

  // Cua còn khoẻ và an toàn thì không loại được dù đã có lý do và ảnh.
  await pick(dialog, 'Tình trạng', 'Còn sống, khoẻ')
  await pick(dialog, 'An toàn thực phẩm', 'An toàn')
  await dialog.getByLabel('Lý do').fill(' Chết trong lúc chờ đo ')
  await dialog.getByLabel('Chụp ảnh').setInputFiles(photo('cua-chet.png'))
  await expect(dialog.getByText('Cua khoẻ và an toàn thì không loại.')).toBeVisible()
  await expect(submit).toBeDisabled()

  await pick(dialog, 'Tình trạng', 'Đã chết')
  await pick(dialog, 'An toàn thực phẩm', 'Không an toàn')
  await expect(dialog.getByText('Cua khoẻ và an toàn thì không loại.')).toHaveCount(0)
  expect(api.writes()).toEqual([])
  await submit.click()
  await expect(page.getByRole('status').filter({ hasText: `Đã loại bỏ ${draft.crabCode}.` })).toBeVisible()
  await expect(dialog).toHaveCount(0)

  const [sent] = api.sent('POST', act(draft, 'reject'))
  expect(sent.multipart).toBe(true)
  expect(sent.body).toEqual({ LiveStatus: 'Dead', FoodSafety: 'Fail', Reason: 'Chết trong lúc chờ đo', Photo: 'file:cua-chet.png' })
  expect(api.writes()).toEqual([`POST ${act(draft, 'reject')}`])
  await expect(main.getByText('Con 1 / 2')).toBeVisible()
  await expect(main.getByRole('tab', { name: /Đã xử lý/ })).toContainText('5')
})

test('máy chủ từ chối thao tác thì lý do hiện ngay trong hộp, không dẫn số quy tắc, và hộp vẫn mở', async ({ page, api }) => {
  api.post(act(draft, 'approve'), () => reply(403, { status: 403, detail: 'Bạn không được phân công duyệt con cua này (BR-017).' }))
  await page.goto(PAGE)
  await page.getByRole('main').getByRole('button', { name: 'Duyệt', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: `Duyệt ${draft.crabCode}` })
  await dialog.getByRole('button', { name: 'Duyệt hạng' }).click()
  await expect(dialog.getByText('Bạn không được phân công duyệt con cua này.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Duyệt hạng' })).toBeEnabled()
  await expect(page.getByRole('status').filter({ hasText: 'Đã duyệt' })).toHaveCount(0)
})

/* ---------- xác nhận lần hai ---------- */

test('xác nhận lần hai: phải xác nhận giữ trước, sau đó mới duyệt hoặc loại con bị người kiểm khác giữ lại', async ({ page, api }) => {
  const queue = liveDecisions(api, [heldA, heldB], batchSecond.batchCode)
  api.post(act(heldA, 'confirm-hold'), () => queue.replace({ ...heldA, secondQcId: ME, secondConfirmedAt: now() }))
  api.post(act(heldA, 'approve'), () => queue.replace({ ...approvedFrom(heldA), specCode: 'ROE-XL-SPECIAL' }))
  await page.goto(SECOND_PAGE)
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: batchSecond.title, level: 1 })).toBeVisible()
  await expect(main.getByText('Con 1 / 2')).toBeVisible()
  await expect(main.getByText(heldA.crabCode, { exact: true })).toBeVisible()
  await expect(main.getByText('Kiểm phẩm giữ lại')).toBeVisible()
  // Lô cua gạch: số chính thứ ba là dải mép khi soi đỏ.
  await expect(valueOf(main, 'Khối lượng')).toHaveText('362 g')
  await expect(valueOf(main, 'Dải mép soi đỏ')).toHaveText('1,6 mm')
  // Lý do của người giữ hiện đúng một lần trên thẻ.
  await expect(main.getByText(`Lý do giữ lại: ${heldA.reason}`)).toBeVisible()

  // Chưa xác nhận giữ thì chỉ có một nút; không tự giữ lại lần nữa, không nhập thước kẹp.
  await expect(main.getByRole('button', { name: /^(Duyệt|Giữ lại|Loại bỏ|Nhập thước kẹp)$/ })).toHaveCount(0)
  await main.getByRole('button', { name: 'Xác nhận giữ' }).click()
  const confirm = page.getByRole('dialog', { name: `Xác nhận giữ ${heldA.crabCode}` })
  await expect(confirm).toContainText('Sau đó bạn duyệt hoặc loại con này.')
  await expect(confirm.getByText(`Lý do giữ lại: ${heldA.reason}`)).toBeVisible()
  await confirm.getByRole('button', { name: 'Xác nhận giữ' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã xác nhận giữ. Giờ bạn duyệt hoặc loại.' })).toBeVisible()
  expect(api.sent('POST', act(heldA, 'confirm-hold')).map((c) => c.body)).toEqual([null])

  // Đã xác nhận: duyệt hoặc loại, không có nút giữ lại.
  await expect(main.getByRole('button', { name: 'Xác nhận giữ' })).toHaveCount(0)
  await expect(main.getByRole('button', { name: 'Loại bỏ', exact: true })).toBeEnabled()
  await expect(main.getByRole('button', { name: 'Giữ lại', exact: true })).toHaveCount(0)
  await main.getByRole('button', { name: 'Duyệt', exact: true }).click()
  await page.getByRole('dialog', { name: `Duyệt ${heldA.crabCode}` }).getByRole('button', { name: 'Duyệt hạng' }).click()
  await expect(page.getByRole('status').filter({ hasText: `Đã duyệt ${heldA.crabCode}: Size XL · Đặc cấp.` })).toBeVisible()
  const body: ApproveDecisionRequest = { finalGrade: 'SPECIAL', sensoryNote: null, reason: null }
  expect(api.sent('POST', act(heldA, 'approve')).map((c) => c.body)).toEqual([body])
  expect(api.writes()).toEqual([`POST ${act(heldA, 'confirm-hold')}`, `POST ${act(heldA, 'approve')}`])

  // Còn một con, tôi đã xác nhận giữ từ trước nên duyệt hoặc loại được ngay.
  await expect(main.getByText(heldB.crabCode, { exact: true })).toBeVisible()
  await expect(main.getByText(/^Con \d+ \/ \d+$/)).toHaveCount(0)
  await expect(valueOf(main, 'Dải mép soi đỏ')).toHaveText('2,6 mm')
  await expect(main.getByText(`Lý do giữ lại: ${heldB.reason}`)).toBeVisible()
  await expect(main.getByRole('button', { name: 'Duyệt', exact: true })).toBeEnabled()
  await expect(main.getByRole('button', { name: 'Loại bỏ', exact: true })).toBeEnabled()
})

test('con không phân cho tôi thì chỉ xem: Lô không có việc của tôi, hoặc con bị người khác giữ mà tôi không phải người kiểm thứ hai', async ({ page, api }) => {
  // Mở Lô của người khác theo mã: tôi chỉ có buổi đo ở Lô cua thịt.
  api.get('/api/qc/tasks', [taskGrading])
  await page.goto(SECOND_PAGE)
  const main = page.getByRole('main')
  await expect(main.getByText(heldA.crabCode, { exact: true })).toBeVisible()
  await expect(main.getByText('Con này không phân cho bạn.')).toBeVisible()
  await expect(main.getByRole('button', { name: /^(Duyệt|Giữ lại|Loại bỏ|Xác nhận giữ|Nhập thước kẹp)$/ })).toHaveCount(0)

  // Trong buổi đo của tôi, con bị người kiểm khác giữ lại xếp cuối hàng và tôi không thao tác được.
  const heldByOther: GradeDecisionResponse = { ...nearHold, holdReasons: ['NearThreshold', 'QcHold'], heldBy: OTHER_QC, reason: 'Nghi cân lệch', createdAt: hoursAgo(2) }
  api.get(`/api/batches/${batchGrading.batchCode}/grade-decisions`, [heldByOther, draft])
  await page.goto(PAGE)
  await expect(main.getByText('Con 1 / 2')).toBeVisible()
  await expect(main.getByText(draft.crabCode, { exact: true })).toBeVisible()
  await main.getByRole('button', { name: 'Con sau' }).click()
  await expect(main.getByText(heldByOther.crabCode, { exact: true })).toBeVisible()
  await expect(main.getByText('Số đo sát ngưỡng')).toBeVisible()
  await expect(main.getByText('Kiểm phẩm giữ lại')).toBeVisible()
  await expect(main.getByText('Lý do giữ lại: Nghi cân lệch')).toBeVisible()
  await expect(main.getByText('Con này không phân cho bạn.')).toBeVisible()
  await expect(main.getByRole('button', { name: /^(Duyệt|Giữ lại|Loại bỏ|Xác nhận giữ)$/ })).toHaveCount(0)
  expect(api.writes()).toEqual([])
})

test('được phân xác nhận lần hai ngay trong Lô mình đang đo thì thấy nút xác nhận giữ', async ({ page, api }) => {
  const heldByOther: GradeDecisionResponse = { ...nearHold, holdReasons: ['NearThreshold', 'QcHold'], heldBy: OTHER_QC, reason: 'Nghi cân lệch' }
  api.get('/api/qc/tasks', [taskGrading, { ...taskSecondA, batchCode: batchGrading.batchCode }])
  api.get(`/api/batches/${batchGrading.batchCode}/grade-decisions`, [heldByOther])
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await expect(main.getByText(heldByOther.crabCode, { exact: true })).toBeVisible()
  await expect(main.getByRole('button', { name: 'Xác nhận giữ' })).toBeVisible()
  await expect(main.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0)
})

/* ---------- tab Đã xử lý: xem lại, đổi size hoặc hạng, loại bỏ con đã duyệt ---------- */

test('tab Đã xử lý liệt kê quyết định đã chốt, mới nhất trước, kèm số con theo quy cách', async ({ page, api }) => {
  // Thêm một con nhẹ hơn size M: đã duyệt Đặc cấp theo chỉ số C nhưng ngoài cỡ nên là cua dưới chuẩn.
  const outOfSize = decision({
    decisionNo: 'GD8Q1R4S7TUW', crabCode: 'CU1R4S7T', sessionNo: 'MS8Q1R4S7TUW', status: 'Approved', weightG: 186, carapaceLengthCm: 6.5, cIndex: 0.6773,
    proposedSize: 'OUT', finalSize: 'OUT', finalGrade: 'SPECIAL', specCode: 'FAT-OUT-G1', isSubstandard: true, liveStatus: 'Alive', foodSafety: 'Pass',
    decidedBy: ME, decidedAt: hoursAgo(5),
  })
  api.get(`/api/batches/${batchGrading.batchCode}/grade-decisions`, [...decisions, outOfSize])
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await main.getByRole('tab', { name: /Đã xử lý/ }).click()
  const rows = main.getByRole('button', { name: /^CU/ })
  await expect(rows).toHaveText([
    new RegExp(`${approved.crabCode}.*388 g.*Size XL.*Đặc cấp`),
    new RegExp(`${revised.crabCode}.*342 g · phiên bản 2.*Size L.*Cấp 1`),
    new RegExp(`${approvedBelow.crabCode}.*262 g.*Size M.*Dưới chuẩn`),
    new RegExp(`${rejected.crabCode}.*355 g.*Loại bỏ`),
    new RegExp(`${outOfSize.crabCode}.*186 g.*Ngoài cỡ.*Đặc cấp.*Dưới chuẩn`),
  ])
  // Con hạng Dưới chuẩn chỉ mang một nhãn "Dưới chuẩn", không lặp hai lần.
  await expect(rows.nth(2).getByText('Dưới chuẩn')).toHaveCount(1)
  // Thẻ của con đang chờ và các nút duyệt không còn ở tab này.
  await expect(main.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0)

  await main.getByText('Theo quy cách').click()
  await expect(main.getByRole('group').filter({ hasText: 'Theo quy cách' }).getByRole('listitem')).toHaveText([/Size XL · Đặc cấp.*1 con/, /Size L · Cấp 1.*1 con/])
})

test('xem lại một con đã xử lý: phiên bản hiện hành với lý do và ảnh, phiên bản trước nằm trong phần gấp lại', async ({ page, api }) => {
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await main.getByRole('tab', { name: /Đã xử lý/ }).click()
  await main.getByRole('button', { name: new RegExp(revised.crabCode) }).click()
  await expect(main.getByRole('heading', { name: revised.crabCode, level: 2 })).toBeVisible()

  const current = main.getByRole('article').first()
  await expect(current).toContainText('Phiên bản 2')
  await expect(current).toContainText('Size L')
  await expect(current).toContainText('Cấp 1')
  await expect(current.getByText('Yếm mềm khi bóp lại')).toBeVisible()
  await expect(current.getByRole('img', { name: `Ảnh quyết định phiên bản 2 của ${revised.crabCode}` })).toBeVisible()
  expect(api.sent('GET', `/api/grade-decisions/${revised.decisionNo}/photo`).map((c) => c.auth)).toEqual([`Bearer ${TOKEN}`])
  await current.getByText('Chi tiết').click()
  await expect(valueOf(current, 'Đề xuất')).toHaveText('Size L · Đặc cấp')
  await expect(valueOf(current, 'Quy cách')).toHaveText('FAT-L-G1')
  await expect(valueOf(current, 'Khối lượng')).toHaveText('342 g')
  await expect(valueOf(current, 'Chỉ số C')).toHaveText('0,6936')
  await expect(valueOf(current, 'Tình trạng')).toHaveText('Còn sống, khoẻ')
  await expect(valueOf(current, 'An toàn thực phẩm')).toHaveText('An toàn')

  await main.getByText('Phiên bản trước').click()
  const older = main.getByRole('article').nth(1)
  await expect(older).toContainText('Phiên bản 1')
  await expect(older).toContainText('Bản cũ')
  // Chỉ phiên bản hiện hành đã duyệt mới đổi hoặc loại được.
  await expect(main.getByRole('button', { name: 'Đổi size, hạng' })).toBeVisible()
  await expect(main.getByRole('button', { name: 'Loại bỏ', exact: true })).toBeVisible()

  await main.getByRole('button', { name: 'Danh sách' }).click()
  await main.getByRole('button', { name: new RegExp(rejected.crabCode) }).click()
  const gone = main.getByRole('article').first()
  await expect(gone).toContainText('Loại bỏ')
  await expect(gone.getByText('Chết trước khi kiểm cảm quan')).toBeVisible()
  await gone.getByText('Chi tiết').click()
  await expect(valueOf(gone, 'Tình trạng')).toHaveText('Đã chết')
  await expect(valueOf(gone, 'An toàn thực phẩm')).toHaveText('Không an toàn')
  await expect(main.getByRole('button', { name: /Đổi size, hạng|^Loại bỏ$/ })).toHaveCount(0)
  expect(api.writes()).toEqual([])
})

test('đổi hạng con đã duyệt: chỉ chọn được size, hạng không vượt số đo; gửi multipart kèm lý do và ảnh, tạo phiên bản mới', async ({ page, api }) => {
  const queue = liveDecisions(api)
  const next: GradeDecisionResponse = {
    ...approved, decisionNo: 'GD5N8P1Q4RSU', versionNo: 2, finalGrade: 'G1', specCode: 'FAT-XL-G1', sensoryNote: null, reason: 'Khách soi lại thấy yếm mềm',
    hasPhoto: true, decidedAt: now(), createdAt: now(),
  }
  let history: GradeDecisionResponse[] = [approved]
  api.get(`/api/crab-units/${approved.crabCode}/grade-decisions`, () => history)
  api.get(`/api/grade-decisions/${next.decisionNo}/photo`, file(PNG, 'image/png'))
  api.post(act(approved, 'revise'), () => {
    history = [{ ...approved, status: 'Superseded', isCurrent: false }, next]
    return queue.replace(next)
  })

  await page.goto(PAGE)
  const main = page.getByRole('main')
  await main.getByRole('tab', { name: /Đã xử lý/ }).click()
  await main.getByRole('button', { name: new RegExp(approved.crabCode) }).click()
  await main.getByRole('button', { name: 'Đổi size, hạng' }).click()
  const dialog = page.getByRole('dialog', { name: `Đổi hạng ${approved.crabCode}` })
  await expect(dialog).toContainText('Hiện tại: Size XL · Đặc cấp')
  const size = dialog.getByLabel('Size')
  const grade = dialog.getByLabel('Hạng')
  await expect(size).toHaveValue('XL')
  await expect(grade).toHaveValue('SPECIAL')
  await expect(size.getByRole('option')).toHaveText(['Size XL', 'Size L', 'Size M', 'Ngoài cỡ'])
  await expect(grade.getByRole('option')).toHaveText(['Đặc cấp', 'Cấp 1', 'Dưới chuẩn'])

  // Chưa đổi gì, thiếu lý do hoặc thiếu ảnh thì chưa lưu được.
  const save = dialog.getByRole('button', { name: 'Lưu' })
  await dialog.getByLabel('Lý do').fill(' Khách soi lại thấy yếm mềm ')
  await dialog.getByLabel('Chụp ảnh').setInputFiles(photo('can-cu.png'))
  await expect(save).toBeDisabled()
  await size.selectOption({ label: 'Ngoài cỡ' })
  await expect(dialog.getByText('Cua dưới chuẩn, rời quy cách đặt trước.')).toBeVisible()
  await size.selectOption({ label: 'Size XL' })
  await grade.selectOption({ label: 'Cấp 1' })
  await expect(dialog.getByText('Cua dưới chuẩn, rời quy cách đặt trước.')).toHaveCount(0)
  expect(api.writes()).toEqual([])
  await save.click()
  await expect(page.getByRole('status').filter({ hasText: `Đã đổi ${approved.crabCode} thành Size XL · Cấp 1.` })).toBeVisible()
  await expect(dialog).toHaveCount(0)

  const [sent] = api.sent('POST', act(approved, 'revise'))
  expect(sent.multipart).toBe(true)
  expect(sent.body).toEqual({ FinalSize: 'XL', FinalGrade: 'G1', Reason: 'Khách soi lại thấy yếm mềm', Photo: 'file:can-cu.png' })
  expect(api.writes()).toEqual([`POST ${act(approved, 'revise')}`])

  // Quyết định cũ được giữ làm phiên bản trước; phiên bản mới mang lý do và ảnh.
  const current = main.getByRole('article').first()
  await expect(current).toContainText('Phiên bản 2')
  await expect(current).toContainText('Cấp 1')
  await expect(current.getByText('Khách soi lại thấy yếm mềm')).toBeVisible()
  await expect(current.getByRole('img', { name: `Ảnh quyết định phiên bản 2 của ${approved.crabCode}` })).toBeVisible()
  await main.getByText('Phiên bản trước').click()
  await expect(main.getByRole('article').nth(1)).toContainText('Bản cũ')
})

test('con đo ra size L thì không đổi lên được XL; loại bỏ con đã duyệt cũng gửi multipart tới quyết định hiện hành', async ({ page, api }) => {
  const queue = liveDecisions(api)
  api.post(act(revised, 'reject'), () => queue.replace({
    ...revised, decisionNo: 'GD6P9Q2R5STV', versionNo: 3, status: 'Rejected', finalSize: null, finalGrade: null, specCode: null, liveStatus: 'Weak', foodSafety: 'Pass',
    reason: 'Yếu hẳn sau một đêm', decidedAt: now(),
  }))
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await main.getByRole('tab', { name: /Đã xử lý/ }).click()
  await main.getByRole('button', { name: new RegExp(revised.crabCode) }).click()

  await main.getByRole('button', { name: 'Đổi size, hạng' }).click()
  const revise = page.getByRole('dialog', { name: `Đổi hạng ${revised.crabCode}` })
  await expect(revise).toContainText('Hiện tại: Size L · Cấp 1')
  await expect(revise.getByLabel('Size').getByRole('option')).toHaveText(['Size L', 'Size M', 'Ngoài cỡ'])
  await revise.getByText('Đóng', { exact: true }).click()

  await main.getByRole('button', { name: 'Loại bỏ', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: `Loại bỏ ${revised.crabCode}` })
  await pick(dialog, 'Tình trạng', 'Yếu nặng')
  await pick(dialog, 'An toàn thực phẩm', 'An toàn')
  await dialog.getByLabel('Lý do').fill('Yếu hẳn sau một đêm')
  await dialog.getByLabel('Chụp ảnh').setInputFiles(photo('cua-yeu.png'))
  await dialog.getByRole('button', { name: 'Loại bỏ', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: `Đã loại bỏ ${revised.crabCode}.` })).toBeVisible()
  const [sent] = api.sent('POST', act(revised, 'reject'))
  expect(sent.multipart).toBe(true)
  expect(sent.body).toEqual({ LiveStatus: 'Weak', FoodSafety: 'Pass', Reason: 'Yếu hẳn sau một đêm', Photo: 'file:cua-yeu.png' })
  expect(api.writes()).toEqual([`POST ${act(revised, 'reject')}`])
})

/* ---------- hàng chờ trống và tự làm mới ---------- */

test('không còn con nào chờ duyệt thì nhắc số con chưa đo ở trạm; chưa xử lý con nào thì tab Đã xử lý cũng chỉ một câu', async ({ page, api }) => {
  api.get(`/api/batches/${batchGrading.batchCode}/grade-decisions`, [])
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await expect(main.getByText('Không có con nào chờ duyệt')).toBeVisible()
  await expect(main.getByText('Còn 5 con chưa đo ở trạm.')).toBeVisible()
  await expect(main.getByText(/^Con \d+ \/ \d+$/)).toHaveCount(0)
  await main.getByRole('tab', { name: /Đã xử lý/ }).click()
  await expect(main.getByText('Chưa có con nào được duyệt hoặc loại')).toBeVisible()
  // Không có thẻ nào nên không gọi API của lượt đo hay con cua.
  expect(api.calls.filter((c) => /measurement-sessions|crab-units/.test(c.path))).toEqual([])
})

test('người nuôi đo thêm ở trạm thì đề xuất mới tự vào hàng chờ sau 20 giây', async ({ page, api }) => {
  await page.clock.install()
  const queue = liveDecisions(api, [draft])
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await expect(main.getByText(draft.crabCode, { exact: true })).toBeVisible()
  await expect(main.getByText(/^Con \d+ \/ \d+$/)).toHaveCount(0)

  queue.list = [draft, nearHold]
  await page.clock.fastForward(20_000)
  await expect(main.getByText('Con 1 / 2')).toBeVisible()
  // Con đang xem không bị đổi khi hàng chờ dài thêm.
  await expect(main.getByText(draft.crabCode, { exact: true })).toBeVisible()
  await expect(main.getByRole('tab', { name: /Chờ duyệt/ })).toContainText('2')
})
