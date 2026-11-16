/* Hai trang tổng quan: "Hôm nay làm gì" của người nuôi (/operator) và bảng điều khiển của Quản trị (/admin).
   Cả hai chỉ hiện số có thật do API trả về, không có dữ liệu mẫu, không có con số dự phóng. */
import { readFile } from 'node:fs/promises'
import type {
  AdminDashboardResponse, AdminSettlementSummary, ClaimResponse, OperatorDashboardResponse, PagedResultOfAdminKycResponse, PagedResultOfAdminOperatorResponse,
  PagedResultOfPartySummaryResponse,
} from '../src/shared/api/api.gen'
import { TOKEN, dateFromNow, daysFromNow, expect, file, paged, reply, signIn, test, vnd, type Api, type Page } from './support/app'
import { CODE, batch, batchRaising, dashboard, fact, farm, mockOperator, more, noDevReload, panel, vnDay } from './support/operator'

const fitsPhone = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test.beforeEach(async ({ page }) => {
  await noDevReload(page)
})

test.describe('tổng quan của người nuôi', () => {
  test.beforeEach(async ({ page, api }) => {
    mockOperator(api)
    await signIn(page, 'OperatorMember')
  })

  test('ba con số, việc hôm nay gom từ cảnh báo, nhật ký, ảnh, phiếu nhận và mốc giải ngân', async ({ page, api }) => {
    await page.goto('/operator')
    await expect(page.getByRole('heading', { name: `Chào ${farm.legalName}`, level: 1 })).toBeVisible()
    await expect(fact(page, 'Lô đang chạy')).toHaveText('4')
    await expect(fact(page, 'Cảnh báo đang mở')).toHaveText('1')
    await expect(fact(page, 'Chưa ghi nhật ký hôm nay')).toHaveText('1 Lô')

    const todo = (title: string) => panel(page, 'Việc hôm nay').getByRole('link').filter({ hasText: title })
    await expect(panel(page, 'Việc hôm nay').getByRole('link')).toHaveCount(6)
    await expect(todo('1 cảnh báo cần phản hồi')).toContainText('Hai con chết trong 24 giờ ở dàn 1')
    await expect(todo('1 cảnh báo cần phản hồi')).toHaveAttribute('href', '/operator/alerts')
    await expect(todo('1 Lô chưa ghi nhật ký hôm nay')).toHaveAttribute('href', '/operator/log')
    await expect(todo('2 hộp cần chụp ảnh')).toHaveAttribute('href', '/operator/evidence')
    // Hai ảnh bị gắn cờ nhưng một ảnh đã giải trình rồi.
    await expect(todo('1 ảnh cần giải trình')).toHaveAttribute('href', '/operator/evidence')
    await expect(todo(`${batchRaising.batchCode}: 1 phiếu nhận chờ kiểm đầu vào`)).toHaveAttribute('href', `/operator/batches/${batchRaising.batchCode}/nguon-cua`)
    await expect(todo('1 mốc giải ngân xin được')).toContainText(`${CODE} mốc 2`)
    await expect(todo('1 mốc giải ngân xin được')).toHaveAttribute('href', '/operator/disbursements')

    const running = panel(page, 'Lô đang chạy')
    const row = (title: string) => running.getByRole('link').filter({ hasText: title })
    await expect(row(batch.title)).toContainText(`${CODE} · Cua gạch · 560 con`)
    await expect(row(batch.title)).toContainText('1 cảnh báo')
    await expect(row(batch.title)).toContainText('Đang thu hoạch')
    await expect(row(batch.title)).toHaveAttribute('href', `/operator/batches/${CODE}`)
    await expect(row(batchRaising.title)).toContainText('Chưa ghi nhật ký')
    await expect(running.getByRole('link', { name: 'Tất cả Lô' })).toHaveAttribute('href', '/operator/batches')
    await expect(page.getByRole('link', { name: 'Ghi nhật ký', exact: true })).toHaveAttribute('href', '/operator/log')

    // Biểu đồ chỉ số nước nằm trong khối gấp.
    await more(page, 'Chỉ số nước 30 ngày qua').click()
    await expect(page.getByRole('img', { name: /^Biểu đồ pH và nhiệt độ nước theo ngày/ })).toBeVisible()

    expect(api.sent('GET', '/api/operators/me/evidence').map((c) => c.query)).toEqual([{ status: 'Flagged', pageSize: '50' }])
    // Chỉ hỏi phiếu nhận của Lô đang mua nguồn hoặc đang lưu nuôi.
    expect(api.sent('GET', /\/goods-receipts$/).map((c) => c.path)).toEqual([`/api/batches/${batchRaising.batchCode}/goods-receipts`])
    expect(api.calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true)
    expect(api.writes()).toEqual([])
  })

  test('hộ nuôi mới chưa có Lô: không có việc chờ, gợi ý tạo Lô P đầu tiên, vừa màn hình điện thoại', async ({ page, api }) => {
    const empty: OperatorDashboardResponse = { ...dashboard, batches: [], aliveCount: 0, openAlerts: 0, pendingCaptureRequests: 0, logsDueToday: 0, environmentByDay: [] }
    api.get('/api/operators/me/dashboard', empty)
    api.get('/api/operators/me/batches', paged([], 100))
    api.get('/api/operators/me/alerts', [])
    api.get('/api/operators/me/evidence', paged([], 50))
    api.get('/api/operator/tranches', [])
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/operator')
    await expect(page.getByText('Chưa có Lô nào đang chạy')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Tạo Lô P đầu tiên' })).toHaveAttribute('href', '/operator/batches/new')
    await expect(page.getByText('Không có việc đang chờ.')).toBeVisible()
    await expect(fact(page, 'Lô đang chạy')).toHaveText('0')
    await expect(fact(page, 'Chưa ghi nhật ký hôm nay')).toHaveText('0 Lô')
    await expect(page.getByText('Chỉ số nước 30 ngày qua')).toHaveCount(0)
    expect(await fitsPhone(page)).toBe(true)
  })

  test('hồ sơ hộ nuôi chưa được duyệt: nhắc xem hồ sơ, vẫn hiện các Lô', async ({ page, api }) => {
    api.get('/api/operators/me/dashboard', () => reply(403, { status: 403, detail: 'Hồ sơ hộ nuôi chưa được duyệt.' }))
    await page.goto('/operator')
    await expect(page.getByRole('heading', { name: 'Tổng quan hộ nuôi', level: 1 })).toBeVisible()
    await expect(page.getByText('Hồ sơ hộ nuôi chưa được duyệt.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Xem hồ sơ' })).toHaveAttribute('href', '/operator/register')
    await expect(fact(page, 'Chưa ghi nhật ký hôm nay')).toHaveText('—')
    await expect(panel(page, 'Lô đang chạy').getByRole('link').filter({ hasText: batch.title })).toBeVisible()
  })

  test('không tải được danh sách Lô thì báo lỗi của máy chủ và thử lại được', async ({ page, api }) => {
    let failing = true
    api.get('/api/operators/me/batches', (call) => (failing
      ? reply(503, { status: 503, detail: 'Không kết nối được báo cáo trại.' })
      : { items: [batch], page: 1, pageSize: Number(call.query.pageSize), total: 1 }))
    await page.goto('/operator')
    const error = page.getByRole('alert').filter({ hasText: 'Không tải được dữ liệu' })
    await expect(error).toContainText('Không kết nối được báo cáo trại.')
    failing = false
    await error.getByRole('button', { name: 'Thử lại' }).click()
    await expect(panel(page, 'Lô đang chạy').getByRole('link').filter({ hasText: batch.title })).toBeVisible()
  })
})

test.describe('bảng điều khiển của Quản trị', () => {
  const adminDash: AdminDashboardResponse = {
    from: dateFromNow(-29), to: dateFromNow(0), asOf: daysFromNow(0), confirmedCapital: 25_000_001, confirmedContributions: 2, totalUsers: 17,
    capitalByDay: [{ date: dateFromNow(-1), amount: 25_000_001, count: 2 }, { date: dateFromNow(0), amount: 0, count: 0 }],
    batchesByStatus: [{ status: 'InProduction', count: 2 }, { status: 'PendingApproval', count: 3 }],
    escalatedAlerts: 1,
    latestEscalatedAlerts: [{ id: 73, batchCode: CODE, farmName: farm.legalName, severity: 'High', message: 'Cần phản hồi chất lượng nước', raisedAt: daysFromNow(-1) }],
    ordersByStatus: [{ status: 'Completed', count: 4 }], completedOrderRevenue: 10_000_001,
    payoutsByStatus: [{ status: 'Succeeded', count: 1, amount: 20_000_001 }, { status: 'Created', count: 1, amount: 999 }], succeededPayoutAmount: 20_000_001,
  }
  const settlement = (status: string): AdminSettlementSummary => ({
    batchCode: CODE, batchTitle: batch.title, operatorName: farm.legalName, batchStatus: 'Settlement', settlementId: 5, status, revisionNo: 1, actualRevenue: 210_000_000,
    revenuePool: 190_000_000, feedbackDeadline: daysFromNow(3), openFeedback: 0, updatedAt: daysFromNow(-1),
  })
  const count = (total: number) => ({ items: [], page: 1, pageSize: 1, total })

  /** Các hàng việc của Quản trị: 2 mốc giải ngân, 1 quyết toán chưa xong, 4 hồ sơ hộ nuôi; ba hàng còn lại trống. */
  function mockAdminDashboard(api: Api, dash: AdminDashboardResponse = adminDash) {
    const parties: PagedResultOfPartySummaryResponse = count(0)
    const farms: PagedResultOfAdminOperatorResponse = count(4)
    const kyc: PagedResultOfAdminKycResponse = count(0)
    const claims: ClaimResponse[] = []
    api.get('/api/admin/dashboard', dash)
    api.get('/api/admin/parties', parties)
    api.get('/api/admin/operators', farms)
    api.get('/api/admin/kyc-checks', kyc)
    api.get('/api/admin/tranches', [{ trancheId: 41 }, { trancheId: 44 }])
    api.get('/api/admin/settlements', [settlement('Proposed'), settlement('PaidOut')])
    api.get('/api/admin/claims', claims)
  }

  test.beforeEach(async ({ page }) => {
    await signIn(page, 'PlatformAdmin')
  })

  test('việc đang chờ dẫn tới đúng hàng việc; tiền là số nguyên đồng do API trả về', async ({ page, api }) => {
    mockAdminDashboard(api)
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Bảng điều khiển', level: 1 })).toBeVisible()

    const queues = panel(page, 'Việc đang chờ')
    const queue = (title: string) => queues.getByRole('link').filter({ hasText: title })
    await expect(queue('Cảnh báo đã chuyển cấp')).toContainText('1 cảnh báo')
    await expect(queue('Cảnh báo đã chuyển cấp')).toHaveAttribute('href', '/admin/alerts')
    await expect(queue('Lô chờ duyệt')).toContainText('3 Lô')
    await expect(queue('Lô chờ duyệt')).toHaveAttribute('href', '/admin/batches?status=PendingApproval')
    await expect(queue('Mốc giải ngân chờ duyệt')).toContainText('2 mốc')
    await expect(queue('Quyết toán chưa xong')).toContainText('1 Lô')
    await expect(queue('Hồ sơ hộ nuôi chờ duyệt')).toContainText('4 hồ sơ')
    // Hàng việc đang trống gom vào khối gấp.
    await more(queues, 'Hàng việc khác').click()
    await expect(queues.getByRole('link', { name: 'Khiếu nại chờ quyết định' })).toHaveAttribute('href', '/admin/claims')
    await expect(queues.getByRole('link', { name: 'eKYC không đạt' })).toBeVisible()

    await expect(page.getByText(`Vốn góp đã xác nhận · ${vnDay(adminDash.from)} – ${vnDay(adminDash.to)}`)).toBeVisible()
    await expect(page.locator('.op-hero b')).toHaveText('25.000.001đ')
    await expect(page.getByText('2 khoản góp')).toBeVisible()
    await expect(fact(page, 'Lô hiện có')).toHaveText('5')
    await expect(fact(page, 'Doanh thu đơn hoàn tất')).toHaveText(vnd(10_000_001))
    await expect(fact(page, 'Đã chi trả nhà đầu tư')).toHaveText(vnd(20_000_001))

    expect(api.sent('GET', '/api/admin/dashboard').map((c) => ({ ...c.query, auth: c.auth }))).toEqual([{ from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), auth: `Bearer ${TOKEN}` }])
    expect(api.sent('GET', '/api/admin/claims').map((c) => c.query)).toEqual([{ status: 'Escalated' }])
    expect(api.sent('GET', '/api/admin/operators').map((c) => c.query)).toEqual([{ status: 'Submitted', pageSize: '1' }])
    expect(api.writes()).toEqual([])
  })

  test('số liệu theo kỳ: đổi kỳ thì hỏi lại máy chủ, xem bảng và tải CSV có đăng nhập', async ({ page, api }) => {
    mockAdminDashboard(api)
    api.get('/api/admin/reports/capital.csv', file('﻿"Ngày","Số tiền"\r\n"2026-11-12","25000001"\r\n', 'text/csv; charset=utf-8'))
    await page.goto('/admin')
    await more(page, 'Chọn kỳ, xem bảng, tải CSV').click()
    const from = dateFromNow(-60)
    await page.getByLabel('Từ ngày').fill(from)
    await expect.poll(() => api.sent('GET', '/api/admin/dashboard').at(-1)!.query.from).toBe(from)

    const tables = page.getByRole('tablist', { name: 'Chọn bảng' })
    await expect(page.getByRole('row').filter({ hasText: 'Chờ duyệt' }).getByRole('cell')).toHaveText(['Chờ duyệt', '3'])
    await tables.getByRole('tab', { name: 'Lệnh chi trả' }).click()
    await expect(page.getByRole('row').filter({ hasText: 'Thành công' }).getByRole('cell')).toHaveText(['Thành công', '1', vnd(20_000_001)])
    await tables.getByRole('tab', { name: 'Đơn' }).click()
    await expect(page.getByRole('row').filter({ hasText: 'Hoàn tất' }).getByRole('cell')).toHaveText(['Hoàn tất', '4'])
    // Bảng vốn theo ngày bỏ những ngày không có khoản góp nào.
    await tables.getByRole('tab', { name: 'Vốn theo ngày' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tbody tr').getByRole('cell')).toHaveText([vnDay(adminDash.capitalByDay[0].date), '2', vnd(25_000_001)])

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Tải CSV' }).click()
    const saved = await download
    const to = api.sent('GET', '/api/admin/dashboard').at(-1)!.query.to
    expect(saved.suggestedFilename()).toBe(`crabshare-capital-${from}-${to}.csv`)
    const bytes = await readFile(await saved.path())
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    expect(bytes.toString('utf8')).toContain('"25000001"')
    expect(api.sent('GET', '/api/admin/reports/capital.csv').map((c) => ({ query: c.query, auth: c.auth }))).toEqual([{ query: { from, to }, auth: `Bearer ${TOKEN}` }])
  })

  test('kỳ không hợp lệ thì không hỏi máy chủ và không cho tải CSV', async ({ page, api }) => {
    mockAdminDashboard(api)
    await page.goto('/admin')
    await more(page, 'Chọn kỳ, xem bảng, tải CSV').click()
    await expect(page.getByRole('button', { name: 'Tải CSV' })).toBeVisible()
    const before = api.sent('GET', '/api/admin/dashboard').length
    await page.getByLabel('Từ ngày').fill(dateFromNow(-500))
    await expect(page.getByText('Kỳ báo cáo tối đa 366 ngày, ngày bắt đầu không sau ngày kết thúc.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tải CSV' })).toHaveCount(0)
    await expect(page.locator('.op-hero')).toHaveCount(0)
    await page.getByLabel('Từ ngày').fill(dateFromNow(5))
    await expect(page.getByText('Kỳ báo cáo tối đa 366 ngày, ngày bắt đầu không sau ngày kết thúc.')).toBeVisible()
    expect(api.sent('GET', '/api/admin/dashboard')).toHaveLength(before)
  })

  test('báo cáo tạm ngưng thì báo lỗi của máy chủ; thử lại, chưa có số liệu thì không dựng số mẫu', async ({ page, api }) => {
    let failing = true
    const blank: AdminDashboardResponse = {
      ...adminDash, confirmedCapital: 0, confirmedContributions: 0, capitalByDay: [], batchesByStatus: [], escalatedAlerts: 0, latestEscalatedAlerts: [], ordersByStatus: [],
      completedOrderRevenue: 0, payoutsByStatus: [], succeededPayoutAmount: 0,
    }
    mockAdminDashboard(api)
    api.get('/api/admin/dashboard', () => (failing ? reply(503, { status: 503, detail: 'Báo cáo đang tạm ngưng.' }) : blank))
    api.get('/api/admin/operators', count(0))
    api.get('/api/admin/tranches', [])
    api.get('/api/admin/settlements', [])
    await page.goto('/admin')
    const error = page.getByRole('alert').filter({ hasText: 'Không tải được dữ liệu' })
    await expect(error).toContainText('Báo cáo đang tạm ngưng.')
    failing = false
    await error.getByRole('button', { name: 'Thử lại' }).click()

    await expect(page.locator('.op-hero b')).toHaveText('0đ')
    await expect(page.getByText('Không có việc nào đang chờ')).toBeVisible()
    await expect(fact(page, 'Lô hiện có')).toHaveText('0')
    await more(page, 'Chọn kỳ, xem bảng, tải CSV').click()
    await expect(page.getByText('Chưa có Lô nào')).toBeVisible()
    await page.getByRole('tab', { name: 'Vốn theo ngày' }).click()
    await expect(page.getByText('Chưa có khoản góp nào được xác nhận trong kỳ')).toBeVisible()
  })

  test('bảng điều khiển có đủ số liệu vẫn vừa màn hình điện thoại', async ({ page, api }) => {
    mockAdminDashboard(api)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/admin')
    await expect(page.locator('.op-hero b')).toHaveText('25.000.001đ')
    await expect(panel(page, 'Việc đang chờ').getByRole('link').filter({ hasText: 'Lô chờ duyệt' })).toBeVisible()
    expect(await fitsPhone(page)).toBe(true)
  })
})
