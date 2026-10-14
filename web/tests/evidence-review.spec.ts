import { test, expect, type Page } from '@playwright/test'

const evidence = { id: 54, batchCode: 'CS54-DEMO', batchTitle: 'Lô thử nghiệm', farmName: 'Hộ nuôi thử nghiệm', slotCode: '0014', mediaType: 'Photo', reviewStatus: 'Flagged', riskScore: 100, receivedAt: '2026-10-14T08:00:00Z' }
const detail = { evidence, source: 'InAppCapture', capturedAt: '2026-10-14T07:59:00Z', latitude: 10.1, longitude: 106.1, sha256: 'a'.repeat(64), perceptualHash: 'b'.repeat(16), explanation: 'Ảnh bổ sung cho hộp 0014', explainedAt: '2026-10-14T08:30:00Z', canReview: true,
  detections: [{ modelVersion: 'none', crabDetected: null, confidence: null, bboxJson: null, detectedAt: '2026-10-14T08:00:00Z' }], reviews: [] as unknown[] }
const paged = (items: unknown[], page = 1, total = items.length) => ({ items, total, page, pageSize: 10 })
async function signIn(page: Page, role = 'EvidenceReviewer') {
  await page.addInitScript(role => localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token: 'review-test-token', expiresAt: '2099-01-01T00:00:00Z', user: {
    userId: 54, fullName: 'Kiểm định viên', email: 'reviewer@test.local', roles: [role], status: 'Active', phone: null, operatorId: null,
  } }, version: 0 })), role)
}
async function image(page: Page) {
  await page.route('**/api/review/evidence/54/image', route => {
    expect(route.request().headers().authorization).toBe('Bearer review-test-token')
    return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGN8AAAAASUVORK5CYII=', 'base64') })
  })
}

test('reviewer queue reads API, filters, searches, paginates and hides admin-only menus', async ({ page }) => {
  await signIn(page)
  const requests: URL[] = []
  await page.route('**/api/review/evidence?*', route => {
    const url = new URL(route.request().url()); requests.push(url)
    expect(route.request().headers().authorization).toBe('Bearer review-test-token')
    return route.fulfill({ json: paged([evidence], Number(url.searchParams.get('page')), 12) })
  })
  await page.goto('/admin/evidence')
  await expect(page.getByRole('link', { name: 'Xem bằng chứng 54' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Quản lý Người dùng' })).toHaveCount(0)
  expect(requests[0].searchParams.get('status')).toBe('Flagged')
  await page.getByLabel('Trạng thái bằng chứng').selectOption('Rejected')
  await page.getByLabel('Tìm bằng chứng').fill('0014')
  await expect.poll(() => requests.at(-1)?.searchParams.get('q')).toBe('0014')
  await page.getByRole('button', { name: 'Sau', exact: true }).click()
  await expect.poll(() => requests.at(-1)?.searchParams.get('page')).toBe('2')
  expect(requests.at(-1)?.searchParams.get('status')).toBe('Rejected')
})

test('detail displays private image and unknown detector, validates note and persists a verdict once', async ({ page }) => {
  await signIn(page); await image(page)
  let state = { ...detail }; let writes = 0
  await page.route('**/api/review/evidence/54', route => route.fulfill({ json: state }))
  await page.route('**/api/review/evidence/54/verdict', async route => {
    writes++; expect(route.request().postDataJSON()).toEqual({ verdict: 'Pass', note: 'Đã đối chiếu ảnh và GPS' })
    state = { ...detail, evidence: { ...evidence, reviewStatus: 'Accepted' }, canReview: false, reviews: [{ id: 1, reviewerId: 54, reviewerName: 'Kiểm định viên', verdict: 'Pass', note: 'Đã đối chiếu ảnh và GPS', reviewedAt: '2026-10-14T09:00:00Z' }] }
    await route.fulfill({ json: state })
  })
  await page.goto('/admin/evidence/54')
  const picture = page.getByRole('img', { name: 'Ảnh bằng chứng 54' })
  await expect(picture).toHaveAttribute('src', /^blob:/)
  await expect.poll(() => picture.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(page.getByText('Chưa có kết luận nhận diện cua', { exact: true })).toBeVisible()
  await expect(page.getByText(detail.explanation, { exact: true })).toBeVisible()
  if (process.env.CAPTURE_REVIEW_SCREENSHOTS) await page.screenshot({ path: '../docs/validation/assets/cs54-review-detail.png', fullPage: true })
  await page.getByRole('button', { name: 'Chấp nhận', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Ghi chú thẩm định').fill('   ')
  await expect(dialog.getByRole('button', { name: 'Lưu phán quyết' })).toBeDisabled()
  expect(writes).toBe(0)
  await dialog.getByLabel('Ghi chú thẩm định').fill('  Đã đối chiếu ảnh và GPS  ')
  await dialog.getByRole('button', { name: 'Lưu phán quyết' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Đã chấp nhận', { exact: true })).toBeVisible()
  await expect(page.getByText('Đã đối chiếu ảnh và GPS', { exact: true })).toBeVisible()
  expect(writes).toBe(1)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  if (process.env.CAPTURE_REVIEW_SCREENSHOTS) {
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: '../docs/validation/assets/cs54-review-small.png', fullPage: true })
  }
})

test('stale verdict keeps the note and refreshes eligibility after 409', async ({ page }) => {
  await signIn(page); await image(page)
  let eligible = true
  await page.route('**/api/review/evidence/54', route => route.fulfill({ json: { ...detail, canReview: eligible } }))
  await page.route('**/api/review/evidence/54/verdict', route => {
    eligible = false
    return route.fulfill({ status: 409, json: { code: 'evidence.review_changed', detail: 'Bằng chứng đã được xử lý. Vui lòng tải lại.' } })
  })
  await page.goto('/admin/evidence/54')
  await page.getByRole('button', { name: 'Từ chối', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Ghi chú thẩm định').fill('Cần kiểm tra lại')
  await dialog.getByRole('button', { name: 'Lưu phán quyết' }).click()
  await expect(dialog.getByRole('alert')).toContainText('đã được xử lý')
  await expect(dialog.getByLabel('Ghi chú thẩm định')).toHaveValue('Cần kiểm tra lại')
  await dialog.getByRole('button', { name: 'Hủy', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Từ chối', exact: true })).toHaveCount(0)
})

test('investor conflict shows 403 without loading a private image or verdict actions', async ({ page }) => {
  await signIn(page)
  let images = 0
  await page.route('**/api/review/evidence/54/image', route => { images++; return route.fulfill({ status: 403 }) })
  await page.route('**/api/review/evidence/54', route => route.fulfill({ status: 403, json: { code: 'evidence.reviewer_conflict', detail: 'Không được thẩm định lô mà bạn đã góp vốn.' } }))
  await page.goto('/admin/evidence/54')
  await expect(page.getByRole('alert')).toContainText('đã góp vốn')
  await expect(page.getByRole('button', { name: 'Chấp nhận', exact: true })).toHaveCount(0)
  expect(images).toBe(0)
})

test('queue failure retries real API and displays an empty result without sample data', async ({ page }) => {
  await signIn(page); let attempts = 0
  await page.route('**/api/review/evidence?*', route => ++attempts === 1 ? route.fulfill({ status: 503, json: { detail: 'Máy chủ đang bận.' } }) : route.fulfill({ json: paged([]) }))
  await page.goto('/admin/evidence')
  await expect(page.getByRole('alert')).toContainText('Máy chủ đang bận')
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click()
  await expect(page.getByText('Không có bằng chứng phù hợp.', { exact: true })).toBeVisible()
  expect(attempts).toBe(2)
})

for (const role of ['PlatformAdmin', 'Investor', 'OperatorMember', 'Customer']) {
  test(`${role} cannot request reviewer data without EvidenceReviewer role`, async ({ page }) => {
    await signIn(page, role); let reads = 0
    await page.route('**/api/review/**', route => { reads++; return route.fulfill({ json: detail }) })
    await page.goto('/admin/evidence/54')
    await expect(page).toHaveURL('/')
    expect(reads).toBe(0)
  })
}
