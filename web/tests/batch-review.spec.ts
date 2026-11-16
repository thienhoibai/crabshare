/* Quản trị xét duyệt Lô: danh sách /admin/batches (lọc, phân trang) và trang một Lô /admin/batches/:code
   (duyệt, yêu cầu sửa lại, từ chối). Kiểm tra chữ trên màn hình và đúng lời gọi API đã gửi. */
import type { ApproveBatchRequest, CancelBatchRequest, RejectBatchRequest } from '../src/shared/api/api.gen'
import { expect, reply, signIn, test, vnd, type Api, type Page } from './support/app'
import {
  adminBatches, batchListReply, costPlan, fact, fundingDetail, gate, mockAdmin, pendingBatch, pendingDetail, pendingTDetail, shownDate,
  vnLocalFromNow, vnLocalToIso, type AdminBatch,
} from './support/admin'

// Ô datetime-local nhận giờ của máy người dùng; cố định giờ Việt Nam để biết chắc ISO mà trang phải gửi.
test.use({ timezoneId: 'Asia/Ho_Chi_Minh' })

const code = pendingBatch.batchCode
const detailApi = `/api/admin/batches/${code}`

/** Hồ sơ một Lô có trạng thái: GET trả bản hiện tại, test đổi nó khi máy chủ nhận một quyết định. */
function serveBatch(api: Api, start: AdminBatch) {
  const state = { current: start }
  api.get(`/api/admin/batches/${start.batch.batchCode}`, () => state.current)
  return state
}

const main = (page: Page) => page.getByRole('main')
const row = (page: Page, batchCode: string) => page.getByRole('row').filter({ hasText: batchCode })

test.beforeEach(async ({ page, api }) => {
  mockAdmin(api)
  await signIn(page, 'PlatformAdmin')
})

test.describe('danh sách Lô', () => {
  test('mỗi dòng hiện phương thức, trạng thái, quy mô và hạn; bấm dòng mở trang xét duyệt', async ({ page, api }) => {
    await page.goto('/admin/batches')
    await expect(page.getByRole('heading', { name: 'Duyệt và tạo Lô', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Tạo Lô T hoặc A' })).toHaveAttribute('href', '/admin/batches/new')

    const pending = row(page, code)
    await expect(pending).toContainText(pendingBatch.title)
    await expect(pending).toContainText('Cua gạch · HTX Đầm Dơi')
    await expect(pending.getByText('Lô P · góp vốn')).toBeVisible()
    await expect(pending.getByText('Chờ duyệt', { exact: true })).toBeVisible()
    await expect(pending).toContainText('600 con')
    await expect(pending).toContainText(vnd(200_000_000))

    // Lô T không gọi vốn nên không có số vốn mục tiêu.
    const trading = row(page, pendingTDetail.batch.batchCode)
    await expect(trading.getByText('Lô T · thương mại')).toBeVisible()
    await expect(trading).toContainText('400 con')
    await expect(trading).not.toContainText(/\d đ/)

    const funding = row(page, fundingDetail.batch.batchCode)
    await expect(funding.getByText('Đang gọi vốn', { exact: true })).toBeVisible()
    await expect(funding).toContainText(await shownDate(page, fundingDetail.batch.fundingDeadline!))

    expect(api.sent('GET', '/api/admin/batches').map((c) => c.query)).toEqual([{ page: '1', pageSize: '20' }])

    await pending.click()
    await expect(page).toHaveURL(new RegExp(`/admin/batches/${code}$`))
    await expect(page.getByRole('heading', { name: pendingBatch.title, level: 1 })).toBeVisible()
    expect(api.writes()).toEqual([])
  })

  test('lọc theo trạng thái và phương thức gửi lên máy chủ, giữ trên thanh địa chỉ', async ({ page, api }) => {
    await page.goto('/admin/batches')
    await expect(page.getByRole('row')).toHaveCount(1 + adminBatches.length)

    await page.getByLabel('Trạng thái').selectOption({ label: 'Chờ duyệt' })
    await expect(page).toHaveURL(/status=PendingApproval/)
    await expect(row(page, fundingDetail.batch.batchCode)).toHaveCount(0)
    await expect(page.getByRole('row')).toHaveCount(3)

    await page.getByLabel('Phương thức').selectOption({ label: 'Lô T · thương mại' })
    await expect(page).toHaveURL(/batchMode=T/)
    await expect(page.getByRole('row')).toHaveCount(2)
    await expect(row(page, pendingTDetail.batch.batchCode)).toBeVisible()
    expect(api.sent('GET', '/api/admin/batches').at(-1)!.query).toEqual({ status: 'PendingApproval', batchMode: 'T', page: '1', pageSize: '20' })

    // Không còn Lô nào chờ duyệt ở phương thức này: câu trống nói đúng tình huống.
    await page.getByLabel('Phương thức').selectOption({ label: 'Lô A · đại lý' })
    await expect(page.getByText('Không có Lô nào chờ duyệt')).toBeVisible()
    await page.getByLabel('Trạng thái').selectOption({ label: 'Đã đóng' })
    await expect(page.getByText('Không có Lô nào khớp')).toBeVisible()

    // Tải lại trang: bộ lọc lấy lại từ địa chỉ.
    await page.reload()
    await expect(page.getByLabel('Trạng thái')).toHaveValue('Closed')
    await expect(page.getByLabel('Phương thức')).toHaveValue('A')
    expect(api.sent('GET', '/api/admin/batches').at(-1)!.query).toEqual({ status: 'Closed', batchMode: 'A', page: '1', pageSize: '20' })
  })

  test('nhiều hơn một trang thì có phân trang, đổi bộ lọc thì về trang 1', async ({ page, api }) => {
    api.get('/api/admin/batches', ({ query }) => ({ items: [pendingDetail], page: Number(query.page), pageSize: 20, total: 45 }))
    await page.goto('/admin/batches')
    await expect(page.getByText('Trang 1 / 3 · 45 dòng')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Trang trước' })).toBeDisabled()

    await page.getByRole('button', { name: 'Trang sau' }).click()
    await expect(page.getByText('Trang 2 / 3 · 45 dòng')).toBeVisible()
    await expect(page).toHaveURL(/page=2/)
    expect(api.sent('GET', '/api/admin/batches').at(-1)!.query).toEqual({ page: '2', pageSize: '20' })

    await page.getByLabel('Phương thức').selectOption('P')
    await expect(page.getByText('Trang 1 / 3 · 45 dòng')).toBeVisible()
    expect(api.sent('GET', '/api/admin/batches').at(-1)!.query).toEqual({ batchMode: 'P', page: '1', pageSize: '20' })
  })

  test('lỗi tải danh sách thì báo lỗi của máy chủ, bấm Thử lại tải lại được', async ({ page, api }) => {
    let down = true
    api.get('/api/admin/batches', (call) => (down ? reply(500, { status: 500, detail: 'Máy chủ đang bận.' }) : batchListReply(adminBatches)(call)))
    await page.goto('/admin/batches')
    await expect(page.getByRole('alert')).toContainText('Không tải được dữ liệu')
    await expect(page.getByRole('alert')).toContainText('Máy chủ đang bận.')

    down = false
    await page.getByRole('button', { name: 'Thử lại' }).click()
    await expect(row(page, code)).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})

test.describe('trang xét duyệt một Lô', () => {
  test('Lô P chờ duyệt: tóm tắt, điều khoản, chào giá, chi phí và mốc giải ngân dự tính', async ({ page, api }) => {
    await page.goto(`/admin/batches/${code}`)
    await expect(page.getByRole('heading', { name: pendingBatch.title, level: 1 })).toBeVisible()
    await expect(page.getByText(`${code} · Cua gạch · HTX Đầm Dơi`)).toBeVisible()
    await expect(main(page).getByText('Lô P · góp vốn')).toBeVisible()
    await expect(main(page).getByText('Chờ duyệt', { exact: true })).toBeVisible()

    // Khối quyết định: bốn con số và ba nút.
    await expect(page.getByRole('heading', { name: 'Chờ quyết định duyệt' })).toBeVisible()
    await expect(fact(page, 'Số cua kế hoạch')).toContainText('600 con')
    await expect(fact(page, 'Vốn mục tiêu').first()).toContainText(vnd(200_000_000))
    await expect(fact(page, 'Chi phí chuẩn mỗi con')).toContainText(vnd(300_000))
    await expect(fact(page, 'Nhận cua dự kiến')).toContainText(await shownDate(page, pendingBatch.expectedReceiptDate!))
    await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Yêu cầu sửa lại' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Từ chối' })).toBeEnabled()

    // Lô chưa duyệt chỉ có ba tab hồ sơ.
    await expect(page.getByRole('tab')).toHaveText(['Điều khoản', 'Chào giá2', 'Chi phí'])
    await expect(page.getByRole('tab', { name: 'Điều khoản' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('link', { name: 'Công ty Hải sản Đất Mũi' })).toHaveAttribute('href', '/admin/parties/33')
    await expect(fact(page, 'Giá sàn đơn hàng cuối')).toContainText(`${vnd(380_000)} / kg`)
    await expect(fact(page, 'Lưu nuôi')).toContainText('30 ngày')
    await expect(fact(page, 'Vốn tối thiểu khả thi')).toContainText(vnd(150_000_000))
    await expect(fact(page, 'Góp tối thiểu')).toContainText(vnd(5_000_000))
    await expect(fact(page, 'Phí nền tảng')).toContainText('3% doanh thu')

    await page.getByRole('tab', { name: 'Chào giá' }).click()
    await expect(page).toHaveURL(/tab=offers/)
    const offer = page.getByRole('row').filter({ hasText: 'Cua gạch L cấp 1' })
    await expect(offer).toContainText(vnd(520_000))
    await expect(offer).toContainText('420 g')
    await expect(offer).toContainText('300 con')
    await expect(page.getByRole('row').filter({ hasText: 'Tổng' })).toContainText('540 con')

    await page.getByRole('tab', { name: 'Chi phí' }).click()
    await expect(fact(page, 'Tổng chi phí Lô chịu')).toContainText(vnd(costPlan.total))
    await expect(page.getByText('Đã gửi duyệt', { exact: true })).toBeVisible()
    const seed = page.getByRole('row').filter({ hasText: 'Cua nguồn 600 con' })
    await expect(seed).toContainText('Mua cua nguồn')
    await expect(seed).toContainText('600 con')
    await expect(seed).toContainText(vnd(200_000))
    await expect(seed).toContainText(vnd(120_000_000))
    // Chưa duyệt nên mốc giải ngân mới là số dự tính, chưa có trạng thái.
    await expect(page.getByRole('columnheader', { name: 'Số tiền dự tính' })).toBeVisible()
    const milestone = page.getByRole('row').filter({ hasText: '1. Nhận cua xong' })
    await expect(milestone).toContainText('Kiểm đầu vào xong và đã xếp hộp')
    await expect(milestone).toContainText('60%')
    await expect(milestone).toContainText(vnd(108_000_000))

    expect(api.writes()).toEqual([])
  })

  test('duyệt Lô P: gửi giờ mở và hạn gọi vốn, xong thì Lô sang gọi vốn và chi phí bị khoá', async ({ page, api }) => {
    const batch = serveBatch(api, pendingDetail)
    const hold = gate()
    api.post(`${detailApi}/approve`, async ({ body }) => {
      await hold.wait
      const sent = body as ApproveBatchRequest
      batch.current = {
        ...fundingDetail,
        batch: { ...fundingDetail.batch, batchCode: code, title: pendingBatch.title, fundingOpenAt: sent.fundingOpenAt!, fundingDeadline: sent.fundingDeadline! },
      }
      return batch.current
    })
    const openAt = vnLocalFromNow(1)
    const deadline = vnLocalFromNow(12)

    await page.goto(`/admin/batches/${code}`)
    await page.getByRole('button', { name: 'Duyệt', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Duyệt Lô' })
    await expect(dialog).toContainText(`${code} · ${pendingBatch.title}`)
    await expect(dialog).toContainText('Duyệt xong, chi phí, sản lượng, chào giá và giá sàn bị khoá.')
    const submit = dialog.getByRole('button', { name: 'Duyệt', exact: true })

    // Giờ mở điền sẵn là lúc này; chưa có hạn thì chưa duyệt được.
    await expect(dialog.getByLabel('Mở gọi vốn lúc')).not.toHaveValue('')
    await expect(submit).toBeDisabled()
    await dialog.getByLabel('Mở gọi vốn lúc').fill(openAt)
    await dialog.getByLabel('Hạn gọi vốn').fill(openAt)
    await expect(dialog.getByText('Hạn gọi vốn phải sau giờ mở.')).toBeVisible()
    await expect(submit).toBeDisabled()
    await dialog.getByLabel('Hạn gọi vốn').fill(deadline)
    await expect(dialog.getByText('Hạn gọi vốn phải sau giờ mở.')).toHaveCount(0)

    // Đang gửi thì nút khoá lại, không gửi lần hai.
    await submit.click()
    await expect(dialog.getByRole('button', { name: 'Đang gửi…' })).toBeDisabled()
    hold.open()

    await expect(page.getByRole('status').filter({ hasText: 'Đã duyệt Lô.' })).toBeVisible()
    await expect(dialog).toHaveCount(0)
    const body: ApproveBatchRequest = { fundingOpenAt: vnLocalToIso(openAt), fundingDeadline: vnLocalToIso(deadline) }
    expect(api.sent('POST', `${detailApi}/approve`).map((c) => c.body)).toEqual([body])
    expect(api.writes()).toEqual([`POST ${detailApi}/approve`])

    // Lô đã duyệt: hết nút quyết định, có thêm tab theo dõi và lối sang các trang tiền.
    await expect(main(page).getByText('Đang gọi vốn', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Từ chối' })).toHaveCount(0)
    await expect(page.getByRole('tab')).toHaveText(['Tiến độ', 'Kiểm phẩm', 'Điều khoản', 'Chào giá2', 'Chi phí', 'Hợp đồng'])
    await expect(main(page).getByRole('link', { name: 'Gọi vốn' })).toHaveAttribute('href', '/admin/funding')
    await expect(main(page).getByRole('link', { name: 'Giải ngân' })).toHaveAttribute('href', '/admin/tranches')
    await expect(main(page).getByRole('link', { name: 'Trang công khai' })).toHaveAttribute('href', `/lo/${code}`)

    await page.getByRole('tab', { name: 'Chi phí' }).click()
    await expect(page.getByText('Đã khoá', { exact: true })).toBeVisible()
    const first = page.getByRole('row').filter({ hasText: '1. Nhận cua xong' })
    await expect(first).toContainText(vnd(108_000_000))
    await expect(first.getByText('Chưa tới mốc')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Duyệt giải ngân' }).last()).toHaveAttribute('href', '/admin/tranches')
  })

  test('duyệt Lô T: chỉ hỏi hạn nhận đặt trước', async ({ page, api }) => {
    const tCode = pendingTDetail.batch.batchCode
    const batch = serveBatch(api, pendingTDetail)
    api.post(`/api/admin/batches/${tCode}/approve`, ({ body }) => {
      batch.current = {
        ...pendingTDetail, approvedAt: new Date().toISOString(), approvedBy: 104,
        batch: { ...pendingTDetail.batch, status: 'Sourcing', preorderDeadline: (body as ApproveBatchRequest).preorderDeadline! },
      }
      return batch.current
    })
    const deadline = vnLocalFromNow(9)

    await page.goto(`/admin/batches/${tCode}`)
    await expect(main(page).getByText('Lô T · thương mại')).toBeVisible()
    // Lô T không có vốn mục tiêu; ô thứ hai là giá sàn.
    await expect(fact(page, 'Giá sàn mỗi kg')).toContainText(vnd(310_000))
    await expect(page.getByText('Vốn mục tiêu')).toHaveCount(0)

    await page.getByRole('button', { name: 'Duyệt', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Duyệt Lô' })
    await expect(dialog.getByLabel('Mở gọi vốn lúc')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Duyệt', exact: true })).toBeDisabled()
    await dialog.getByLabel('Hạn nhận đặt trước').fill(deadline)
    await dialog.getByRole('button', { name: 'Duyệt', exact: true }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Đã duyệt Lô.' })).toBeVisible()
    const body: ApproveBatchRequest = { preorderDeadline: vnLocalToIso(deadline) }
    expect(api.sent('POST', `/api/admin/batches/${tCode}/approve`).map((c) => c.body)).toEqual([body])
    await expect(main(page).getByText('Đang mua nguồn', { exact: true })).toBeVisible()
    // Lô T đã duyệt không có lối sang gọi vốn, giải ngân, cũng không có tab hợp đồng góp vốn.
    await expect(main(page).getByRole('link', { name: 'Quyết toán' })).toBeVisible()
    await expect(main(page).getByRole('link', { name: 'Gọi vốn' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Hợp đồng' })).toHaveCount(0)
  })

  test('Lô thiếu điều kiện thì không duyệt được và nêu đúng điều kiện còn thiếu', async ({ page, api }) => {
    serveBatch(api, { ...pendingDetail, operatorStatus: 'Submitted', batch: { ...pendingBatch, costPlan: null, offers: [], offtakeBuyer: null } })
    await page.goto(`/admin/batches/${code}`)
    await expect(page.getByText('Chưa duyệt được, còn thiếu: hộ nuôi chưa được duyệt, kế hoạch chi phí, chào giá, bên cam kết thu mua.')).toBeVisible()
    await expect(fact(page, 'Chi phí chuẩn mỗi con')).toContainText('Chưa có')
    await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toBeDisabled()
    // Vẫn trả hồ sơ về hoặc từ chối được.
    await expect(page.getByRole('button', { name: 'Yêu cầu sửa lại' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Từ chối' })).toBeEnabled()
    expect(api.writes()).toEqual([])
  })

  test('từ chối Lô: bắt buộc có lý do, gửi lý do đã bỏ khoảng trắng thừa', async ({ page, api }) => {
    const batch = serveBatch(api, pendingDetail)
    api.post(`${detailApi}/reject`, ({ body }) => {
      const { reason } = body as RejectBatchRequest
      batch.current = { ...pendingDetail, batch: { ...pendingBatch, status: 'Rejected', rejectionReason: reason } }
      return batch.current
    })
    await page.goto(`/admin/batches/${code}`)

    // Mở rồi đóng hộp thoại thì không gửi gì.
    await page.getByRole('button', { name: 'Từ chối' }).click()
    const dialog = page.getByRole('dialog', { name: 'Từ chối Lô' })
    await expect(dialog).toContainText('Lô bị từ chối không mở lại được.')
    await dialog.getByRole('button', { name: 'Đóng' }).last().click()
    await expect(dialog).toHaveCount(0)
    expect(api.writes()).toEqual([])

    await page.getByRole('button', { name: 'Từ chối' }).click()
    const submit = dialog.getByRole('button', { name: 'Từ chối' })
    await expect(submit).toBeDisabled()
    await dialog.getByLabel('Lý do từ chối').fill('   ')
    await expect(submit).toBeDisabled()
    await dialog.getByLabel('Lý do từ chối').fill('  Thiếu hồ sơ nguồn cua  ')
    await submit.click()

    await expect(page.getByRole('status').filter({ hasText: 'Đã từ chối Lô.' })).toBeVisible()
    await expect(dialog).toHaveCount(0)
    const body: RejectBatchRequest = { reason: 'Thiếu hồ sơ nguồn cua' }
    expect(api.sent('POST', `${detailApi}/reject`).map((c) => c.body)).toEqual([body])
    expect(api.writes()).toEqual([`POST ${detailApi}/reject`])

    await expect(main(page).getByText('Bị từ chối', { exact: true })).toBeVisible()
    await expect(main(page).getByText('Thiếu hồ sơ nguồn cua', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Chờ quyết định duyệt' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Từ chối' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0)
  })

  test('yêu cầu sửa lại: gửi nội dung cần sửa, Lô về trạng thái cần sửa chứ không bị từ chối', async ({ page, api }) => {
    const batch = serveBatch(api, pendingDetail)
    api.post(`${detailApi}/request-revision`, ({ body }) => {
      const { reason } = body as RejectBatchRequest
      batch.current = { ...pendingDetail, batch: { ...pendingBatch, status: 'NeedsRevision', rejectionReason: reason } }
      return batch.current
    })
    await page.goto(`/admin/batches/${code}`)
    await page.getByRole('button', { name: 'Yêu cầu sửa lại' }).click()
    const dialog = page.getByRole('dialog', { name: 'Yêu cầu sửa lại Lô' })
    const submit = dialog.getByRole('button', { name: 'Gửi yêu cầu sửa' })
    await expect(submit).toBeDisabled()
    await dialog.getByLabel('Nội dung cần sửa').fill('Bổ sung điều kiện mở mốc 2')
    await expect(dialog.getByText('26 / 300 ký tự')).toBeVisible()
    await submit.click()

    await expect(page.getByRole('status').filter({ hasText: 'Đã yêu cầu sửa lại Lô.' })).toBeVisible()
    const body: RejectBatchRequest = { reason: 'Bổ sung điều kiện mở mốc 2' }
    expect(api.sent('POST', `${detailApi}/request-revision`).map((c) => c.body)).toEqual([body])
    expect(api.writes()).toEqual([`POST ${detailApi}/request-revision`])
    await expect(main(page).getByText('Cần sửa lại', { exact: true })).toBeVisible()
    await expect(main(page).getByText('Bổ sung điều kiện mở mốc 2', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Yêu cầu sửa lại' })).toHaveCount(0)
  })

  test('máy chủ không nhận quyết định thì lỗi hiện trong hộp thoại, không kèm số quy tắc, lý do còn nguyên', async ({ page, api }) => {
    serveBatch(api, pendingDetail)
    api.post(`${detailApi}/reject`, () => reply(422, { status: 422, detail: 'Lô đã được người khác xử lý (BR-021).' }))
    await page.goto(`/admin/batches/${code}`)
    await page.getByRole('button', { name: 'Từ chối' }).click()
    const dialog = page.getByRole('dialog', { name: 'Từ chối Lô' })
    await dialog.getByLabel('Lý do từ chối').fill('Thiếu hồ sơ')
    await dialog.getByRole('button', { name: 'Từ chối' }).click()

    await expect(dialog.getByText('Lô đã được người khác xử lý.', { exact: true })).toBeVisible()
    await expect(dialog.getByLabel('Lý do từ chối')).toHaveValue('Thiếu hồ sơ')
    await expect(dialog.getByRole('button', { name: 'Từ chối' })).toBeEnabled()
    await expect(page.getByRole('status')).toHaveCount(0)
    expect(api.writes()).toEqual([`POST ${detailApi}/reject`])
  })

  test('Lô T do Quản trị soạn: gửi duyệt không cần lý do, huỷ Lô thì bắt buộc lý do', async ({ page, api }) => {
    const draft: AdminBatch = { ...pendingTDetail, batch: { ...pendingTDetail.batch, status: 'Draft', canEdit: true, canSubmit: true, canCancel: true } }
    const tCode = draft.batch.batchCode
    const batch = serveBatch(api, draft)
    api.post(`/api/batches/${tCode}/submit`, () => {
      batch.current = { ...pendingTDetail, batch: { ...pendingTDetail.batch, canCancel: true } }
      return batch.current.batch
    })
    api.post(`/api/batches/${tCode}/cancel`, ({ body }) => {
      batch.current = { ...pendingTDetail, batch: { ...pendingTDetail.batch, status: 'Cancelled', cancelReason: (body as CancelBatchRequest).reason } }
      return batch.current.batch
    })

    await page.goto(`/admin/batches/${tCode}`)
    await expect(page.getByRole('heading', { name: 'Lô nháp, chưa gửi duyệt' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Gửi duyệt' }).click()
    const submit = page.getByRole('dialog', { name: 'Gửi Lô đi duyệt' })
    await expect(submit.getByRole('textbox')).toHaveCount(0)
    await submit.getByRole('button', { name: 'Gửi duyệt' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Đã gửi Lô đi duyệt.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Chờ quyết định duyệt' })).toBeVisible()
    expect(api.sent('POST', `/api/batches/${tCode}/submit`).map((c) => c.body)).toEqual([null])

    await page.getByRole('button', { name: 'Huỷ Lô' }).click()
    const cancel = page.getByRole('dialog', { name: 'Huỷ Lô' })
    await expect(cancel).toContainText('Cọc đặt trước đã trả sẽ được hoàn. Không hoàn tác được.')
    await expect(cancel.getByRole('button', { name: 'Huỷ Lô' })).toBeDisabled()
    await cancel.getByLabel('Lý do huỷ').fill('Nhà cung cấp không giao được cua nguồn')
    await cancel.getByRole('button', { name: 'Huỷ Lô' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Đã huỷ Lô.' })).toBeVisible()
    const body: CancelBatchRequest = { reason: 'Nhà cung cấp không giao được cua nguồn' }
    expect(api.sent('POST', `/api/batches/${tCode}/cancel`).map((c) => c.body)).toEqual([body])
    expect(api.writes()).toEqual([`POST /api/batches/${tCode}/submit`, `POST /api/batches/${tCode}/cancel`])

    await expect(main(page).getByText('Đã huỷ', { exact: true })).toBeVisible()
    await expect(main(page).getByText('Nhà cung cấp không giao được cua nguồn', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Huỷ Lô' })).toHaveCount(0)
  })

  test('mã Lô không có thì báo lỗi của máy chủ, không dựng hồ sơ mẫu', async ({ page }) => {
    await page.goto('/admin/batches/P-0000-00')
    await expect(page.getByRole('alert')).toContainText('Không tìm thấy Lô.')
    await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0)
  })
})
