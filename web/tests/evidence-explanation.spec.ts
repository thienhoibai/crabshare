/* Ảnh bằng chứng cần giải trình của hộ nuôi: danh sách (/operator/evidence), chụp hộp theo yêu cầu và trang một ảnh với ô giải trình
   (/operator/evidence/:id). Phần thẩm định của Người thẩm định nằm ở evidence-review.spec.ts. */
import type { EvidenceExplanationRequest, EvidenceResponse, OperatorEvidenceItem } from '../src/shared/api/api.gen'
import { TOKEN, daysFromNow, expect, paged, photo, reply, signIn, test, type Page, type Role } from './support/app'
import { CODE, EVIDENCE_ID, captureRequests, evidenceItems, evidenceOf, evidencePage, mockOperator, more, noDevReload, panel } from './support/operator'

const LIST_URL = '/operator/evidence'
const LIST = '/api/operators/me/evidence'
const DETAIL_URL = `/operator/evidence/${EVIDENCE_ID}`
const DETAIL = `${LIST}/${EVIDENCE_ID}`
const EXPLAIN = `/api/evidence/${EVIDENCE_ID}/explanation`

/** Các dòng ảnh trong danh sách (menu bên trái cũng có liên kết "Hộp nuôi"). */
const rows = (page: Page) => page.getByRole('main').getByRole('link').filter({ hasText: /^Hộp \d/ })

test.beforeEach(async ({ api, page }) => {
  mockOperator(api)
  await noDevReload(page)
})

test.describe('danh sách bằng chứng', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'OperatorMember')
  })

  test('mặc định là ảnh bị gắn cờ; đổi mục, tìm và chuyển trang đều gửi lên máy chủ', async ({ page, api }) => {
    await page.goto(LIST_URL)
    await expect(page.getByRole('heading', { name: 'Bằng chứng cần giải trình', level: 1 })).toBeVisible()
    const row = (slot: string) => rows(page).filter({ hasText: `Hộp ${slot}` })
    await expect(row('0101')).toContainText(`Lô ${CODE}`)
    await expect(row('0101')).toContainText('Gắn cờ')
    await expect(row('0101')).toContainText('Thẩm định: Cần bổ sung')
    await expect(row('0101')).toContainText('Chờ giải trình')
    await expect(row('0102')).toContainText('Đã giải trình')
    await expect(row('0104')).toHaveCount(0)
    expect(api.sent('GET', LIST).map((c) => c.query)).toEqual([{ status: 'Flagged', page: '1', pageSize: '20' }])

    await page.getByRole('tab', { name: 'Chấp nhận', exact: true }).click()
    await expect(row('0104')).toContainText('Thẩm định: Đạt')
    await expect(row('0101')).toHaveCount(0)
    await page.getByRole('tab', { name: 'Theo dõi' }).click()
    await expect(page.getByText('Không có ảnh ở mục này')).toBeVisible()

    // "Tất cả" phải gửi status rỗng, nếu bỏ hẳn tham số thì máy chủ lại lọc ảnh bị gắn cờ.
    await page.getByRole('tab', { name: 'Tất cả' }).click()
    await expect(rows(page)).toHaveCount(3)
    expect(api.sent('GET', LIST).at(-1)!.query).toEqual({ status: '', page: '1', pageSize: '20' })

    await page.getByLabel('Tìm ảnh bằng chứng').fill(' 0102 ')
    await expect(row('0102')).toBeVisible()
    await expect(row('0101')).toHaveCount(0)
    expect(api.sent('GET', LIST).at(-1)!.query).toEqual({ status: '', q: '0102', page: '1', pageSize: '20' })

    await row('0102').click()
    await expect(page).toHaveURL(/\/operator\/evidence\/58$/)
  })

  test('danh sách dài thì chuyển trang ở máy chủ và giữ mục đang chọn', async ({ page, api }) => {
    const many = Array.from({ length: 21 }, (_, i) => evidenceOf({ id: 200 + i, slotCode: String(201 + i).padStart(4, '0'), reviewStatus: 'Rejected', canExplain: false }))
    api.get(LIST, evidencePage(many))
    await page.goto(LIST_URL)
    await expect(page.getByText('Không có ảnh nào cần giải trình')).toBeVisible()
    await page.getByRole('tab', { name: 'Không chấp nhận' }).click()
    await expect(page.getByText('1–20 trong 21 ảnh')).toBeVisible()
    await page.getByRole('button', { name: 'Trang sau' }).click()
    await expect(rows(page).filter({ hasText: 'Hộp 0221' })).toBeVisible()
    expect(api.sent('GET', LIST).at(-1)!.query).toEqual({ status: 'Rejected', page: '2', pageSize: '20' })
  })

  test('không tải được thì báo lỗi của máy chủ; thử lại, không có ảnh thì không dựng dữ liệu mẫu', async ({ page, api }) => {
    let failing = true
    api.get(LIST, () => (failing ? reply(503, { status: 503, detail: 'Không tải được bằng chứng.' }) : paged([], 20)))
    await page.goto(LIST_URL)
    const error = page.getByRole('alert').filter({ hasText: 'Không tải được dữ liệu' })
    await expect(error).toContainText('Không tải được bằng chứng.')
    failing = false
    await error.getByRole('button', { name: 'Thử lại' }).click()
    await expect(page.getByText('Không có ảnh nào cần giải trình')).toBeVisible()
    await expect(rows(page)).toHaveCount(0)
  })

  test('chụp hộp theo yêu cầu: ảnh gửi kèm mã yêu cầu, giờ chụp và vị trí', async ({ page, api, context }) => {
    const sent: EvidenceResponse = {
      id: 77, batchCode: CODE, slotCode: '0102', capturedAt: daysFromNow(0), receivedAt: daysFromNow(0), latitude: 8.7601, longitude: 104.9903, sha256: 'a'.repeat(64),
      perceptualHash: 'f'.repeat(16), riskScore: 0, reviewStatus: 'Accepted', duplicateMatch: 'None', detection: { crabDetected: true, confidence: 0.97, modelVersion: 'box-0.2' },
      captureRequestId: captureRequests[0].id, captureRequestStatus: 'Fulfilled',
    }
    let open = captureRequests
    api.get('/api/operators/me/capture-requests', (call) => paged(call.query.status === 'Open' ? open : [], 50))
    api.post('/api/evidence', () => {
      open = []
      return reply(201, sent)
    })
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 8.7601, longitude: 104.9903 })
    await page.goto(LIST_URL)

    const requests = panel(page, 'Hộp cần chụp')
    await expect(requests.getByRole('row').filter({ hasText: '0102' })).toContainText(`Lô ${CODE}`)
    await requests.getByRole('button', { name: 'Chụp', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Chụp hộp 0102' })
    await expect(dialog.getByRole('button', { name: 'Gửi ảnh' })).toBeDisabled()
    await dialog.getByLabel('Chụp ảnh hộp').setInputFiles(photo('hop-0102.png'))
    await dialog.getByRole('button', { name: 'Gửi ảnh' }).click()

    const done = page.getByRole('dialog', { name: 'Đã gửi ảnh' })
    await expect(done.getByText('Chấp nhận')).toBeVisible()
    const calls = api.sent('POST', '/api/evidence')
    expect(calls).toHaveLength(1)
    expect(calls[0].multipart).toBe(true)
    expect(calls[0].body).toEqual({
      BatchCode: CODE, SlotCode: '0102', CapturedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), Latitude: '8.760100', Longitude: '104.990300',
      CaptureRequestId: String(captureRequests[0].id), Image: 'file:hop-0102.png',
    })
    await done.getByRole('button', { name: 'Xong' }).click()
    // Yêu cầu đã xong thì khối "Hộp cần chụp" không còn.
    await expect(page.getByRole('heading', { name: /^Hộp cần chụp/ })).toHaveCount(0)
  })
})

test.describe('một ảnh bằng chứng', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'OperatorMember')
  })

  test('giải trình được cắt khoảng trắng, gửi một lần; ảnh vẫn bị gắn cờ cho tới khi có kết luận', async ({ page, api }) => {
    let current: OperatorEvidenceItem = evidenceItems[0]
    let finish!: () => void
    const gate = new Promise<void>((resolve) => { finish = resolve })
    api.get(DETAIL, () => current)
    api.post(EXPLAIN, async (call) => {
      await gate
      current = { ...current, explanation: (call.body as EvidenceExplanationRequest).text, explainedAt: daysFromNow(0) }
      return current
    })
    await page.goto(DETAIL_URL)
    await expect(page.getByRole('heading', { name: `Hộp 0101 · Lô ${CODE}`, level: 1 })).toBeVisible()
    await expect(page.locator('.op-heading').getByText('Gắn cờ')).toBeVisible()
    await expect(page.getByText('Người thẩm định: Cần bổ sung')).toBeVisible()
    await expect(page.getByText('Ảnh trùng với ảnh hộp 0102, cần giải thích.')).toBeVisible()

    // Ảnh lấy qua API cần đăng nhập rồi hiện bằng blob.
    const image = page.getByRole('img', { name: `Ảnh hộp 0101 của Lô ${CODE}` })
    await expect(image).toHaveAttribute('src', /^blob:/)
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    expect(api.sent('GET', `${DETAIL}/image`).map((c) => c.auth)).toEqual([`Bearer ${TOKEN}`])
    await more(page, 'Thông tin ảnh').click()
    await expect(page.getByText('8.7601, 104.9903')).toBeVisible()

    const field = page.getByLabel('Giải trình của người nuôi')
    const send = page.getByRole('button', { name: 'Gửi giải trình' })
    await field.fill('   ')
    await expect(send).toBeDisabled()
    await field.fill('  Ảnh chụp lại để kiểm tra hộp 0101  ')
    await send.click()
    // Đang gửi thì nút khoá lại nên không bấm được lần hai.
    await expect(page.getByRole('button', { name: 'Đang gửi…' })).toBeDisabled()
    finish()

    await expect(page.getByRole('status').filter({ hasText: 'Đã gửi giải trình.' })).toBeVisible()
    const body: EvidenceExplanationRequest = { text: 'Ảnh chụp lại để kiểm tra hộp 0101' }
    expect(api.sent('POST', EXPLAIN).map((c) => ({ body: c.body, auth: c.auth }))).toEqual([{ body, auth: `Bearer ${TOKEN}` }])
    await expect(page.getByText(/^Đã gửi lúc /)).toBeVisible()
    await expect(page.locator('.op-heading').getByText('Gắn cờ')).toBeVisible()
    // Chưa sửa gì thì không gửi lại được.
    await expect(page.getByRole('button', { name: 'Gửi lại' })).toBeDisabled()
    await expect(field).toHaveValue('Ảnh chụp lại để kiểm tra hộp 0101')
    await field.fill('Ảnh chụp lại để kiểm tra hộp 0101, kèm ảnh mới')
    await expect(page.getByRole('button', { name: 'Gửi lại' })).toBeEnabled()
  })

  test('máy chủ từ chối giải trình: lỗi hiện cạnh ô nhập, bản nháp còn nguyên và gửi lại được', async ({ page, api }) => {
    let refuse = true
    api.post(EXPLAIN, () => (refuse ? reply(400, { status: 400, detail: 'Giải trình không hợp lệ.' }) : evidenceOf({ explanation: 'Nội dung cần giữ', explainedAt: daysFromNow(0) })))
    await page.goto(DETAIL_URL)
    const field = page.getByLabel('Giải trình của người nuôi')
    await field.fill('Nội dung cần giữ')
    await page.getByRole('button', { name: 'Gửi giải trình' }).click()
    await expect(page.getByText('Giải trình không hợp lệ.')).toBeVisible()
    await expect(field).toHaveValue('Nội dung cần giữ')
    await expect(page.getByRole('button', { name: 'Gửi giải trình' })).toBeEnabled()

    refuse = false
    await page.getByRole('button', { name: 'Gửi giải trình' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Đã gửi giải trình.' })).toBeVisible()
    expect(api.sent('POST', EXPLAIN)).toHaveLength(2)
  })

  test('ảnh đã có kết luận cuối: máy chủ báo 409, bản nháp còn nguyên', async ({ page, api }) => {
    api.post(EXPLAIN, () => reply(409, { status: 409, detail: 'Bằng chứng không còn chờ thẩm định.' }))
    await page.goto(DETAIL_URL)
    await page.getByLabel('Giải trình của người nuôi').fill('Nội dung cần giữ')
    await page.getByRole('button', { name: 'Gửi giải trình' }).click()
    await expect(page.getByText('Bằng chứng không còn chờ thẩm định.')).toBeVisible()
    await expect(page.getByLabel('Giải trình của người nuôi')).toHaveValue('Nội dung cần giữ')
  })

  test('ảnh không cần giải trình thì không có ô nhập', async ({ page, api }) => {
    api.get(DETAIL, evidenceOf({ reviewStatus: 'Accepted', canExplain: false, latestReview: { verdict: 'Pass', note: 'Ảnh rõ, đúng hộp.', reviewedAt: daysFromNow(-1) } }))
    await page.goto(DETAIL_URL)
    await expect(page.locator('.op-heading').getByText('Chấp nhận')).toBeVisible()
    await expect(page.getByText('Người thẩm định: Đạt')).toBeVisible()
    await expect(page.getByText('Ảnh này không cần giải trình.')).toBeVisible()
    await expect(page.getByLabel('Giải trình của người nuôi')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Gửi/ })).toHaveCount(0)
  })

  test('ảnh của hộ nuôi khác: báo không tìm thấy và không hỏi tệp ảnh', async ({ page, api }) => {
    api.get(DETAIL, () => reply(404, { status: 404, detail: 'Không tìm thấy bằng chứng của hộ nuôi.' }))
    await page.goto(DETAIL_URL)
    await expect(page.getByRole('alert').filter({ hasText: 'Không tải được dữ liệu' })).toContainText('Không tìm thấy bằng chứng của hộ nuôi.')
    expect(api.sent('GET', `${DETAIL}/image`)).toEqual([])
  })

  test('đường dẫn không phải số thì báo ngay, không gọi API bằng chứng', async ({ page, api }) => {
    await page.goto('/operator/evidence/abc')
    await expect(page.getByText('Đường dẫn không đúng.')).toBeVisible()
    expect(api.sent('GET', /\/evidence\//)).toEqual([])
  })
})

for (const role of ['Investor', 'Customer', 'PlatformAdmin', 'EvidenceReviewer'] satisfies Role[]) {
  test(`${role} không mở được bằng chứng của hộ nuôi và trang không gọi API`, async ({ page, api }) => {
    await signIn(page, role)
    await page.goto(DETAIL_URL)
    await expect(page).not.toHaveURL(/\/operator\//)
    expect(api.calls).toEqual([])
  })
}
