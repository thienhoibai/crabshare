/* Thăm trại giữa vụ: /qc/tham-trai (lần thăm được phân cho tôi) và /qc/tham-trai/:assignmentId (lập biên bản ngay tại trại).
   Biên bản gửi multipart tới POST /api/qc/site-visits/{assignmentId}/report: vị trí của máy, các hộp đã xem, số cua đã thấy,
   nhận xét và ảnh chụp tại trại. Máy chủ chỉ nhận biên bản lập gần trại; trang lấy vị trí từ trình duyệt ngay khi mở. */
import type { Locator } from '@playwright/test'
import type { QcTaskResponse, SiteVisitReportResponse } from '../src/shared/api/api.gen'
import { expect, photo, reply, signIn, test } from './support/app'
import { ME, batchVisit, mockQc, noDevReload, pastVisit, taskGrading, taskVisit, tasks, valueOf } from './support/qc'

const PAGE = `/qc/tham-trai/${taskVisit.assignmentId}`
const REPORT = `/api/qc/site-visits/${taskVisit.assignmentId}/report`
const VISIT = `/api/batches/${batchVisit.batchCode}`

/** Vị trí của máy đang đứng ở trại (Rạch Gốc, Ngọc Hiển). */
const AT_FARM = { latitude: 8.6012, longitude: 104.9573, accuracy: 12 }
test.use({ geolocation: AT_FARM, permissions: ['geolocation'] })

const report: SiteVisitReportResponse = {
  reportNo: 'TT6R9S2T5UVW', batchCode: batchVisit.batchCode, qcUserId: ME, visitedAt: new Date().toISOString(), latitude: AT_FARM.latitude, longitude: AT_FARM.longitude,
  distanceToFarmM: 350, boxCodes: ['R02-T1-01', 'R02-T1-03'], crabsSeen: 37, findings: 'Cua khoẻ, đủ hộp theo sổ, nước trong.',
}

/** Nút gửi của form: chữ trên nút nói còn thiếu gì. */
const submitOf = (main: Locator) => main.getByRole('button', { name: /^(Còn thiếu|Lập biên bản)/ })

/** Điền phần ghi nhận: số cua, nhận xét, ảnh chụp tại trại. */
async function fillFindings(main: Locator, crabs = '37', findings = report.findings) {
  await main.getByLabel('Số cua đã thấy').fill(crabs)
  await main.getByLabel('Nhận xét').fill(findings)
  await main.getByLabel('Chụp ảnh').setInputFiles(photo('trai.png'))
}

test.beforeEach(async ({ page, api }) => {
  await noDevReload(page)
  await signIn(page, 'QcInspector')
  mockQc(api)
})

test('danh sách có lần thăm trại được phân cho tôi, bấm vào thì mở biên bản; không có thì chỉ một câu', async ({ page, api }) => {
  await page.goto('/qc/tham-trai')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Thăm trại giữa vụ', level: 1 })).toBeVisible()
  const row = main.getByRole('link', { name: new RegExp(batchVisit.batchCode) })
  await expect(row).toContainText(batchVisit.title)
  await expect(row).toContainText(`Người nuôi: ${batchVisit.executorName}`)
  await expect(main.getByRole('link')).toHaveCount(1)
  await row.click()
  await expect(page).toHaveURL(new RegExp(`${PAGE}$`))
  await expect(page.getByRole('heading', { name: batchVisit.title, level: 1 })).toBeVisible()

  api.get('/api/qc/tasks', [taskGrading])
  await page.goto('/qc/tham-trai')
  await expect(main.getByText('Chưa có lần thăm trại nào được phân cho bạn')).toBeVisible()
})

test('lập biên bản tại trại: bấm các hộp đã xem, ghi số cua, nhận xét, chụp ảnh rồi gửi multipart kèm vị trí của máy', async ({ page, api }) => {
  // Gửi xong thì việc thăm trại rời danh sách việc đang chờ.
  let assigned: QcTaskResponse[] = tasks
  api.get('/api/qc/tasks', () => assigned)
  api.post(REPORT, () => {
    assigned = tasks.filter((t) => t.assignmentId !== taskVisit.assignmentId)
    return reply(201, report)
  })
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: batchVisit.title, level: 1 })).toBeVisible()
  await expect(main.getByText(`Thăm trại · Lô ${batchVisit.batchCode}`)).toBeVisible()

  // Cột bên: thông tin để đối chiếu với thực tế ở trại, biên bản của lần thăm trước gấp lại.
  const side = main.getByRole('complementary')
  await expect(valueOf(side, 'Người nuôi')).toHaveText(batchVisit.executorName)
  await expect(valueOf(side, 'Loại cua')).toHaveText('Cua gạch')
  await expect(valueOf(side, 'Cua đang nuôi theo sổ')).toHaveText('38 con')
  await expect(valueOf(side, 'Số ngày nuôi')).toHaveText('16')
  await side.getByText('Biên bản trước').click()
  await expect(side.getByRole('article')).toContainText('3 hộp · 39 con')
  await expect(side.getByRole('article')).toContainText(pastVisit.findings)

  // Vị trí lấy ngay khi mở trang; nút gửi nói rõ còn thiếu gì.
  await expect(main.getByText('Đã có vị trí · sai số 12 m')).toBeVisible()
  const submit = submitOf(main)
  await expect(submit).toHaveText('Còn thiếu: hộp đã xem, số cua, nhận xét, ảnh')
  await expect(submit).toBeDisabled()

  // Bấm hộp để chọn, bấm lần nữa để bỏ.
  await expect(main.getByRole('heading', { name: 'Hộp đã xem · 0', level: 2 })).toBeVisible()
  for (const code of ['R02-T1-01', 'R02-T1-02', 'R02-T1-03']) await main.getByRole('button', { name: code }).click()
  await main.getByRole('button', { name: 'R02-T1-02' }).click()
  await expect(main.getByRole('heading', { name: 'Hộp đã xem · 2', level: 2 })).toBeVisible()
  await expect(main.getByRole('button', { name: /^R02-/, pressed: true })).toHaveText(['R02-T1-01', 'R02-T1-03'])
  await expect(submit).toHaveText('Còn thiếu: số cua, nhận xét, ảnh')

  await fillFindings(main, '37', `  ${report.findings} `)
  await expect(submit).toHaveText('Lập biên bản')
  await submit.click()
  // Hộp xác nhận nhắc lại con số trước khi gửi; chưa bấm gửi thì chưa ghi gì.
  const dialog = page.getByRole('dialog', { name: 'Gửi biên bản thăm trại' })
  await expect(dialog).toContainText('Gửi rồi không sửa được.')
  await expect(valueOf(dialog, 'Hộp đã xem')).toHaveText('2')
  await expect(valueOf(dialog, 'Cua đã thấy')).toHaveText('37 con')
  expect(api.writes()).toEqual([])

  await dialog.getByRole('button', { name: 'Gửi biên bản' }).click()
  await expect(page.getByRole('status').filter({ hasText: `Đã lập biên bản ${report.reportNo}.` })).toBeVisible()
  const [sent] = api.sent('POST', REPORT)
  expect(sent.multipart).toBe(true)
  expect(sent.body).toEqual({
    Latitude: '8.601200', Longitude: '104.957300', BoxCodes: 'R02-T1-01,R02-T1-03', CrabsSeen: '37', Findings: report.findings, Photo: 'file:trai.png',
  })
  expect(api.writes()).toEqual([`POST ${REPORT}`])

  // Màn hình kết quả: số biên bản, khoảng cách tới trại do máy chủ tính; form không còn để gửi lần hai.
  await expect(main.getByRole('heading', { name: 'Đã lập biên bản', level: 1 })).toBeVisible()
  await expect(main.getByRole('heading', { name: report.reportNo, level: 2 })).toBeVisible()
  await expect(valueOf(main, 'Cách trại')).toHaveText('350 m')
  await expect(valueOf(main, 'Hộp đã xem')).toHaveText('2')
  await expect(valueOf(main, 'Cua đã thấy')).toHaveText('37 con')
  await expect(main.getByLabel('Nhận xét')).toHaveCount(0)

  await main.getByRole('link', { name: 'Về danh sách việc' }).click()
  await expect(page).toHaveURL(/\/qc$/)
  await expect(valueOf(page.getByRole('main'), 'Thăm trại giữa vụ').getByRole('link')).toHaveText('0')
})

test.describe('trình duyệt chưa cho trang biết vị trí', () => {
  test.use({ permissions: [] })

  test('không có vị trí thì không lập được biên bản; mở quyền rồi bấm Lấy lại là được', async ({ page, context, api }) => {
    await page.goto(PAGE)
    const main = page.getByRole('main')
    const blocked = main.getByText('Trình duyệt đang chặn vị trí. Mở quyền Vị trí cho trang này rồi bấm Lấy lại.')
    await expect(main.getByText('Chưa có vị trí')).toBeVisible()
    await expect(blocked).toBeVisible()

    await main.getByRole('button', { name: 'R02-T1-04' }).click()
    await fillFindings(main)
    const submit = submitOf(main)
    await expect(submit).toHaveText('Còn thiếu: vị trí')
    await expect(submit).toBeDisabled()
    // Bấm Enter trong form cũng không mở hộp gửi.
    await main.getByLabel('Số cua đã thấy').press('Enter')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await context.grantPermissions(['geolocation'])
    await main.getByRole('button', { name: 'Lấy lại' }).click()
    await expect(main.getByText('Đã có vị trí · sai số 12 m')).toBeVisible()
    await expect(blocked).toHaveCount(0)
    await expect(submit).toHaveText('Lập biên bản')
    await expect(submit).toBeEnabled()
    expect(api.writes()).toEqual([])
  })
})

test('máy chủ không nhận biên bản lập xa trại: lý do hiện trong hộp gửi, không dẫn số quy tắc, form giữ nguyên', async ({ page, api }) => {
  api.post(REPORT, () => reply(422, { status: 422, detail: 'Vị trí chụp cách trại 3.412 m; biên bản phải lập tại trại (BR-233).' }))
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await main.getByRole('button', { name: 'R02-T1-05' }).click()
  await fillFindings(main)
  await submitOf(main).click()
  const dialog = page.getByRole('dialog', { name: 'Gửi biên bản thăm trại' })
  await dialog.getByRole('button', { name: 'Gửi biên bản' }).click()
  await expect(dialog.getByText('Vị trí chụp cách trại 3.412 m; biên bản phải lập tại trại.')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Đã lập biên bản' })).toHaveCount(0)

  await dialog.getByText('Đóng', { exact: true }).click()
  await expect(main.getByRole('heading', { name: 'Hộp đã xem · 1', level: 2 })).toBeVisible()
  await expect(main.getByLabel('Nhận xét')).toHaveValue(report.findings)
  await expect(submitOf(main)).toHaveText('Lập biên bản')
  // Mở lại hộp gửi thì lỗi của lần trước không còn.
  await submitOf(main).click()
  await expect(dialog.getByText(/Vị trí chụp cách trại/)).toHaveCount(0)
})

test('không đọc được sơ đồ hộp của Lô thì gõ mã hộp cách nhau bằng dấu phẩy; mã trùng chỉ gửi một lần', async ({ page, api }) => {
  const forbidden = () => reply(403, { status: 403, detail: 'Bạn không có quyền xem Lô này.' })
  api.get(`${VISIT}/boxes`, forbidden)
  api.get(`${VISIT}/site-visits`, forbidden)
  api.post(REPORT, () => reply(201, { ...report, boxCodes: ['R02-T1-01', 'R02-T1-02'] } satisfies SiteVisitReportResponse))
  await page.goto(PAGE)
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Hộp đã xem', exact: true, level: 2 })).toBeVisible()
  await expect(main.getByRole('button', { name: /^R02-/ })).toHaveCount(0)
  // Không xem được biên bản cũ thì không hiện mục đó, không báo lỗi.
  await expect(main.getByText('Biên bản trước')).toHaveCount(0)
  await expect(main.getByRole('alert')).toHaveCount(0)

  await fillFindings(main)
  const codes = main.getByLabel('Mã hộp')
  await codes.fill('A1')
  await expect(submitOf(main)).toHaveText('Còn thiếu: hộp đã xem')
  await codes.fill(' R02-T1-01, R02-T1-02 ,R02-T1-01,')
  await submitOf(main).click()
  const dialog = page.getByRole('dialog', { name: 'Gửi biên bản thăm trại' })
  await expect(valueOf(dialog, 'Hộp đã xem')).toHaveText('2')
  await dialog.getByRole('button', { name: 'Gửi biên bản' }).click()
  await expect(main.getByRole('heading', { name: 'Đã lập biên bản', level: 1 })).toBeVisible()
  expect(api.sent('POST', REPORT)[0].body).toMatchObject({ BoxCodes: 'R02-T1-01,R02-T1-02', CrabsSeen: '37' })
})

for (const [what, id] of [['việc không có trong danh sách của tôi', 999], ['việc thuộc loại khác', taskGrading.assignmentId]] as const) {
  test(`mở biên bản của ${what} thì báo không có việc này và không gọi API của Lô`, async ({ page, api }) => {
    await page.goto(`/qc/tham-trai/${id}`)
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { name: 'Không có việc này', level: 1 })).toBeVisible()
    await expect(main.getByText('Việc này đã xong hoặc không phân cho bạn')).toBeVisible()
    await expect(main.getByLabel('Nhận xét')).toHaveCount(0)
    expect(api.calls.map((c) => c.path)).toEqual(['/api/qc/tasks'])
  })
}
