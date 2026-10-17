import { test, expect, type Page } from '@playwright/test'
import type { AuditPage } from '../src/features/admin/adminAuditApi'
import { readFile } from 'node:fs/promises'

function result(page = 1, broken = false): AuditPage { return { items: [{ auditId: page === 1 ? 76 : 75, entityType: 'Batch', entityId: 73, actionType: 'Approve', oldValue: '{"status":"Submitted"}', newValue: '<script>alert("unsafe")</script>', actorUserId: 1, occurredAt: '2026-10-16T00:00:00Z', prevHash: 'a'.repeat(64), rowHash: 'b'.repeat(64) }], page, pageSize: 20, total: 21, throughAuditId: 76, chain: { isValid: !broken, checkedRows: broken ? 74 : 76, brokenAuditId: broken ? 75 : null, problem: broken ? 'row_hash không khớp nội dung: dòng này đã bị sửa.' : null } } }
async function signIn(page: Page, role = 'PlatformAdmin') {
  await page.addInitScript(role => localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token: 'audit-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 76, email: 'audit@local', fullName: 'Khôi', roles: [role], status: 'Active', operatorId: null } }, version: 0 })), role)
}
test('audit list filters and pages with a stable observed prefix; details escape raw content', async ({ page }) => {
  await signIn(page); const requests: URL[] = []; let dialog = false; page.on('dialog', async d => { dialog = true; await d.dismiss() })
  await page.route('**/api/admin/audit-log**', r => { const url = new URL(r.request().url()); requests.push(url); expect(r.request().headers()['authorization']).toBe('Bearer audit-token'); return r.fulfill({ json: result(Number(url.searchParams.get('page') ?? 1)) }) })
  await page.goto('/admin/audit-log'); await expect(page.getByText('Chuỗi băm hợp lệ')).toBeVisible()
  await page.getByText('Xem nội dung và chuỗi băm').click(); await expect(page.getByText('<script>alert("unsafe")</script>', { exact: true })).toBeVisible(); expect(dialog).toBe(false)
  await expect(page.getByText('Trang 1 / 2 · 21 kết quả')).toBeVisible()
  await page.getByRole('button', { name: 'Sau', exact: true }).click(); await expect.poll(() => requests.at(-1)?.searchParams.get('page')).toBe('2'); expect(requests.at(-1)?.searchParams.get('throughAuditId')).toBe('76')
  await expect(page.getByRole('button', { name: 'Sau', exact: true })).toBeDisabled()
  await page.getByLabel('Loại đối tượng').fill('PayoutAccount'); await expect.poll(() => requests.at(-1)?.searchParams.get('entityType')).toBe('PayoutAccount'); await expect.poll(() => requests.at(-1)?.searchParams.get('page')).toBe('1')
})
test('broken chain outside a filter is visible at the exact row and export contains verification', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/admin/audit-log**', r => new URL(r.request().url()).pathname.endsWith('/export') ? r.fulfill({ contentType: 'text/csv; charset=utf-8', body: '\ufeff"Chuỗi hợp lệ","False"\r\n"Dòng gãy đầu tiên","75"\r\n' }) : r.fulfill({ json: { ...result(1, true), items: [] } }))
  await page.goto('/admin/audit-log'); await expect(page.getByRole('alert')).toContainText('Phát hiện gãy chuỗi tại dòng #75'); await expect(page.getByText('Không có nhật ký phù hợp.')).toBeVisible()
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Xuất CSV + kiểm tra chuỗi' }).click(); const file = await download; const bytes = await readFile((await file.path())!); expect(bytes.subarray(0, 3)).toEqual(Buffer.from([239, 187, 191])); expect(bytes.toString('utf8')).toContain('"75"')
})
test('refresh observes a newly appended tail instead of retaining a cached old snapshot', async ({ page }) => {
  await signIn(page); let tail = 76
  await page.route('**/api/admin/audit-log**', r => { const requested = new URL(r.request().url()).searchParams.get('throughAuditId'); const boundary = requested ? Number(requested) : tail; return r.fulfill({ json: { ...result(), throughAuditId: boundary, chain: { isValid: true, checkedRows: boundary, brokenAuditId: null, problem: null } } }) })
  await page.goto('/admin/audit-log'); await expect(page.getByText(/mốc audit #76/)).toBeVisible(); tail = 77
  await page.getByRole('button', { name: 'Làm mới' }).click(); await expect(page.getByText(/mốc audit #77/)).toBeVisible()
})
test('loading, retry, empty state, invalid date and CSV failures remain truthful', async ({ page }) => {
  await signIn(page); let fail = true
  await page.route('**/api/admin/audit-log**', r => fail || new URL(r.request().url()).pathname.endsWith('/export') ? r.fulfill({ status: 503, json: { detail: 'Nhật ký tạm thời không khả dụng.' } }) : r.fulfill({ json: { ...result(), items: [], total: 0 } }))
  await page.goto('/admin/audit-log'); await expect(page.getByRole('alert')).toContainText('Nhật ký tạm thời không khả dụng.')
  fail = false; await page.getByRole('button', { name: 'Thử lại' }).click(); await expect(page.getByText('Không có nhật ký phù hợp.')).toBeVisible()
  await page.getByRole('button', { name: 'Xuất CSV + kiểm tra chuỗi' }).click(); await expect(page.getByRole('alert')).toBeVisible()
  await page.getByLabel('Từ ngày', { exact: true }).fill('2026-10-17'); await page.getByLabel('Đến ngày', { exact: true }).fill('2026-10-16'); await expect(page.getByRole('alert')).toContainText('Ngày bắt đầu không được sau ngày kết thúc.')
})
test('audit page follows admin styling and fits a phone', async ({ page }) => {
  await signIn(page); await page.route('**/api/admin/audit-log**', r => r.fulfill({ json: result() }))
  await page.goto('/admin/audit-log'); await expect(page.getByText('Chuỗi băm hợp lệ')).toBeVisible()
  if (process.env.CAPTURE_AUDIT === '1') await page.screenshot({ path: '../.artifacts/sprint3/cs76-admin.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await page.getByLabel('Loại đối tượng').boundingBox())!.width).toBeGreaterThan(250)
  if (process.env.CAPTURE_AUDIT === '1') await page.screenshot({ path: '../.artifacts/sprint3/cs76-small.png', fullPage: true })
})
test('investor cannot enter audit page or request its private API', async ({ page }) => {
  await signIn(page, 'Investor'); let requests = 0
  await page.route('**/api/admin/audit-log**', r => { requests++; return r.fulfill({ json: result() }) })
  await page.route('**/api/investor/portfolio**', r => r.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 10, summary: { totalConfirmedAmount: 0, activeConfirmedAmount: 0, totalBatches: 0, activeBatches: 0, approvedNetPayout: 0 } } }))
  await page.route('**/api/me/notifications**', r => r.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 100, asOf: '2026-10-16T00:00:00Z' } }))
  await page.route('**/api/me/kyc', r => r.fulfill({ json: { verificationStatus: 'Verified', verifiedAt: null, lastCheck: null } }))
  await page.goto('/admin/audit-log'); await expect(page).not.toHaveURL(/admin\/audit-log/); expect(requests).toBe(0)
})
