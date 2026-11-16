/* Quản trị duyệt giải ngân theo mốc (/admin/tranches): duyệt, yêu cầu giải trình, dừng chi.
   Kiểm tra một dòng mốc hiện gì (điều kiện mở mốc, số tiền, tiến trình), hộp xác nhận và đúng lời gọi đã gửi. */
import type { TrancheDecisionRequest } from '../src/shared/api/api.gen'
import { daysFromNow, expect, reply, signIn, test, vnd, type Api, type Page } from './support/app'
import {
  fact, mockAdmin, overdueTranche, plannedTranche, releasedTranche, requestedTranche, requestedTranche2, shownDate, shownDateTime, trancheListReply,
  tranches, type DisbursementTranche,
} from './support/admin'

const LIST = '/api/admin/tranches'

/** Danh sách mốc có trạng thái: test đổi một mốc khi máy chủ nhận quyết định, lần tải lại sau đó trả bản mới. */
function serveTranches(api: Api, start: DisbursementTranche[] = tranches) {
  const state = { rows: start }
  api.get(LIST, (call) => trancheListReply(state.rows)(call))
  const change = (id: number, patch: Partial<DisbursementTranche>) => {
    state.rows = state.rows.map((t) => (t.trancheId === id ? { ...t, ...patch } : t))
    return state.rows.find((t) => t.trancheId === id)!
  }
  return { state, change }
}

const row = (page: Page, t: DisbursementTranche) => page.getByRole('row').filter({ hasText: t.batchCode })

test.beforeEach(async ({ page, api }) => {
  mockAdmin(api)
  await signIn(page, 'PlatformAdmin')
})

test('hàng chờ xử lý: mỗi mốc hiện Lô, điều kiện mở mốc, số tiền, tiến trình và trạng thái', async ({ page, api }) => {
  await page.goto('/admin/tranches')
  await expect(page.getByRole('heading', { name: 'Duyệt giải ngân', level: 1 })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveText(['Chờ xử lý3', 'Đã giải ngân', 'Bị dừng chi', 'Chưa tới mốc', 'Dừng do thanh lý'])
  await expect(page.getByRole('tab', { name: 'Chờ xử lý' })).toHaveAttribute('aria-selected', 'true')
  // Mục chờ xử lý không gửi status: máy chủ tự trả các mốc đã xin và các mốc cần giải trình.
  expect(api.sent('GET', LIST).map((c) => c.query)).toEqual([{}])

  // Ba con số đầu trang: tiền chờ duyệt chỉ cộng các mốc đã xin.
  await expect(fact(page, 'Chờ duyệt')).toContainText('2')
  await expect(fact(page, 'Tiền chờ duyệt')).toContainText(vnd(requestedTranche.plannedAmount + requestedTranche2.plannedAmount))
  await expect(fact(page, 'Chờ giải trình')).toContainText('1')

  const requested = row(page, requestedTranche)
  await expect(requested).toContainText('Trại cua Tư Bền')
  await expect(requested).toContainText('Mốc 2')
  await expect(requested).toContainText('Có biên bản thăm trại giữa vụ')
  await expect(requested).toContainText(vnd(54_000_000))
  await expect(requested).toContainText(`Xin ${await shownDateTime(page, requestedTranche.requestedAt!)}`)
  await expect(requested.getByText('Đã xin giải ngân')).toBeVisible()
  await expect(requested.getByRole('button')).toHaveText(['Duyệt', 'Giải trình', 'Dừng chi'])

  // Mốc đang chờ giải trình đã quá hạn: chỉ còn dừng chi được.
  const overdue = row(page, overdueTranche)
  await expect(overdue).toContainText('Mốc 3')
  await expect(overdue).toContainText(vnd(18_000_000))
  await expect(overdue.getByText('Cần giải trình')).toBeVisible()
  await expect(overdue.getByText('Quá hạn', { exact: true })).toBeVisible()
  await expect(overdue).toContainText(`Hạn giải trình ${await shownDateTime(page, overdueTranche.explanationDeadline!)}`)
  await expect(overdue.getByRole('button')).toHaveText(['Dừng chi'])

  expect(api.writes()).toEqual([])
})

test('duyệt giải ngân: hộp xác nhận nêu điều kiện và số tiền, gửi release, mốc sang mục đã giải ngân', async ({ page, api }) => {
  const list = serveTranches(api)
  api.post(`${LIST}/${requestedTranche.trancheId}/release`, () =>
    list.change(requestedTranche.trancheId, { status: 'Released', releasedAt: new Date().toISOString(), instructionId: 91, instructionStatus: 'Created' }))

  await page.goto('/admin/tranches')
  await row(page, requestedTranche).getByRole('button', { name: 'Duyệt', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Duyệt giải ngân · mốc 2' })
  await expect(dialog).toContainText('P-2610-02 · Trại cua Tư Bền')
  await expect(fact(dialog, 'Điều kiện mở mốc')).toContainText('Có biên bản thăm trại giữa vụ')
  await expect(fact(dialog, 'Số tiền của mốc')).toContainText(vnd(54_000_000))
  await expect(dialog).toContainText('Lệnh chi được lập. Tiền chỉ đi khi bạn gửi lệnh chi.')
  // Duyệt không cần lý do.
  await expect(dialog.getByRole('textbox')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Duyệt giải ngân' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã duyệt giải ngân và lập lệnh chi.' })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  expect(api.sent('POST', `${LIST}/${requestedTranche.trancheId}/release`).map((c) => c.body)).toEqual([null])
  expect(api.writes()).toEqual([`POST ${LIST}/${requestedTranche.trancheId}/release`])

  // Hàng chờ tải lại: còn một mốc chờ duyệt.
  await expect(row(page, requestedTranche)).toHaveCount(0)
  await expect(fact(page, 'Chờ duyệt')).toContainText('1')
  await expect(fact(page, 'Tiền chờ duyệt')).toContainText(vnd(requestedTranche2.plannedAmount))

  await page.getByRole('tab', { name: 'Đã giải ngân' }).click()
  expect(api.sent('GET', LIST).at(-1)!.query).toEqual({ status: 'Released' })
  const released = page.getByRole('row').filter({ hasText: 'Mốc 2' })
  await expect(released.getByText('Đã giải ngân')).toBeVisible()
  await expect(released).toContainText('Lệnh chi chờ gửi')
  // Tiền chưa đi: bước kế tiếp là gửi lệnh chi của đúng Lô này.
  await expect(released.getByRole('link', { name: 'Gửi lệnh chi' })).toHaveAttribute('href', '/admin/finance?type=Disbursement&batch=P-2610-02')
  await expect(released.getByRole('button')).toHaveCount(0)
})

test('yêu cầu giải trình: lý do từ 5 ký tự, gửi need-explanation, mốc chờ người nuôi bổ sung', async ({ page, api }) => {
  const list = serveTranches(api)
  const deadline = daysFromNow(3)
  api.post(`${LIST}/${requestedTranche.trancheId}/need-explanation`, () =>
    list.change(requestedTranche.trancheId, { status: 'NeedsExplanation', explanationDeadline: deadline }))

  await page.goto('/admin/tranches')
  await row(page, requestedTranche).getByRole('button', { name: 'Giải trình' }).click()
  const dialog = page.getByRole('dialog', { name: 'Yêu cầu giải trình · mốc 2' })
  await expect(dialog).toContainText('Người nuôi có 72 giờ để bổ sung rồi xin lại.')
  await expect(fact(dialog, 'Số tiền của mốc')).toContainText(vnd(54_000_000))
  const submit = dialog.getByRole('button', { name: 'Gửi yêu cầu' })
  await expect(submit).toBeDisabled()
  await dialog.getByLabel('Cần giải trình điều gì').fill('Ảnh')
  await expect(submit).toBeDisabled()
  await dialog.getByLabel('Cần giải trình điều gì').fill('  Thiếu ảnh biên bản thăm trại  ')
  await submit.click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã yêu cầu người nuôi giải trình.' })).toBeVisible()
  const body: TrancheDecisionRequest = { reason: 'Thiếu ảnh biên bản thăm trại' }
  expect(api.sent('POST', `${LIST}/${requestedTranche.trancheId}/need-explanation`).map((c) => c.body)).toEqual([body])
  expect(api.writes()).toEqual([`POST ${LIST}/${requestedTranche.trancheId}/need-explanation`])

  const waiting = row(page, requestedTranche)
  await expect(waiting.getByText('Cần giải trình')).toBeVisible()
  await expect(waiting).toContainText(`Hạn giải trình ${await shownDateTime(page, deadline)}`)
  // Còn trong hạn thì chưa gắn nhãn quá hạn; không duyệt được cho tới khi người nuôi xin lại.
  await expect(waiting.getByText('Quá hạn', { exact: true })).toHaveCount(0)
  await expect(waiting.getByRole('button')).toHaveText(['Dừng chi'])
  await expect(fact(page, 'Chờ duyệt')).toContainText('1')
  await expect(fact(page, 'Chờ giải trình')).toContainText('2')
})

test('dừng chi: bắt buộc lý do, gửi block, mốc sang mục bị dừng chi và hết thao tác', async ({ page, api }) => {
  const list = serveTranches(api)
  api.post(`${LIST}/${overdueTranche.trancheId}/block`, () => list.change(overdueTranche.trancheId, { status: 'Blocked' }))

  await page.goto('/admin/tranches')
  await row(page, overdueTranche).getByRole('button', { name: 'Dừng chi' }).click()
  const dialog = page.getByRole('dialog', { name: 'Dừng chi · mốc 3' })
  await expect(dialog).toContainText('P-2609-05 · HTX Phú Tân')
  await expect(dialog).toContainText('Người nuôi không xin lại được mốc này.')
  await expect(fact(dialog, 'Điều kiện mở mốc')).toContainText('Bảng quyết toán được duyệt')
  const submit = dialog.getByRole('button', { name: 'Dừng chi' })
  await expect(submit).toBeDisabled()
  await dialog.getByLabel('Lý do dừng chi').fill('Quá hạn giải trình, không có chứng từ')
  await submit.click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã dừng chi mốc giải ngân.' })).toBeVisible()
  const body: TrancheDecisionRequest = { reason: 'Quá hạn giải trình, không có chứng từ' }
  expect(api.sent('POST', `${LIST}/${overdueTranche.trancheId}/block`).map((c) => c.body)).toEqual([body])
  expect(api.writes()).toEqual([`POST ${LIST}/${overdueTranche.trancheId}/block`])
  await expect(row(page, overdueTranche)).toHaveCount(0)
  await expect(fact(page, 'Chờ giải trình')).toContainText('0')

  await page.getByRole('tab', { name: 'Bị dừng chi' }).click()
  expect(api.sent('GET', LIST).at(-1)!.query).toEqual({ status: 'Blocked' })
  const blocked = row(page, overdueTranche)
  await expect(blocked.getByText('Bị dừng chi')).toBeVisible()
  await expect(blocked.getByRole('button')).toHaveCount(0)
})

test('máy chủ không cho duyệt thì lỗi hiện trong hộp thoại, không kèm số quy tắc, mốc vẫn chờ', async ({ page, api }) => {
  api.post(`${LIST}/${requestedTranche.trancheId}/release`, () =>
    reply(422, { status: 422, code: 'tranche.condition_unmet', detail: 'Điều kiện mốc chưa đạt: chưa có biên bản thăm trại (BR-089).' }))
  await page.goto('/admin/tranches')
  await row(page, requestedTranche).getByRole('button', { name: 'Duyệt', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Duyệt giải ngân · mốc 2' })
  await dialog.getByRole('button', { name: 'Duyệt giải ngân' }).click()
  await expect(dialog.getByText('Điều kiện mốc chưa đạt: chưa có biên bản thăm trại.', { exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Đóng' }).last().click()
  await expect(dialog).toHaveCount(0)
  await expect(row(page, requestedTranche).getByText('Đã xin giải ngân')).toBeVisible()
  expect(api.writes()).toEqual([`POST ${LIST}/${requestedTranche.trancheId}/release`])
})

test('các mục khác gửi đúng status lên máy chủ và có câu trống riêng', async ({ page, api }) => {
  await page.goto('/admin/tranches')
  await expect(row(page, requestedTranche)).toBeVisible()

  await page.getByRole('tab', { name: 'Đã giải ngân' }).click()
  const released = page.getByRole('row').filter({ hasText: 'Mốc 1' })
  await expect(released).toContainText(`Giải ngân ${await shownDateTime(page, releasedTranche.releasedAt!)}`)
  // Các con số đầu trang chỉ thuộc mục chờ xử lý.
  await expect(page.getByText('Tiền chờ duyệt')).toHaveCount(0)

  // Mốc chưa tới: hiện ngày dự kiến và vì sao người nuôi chưa xin được.
  await page.getByRole('tab', { name: 'Chưa tới mốc' }).click()
  const planned = page.getByRole('row').filter({ hasText: 'Mốc 3' })
  await expect(planned).toContainText(`Dự kiến ${await shownDate(page, plannedTranche.plannedDate!)}`)
  await expect(planned).toContainText('Lô chưa có bảng quyết toán được duyệt')
  await expect(planned.getByRole('button')).toHaveCount(0)

  await page.getByRole('tab', { name: 'Bị dừng chi' }).click()
  await expect(page.getByText('Không có mốc nào bị dừng chi')).toBeVisible()
  await page.getByRole('tab', { name: 'Dừng do thanh lý' }).click()
  await expect(page.getByText('Không có mốc nào dừng do thanh lý sớm')).toBeVisible()

  expect(api.sent('GET', LIST).map((c) => c.query.status)).toEqual([undefined, 'Released', 'Planned', 'Blocked', 'Stopped'])
  expect(api.writes()).toEqual([])
})

test('không còn mốc nào chờ thì báo trống và không hiện con số nào', async ({ page, api }) => {
  serveTranches(api, [releasedTranche])
  await page.goto('/admin/tranches')
  await expect(page.getByText('Không có mốc giải ngân nào chờ duyệt')).toBeVisible()
  await expect(page.getByText('Tiền chờ duyệt')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Chờ xử lý' })).toHaveText('Chờ xử lý')
})
