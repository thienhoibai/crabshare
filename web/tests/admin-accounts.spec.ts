/* Quản trị tài khoản: danh sách người dùng và hàng kiểm tra eKYC (/admin/users, hai tab), hồ sơ một tài khoản (/admin/users/:id)
   với khoá, mở khoá và duyệt ngoại lệ xác minh danh tính. */
import type { AdminAccountDecisionRequest, AdminKycResponse, AdminUserDetailResponse } from '../src/shared/api/api.gen'
import { expect, reply, signIn, test, type Api } from './support/app'
import { bankKyc, expectTurnedAway, fact, failedKyc, investorUser, mockAdmin, operatorUser, shownDateTime, userDetail } from './support/admin'

const USERS = '/api/admin/users'
const USER = `${USERS}/${investorUser.userId}`
const KYC = '/api/admin/kyc-checks'
const EXCEPTION = `${KYC}/${failedKyc.id}/approve-exception`

/** Hồ sơ tài khoản có trạng thái: GET trả bản hiện tại, test đổi nó khi máy chủ nhận quyết định. */
function serveUser(api: Api) {
  const state: { current: AdminUserDetailResponse } = { current: userDetail }
  api.get(USER, () => state.current)
  return state
}

test.describe('Quản trị', () => {
  test.beforeEach(async ({ page, api }) => {
    mockAdmin(api)
    await signIn(page, 'PlatformAdmin')
  })

  test('danh sách người dùng đọc từ API; lọc vai trò, trạng thái, tìm và sang trang đều gửi lên máy chủ', async ({ page, api }) => {
    api.get(USERS, ({ query }) => ({ items: [investorUser], page: Number(query.page), pageSize: 20, total: 45 }))
    const last = () => api.sent('GET', USERS).at(-1)!.query
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: 'Người dùng và eKYC', level: 1 })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Người dùng' })).toHaveAttribute('aria-selected', 'true')

    const row = page.getByRole('row').filter({ hasText: investorUser.email })
    await expect(row).toContainText(investorUser.fullName)
    await expect(row).toContainText(`${investorUser.email} · ${investorUser.phone}`)
    await expect(row.getByText('Nhà đầu tư')).toBeVisible()
    await expect(row.getByText('Khách hàng')).toBeVisible()
    await expect(row.getByText('Đang hoạt động')).toBeVisible()
    await expect(row.getByText('Bị từ chối')).toBeVisible()
    expect(last()).toEqual({ page: '1', pageSize: '20' })

    await page.getByLabel('Vai trò').selectOption({ label: 'Nhà đầu tư' })
    await page.getByLabel('Trạng thái tài khoản').selectOption({ label: 'Đang hoạt động' })
    await page.getByLabel('Tìm người dùng').fill('  Nguyễn An ')
    await page.getByRole('button', { name: 'Tìm' }).click()
    await expect(page).toHaveURL(/q=Nguy/)
    await expect.poll(last).toEqual({ role: 'Investor', status: 'Active', q: 'Nguyễn An', page: '1', pageSize: '20' })

    await expect(page.getByText('Trang 1 / 3 · 45 dòng')).toBeVisible()
    await page.getByRole('button', { name: 'Trang sau' }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByText('Trang 2 / 3 · 45 dòng')).toBeVisible()
    expect(last()).toEqual({ role: 'Investor', status: 'Active', q: 'Nguyễn An', page: '2', pageSize: '20' })

    // Bấm một dòng thì mở hồ sơ tài khoản.
    await row.click()
    await expect(page).toHaveURL(new RegExp(`/admin/users/${investorUser.userId}$`))
    await expect(page.getByRole('heading', { name: investorUser.fullName, level: 1 })).toBeVisible()
    expect(api.writes()).toEqual([])
  })

  test('gõ Enter trong ô tìm cũng tìm; không khớp ai thì báo trống', async ({ page, api }) => {
    await page.goto('/admin/users')
    await expect(page.getByRole('row').filter({ hasText: operatorUser.email }).getByText('Đã khoá')).toBeVisible()
    await page.getByLabel('Tìm người dùng').fill('không có ai tên này')
    await page.getByLabel('Tìm người dùng').press('Enter')
    await expect(page.getByText('Không có người dùng nào khớp')).toBeVisible()
    expect(api.sent('GET', USERS).at(-1)!.query.q).toBe('không có ai tên này')
  })

  test('khoá rồi mở khoá tài khoản: bắt buộc lý do, trạng thái hiện theo máy chủ', async ({ page, api }) => {
    const user = serveUser(api)
    for (const action of ['lock', 'unlock'] as const) {
      api.post(`${USER}/${action}`, () => {
        user.current = { ...userDetail, user: { ...investorUser, status: action === 'lock' ? 'Locked' : 'Active' } }
        return user.current.user
      })
    }
    await page.goto(`/admin/users/${investorUser.userId}`)
    await expect(page.getByRole('main').getByText('Đang hoạt động', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Khoá tài khoản' }).click()
    const lock = page.getByRole('dialog', { name: 'Khoá tài khoản', exact: true })
    await expect(lock).toContainText(`${investorUser.fullName} · sẽ không đăng nhập được`)
    const confirmLock = lock.getByRole('button', { name: 'Khoá', exact: true })
    await expect(confirmLock).toBeDisabled()
    await lock.getByLabel('Lý do').fill('   ')
    await expect(confirmLock).toBeDisabled()
    expect(api.writes()).toEqual([])
    await lock.getByLabel('Lý do').fill(' Nghi bị chiếm tài khoản ')
    await confirmLock.click()

    await expect(page.getByRole('status').filter({ hasText: 'Đã khoá tài khoản.' })).toBeVisible()
    await expect(lock).toHaveCount(0)
    await expect(page.getByRole('main').getByText('Đã khoá', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Khoá tài khoản' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Mở khoá' }).click()
    const unlock = page.getByRole('dialog', { name: 'Mở khoá tài khoản' })
    // Hộp mới mở không giữ lý do của lần trước.
    await expect(unlock.getByLabel('Lý do')).toHaveValue('')
    await unlock.getByLabel('Lý do').fill('Chủ tài khoản đã xác nhận lại')
    await unlock.getByRole('button', { name: 'Mở khoá' }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Đã mở khoá tài khoản.' })).toBeVisible()
    await expect(page.getByRole('main').getByText('Đang hoạt động', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Khoá tài khoản' })).toBeVisible()

    const locked: AdminAccountDecisionRequest = { reason: 'Nghi bị chiếm tài khoản' }
    const unlocked: AdminAccountDecisionRequest = { reason: 'Chủ tài khoản đã xác nhận lại' }
    expect(api.sent('POST', `${USER}/lock`).map((c) => c.body)).toEqual([locked])
    expect(api.sent('POST', `${USER}/unlock`).map((c) => c.body)).toEqual([unlocked])
    expect(api.writes()).toEqual([`POST ${USER}/lock`, `POST ${USER}/unlock`])
  })

  test('hồ sơ tài khoản: duyệt ngoại lệ lần eKYC đủ điều kiện thì thành đã xác minh; không hiện ảnh giấy tờ', async ({ page, api }) => {
    const user = serveUser(api)
    api.post(EXCEPTION, () => {
      const approved: AdminKycResponse = { ...failedKyc, result: 'ExceptionApproved', reviewedBy: 104, canApproveException: false }
      user.current = { user: { ...investorUser, verificationStatus: 'Verified' }, verifiedAt: new Date().toISOString(), kycChecks: [approved] }
      return approved
    })
    await page.goto(`/admin/users/${investorUser.userId}`)
    await expect(page.getByRole('heading', { name: investorUser.fullName, level: 1 })).toBeVisible()
    await expect(page.getByText(investorUser.email)).toBeVisible()
    await expect(fact(page, 'Số điện thoại')).toContainText(investorUser.phone!)
    await expect(fact(page, 'Xác minh nhà đầu tư')).toContainText('Bị từ chối')
    const check = page.getByRole('row').filter({ hasText: 'Giấy tờ và khuôn mặt' })
    await expect(check.getByText('Không đạt')).toBeVisible()
    await expect(check).toContainText('Không khớp khuôn mặt')
    await expect(check).toContainText(await shownDateTime(page, failedKyc.checkedAt))
    // Quản trị chỉ thấy kết quả kiểm tra, không thấy ảnh giấy tờ hay ảnh khuôn mặt.
    await expect(page.getByRole('main').getByRole('img')).toHaveCount(0)

    // Bấm dòng để xem mã tham chiếu và thời điểm nhà đầu tư đồng ý xử lý dữ liệu.
    await check.getByText('Giấy tờ và khuôn mặt').click()
    const view = page.getByRole('dialog', { name: 'Lần kiểm tra danh tính' })
    await expect(fact(view, 'Mã tham chiếu')).toContainText(failedKyc.providerReference!)
    await expect(fact(view, 'Đồng ý xử lý dữ liệu')).toContainText(await shownDateTime(page, failedKyc.consentAt!))
    await view.getByRole('button', { name: 'Đóng' }).click()

    await check.getByRole('button', { name: 'Duyệt ngoại lệ' }).click()
    const dialog = page.getByRole('dialog', { name: 'Duyệt ngoại lệ xác minh danh tính' })
    await expect(dialog).toContainText(`${investorUser.fullName} · sẽ được coi là đã xác minh`)
    // Bấm nút trong dòng không mở kèm hộp xem chi tiết.
    await expect(view).toHaveCount(0)
    const confirm = dialog.getByRole('button', { name: 'Duyệt ngoại lệ' })
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel('Căn cứ duyệt ngoại lệ').fill('Đã đối chiếu giấy tờ gốc tại văn phòng')
    await confirm.click()

    await expect(page.getByRole('status').filter({ hasText: 'Đã duyệt ngoại lệ. Nhà đầu tư được xác minh.' })).toBeVisible()
    await expect(dialog).toHaveCount(0)
    const body: AdminAccountDecisionRequest = { reason: 'Đã đối chiếu giấy tờ gốc tại văn phòng' }
    expect(api.sent('POST', EXCEPTION).map((c) => c.body)).toEqual([body])
    expect(api.writes()).toEqual([`POST ${EXCEPTION}`])

    await expect(fact(page, 'Xác minh nhà đầu tư')).toContainText('Đã xác minh')
    await expect(check.getByText('Duyệt ngoại lệ', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Duyệt ngoại lệ' })).toHaveCount(0)
  })

  test('máy chủ không cho duyệt ngoại lệ nữa (422): lỗi hiện trong hộp thoại, căn cứ còn nguyên', async ({ page, api }) => {
    api.post(EXCEPTION, () => reply(422, { status: 422, detail: 'Lần eKYC này không còn đủ điều kiện duyệt ngoại lệ.' }))
    await page.goto(`/admin/users/${investorUser.userId}`)
    await page.getByRole('button', { name: 'Duyệt ngoại lệ' }).click()
    const dialog = page.getByRole('dialog', { name: 'Duyệt ngoại lệ xác minh danh tính' })
    await dialog.getByLabel('Căn cứ duyệt ngoại lệ').fill('Kiểm tra')
    await dialog.getByRole('button', { name: 'Duyệt ngoại lệ' }).click()
    await expect(dialog.getByText('Lần eKYC này không còn đủ điều kiện duyệt ngoại lệ.')).toBeVisible()
    await expect(dialog.getByLabel('Căn cứ duyệt ngoại lệ')).toHaveValue('Kiểm tra')
    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(fact(page, 'Xác minh nhà đầu tư')).toContainText('Bị từ chối')
  })

  test('hàng eKYC: mặc định là các lần không đạt, lọc theo loại; chỉ lần đủ điều kiện có nút duyệt ngoại lệ', async ({ page, api }) => {
    const last = () => api.sent('GET', KYC).at(-1)!.query
    await page.goto('/admin/users')
    await page.getByRole('tab', { name: 'Kiểm tra eKYC' }).click()
    await expect(page).toHaveURL(/tab=kyc/)

    const eligible = page.getByRole('row').filter({ hasText: failedKyc.email })
    await expect(eligible).toContainText('Giấy tờ và khuôn mặt')
    await expect(eligible.getByRole('button', { name: 'Duyệt ngoại lệ' })).toBeVisible()
    // Lần khớp tên tài khoản ngân hàng không duyệt ngoại lệ được.
    const bank = page.getByRole('row').filter({ hasText: bankKyc.email })
    await expect(bank).toContainText('Khớp tên tài khoản ngân hàng')
    await expect(bank).toContainText(bankKyc.failureReason!)
    await expect(bank.getByRole('button')).toHaveCount(0)
    await expect(page.getByLabel('Kết quả')).toHaveValue('Failed')
    expect(last()).toEqual({ result: 'Failed', page: '1', pageSize: '20' })

    await page.getByLabel('Loại kiểm tra').selectOption({ label: 'Giấy tờ và khuôn mặt' })
    await expect(bank).toHaveCount(0)
    expect(last()).toEqual({ result: 'Failed', checkType: 'EkycIdFace', page: '1', pageSize: '20' })

    // "Mọi kết quả" gửi result rỗng; bỏ trống thì máy chủ chỉ trả các lần không đạt.
    await page.getByLabel('Kết quả').selectOption({ label: 'Mọi kết quả' })
    await expect.poll(last).toEqual({ result: '', checkType: 'EkycIdFace', page: '1', pageSize: '20' })
    await page.getByLabel('Kết quả').selectOption({ label: 'Đạt' })
    await expect(page.getByText('Không có lần kiểm tra nào khớp')).toBeVisible()
    expect(last()).toEqual({ result: 'Passed', checkType: 'EkycIdFace', page: '1', pageSize: '20' })
    expect(api.writes()).toEqual([])
  })

  test('tài khoản không có thì báo lỗi của máy chủ, không dựng hồ sơ mẫu', async ({ page, api }) => {
    api.get(`${USERS}/999`, () => reply(404, { status: 404, detail: 'Không tìm thấy người dùng.' }))
    await page.goto('/admin/users/999')
    await expect(page.getByRole('alert')).toContainText('Không tìm thấy người dùng.')
    await expect(page.getByRole('button', { name: 'Khoá tài khoản' })).toHaveCount(0)
  })
})

test('Kiểm định bằng chứng không vào được trang người dùng và trang không gọi API', async ({ page, api }) => {
  await signIn(page, 'EvidenceReviewer')
  await expectTurnedAway(page, '/admin/users')
  expect(api.calls).toEqual([])
})
