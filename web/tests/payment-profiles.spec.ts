/* Tài khoản nhận tiền: của nhà đầu tư ở /nha-dau-tu/ho-so (mục Tài khoản nhận tiền) và của hộ nuôi ở /operator/payout-account.
   GET / PUT /api/me/payout-account?ownerType=Investor | Operator. Địa chỉ giao hàng của khách đã chuyển sang /khach/dia-diem (spec của cổng khách). */
import type { OperatorResponse, PayoutAccountRequest, PayoutProfileResponse } from '../src/shared/api/api.gen'
import { daysFromNow, expect, reply, signIn, test } from './support/app'
import { HOLDER, mockInvestor, panel, payoutActive, payoutEmpty } from './support/investor'

const INPUT: PayoutAccountRequest = { bankCode: 'VCB', accountNo: '0071000123456', accountHolderName: HOLDER }

/** Hồ sơ sau khi lưu: tên khớp thì tài khoản hoạt động, không khớp thì bị khoá. */
const saved = (base: PayoutProfileResponse, input: PayoutAccountRequest, matched: boolean): PayoutProfileResponse => ({
  ...base,
  account: { payoutAccountId: 9, ...input, nameMatchStatus: matched ? 'Matched' : 'Mismatched', status: matched ? 'Active' : 'Locked', updatedAt: daysFromNow(0) },
})

test.describe('nhà đầu tư', () => {
  test.beforeEach(async ({ page, api }) => {
    mockInvestor(api)
    await signIn(page, 'Investor')
  })

  test('lưu tài khoản nhận tiền: gửi đúng phạm vi nhà đầu tư và thấy kết quả đối chiếu tên', async ({ page, api }) => {
    let profile = payoutEmpty
    api.get('/api/me/payout-account', () => profile)
    api.put('/api/me/payout-account', (call) => (profile = saved(payoutEmpty, call.body as PayoutAccountRequest, true)))
    // Người đã xác minh mở hồ sơ là vào thẳng mục tài khoản nhận tiền.
    await page.goto('/nha-dau-tu/ho-so')
    await expect(page.getByRole('tab', { name: 'Tài khoản nhận tiền' })).toHaveAttribute('aria-selected', 'true')

    const form = panel(page, 'Tài khoản nhận tiền')
    const save = form.getByRole('button', { name: 'Lưu tài khoản' })
    // Tên chủ tài khoản điền sẵn theo tên trên hồ sơ; chưa có ngân hàng và số tài khoản thì chưa lưu được.
    await expect(form.getByLabel('Tên chủ tài khoản')).toHaveValue(HOLDER)
    await expect(form.getByText(`Phải khớp: ${HOLDER}`)).toBeVisible()
    await expect(save).toBeDisabled()
    await form.getByLabel('Mã ngân hàng').fill('vcb')
    await form.getByLabel('Số tài khoản').fill('123')
    await expect(save).toBeDisabled()
    // Ô số tài khoản chỉ nhận chữ số.
    await form.getByLabel('Số tài khoản').fill('0071 000-123456')
    await expect(form.getByLabel('Số tài khoản')).toHaveValue('0071000123456')
    await save.click()

    await expect(page.getByRole('status').filter({ hasText: 'Đã lưu tài khoản nhận tiền, tên chủ tài khoản khớp.' })).toBeVisible()
    await expect(form.getByText('Đang nhận tiền')).toBeVisible()
    await expect(form.getByText('Tên khớp hồ sơ')).toBeVisible()
    await expect(form.getByLabel('Mã ngân hàng')).toHaveValue('VCB')

    const puts = api.sent('PUT', '/api/me/payout-account')
    expect(puts.map((c) => c.body)).toEqual([INPUT])
    expect(puts[0].query).toEqual({ ownerType: 'Investor' })
    expect(puts[0].auth).toBe('Bearer test-token')
    expect(api.sent('GET', '/api/me/payout-account').every((c) => c.query.ownerType === 'Investor')).toBe(true)
    expect(api.writes()).toEqual(['PUT /api/me/payout-account'])
  })

  test('tên không khớp hồ sơ: tài khoản bị khoá, không ghi là đang nhận tiền; sửa tên rồi lưu lại thì mở', async ({ page, api }) => {
    let profile = payoutEmpty
    api.get('/api/me/payout-account', () => profile)
    api.put('/api/me/payout-account', (call) => {
      const input = call.body as PayoutAccountRequest
      return (profile = saved(payoutEmpty, input, input.accountHolderName === HOLDER))
    })
    await page.goto('/nha-dau-tu/ho-so?tab=tai-khoan')
    const form = panel(page, 'Tài khoản nhận tiền')
    await form.getByLabel('Mã ngân hàng').fill('VCB')
    await form.getByLabel('Số tài khoản').fill(INPUT.accountNo)
    await form.getByLabel('Tên chủ tài khoản').fill('LE MINH KHOA')
    await form.getByRole('button', { name: 'Lưu tài khoản' }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Đã lưu nhưng tên chủ tài khoản chưa khớp. Kiểm tra lại tên.' })).toBeVisible()
    await expect(form.getByText('Đang khoá', { exact: true })).toBeVisible()
    await expect(form.getByText('Tên chưa khớp hồ sơ')).toBeVisible()
    await expect(form.getByText('Tên chưa khớp nên tài khoản đang khoá. Sửa tên rồi lưu lại.')).toBeVisible()
    await expect(form.getByText('Đang nhận tiền')).toHaveCount(0)

    await form.getByLabel('Tên chủ tài khoản').fill(HOLDER)
    await form.getByRole('button', { name: 'Lưu tài khoản' }).click()
    await expect(form.getByText('Đang nhận tiền')).toBeVisible()
    await expect(form.getByText('Tên chưa khớp nên tài khoản đang khoá.')).toHaveCount(0)
    expect(api.sent('PUT', '/api/me/payout-account').map((c) => (c.body as PayoutAccountRequest).accountHolderName)).toEqual(['LE MINH KHOA', HOLDER])
  })

  test('máy chủ báo trùng tài khoản: hiện lỗi và giữ nguyên những gì đã nhập', async ({ page, api }) => {
    api.get('/api/me/payout-account', payoutEmpty)
    api.put('/api/me/payout-account', () => reply(409, { status: 409, detail: 'Tài khoản ngân hàng này đã được đăng ký cho chủ sở hữu khác.' }))
    await page.goto('/nha-dau-tu/ho-so?tab=tai-khoan')
    const form = panel(page, 'Tài khoản nhận tiền')
    await form.getByLabel('Mã ngân hàng').fill('VCB')
    await form.getByLabel('Số tài khoản').fill(INPUT.accountNo)
    await form.getByRole('button', { name: 'Lưu tài khoản' }).click()

    await expect(page.getByRole('alert')).toContainText('đã được đăng ký cho chủ sở hữu khác')
    await expect(form.getByLabel('Số tài khoản')).toHaveValue(INPUT.accountNo)
    await expect(form.getByLabel('Mã ngân hàng')).toHaveValue('VCB')
    await expect(form.getByText('Đang nhận tiền')).toHaveCount(0)
    await expect(form.getByRole('button', { name: 'Lưu tài khoản' })).toBeEnabled()
  })

  test('tài khoản bị Admin khoá thì không tự mở lại được bằng cách lưu', async ({ page, api }) => {
    api.get('/api/me/payout-account', { ...payoutActive, account: { ...payoutActive.account!, status: 'Locked' } })
    await page.goto('/nha-dau-tu/ho-so?tab=tai-khoan')
    const form = panel(page, 'Tài khoản nhận tiền')
    await expect(form.getByText('Tài khoản đang bị Admin khoá. Liên hệ Admin để mở lại.')).toBeVisible()
    await expect(form.getByText('Đang khoá', { exact: true })).toBeVisible()
    await expect(form.getByLabel('Mã ngân hàng')).toBeDisabled()
    await expect(form.getByLabel('Số tài khoản')).toBeDisabled()
    await expect(form.getByLabel('Tên chủ tài khoản')).toBeDisabled()
    await expect(form.getByRole('button', { name: 'Lưu tài khoản' })).toBeDisabled()
  })
})

test.describe('hộ nuôi', () => {
  const farm = (memberRole: string): OperatorResponse => ({
    operatorId: 7, legalName: 'HTX Năm Căn', taxCode: '2001234567', businessRegNo: 'HTX-0045', farmAddress: 'Năm Căn, Cà Mau', status: 'Approved',
    submittedAt: daysFromNow(-90), memberRole, canEdit: memberRole === 'Owner', canSubmit: false,
  })
  const farmPayout: PayoutProfileResponse = { ownerType: 'Operator', expectedHolderName: 'HTX NAM CAN', account: null }

  test('chủ hộ lưu tài khoản của hộ nuôi với phạm vi hộ nuôi', async ({ page, api }) => {
    let profile = farmPayout
    api.get('/api/operators/me', farm('Owner'))
    api.get('/api/me/payout-account', () => profile)
    api.put('/api/me/payout-account', (call) => (profile = saved(farmPayout, call.body as PayoutAccountRequest, true)))
    await signIn(page, 'OperatorMember')
    await page.goto('/operator/payout-account')
    await expect(page.getByRole('heading', { name: 'Tài khoản nhận tiền', level: 1 })).toBeVisible()

    const form = panel(page, 'Thông tin ngân hàng')
    await expect(form.getByLabel('Tên chủ tài khoản')).toHaveValue('HTX NAM CAN')
    await form.getByLabel('Mã ngân hàng').fill('bidv')
    await form.getByLabel('Số tài khoản').fill('8600123456')
    await form.getByRole('button', { name: 'Lưu tài khoản' }).click()
    await expect(form.getByText('Đang nhận tiền')).toBeVisible()

    const put = api.sent('PUT', '/api/me/payout-account')
    expect(put.map((c) => c.body)).toEqual([{ bankCode: 'BIDV', accountNo: '8600123456', accountHolderName: 'HTX NAM CAN' }])
    expect(put[0].query).toEqual({ ownerType: 'Operator' })
    expect(api.sent('GET', '/api/me/payout-account').every((c) => c.query.ownerType === 'Operator')).toBe(true)
  })

  test('nhân viên hộ nuôi không quản lý được tài khoản: hiện lý do của máy chủ, không có form', async ({ page, api }) => {
    api.get('/api/operators/me', farm('Staff'))
    api.get('/api/me/payout-account', () => reply(403, { status: 403, detail: 'Chỉ chủ hộ nuôi được quản lý tài khoản nhận tiền của hộ nuôi.' }))
    await signIn(page, 'OperatorMember')
    await page.goto('/operator/payout-account')
    await expect(page.getByRole('alert')).toContainText('Chỉ chủ hộ nuôi được quản lý tài khoản nhận tiền của hộ nuôi.')
    await expect(page.getByRole('button', { name: 'Lưu tài khoản' })).toHaveCount(0)
    await expect(page.getByLabel('Số tài khoản')).toHaveCount(0)
    expect(api.sent('GET', '/api/me/payout-account').every((c) => c.query.ownerType === 'Operator')).toBe(true)
    expect(api.writes()).toEqual([])
  })
})
