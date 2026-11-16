/* Thẩm định bằng chứng của vai trò Kiểm định bằng chứng: hàng đợi /admin/evidence và hồ sơ /admin/evidence/:id
   (ảnh riêng tư, kết quả mô hình, ba phán quyết kèm ghi chú). Vai trò khác không vào được và không gọi API thẩm định. */
import type { EvidenceVerdictRequest, ReviewEvidenceDetail } from '../src/shared/api/api.gen'
import { TOKEN, expect, reply, signIn, test, userOf, type Api, type Role } from './support/app'
import { acceptedEvidence, evidence, evidenceDetail, expectTurnedAway, fact, mockAdmin } from './support/admin'

const LIST = '/api/review/evidence'
const DETAIL = `${LIST}/${evidence.id}`
const reviewer = userOf('EvidenceReviewer')

/** Hồ sơ bằng chứng có trạng thái: GET trả bản hiện tại, phán quyết đổi nó như máy chủ. */
function serveEvidence(api: Api) {
  const state = { current: evidenceDetail }
  api.get(DETAIL, () => state.current)
  api.post(`${DETAIL}/verdict`, ({ body }) => {
    const { verdict, note } = body as EvidenceVerdictRequest
    const reviewStatus = verdict === 'Pass' ? 'Accepted' : verdict === 'Fail' ? 'Rejected' : 'Flagged'
    state.current = {
      ...evidenceDetail, canReview: false, evidence: { ...evidence, reviewStatus },
      reviews: [{ id: 1, reviewerId: reviewer.userId, reviewerName: reviewer.fullName, verdict, note, reviewedAt: new Date().toISOString() }],
    } satisfies ReviewEvidenceDetail
    return state.current
  })
  return state
}

test.describe('người thẩm định', () => {
  test.beforeEach(async ({ page, api }) => {
    mockAdmin(api)
    await signIn(page, 'EvidenceReviewer')
  })

  test('hàng đợi đọc từ API: mặc định là bằng chứng bị gắn cờ, chỉ có một mục menu', async ({ page, api }) => {
    await page.goto('/admin/evidence')
    await expect(page.getByRole('heading', { name: 'Thẩm định bằng chứng', level: 1 })).toBeVisible()
    const flagged = page.getByRole('row').filter({ hasText: `#${evidence.id}` })
    await expect(flagged).toContainText('Ảnh · hộp 0014')
    await expect(flagged).toContainText('P-2611-04')
    await expect(flagged).toContainText('HTX Năm Căn')
    await expect(flagged).toContainText('92 / 100')
    await expect(flagged.getByText('Gắn cờ')).toBeVisible()
    await expect(flagged.getByRole('link', { name: 'Thẩm định' })).toHaveAttribute('href', `/admin/evidence/${evidence.id}`)
    await expect(page.getByRole('tab', { name: 'Chờ thẩm định' })).toHaveText('Chờ thẩm định1')

    // Hai lời gọi: trang đầu của hàng đợi và số đếm trên tab; đều kèm token của người thẩm định.
    const calls = api.sent('GET', LIST)
    expect(calls.map((c) => c.query)).toEqual(expect.arrayContaining([{ Status: 'Flagged', Page: '1', PageSize: '20' }, { Status: 'Flagged', PageSize: '1' }]))
    expect(calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true)

    // Người thẩm định không thấy các mục của Quản trị.
    const menu = page.getByRole('navigation', { name: 'Menu Quản trị nền tảng' })
    await expect(menu.getByRole('link')).toHaveText(['Thẩm định bằng chứng'])

    // Bằng chứng đã có kết luận thì chỉ xem.
    await page.getByRole('tab', { name: 'Chấp nhận', exact: true }).click()
    const accepted = page.getByRole('row').filter({ hasText: `#${acceptedEvidence.id}` })
    await expect(accepted.getByRole('link', { name: 'Xem' })).toHaveAttribute('href', `/admin/evidence/${acceptedEvidence.id}`)
    await expect(accepted).toContainText('12 / 100')
    expect(api.writes()).toEqual([])
  })

  test('đổi mục, tìm và sang trang đều gửi lên máy chủ; đổi mục hay tìm thì về trang 1', async ({ page, api }) => {
    api.get(LIST, ({ query }) => ({ items: [evidence], page: Number(query.Page ?? 1), pageSize: Number(query.PageSize ?? 20), total: 45 }))
    const last = () => api.sent('GET', LIST).at(-1)!.query
    await page.goto('/admin/evidence')
    await expect(page.getByText('Trang 1 / 3')).toBeVisible()

    await page.getByRole('tab', { name: 'Không chấp nhận' }).click()
    await expect.poll(last).toEqual({ Status: 'Rejected', Page: '1', PageSize: '20' })

    await page.getByLabel('Tìm bằng chứng').fill('  0014 ')
    await page.getByRole('button', { name: 'Tìm' }).click()
    await expect.poll(last).toEqual({ Status: 'Rejected', Q: '0014', Page: '1', PageSize: '20' })

    await page.getByRole('button', { name: 'Trang sau' }).click()
    await expect(page.getByText('Trang 2 / 3')).toBeVisible()
    expect(last()).toEqual({ Status: 'Rejected', Q: '0014', Page: '2', PageSize: '20' })

    // "Tất cả" gửi Status rỗng; bỏ trống thì máy chủ chỉ trả bằng chứng bị gắn cờ.
    await page.getByRole('tab', { name: 'Tất cả' }).click()
    await expect.poll(last).toEqual({ Status: '', Q: '0014', Page: '1', PageSize: '20' })
  })

  test('hàng đợi lỗi thì báo lỗi của máy chủ, thử lại ra kết quả trống thật chứ không dựng dữ liệu mẫu', async ({ page, api }) => {
    let down = true
    api.get(LIST, () => (down ? reply(503, { status: 503, detail: 'Máy chủ đang bận.' }) : { items: [], page: 1, pageSize: 20, total: 0 }))
    await page.goto('/admin/evidence')
    await expect(page.getByRole('alert')).toContainText('Máy chủ đang bận.')
    await expect(page.getByRole('row')).toHaveCount(0)

    down = false
    await page.getByRole('button', { name: 'Thử lại' }).click()
    await expect(page.getByText('Không còn bằng chứng nào chờ thẩm định')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('hồ sơ: ảnh riêng tư tải bằng token, kết quả mô hình chưa xác định, ghi chú bắt buộc, lưu phán quyết đúng một lần', async ({ page, api }) => {
    serveEvidence(api)
    await page.goto(`/admin/evidence/${evidence.id}`)
    await expect(page.getByRole('heading', { name: `Bằng chứng #${evidence.id}`, level: 1 })).toBeVisible()
    await expect(page.getByText('P-2611-04 · HTX Năm Căn')).toBeVisible()
    await expect(page.getByRole('main').getByText('Gắn cờ', { exact: true })).toBeVisible()

    // Ảnh không có đường dẫn công khai: trang tải qua API kèm token rồi hiện bằng blob.
    const picture = page.getByRole('img', { name: `Ảnh bằng chứng số ${evidence.id}` })
    await expect(picture).toHaveAttribute('src', /^blob:/)
    await expect.poll(() => picture.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    expect(api.sent('GET', `${DETAIL}/image`).map((c) => c.auth)).toEqual([`Bearer ${TOKEN}`])

    await expect(page.getByText(evidenceDetail.explanation!, { exact: true })).toBeVisible()
    await expect(fact(page, 'Hộp')).toContainText('0014')
    await expect(fact(page, 'Điểm rủi ro')).toContainText('92 / 100')
    await expect(fact(page, 'Giải trình')).toContainText('Đã gửi')
    // Mô hình chưa kết luận thì nói rõ là không xác định, không tự coi là có cua.
    await page.getByText('Kết quả nhận diện của mô hình').click()
    await expect(page.getByRole('cell', { name: 'Không xác định' })).toBeVisible()

    await page.getByRole('button', { name: 'Chấp nhận', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Chấp nhận bằng chứng' })
    await expect(dialog).toContainText('Bằng chứng được tính là hợp lệ cho Lô.')
    const save = dialog.getByRole('button', { name: 'Lưu phán quyết' })
    await expect(save).toBeDisabled()
    await dialog.getByLabel('Ghi chú thẩm định').fill('   ')
    await expect(save).toBeDisabled()
    expect(api.writes()).toEqual([])
    await dialog.getByLabel('Ghi chú thẩm định').fill('  Đã đối chiếu ảnh và vị trí  ')
    await save.click()

    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: 'Đã lưu phán quyết.' })).toBeVisible()
    const body: EvidenceVerdictRequest = { verdict: 'Pass', note: 'Đã đối chiếu ảnh và vị trí' }
    expect(api.sent('POST', `${DETAIL}/verdict`).map((c) => c.body)).toEqual([body])
    expect(api.writes()).toEqual([`POST ${DETAIL}/verdict`])

    // Hồ sơ tải lại: đã có kết luận, hiện phán quyết kèm tên người thẩm định, hết nút phán quyết.
    await expect(page.getByRole('main').getByText('Chấp nhận', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Phán quyết đã có' })).toBeVisible()
    await expect(page.getByText(`Chấp nhận · ${reviewer.fullName}`)).toBeVisible()
    await expect(page.getByText('Đã đối chiếu ảnh và vị trí', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Chấp nhận', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Không chấp nhận' })).toHaveCount(0)

    // Trên điện thoại trang không tràn ngang.
    await page.setViewportSize({ width: 390, height: 844 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  const OTHER_VERDICTS = [
    { button: 'Không chấp nhận', title: 'Không chấp nhận bằng chứng', effect: 'Bằng chứng không được tính cho Lô.', verdict: 'Fail', after: 'Không chấp nhận' },
    { button: 'Yêu cầu bổ sung', title: 'Yêu cầu bổ sung', effect: 'Bằng chứng vẫn bị gắn cờ, chờ người nuôi giải trình thêm.', verdict: 'NeedMoreEvidence', after: 'Gắn cờ' },
  ]
  for (const v of OTHER_VERDICTS) {
    test(`phán quyết "${v.button}" gửi mã ${v.verdict}`, async ({ page, api }) => {
      serveEvidence(api)
      await page.goto(`/admin/evidence/${evidence.id}`)
      await page.getByRole('button', { name: v.button, exact: true }).click()
      const dialog = page.getByRole('dialog', { name: v.title })
      await expect(dialog).toContainText(v.effect)
      await dialog.getByLabel('Ghi chú thẩm định').fill('Ảnh mờ, không thấy rõ hộp')
      await dialog.getByRole('button', { name: 'Lưu phán quyết' }).click()

      await expect(dialog).toHaveCount(0)
      const body: EvidenceVerdictRequest = { verdict: v.verdict, note: 'Ảnh mờ, không thấy rõ hộp' }
      expect(api.sent('POST', `${DETAIL}/verdict`).map((c) => c.body)).toEqual([body])
      await expect(page.getByRole('main').getByText(v.after, { exact: true }).first()).toBeVisible()
      await expect(page.getByText(`${v.button} · ${reviewer.fullName}`)).toBeVisible()
      await expect(page.getByRole('button', { name: v.button, exact: true })).toHaveCount(0)
      // Yêu cầu bổ sung thì bằng chứng vẫn bị gắn cờ và trang nói rõ đang chờ ai.
      await expect(page.getByText('Đang chờ người nuôi giải trình thêm.')).toHaveCount(v.verdict === 'NeedMoreEvidence' ? 1 : 0)
    })
  }

  test('người khác đã xử lý trước (409): lỗi hiện trong hộp thoại, ghi chú còn nguyên, không báo thành công', async ({ page, api }) => {
    api.post(`${DETAIL}/verdict`, () => reply(409, { status: 409, code: 'evidence.review_changed', detail: 'Bằng chứng đã được xử lý. Vui lòng tải lại.' }))
    await page.goto(`/admin/evidence/${evidence.id}`)
    await page.getByRole('button', { name: 'Không chấp nhận' }).click()
    const dialog = page.getByRole('dialog', { name: 'Không chấp nhận bằng chứng' })
    await dialog.getByLabel('Ghi chú thẩm định').fill('Cần kiểm tra lại')
    await dialog.getByRole('button', { name: 'Lưu phán quyết' }).click()
    await expect(dialog.getByText('Bằng chứng đã được xử lý. Vui lòng tải lại.')).toBeVisible()
    await expect(dialog.getByLabel('Ghi chú thẩm định')).toHaveValue('Cần kiểm tra lại')
    await expect(page.getByRole('status')).toHaveCount(0)
    expect(api.writes()).toEqual([`POST ${DETAIL}/verdict`])
  })

  test('người thẩm định đã góp vốn vào Lô (403): báo lý do, không tải ảnh, không có nút phán quyết', async ({ page, api }) => {
    api.get(DETAIL, () => reply(403, { status: 403, code: 'evidence.reviewer_conflict', detail: 'Không được thẩm định Lô mà bạn đã góp vốn.' }))
    await page.goto(`/admin/evidence/${evidence.id}`)
    await expect(page.getByRole('alert')).toContainText('Không được thẩm định Lô mà bạn đã góp vốn.')
    await expect(page.getByRole('button', { name: 'Chấp nhận', exact: true })).toHaveCount(0)
    await expect(page.getByRole('img')).toHaveCount(0)
    expect(api.sent('GET', `${DETAIL}/image`)).toEqual([])
  })

  test('mã bằng chứng không hợp lệ thì báo ngay, không gọi API', async ({ page, api }) => {
    await page.goto('/admin/evidence/abc')
    await expect(page.getByText('Mã bằng chứng không hợp lệ')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Thẩm định bằng chứng' }).first()).toBeVisible()
    expect(api.calls).toEqual([])
  })
})

const OUTSIDERS: Role[] = ['PlatformAdmin', 'Investor', 'OperatorMember', 'Customer']
for (const role of OUTSIDERS) {
  test(`${role} không mở được hồ sơ bằng chứng và trang không gọi API thẩm định`, async ({ page, api }) => {
    await signIn(page, role)
    await expectTurnedAway(page, `/admin/evidence/${evidence.id}`)
    expect(api.calls).toEqual([])
  })
}
