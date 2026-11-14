/* Quản trị hồ sơ hộ nuôi (/admin/operators): hộ nuôi đang tạm dừng mở lại được, kèm lý do bắt buộc. */
import type { AdminOperatorResponse, OperatorDecisionRequest, PagedResultOfAdminOperatorResponse } from '../src/shared/api/api.gen'
import { expect, signIn, test } from './support/app'
import { mockAdmin } from './support/admin'

const LIST = '/api/admin/operators'

const suspended: AdminOperatorResponse = {
  operatorId: 7, legalName: 'HTX Nuôi cua Năm Căn', taxCode: '2001234567', businessRegNo: '61-HTX-0001',
  farmAddress: 'Ấp Hàng Vịnh, Năm Căn, Cà Mau', status: 'Suspended', approvedSlotCapacity: 2000,
  submittedAt: '2026-05-01T02:00:00Z', approvedAt: '2026-05-06T02:00:00Z', approvedBy: 1,
}

const page1 = (items: AdminOperatorResponse[]): PagedResultOfAdminOperatorResponse => ({ items, page: 1, pageSize: 20, total: items.length })

test('hộ nuôi đang tạm dừng: nút Mở lại, lý do bắt buộc, gửi đúng lời gọi rồi hết khỏi danh sách tạm dừng', async ({ page, api }) => {
  mockAdmin(api)
  let rows = [suspended]
  api.get(LIST, () => page1(rows))
  api.post(`${LIST}/7/reinstate`, () => {
    rows = []
    return { ...suspended, status: 'Approved' }
  })
  await signIn(page, 'PlatformAdmin')
  await page.goto('/admin/operators?status=Suspended')

  const row = page.getByRole('row').filter({ hasText: 'HTX Nuôi cua Năm Căn' })
  await expect(row).toContainText('Tạm dừng')
  await expect(row.getByRole('button', { name: 'Tạm dừng' })).toHaveCount(0)
  await row.getByRole('button', { name: 'Mở lại' }).click()

  const dialog = page.getByRole('dialog', { name: 'Mở lại hộ nuôi' })
  await expect(dialog).toContainText('Hộ nuôi hoạt động lại với số hộp đã duyệt trước đó.')
  const confirm = dialog.getByRole('button', { name: 'Mở lại' })
  await expect(confirm).toBeDisabled()
  await dialog.getByRole('textbox').fill('  Đã kiểm tra lại trại  ')
  await confirm.click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã mở lại hộ nuôi.' })).toBeVisible()
  const body: OperatorDecisionRequest = { reason: 'Đã kiểm tra lại trại' }
  expect(api.sent('POST', `${LIST}/7/reinstate`).map((c) => c.body)).toEqual([body])
  await expect(page.getByText('Không có hộ nuôi nào ở trạng thái này')).toBeVisible()
})
