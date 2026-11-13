/* Nhật ký kiểm toán của Quản trị (/admin/audit-log): lọc, phân trang theo một mốc cố định, xem một dòng, kiểm tra chuỗi băm, xuất CSV. */
import { readFile } from 'node:fs/promises'
import type { AuditLogPage } from '../src/shared/api/api.gen'
import { dateFromNow, expect, file, reply, signIn, test, type Role } from './support/app'
import { auditPage, auditRow, expectTurnedAway, fact, mockAdmin, shownDateTime, systemAuditRow } from './support/admin'

const LOG = '/api/admin/audit-log'
const EXPORT = `${LOG}/export`

test.describe('Quản trị', () => {
  test.beforeEach(async ({ page, api }) => {
    mockAdmin(api)
    await signIn(page, 'PlatformAdmin')
  })

  test('đọc từ API, lọc theo loại đối tượng, sang trang thì giữ mốc đã xem', async ({ page, api }) => {
    api.get(LOG, ({ query }) => auditPage({ page: Number(query.page), total: 120 }))
    const last = () => api.sent('GET', LOG).at(-1)!.query
    await page.goto('/admin/audit-log')
    await expect(page.getByRole('heading', { name: 'Nhật ký kiểm toán', level: 1 })).toBeVisible()
    await expect(page.getByText('Chuỗi băm còn nguyên · 76 dòng')).toBeVisible()
    expect(last()).toEqual({ page: '1', pageSize: '50' })

    const row = page.getByRole('row').filter({ hasText: 'Approve' })
    await expect(row).toContainText(String(auditRow.auditId))
    await expect(row).toContainText(await shownDateTime(page, auditRow.occurredAt))
    await expect(row).toContainText('Lô #73')
    await expect(row).toContainText('Tài khoản #104')
    // Dòng do job nền ghi thì người thực hiện là hệ thống.
    await expect(page.getByRole('row').filter({ hasText: 'Escalate' })).toContainText('Cảnh báo #37')
    await expect(page.getByRole('row').filter({ hasText: 'Escalate' })).toContainText('Hệ thống')

    // Sang trang 2 phải kèm mốc của trang 1, để dòng mới ghi thêm không làm lệch trang.
    await expect(page.getByText('Trang 1 / 3 · 120 dòng')).toBeVisible()
    await page.getByRole('button', { name: 'Trang sau' }).click()
    await expect(page.getByText('Trang 2 / 3 · 120 dòng')).toBeVisible()
    expect(last()).toEqual({ throughAuditId: '76', page: '2', pageSize: '50' })

    // Đổi bộ lọc thì về trang 1 và bỏ mốc cũ.
    await page.getByLabel('Loại đối tượng').selectOption({ label: 'Lệnh chi' })
    await expect(page).toHaveURL(/entityType=payment_instruction/)
    await expect.poll(last).toEqual({ entityType: 'payment_instruction', page: '1', pageSize: '50' })
    await page.getByRole('button', { name: 'Bỏ lọc' }).click()
    await expect(page.getByLabel('Loại đối tượng')).toHaveValue('')
    await expect(page.getByRole('button', { name: 'Bỏ lọc' })).toHaveCount(0)
    expect(api.writes()).toEqual([])
  })

  test('xem một dòng: giá trị trước và sau hiện nguyên văn, nội dung lạ không chạy thành mã', async ({ page, api }) => {
    const unsafe = '<script>alert("unsafe")</script><img src=x onerror=alert(1)>'
    api.get(LOG, auditPage({ items: [{ ...auditRow, newValue: unsafe }, systemAuditRow] }))
    let popups = 0
    page.on('dialog', async (d) => { popups += 1; await d.dismiss() })

    await page.goto('/admin/audit-log')
    await page.getByRole('row').filter({ hasText: 'Approve' }).click()
    const dialog = page.getByRole('dialog', { name: `Dòng nhật ký số ${auditRow.auditId}` })
    await expect(dialog).toContainText('Lô #73 · Approve')
    await expect(dialog.getByText('"status": "PendingApproval"')).toBeVisible()
    await expect(dialog.getByText(unsafe, { exact: true })).toBeVisible()
    await expect(dialog.getByRole('img')).toHaveCount(0)
    await expect(dialog.getByRole('link', { name: 'Tài khoản #104' })).toHaveAttribute('href', '/admin/users/104')
    await expect(fact(dialog, 'Mã băm dòng trước')).toContainText(auditRow.prevHash!)
    await expect(fact(dialog, 'Mã băm của dòng')).toContainText(auditRow.rowHash)
    expect(popups).toBe(0)

    await dialog.getByRole('button', { name: 'Đóng' }).click()
    await page.getByRole('row').filter({ hasText: 'Escalate' }).click()
    const system = page.getByRole('dialog', { name: `Dòng nhật ký số ${systemAuditRow.auditId}` })
    await expect(fact(system, 'Người thực hiện')).toContainText('Hệ thống (job nền hoặc thiết bị)')
    // Dòng tạo mới không có giá trị trước.
    await expect(system.getByText('—', { exact: true })).toBeVisible()
  })

  test('chuỗi băm gãy thì báo đúng dòng; xuất CSV gửi kèm bộ lọc và mốc đang xem', async ({ page, api }) => {
    const from = dateFromNow(-30)
    const to = dateFromNow(-1)
    const broken: AuditLogPage = auditPage({
      items: [], total: 0, chain: { isValid: false, checkedRows: 74, brokenAuditId: 75, problem: 'Nội dung dòng không khớp mã băm' },
    })
    api.get(LOG, broken)
    api.get(EXPORT, file('﻿"Chuỗi hợp lệ","False"\r\n"Dòng gãy đầu tiên","75"\r\n', 'text/csv; charset=utf-8'))

    await page.goto(`/admin/audit-log?entityType=AppUser&from=${from}&to=${to}`)
    await expect(page.getByText('Chuỗi băm gãy ở dòng số 75: Nội dung dòng không khớp mã băm. Hãy xuất CSV và báo người phụ trách.')).toBeVisible()
    await expect(page.getByText(/Chuỗi băm còn nguyên/)).toHaveCount(0)
    // Chuỗi gãy nằm ngoài bộ lọc nên bảng trống mà cảnh báo vẫn hiện.
    await expect(page.getByText('Không có dòng nhật ký nào khớp')).toBeVisible()
    await expect(page.getByLabel('Loại đối tượng')).toHaveValue('AppUser')
    expect(api.sent('GET', LOG).at(-1)!.query).toEqual({ entityType: 'AppUser', from, to, page: '1', pageSize: '50' })

    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Xuất CSV' }).click()
    const download = await downloading
    expect(download.suggestedFilename()).toBe('crabshare-nhat-ky-kiem-toan-den-76.csv')
    const bytes = await readFile(await download.path())
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    expect(bytes.toString('utf8')).toContain('"Dòng gãy đầu tiên","75"')
    expect(api.sent('GET', EXPORT).map((c) => c.query)).toEqual([{ entityType: 'AppUser', from, to, throughAuditId: '76' }])
  })

  test('Làm mới bỏ mốc cũ nên thấy dòng vừa ghi thêm', async ({ page, api }) => {
    let tail = 76
    api.get(LOG, ({ query }) => {
      const through = query.throughAuditId ? Number(query.throughAuditId) : tail
      return auditPage({ page: Number(query.page), total: 120, throughAuditId: through, chain: { isValid: true, checkedRows: through, brokenAuditId: null, problem: null } })
    })
    await page.goto('/admin/audit-log')
    await expect(page.getByText('Chuỗi băm còn nguyên · 76 dòng')).toBeVisible()

    // Có dòng mới: trang đang xem vẫn theo mốc cũ cho tới khi bấm Làm mới.
    tail = 77
    await page.getByRole('button', { name: 'Trang sau' }).click()
    await expect(page.getByText('Trang 2 / 3 · 120 dòng')).toBeVisible()
    await expect(page.getByText('Chuỗi băm còn nguyên · 76 dòng')).toBeVisible()

    await page.getByRole('button', { name: 'Làm mới' }).click()
    await expect(page.getByText('Chuỗi băm còn nguyên · 77 dòng')).toBeVisible()
    await expect(page.getByText('Trang 1 / 3 · 120 dòng')).toBeVisible()
    await expect(page).not.toHaveURL(/through=/)
  })

  test('lỗi tải thì báo và thử lại được; khoảng ngày ngược thì không gọi API; xuất CSV lỗi thì báo, không tải tệp', async ({ page, api }) => {
    let down = true
    api.get(LOG, () => (down ? reply(503, { status: 503, detail: 'Nhật ký tạm thời không khả dụng.' }) : auditPage({ items: [], total: 0 })))
    api.get(EXPORT, () => reply(503, { status: 503, detail: 'Nhật ký tạm thời không khả dụng.' }))
    await page.goto('/admin/audit-log')
    await expect(page.getByRole('alert')).toContainText('Nhật ký tạm thời không khả dụng.')

    down = false
    await page.getByRole('button', { name: 'Thử lại' }).click()
    await expect(page.getByText('Không có dòng nhật ký nào khớp')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)

    let downloads = 0
    page.on('download', () => { downloads += 1 })
    await page.getByRole('button', { name: 'Xuất CSV' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    expect(downloads).toBe(0)

    // Ngày bắt đầu sau ngày kết thúc: báo ngay, ẩn bảng, khoá nút xuất, không gửi khoảng ngày sai lên máy chủ.
    await page.getByLabel('Từ ngày').fill(dateFromNow(-1))
    await expect(page).toHaveURL(/from=/)
    const before = api.sent('GET', LOG).length
    await page.getByLabel('Đến ngày').fill(dateFromNow(-5))
    await expect(page.getByText('Ngày bắt đầu không được sau ngày kết thúc.')).toBeVisible()
    await expect(page.getByText('Không có dòng nhật ký nào khớp')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Xuất CSV' })).toBeDisabled()
    expect(api.sent('GET', LOG)).toHaveLength(before)
  })

  test('trên điện thoại trang không tràn ngang', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/admin/audit-log')
    await expect(page.getByText(/Chuỗi băm còn nguyên/)).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

const OUTSIDERS: Role[] = ['Investor', 'EvidenceReviewer']
for (const role of OUTSIDERS) {
  test(`${role} không vào được nhật ký kiểm toán và trang không gọi API`, async ({ page, api }) => {
    await signIn(page, role)
    await expectTurnedAway(page, '/admin/audit-log')
    expect(api.calls).toEqual([])
  })
}
