/* /qc — Tất cả việc đang chờ của Nhân viên kiểm phẩm (GET /api/qc/tasks). Việc do hệ thống phân ngẫu nhiên nên trang chỉ đọc:
   đếm theo loại, gom thành nhóm, mỗi hàng dẫn tới trang làm việc (phiếu nhận, hàng chờ phân hạng của Lô, biên bản thăm trại).
   Đầu tệp có một lượt mở từng trang của cổng chỉ với mockQc(api), để dữ liệu mặc định luôn đủ cho mọi trang trong QC_PAGES. */
import type { GoodsReceiptResponse, QcTaskResponse } from '../src/shared/api/api.gen'
import { TOKEN, expect, reply, signIn, test } from './support/app'
import {
  QC_PAGES, batchGrading, batchIncoming, batchSecond, batchVisit, hoursAgo, mockQc, noDevReload, receipt, receiptDone, taskDispatch, taskGrading, taskIncoming,
  taskVisit, tasks, valueOf,
} from './support/qc'

test.beforeEach(async ({ page, api }) => {
  await noDevReload(page)
  await signIn(page, 'QcInspector')
  mockQc(api)
})

/** Mục menu phải sáng ở từng nhóm trang. */
const MENU: [prefix: string, label: string][] = [
  ['/qc/kiem-dau-vao', 'Kiểm đầu vào'],
  ['/qc/phan-hang', 'Duyệt phân hạng'],
  ['/qc/tham-trai', 'Thăm trại giữa vụ'],
  ['/qc/chuan', 'Chuẩn phân hạng'],
  ['/qc', 'Tất cả việc'],
]

for (const target of QC_PAGES) {
  test(`${target.path} dựng đủ với dữ liệu mặc định, không ghi gì lên máy chủ`, async ({ page, api }) => {
    await page.goto(target.path)
    await expect(page.getByText(target.ready)).toBeVisible()
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
    const menu = page.getByRole('navigation', { name: 'Menu Nhân viên kiểm phẩm' })
    await expect(menu.locator('[aria-current="page"]')).toHaveText(MENU.find(([prefix]) => target.path.startsWith(prefix))![1])
    expect(api.writes()).toEqual([])
    expect(api.calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true)
  })
}

test('đếm việc theo loại và gom thành nhóm, mỗi hàng dẫn tới đúng trang làm việc', async ({ page, api }) => {
  await page.goto('/qc')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Tất cả việc', level: 1 })).toBeVisible()

  // Bốn ô đếm; mỗi con số là liên kết tới danh sách của loại việc đó. Hai việc xác nhận lần hai cùng dẫn về trang phân hạng.
  const counts: [label: string, count: string, href: string][] = [
    ['Kiểm đầu vào', '1', '/qc/kiem-dau-vao'],
    ['Duyệt phân hạng', '1', '/qc/phan-hang'],
    ['Xác nhận lần hai', '2', '/qc/phan-hang'],
    ['Thăm trại giữa vụ', '1', '/qc/tham-trai'],
  ]
  for (const [label, count, href] of counts) {
    const link = valueOf(main, label).getByRole('link')
    await expect(link).toHaveText(count)
    await expect(link).toHaveAttribute('href', href)
  }

  // Kiểm đầu vào: việc chỉ mang id phiếu, trang tra số phiếu qua danh sách phiếu nhận của Lô (bỏ qua phiếu người khác đã kiểm xong).
  const incoming = main.getByRole('link', { name: new RegExp(receipt.receiptNo) })
  await expect(incoming).toHaveAttribute('href', `/qc/kiem-dau-vao/${receipt.receiptNo}?lo=${batchIncoming.batchCode}`)
  await expect(incoming).toContainText(`Lô ${batchIncoming.batchCode} · ${batchIncoming.title}`)
  await expect(incoming).toContainText('3 / 20 con')
  await expect(incoming).toContainText('Loại 1')
  await expect(main.getByText(receiptDone.receiptNo)).toHaveCount(0)

  // Duyệt phân hạng: mỗi Lô một buổi đo.
  const grading = main.getByRole('link', { name: new RegExp(batchGrading.batchCode) })
  await expect(grading).toHaveAttribute('href', `/qc/phan-hang/${batchGrading.batchCode}`)
  await expect(grading).toContainText(batchGrading.title)
  await expect(grading).toContainText('Cua thịt vỗ béo · 5 chưa đo · 3 đã duyệt')
  await expect(grading).toContainText('3 con chờ duyệt')

  // Xác nhận lần hai: mỗi con bị giữ lại là một việc, hai việc của cùng một Lô gom thành một hàng.
  const second = main.getByRole('link', { name: new RegExp(batchSecond.batchCode) })
  await expect(second).toHaveAttribute('href', `/qc/phan-hang/${batchSecond.batchCode}`)
  await expect(second).toContainText('2 con chờ xác nhận')

  // Thăm trại giữa vụ: dẫn tới biên bản của đúng việc được phân.
  const visit = main.getByRole('link', { name: new RegExp(batchVisit.batchCode) })
  await expect(visit).toHaveAttribute('href', `/qc/tham-trai/${taskVisit.assignmentId}`)
  await expect(visit).toContainText(`Người nuôi: ${batchVisit.executorName}`)

  // Loại việc chưa có trang làm việc trên web nằm trong phần gấp lại, không có liên kết.
  await main.getByText('Việc khác').click()
  const other = main.getByRole('listitem').filter({ hasText: 'Kiểm xuất hàng' })
  await expect(other).toContainText(`Lô ${taskDispatch.batchCode}`)
  await expect(other.getByRole('link')).toHaveCount(0)

  // Trang chỉ đọc: người kiểm không tự nhận, không đổi được việc.
  expect(api.writes()).toEqual([])
  await expect(main.getByRole('button', { name: /Nhận việc|Đổi người|Từ chối/ })).toHaveCount(0)
})

const ROWS: { what: string; row: string; url: string; heading: string }[] = [
  { what: 'phiếu nhận hàng', row: receipt.receiptNo, url: `/qc/kiem-dau-vao/${receipt.receiptNo}?lo=${batchIncoming.batchCode}`, heading: receipt.receiptNo },
  { what: 'buổi đo của Lô', row: batchGrading.batchCode, url: `/qc/phan-hang/${batchGrading.batchCode}`, heading: batchGrading.title },
  { what: 'con chờ xác nhận lần hai', row: batchSecond.batchCode, url: `/qc/phan-hang/${batchSecond.batchCode}`, heading: batchSecond.title },
  { what: 'lần thăm trại', row: batchVisit.batchCode, url: `/qc/tham-trai/${taskVisit.assignmentId}`, heading: batchVisit.title },
]

for (const { what, row, url, heading } of ROWS) {
  test(`bấm hàng ${what} thì mở trang làm việc của việc đó`, async ({ page }) => {
    await page.goto('/qc')
    await page.getByRole('main').getByRole('link', { name: new RegExp(row) }).click()
    await expect(page).toHaveURL((current) => current.pathname + current.search === url)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
  })
}

test('trong một nhóm, việc được phân sau cùng đứng trước', async ({ page, api }) => {
  const older: QcTaskResponse = { ...taskGrading, assignedAt: hoursAgo(30) }
  const newer: QcTaskResponse = { ...taskGrading, assignmentId: 520, batchCode: batchSecond.batchCode, targetId: 13, assignedAt: hoursAgo(2) }
  api.get('/api/qc/tasks', [older, newer])
  await page.goto('/qc')
  const main = page.getByRole('main')
  await expect(main.getByRole('link', { name: /CS-26/ })).toHaveText([new RegExp(batchSecond.batchCode), new RegExp(batchGrading.batchCode)])
  // Nhóm không có việc thì không hiện tên nhóm và không gọi API của nhóm đó.
  await expect(valueOf(main, 'Kiểm đầu vào').getByRole('link')).toHaveText('0')
  await expect(main.getByText('Việc khác')).toHaveCount(0)
  expect(api.calls.filter((c) => c.path.endsWith('/goods-receipts'))).toEqual([])
})

test('nhiều phiếu của cùng một Lô khớp lần lượt với từng việc; việc chưa tra được số phiếu thì nhắc tải lại', async ({ page, api }) => {
  const nextReceipt: GoodsReceiptResponse = {
    ...receipt, receiptNo: 'GR8L3N0RYB5V', lotCode: 'LN-2611-T2-03', declaredCount: 12, declaredWeightKg: 3.9, acceptedCount: 0, rejectedCount: 0, acceptedWeightG: 0,
  }
  api.get('/api/qc/tasks', [
    taskIncoming,
    { ...taskIncoming, assignmentId: 511, targetId: taskIncoming.targetId + 1, assignedAt: hoursAgo(0.5) },
    { ...taskIncoming, assignmentId: 512, targetId: taskIncoming.targetId + 2, assignedAt: hoursAgo(0.2) },
  ] satisfies QcTaskResponse[])
  // Lô có ba việc nhưng máy chủ mới trả hai phiếu đang kiểm của tôi (phiếu thứ ba vừa lập, chưa kịp có trong danh sách).
  api.get(`/api/batches/${batchIncoming.batchCode}/goods-receipts`, [receiptDone, receipt, nextReceipt])
  await page.goto('/qc')
  const main = page.getByRole('main')

  await expect(valueOf(main, 'Kiểm đầu vào').getByRole('link')).toHaveText('3')
  // Việc mới nhất trước: phiếu thứ hai rồi tới phiếu đầu.
  const rows = main.getByRole('link', { name: /^GR/ })
  await expect(rows).toHaveText([new RegExp(nextReceipt.receiptNo), new RegExp(receipt.receiptNo)])
  await expect(rows.first()).toHaveAttribute('href', `/qc/kiem-dau-vao/${nextReceipt.receiptNo}?lo=${batchIncoming.batchCode}`)
  await expect(rows.first()).toContainText('0 / 12 con')
  await expect(rows.first()).not.toContainText('Loại')
  // Một Lô chỉ gọi danh sách phiếu nhận một lần dù có ba việc.
  expect(api.sent('GET', `/api/batches/${batchIncoming.batchCode}/goods-receipts`)).toHaveLength(1)

  await main.getByRole('button', { name: /Phiếu nhận hàng/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Chưa tra được số phiếu của việc này. Tải lại trang.' })).toBeVisible()
  await expect(page).toHaveURL(/\/qc$/)
})

test('chưa được phân việc nào thì chỉ có một câu, không gọi thêm API', async ({ page, api }) => {
  api.get('/api/qc/tasks', [])
  await page.goto('/qc')
  const main = page.getByRole('main')
  await expect(main.getByText('Chưa có việc nào chờ bạn')).toBeVisible()
  await expect(main.getByRole('term')).toHaveCount(0)
  expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /api/qc/tasks'])
})

test('không tải được việc thì báo lỗi của máy chủ và thử lại được', async ({ page, api }) => {
  let down = true
  api.get('/api/qc/tasks', () => (down ? reply(500, { status: 500, detail: 'Máy chủ đang bận, thử lại sau.' }) : tasks))
  await page.goto('/qc')
  const error = page.getByRole('main').getByRole('alert')
  await expect(error).toContainText('Không tải được dữ liệu')
  await expect(error).toContainText('Máy chủ đang bận, thử lại sau.')

  down = false
  await error.getByRole('button', { name: 'Thử lại' }).click()
  await expect(page.getByRole('main').getByRole('link', { name: new RegExp(receipt.receiptNo) })).toBeVisible()
  await expect(error).toHaveCount(0)
})

test('việc mới được phân tự hiện sau một phút, không cần tải lại trang', async ({ page, api }) => {
  await page.clock.install()
  let assigned: QcTaskResponse[] = [taskGrading]
  api.get('/api/qc/tasks', () => assigned)
  await page.goto('/qc')
  const main = page.getByRole('main')
  await expect(main.getByRole('link', { name: new RegExp(batchGrading.batchCode) })).toBeVisible()
  await expect(valueOf(main, 'Thăm trại giữa vụ').getByRole('link')).toHaveText('0')

  // Quản trị vừa phân một lần thăm trại; trang tự hỏi lại danh sách việc mỗi phút.
  assigned = [taskGrading, taskVisit]
  await page.clock.fastForward(60_000)
  await expect(main.getByRole('link', { name: new RegExp(batchVisit.batchCode) })).toBeVisible()
  await expect(valueOf(main, 'Thăm trại giữa vụ').getByRole('link')).toHaveText('1')
  expect(api.sent('GET', '/api/qc/tasks')).toHaveLength(2)
})
