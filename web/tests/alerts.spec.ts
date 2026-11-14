/* Cảnh báo vận hành ở hai phía: người nuôi ghi cách xử lý (/operator/alerts), Quản trị theo dõi và đóng cảnh báo (/admin/alerts). */
import type { AcknowledgeAlertRequest, AlertResponse, AuthResponse, ResolveAlertRequest } from '../src/shared/api/api.gen'
import { TOKEN, daysFromNow, expect, reply, signIn, test, userOf, type Api, type Page } from './support/app'
import { acknowledgedAlert, alertListReply, escalatedAlert, expectTurnedAway, mockAdmin, openAlert, operatorAlerts, shownDateTime } from './support/admin'

/** Cảnh báo người nuôi chưa phản hồi và đã quá hạn phản hồi. */
const lateAlert: AlertResponse = { ...openAlert, id: 37, raisedAt: daysFromNow(-0.2), ackDeadline: daysFromNow(-0.1) }

test.describe('người nuôi', () => {
  const LIST = '/api/operators/me/alerts'
  const ACK = `/api/alerts/${lateAlert.id}/acknowledge`
  const card = (page: Page, a: AlertResponse) => page.getByRole('article').filter({ hasText: a.message })

  test.beforeEach(async ({ page, api }) => {
    mockAdmin(api)
    await signIn(page, 'OperatorMember')
  })

  test('ghi cách xử lý; phản hồi trễ hạn thì cảnh báo vẫn chuyển cho Quản trị theo dõi', async ({ page, api }) => {
    let rows = [lateAlert]
    api.get(LIST, () => rows)
    api.post(ACK, ({ body }) => {
      const sent = body as AcknowledgeAlertRequest
      rows = [{ ...lateAlert, status: 'Escalated', acknowledgedAt: new Date().toISOString(), acknowledgedBy: 102, responseNote: sent.responseNote, escalatedAt: lateAlert.ackDeadline }]
      return rows[0]
    })

    await page.goto('/operator/alerts')
    await expect(page.getByRole('heading', { name: 'Cảnh báo', level: 1 })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Đang mở' })).toHaveText('Đang mở1')
    const alert = card(page, lateAlert)
    await expect(alert).toContainText('Chất lượng nước')
    await expect(alert.getByText('Cao', { exact: true })).toBeVisible()
    await expect(alert.getByRole('link', { name: lateAlert.batchCode })).toHaveAttribute('href', `/operator/batches/${lateAlert.batchCode}`)
    await expect(alert).toContainText(`hạn phản hồi ${await shownDateTime(page, lateAlert.ackDeadline)}`)

    await alert.getByRole('button', { name: 'Ghi cách xử lý' }).click()
    const dialog = page.getByRole('dialog', { name: 'Chất lượng nước' })
    await expect(dialog).toContainText(lateAlert.message)
    await expect(dialog).toContainText('Đã quá hạn phản hồi nên Admin vẫn theo dõi cảnh báo này.')
    const send = dialog.getByRole('button', { name: 'Gửi', exact: true })
    await expect(send).toBeDisabled()
    await dialog.getByLabel('Đã xử lý thế nào').fill('   ')
    await expect(send).toBeDisabled()
    await dialog.getByLabel('Đã xử lý thế nào').fill(' Đã thay nước ')
    await send.click()

    await expect(page.getByRole('status').filter({ hasText: 'Đã ghi cách xử lý.' })).toBeVisible()
    await expect(dialog).toHaveCount(0)
    const body: AcknowledgeAlertRequest = { responseNote: 'Đã thay nước' }
    const calls = api.sent('POST', ACK)
    expect(calls.map((c) => c.body)).toEqual([body])
    expect(calls[0].auth).toBe(`Bearer ${TOKEN}`)
    expect(api.writes()).toEqual([`POST ${ACK}`])

    // Danh sách tải lại: có phản hồi, cảnh báo đã chuyển cấp, hết nút ghi cách xử lý.
    await expect(alert).toContainText('Đã xử lý: Đã thay nước')
    await expect(alert.getByText('Đã chuyển cấp')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ghi cách xử lý' })).toHaveCount(0)
  })

  test('cảnh báo còn trong hạn thì hộp ghi cách xử lý không nhắc chuyện quá hạn', async ({ page }) => {
    await page.goto('/operator/alerts')
    await card(page, openAlert).getByRole('button', { name: 'Ghi cách xử lý' }).click()
    const dialog = page.getByRole('dialog', { name: 'Chất lượng nước' })
    await expect(dialog.getByLabel('Đã xử lý thế nào')).toBeVisible()
    await expect(dialog.getByText(/quá hạn phản hồi/)).toHaveCount(0)
  })

  test('máy chủ không nhận phản hồi (409) thì lỗi hiện trong hộp thoại và ghi chú còn nguyên để gửi lại', async ({ page, api }) => {
    api.get(LIST, [lateAlert])
    api.post(ACK, () => reply(409, { status: 409, detail: 'Cảnh báo đã thay đổi.' }))
    await page.goto('/operator/alerts')
    await page.getByRole('button', { name: 'Ghi cách xử lý' }).click()
    const dialog = page.getByRole('dialog', { name: 'Chất lượng nước' })
    await dialog.getByLabel('Đã xử lý thế nào').fill('Đã thay nước')
    await dialog.getByRole('button', { name: 'Gửi', exact: true }).click()
    await expect(dialog.getByText('Cảnh báo đã thay đổi.')).toBeVisible()
    await expect(dialog.getByLabel('Đã xử lý thế nào')).toHaveValue('Đã thay nước')
    await expect(dialog.getByRole('button', { name: 'Gửi', exact: true })).toBeEnabled()
    await expect(page.getByRole('status').filter({ hasText: 'Đã ghi cách xử lý.' })).toHaveCount(0)
  })

  test('các mục lọc ngay trên dữ liệu đã tải; chỉ cảnh báo chưa phản hồi có nút ghi cách xử lý', async ({ page, api }) => {
    await page.goto('/operator/alerts')
    const open = card(page, openAlert)
    const acknowledged = card(page, acknowledgedAlert)
    await expect(open).toBeVisible()
    await expect(acknowledged).toHaveCount(0)

    await page.getByRole('tab', { name: 'Đã ghi nhận' }).click()
    await expect(open).toHaveCount(0)
    await expect(acknowledged).toContainText('Cua chết nhiều')
    await expect(acknowledged.getByText('Đã ghi nhận')).toBeVisible()
    await expect(acknowledged).toContainText(`Đã xử lý: ${acknowledgedAlert.responseNote}`)
    await expect(acknowledged.getByRole('button')).toHaveCount(0)

    await page.getByRole('tab', { name: 'Tất cả' }).click()
    await expect(page.getByRole('article')).toHaveCount(operatorAlerts.length)
    await expect(page.getByRole('button', { name: 'Ghi cách xử lý' })).toHaveCount(1)
    await page.getByRole('tab', { name: 'Đã xử lý' }).click()
    await expect(page.getByText('Không có cảnh báo nào ở mục này')).toBeVisible()
    expect(api.sent('GET', LIST)).toHaveLength(1)
  })

  test('lỗi tải thì báo lỗi của máy chủ, thử lại ra danh sách trống thật; trên điện thoại không tràn ngang', async ({ page, api }) => {
    let down = true
    api.get(LIST, () => (down ? reply(500, { status: 500, detail: 'Không tải được cảnh báo.' }) : []))
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/operator/alerts')
    await expect(page.getByRole('alert')).toContainText('Không tải được cảnh báo.')

    down = false
    await page.getByRole('button', { name: 'Thử lại' }).click()
    await expect(page.getByText('Không có cảnh báo đang mở')).toBeVisible()
    await page.getByRole('tab', { name: 'Tất cả' }).click()
    await expect(page.getByText('Không có cảnh báo nào ở mục này')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  // Phiên hết hạn (401) thì ứng dụng đăng xuất và về /dang-nhap mà không tải lại trang; app/providers.tsx xoá bộ nhớ đệm truy vấn khi phiên đổi,
  // nên người đăng nhập kế tiếp trong cùng tab không thấy cảnh báo của người trước.
  test('phiên hết hạn rồi người khác đăng nhập trong cùng tab thì không còn thấy cảnh báo của người trước', async ({ page, api }) => {
    const second: AuthResponse = { accessToken: 'token-ho-thu-hai', expiresAt: '2099-01-01T00:00:00Z', user: userOf('OperatorMember', { userId: 202, email: 'ho-thu-hai@test.local', operatorId: 8 }) }
    api.get(LIST, ({ auth }) => [{ ...lateAlert, message: auth === `Bearer ${second.accessToken}` ? 'Cảnh báo của hộ thứ hai' : 'Cảnh báo của hộ thứ nhất' }])
    // Token của người thứ nhất hết hạn đúng lúc gửi phản hồi: máy chủ trả 401, ứng dụng đăng xuất và về trang đăng nhập.
    api.post(ACK, () => reply(401, { status: 401, detail: 'Phiên đăng nhập đã hết hạn.' }))
    api.post('/api/auth/login', second)

    await page.goto('/operator/alerts')
    await expect(page.getByText('Cảnh báo của hộ thứ nhất')).toBeVisible()
    await page.getByRole('button', { name: 'Ghi cách xử lý' }).click()
    await page.getByLabel('Đã xử lý thế nào').fill('Đã thay nước')
    await page.getByRole('button', { name: 'Gửi', exact: true }).click()
    await expect(page).toHaveURL(/\/dang-nhap\?next=%2Foperator%2Falerts$/)

    await page.getByLabel('Email').fill(second.user.email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-thu')
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL(/\/operator\/alerts$/)
    await expect(page.getByText('Cảnh báo của hộ thứ hai')).toBeVisible()
    await expect(page.getByText('Cảnh báo của hộ thứ nhất')).toHaveCount(0)
  })
})

test.describe('Quản trị', () => {
  const LIST = '/api/admin/alerts'
  const RESOLVE = `${LIST}/${escalatedAlert.id}/resolve`
  const row = (page: Page, a: AlertResponse) => page.getByRole('row').filter({ hasText: a.message })
  const lastList = (api: Api) => api.sent('GET', LIST).filter((c) => c.query.PageSize === '20').at(-1)!.query

  test.beforeEach(async ({ page, api }) => {
    mockAdmin(api)
    await signIn(page, 'PlatformAdmin')
  })

  test('đóng một cảnh báo đã chuyển cấp kèm kết quả xử lý, rồi đọc lại được ở mục đã xử lý', async ({ page, api }) => {
    let rows: AlertResponse[] = [escalatedAlert]
    api.get(LIST, alertListReply(() => rows))
    api.post(RESOLVE, ({ body }) => {
      rows = [{ ...escalatedAlert, status: 'Resolved', resolutionNote: (body as ResolveAlertRequest).note }]
      return rows[0]
    })

    await page.goto('/admin/alerts')
    await expect(page.getByRole('heading', { name: 'Cảnh báo', level: 1 })).toBeVisible()
    // Có cảnh báo chuyển cấp thì mở sẵn mục đó; số đếm trên tab lấy từ ba lời gọi đếm riêng.
    await expect(page.getByRole('tab', { name: 'Chuyển cấp' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Chuyển cấp' })).toHaveText('Chuyển cấp1')
    const alert = row(page, escalatedAlert)
    await expect(alert.getByText('Cao', { exact: true })).toBeVisible()
    await expect(alert).toContainText(`Chất lượng nước · ${escalatedAlert.message}`)
    await expect(alert).toContainText('Người nuôi: Đã thay nước')
    await expect(alert).toContainText('P-2611-04')
    await expect(alert).toContainText('HTX Năm Căn')
    await expect(alert).toContainText(`Chuyển cấp ${await shownDateTime(page, escalatedAlert.escalatedAt!)}`)
    await expect(alert.getByText('Đã chuyển cấp')).toBeVisible()
    expect(lastList(api)).toEqual({ Status: 'Escalated', Page: '1', PageSize: '20' })
    expect(api.sent('GET', LIST).filter((c) => c.query.PageSize === '1').map((c) => c.query.Status).sort()).toEqual(['Acknowledged', 'Escalated', 'Open'])

    await alert.getByRole('button', { name: 'Đóng' }).click()
    const dialog = page.getByRole('dialog', { name: `Đóng cảnh báo #${escalatedAlert.id}` })
    await expect(dialog).toContainText('P-2611-04 · Chất lượng nước')
    await expect(dialog).toContainText(escalatedAlert.message)
    await expect(dialog).toContainText('Người nuôi: Đã thay nước')
    const confirm = dialog.getByRole('button', { name: 'Đóng cảnh báo' })
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel('Kết quả xử lý').fill(' Đã kiểm tra và xử lý ')
    await confirm.click()

    await expect(page.getByRole('status').filter({ hasText: 'Đã đóng cảnh báo.' })).toBeVisible()
    await expect(dialog).toHaveCount(0)
    const body: ResolveAlertRequest = { note: 'Đã kiểm tra và xử lý' }
    expect(api.sent('POST', RESOLVE).map((c) => c.body)).toEqual([body])
    expect(api.writes()).toEqual([`POST ${RESOLVE}`])
    await expect(page.getByText('Không có cảnh báo nào bị chuyển cấp')).toBeVisible()

    await page.getByRole('tab', { name: 'Đã xử lý' }).click()
    await expect(alert).toContainText('Người nuôi: Đã thay nước · Kết quả: Đã kiểm tra và xử lý')
    await expect(alert.getByText('Đã xử lý', { exact: true })).toBeVisible()
    await expect(alert.getByRole('button')).toHaveCount(0)
    expect(lastList(api)).toEqual({ Status: 'Resolved', Page: '1', PageSize: '20' })
  })

  test('không có cảnh báo chuyển cấp thì mở sẵn mục đang mở', async ({ page, api }) => {
    api.get(LIST, alertListReply(() => [openAlert, acknowledgedAlert]))
    await page.goto('/admin/alerts')
    await expect(page.getByRole('tab', { name: 'Đang mở' })).toHaveAttribute('aria-selected', 'true')
    const alert = row(page, openAlert)
    await expect(alert).toContainText(`Hạn ${await shownDateTime(page, openAlert.ackDeadline)}`)
    // Quản trị đóng được cả cảnh báo người nuôi chưa phản hồi.
    await expect(alert.getByRole('button', { name: 'Đóng' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Đã ghi nhận' })).toHaveText('Đã ghi nhận1')
    expect(lastList(api)).toEqual({ Status: 'Open', Page: '1', PageSize: '20' })
  })

  test('lọc mức độ và tìm gửi lên máy chủ; máy chủ không cho đóng (409) thì ghi chú còn nguyên', async ({ page, api }) => {
    api.post(RESOLVE, () => reply(409, { status: 409, detail: 'Cảnh báo đã được đóng.' }))
    await page.goto('/admin/alerts')
    await page.getByLabel('Lọc theo mức độ').selectOption({ label: 'Cao' })
    await page.getByLabel('Tìm cảnh báo').fill('P-2611-04')
    await page.getByRole('button', { name: 'Tìm' }).click()
    await expect.poll(() => lastList(api)).toEqual({ Status: 'Escalated', Severity: 'High', Q: 'P-2611-04', Page: '1', PageSize: '20' })

    await row(page, escalatedAlert).getByRole('button', { name: 'Đóng' }).click()
    const dialog = page.getByRole('dialog', { name: `Đóng cảnh báo #${escalatedAlert.id}` })
    await dialog.getByLabel('Kết quả xử lý').fill('Đã xử lý')
    await dialog.getByRole('button', { name: 'Đóng cảnh báo' }).click()
    await expect(dialog.getByText('Cảnh báo đã được đóng.')).toBeVisible()
    await expect(dialog.getByLabel('Kết quả xử lý')).toHaveValue('Đã xử lý')
    await expect(page.getByRole('status').filter({ hasText: 'Đã đóng cảnh báo.' })).toHaveCount(0)

    // Tìm không ra thì câu trống khác với câu "không có cảnh báo chuyển cấp".
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).last().click()
    await page.getByLabel('Tìm cảnh báo').fill('không có Lô này')
    await page.getByRole('button', { name: 'Tìm' }).click()
    await expect(page.getByText('Không có cảnh báo nào khớp')).toBeVisible()
  })
})

test('Kiểm định bằng chứng không mở được trang cảnh báo của Quản trị và trang không gọi API', async ({ page, api }) => {
  await signIn(page, 'EvidenceReviewer')
  await expectTurnedAway(page, '/admin/alerts')
  expect(api.calls).toEqual([])
})
