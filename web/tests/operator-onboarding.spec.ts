/* Đăng ký hộ nuôi (/dang-ky-ho-nuoi) và duyệt hồ sơ hộ nuôi (/admin/operators):
   - Tạo hồ sơ nháp tự làm mới JWT (/api/auth/refresh) thay vì bắt đăng xuất/đăng nhập lại.
   - Hộp thoại Gửi hồ sơ xét duyệt hoạt động (không bị nested form).
   - Địa điểm hộ nuôi chọn Tỉnh/Thành phố + Phường/Xã (không nhập tay toạ độ).
   - Admin duyệt hộ nuôi xác nhận pháp lý thay vì nhập số hộp tối đa. */
import type {
  AdminOperatorResponse, ApproveOperatorRequest, OperatorResponse, PartySiteResponse, SiteRequest,
} from '../src/shared/api/api.gen'
import { expect, paged, reply, signIn, test, userOf } from './support/app'
import { mockAdmin } from './support/admin'
import { party } from './support/investor'

const draftApp: OperatorResponse = {
  operatorId: 21,
  legalName: 'Trại Cua Hộp Năm Căn Mới',
  taxCode: '2008889991',
  businessRegNo: '61A8009991',
  farmAddress: 'Ấp Kinh Tắc, Xã Năm Căn, Tỉnh Cà Mau',
  approvedSlotCapacity: null,
  status: 'Draft',
  submittedAt: null,
  approvedAt: null,
  canEdit: true,
  canSubmit: true,
  canCancel: false,
}

test('đăng ký hộ nuôi: tạo nháp tự làm mới phiên, gửi xét duyệt và thêm địa điểm 2 cấp', async ({ page, api }) => {
  let app: OperatorResponse | null = null
  let sites: PartySiteResponse[] = []

  api.get('/api/operators/me', () => app ?? reply(404, { status: 404, detail: 'Chưa có hồ sơ hộ nuôi.' }))
  api.get('/api/me/party', party)
  api.get('/api/me/sites', () => sites)
  api.get('/api/me/related-parties', [])
  api.post('/api/operators', () => {
    app = draftApp
    return app
  })
  api.post('/api/auth/refresh', () => ({
    accessToken: 'refreshed-operator-token',
    expiresAt: '2099-01-01T00:00:00Z',
    user: userOf('OperatorMember', { email: 'customer@test.local', operatorId: 21 }),
  }))
  api.post('/api/operators/me/submit', () => {
    app = { ...draftApp, status: 'Submitted', submittedAt: '2026-11-28T06:00:00Z', canEdit: false, canSubmit: false }
    return app
  })
  api.post('/api/me/sites', (call) => {
    const body = call.body as SiteRequest
    const created: PartySiteResponse = {
      siteId: 91,
      siteCode: 'FARM-91',
      siteType: body.siteType,
      name: body.name,
      addressLine: body.addressLine,
      province: body.province ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      contactName: body.contactName ?? null,
      contactPhone: body.contactPhone ?? null,
      isDefault: body.isDefault,
      status: 'Active',
    }
    sites = [created]
    return reply(201, created)
  })

  await signIn(page, 'Customer')
  await page.goto('/dang-ky-ho-nuoi')

  await page.getByLabel('Tên pháp lý').first().fill(draftApp.legalName)
  await page.getByLabel('Mã số thuế').fill(draftApp.taxCode)
  await page.getByLabel('Số đăng ký kinh doanh').fill(draftApp.businessRegNo)
  await page.getByLabel('Địa chỉ trại').fill(draftApp.farmAddress)
  await page.getByRole('button', { name: 'Tạo hồ sơ' }).click()

  await expect.poll(() => api.sent('POST', '/api/auth/refresh').length).toBeGreaterThanOrEqual(1)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('crabshare-auth')!).state.token)).toBe('refreshed-operator-token')
  await expect(page.getByText('Đăng xuất rồi đăng nhập lại để mở cổng người nuôi.')).toHaveCount(0)

  await page.getByRole('button', { name: 'Gửi xét duyệt' }).click()
  const submitDialog = page.getByRole('dialog', { name: 'Gửi hồ sơ xét duyệt' })
  await submitDialog.getByRole('button', { name: 'Gửi', exact: true }).click()
  await expect(submitDialog).toHaveCount(0)
  expect(api.sent('POST', '/api/operators/me/submit')).toHaveLength(1)
  await expect(page.getByText('Hồ sơ đã gửi và đang chờ Admin xét duyệt.')).toBeVisible()

  await page.getByRole('button', { name: 'Thêm' }).click()
  const siteDialog = page.getByRole('dialog', { name: 'Thêm địa điểm' })
  await expect(siteDialog.getByLabel(/Toạ độ|Vĩ độ|Kinh độ/)).toHaveCount(0)
  await siteDialog.getByLabel(/^Tên/).fill('Trại Cua Năm Căn')
  await siteDialog.getByLabel(/^Tỉnh \/ Thành phố/).selectOption('Tỉnh Cà Mau')
  await siteDialog.getByLabel(/^Phường \/ Xã \/ Đặc khu/).selectOption('Xã Năm Căn')
  await siteDialog.getByLabel('Số nhà, đường / ấp, khóm').fill('Ấp Kinh Tắc')
  await siteDialog.getByRole('button', { name: 'Lưu' }).click()

  await expect(siteDialog).toHaveCount(0)
  expect(api.sent('POST', '/api/me/sites').map((c) => c.body)).toEqual([{
    siteType: 'Farm',
    name: 'Trại Cua Năm Căn',
    addressLine: 'Ấp Kinh Tắc, Xã Năm Căn',
    province: 'Tỉnh Cà Mau',
    latitude: 9.17682,
    longitude: 105.15242,
    contactName: null,
    contactPhone: null,
    isDefault: false,
  }])
})

test('admin duyệt hộ nuôi xác nhận pháp lý thay vì nhập số hộp tối đa', async ({ page, api }) => {
  mockAdmin(api)
  const pendingFarm: AdminOperatorResponse = {
    operatorId: 21,
    legalName: 'Trại Cua Hộp Năm Căn Mới',
    taxCode: '2008889991',
    businessRegNo: '61A8009991',
    farmAddress: 'Ấp Kinh Tắc, Xã Năm Căn, Tỉnh Cà Mau',
    status: 'Submitted',
    approvedSlotCapacity: null,
    submittedAt: '2026-11-28T06:00:00Z',
    approvedAt: null,
    rejectionReason: null,
  }
  let approved = false
  api.get('/api/admin/operators', () => paged(approved ? [] : [pendingFarm], 20))
  api.post('/api/admin/operators/21/approve', () => {
    approved = true
    return { ...pendingFarm, status: 'Approved', approvedSlotCapacity: 1_000_000, approvedAt: '2026-11-28T06:10:00Z' }
  })

  await signIn(page, 'PlatformAdmin')
  await page.goto('/admin/operators')

  const row = page.getByRole('row').filter({ hasText: pendingFarm.legalName })
  await row.getByRole('button', { name: 'Duyệt' }).click()

  const dialog = page.getByRole('dialog', { name: 'Duyệt hồ sơ hộ nuôi' })
  await expect(dialog.getByLabel(/Số hộp/)).toHaveCount(0)
  await expect(dialog).toContainText('Đỗ Quang Huy (platformadmin@test.local)')
  const confirmBtn = dialog.getByRole('button', { name: 'Xác nhận duyệt' })
  await expect(confirmBtn).toBeDisabled()

  await dialog.getByRole('checkbox', { name: /Tôi xác nhận đã đối chiếu hồ sơ pháp lý/ }).check()
  await expect(confirmBtn).toBeEnabled()
  await confirmBtn.click()

  await expect(dialog).toHaveCount(0)
  const expectedBody: ApproveOperatorRequest = { approvedSlotCapacity: 1_000_000 }
  expect(api.sent('POST', '/api/admin/operators/21/approve').map((c) => c.body)).toEqual([expectedBody])
})
