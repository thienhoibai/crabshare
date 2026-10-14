import { test, expect, type Page } from '@playwright/test'

const item = { id: 57, batchCode: 'CS57-TEST', slotCode: '0014', mediaType: 'Photo', reviewStatus: 'Flagged', riskScore: 100, capturedAt: '2026-10-14T07:59:00Z', receivedAt: '2026-10-14T08:00:00Z', latitude: 10.1, longitude: 106.1,
  explanation: null as string | null, explainedAt: null as string | null, canExplain: true, latestReview: { verdict: 'NeedMoreEvidence', note: 'Giải thích ảnh chụp cùng hộp', reviewedAt: '2026-10-14T08:01:00Z' } }
const paged = (items: unknown[], total = items.length, page = 1) => ({ items, total, page, pageSize: 10 })
async function signIn(page: Page, role = 'OperatorMember') {
  await page.addInitScript(role => {
    if (!localStorage.getItem('crabshare-auth')) localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token: 'explain-test-token', expiresAt: '2099-01-01T00:00:00Z', user: {
      userId: 1, fullName: 'Hộ nuôi thử nghiệm', email: 'operator@test.local', roles: [role], status: 'Active', operatorId: role === 'OperatorMember' ? 1 : null,
    } }, version: 0 }))
  }, role)
  await page.route('**/api/operators/me', route => route.fulfill({ json: { legalName: 'Hộ nuôi thử nghiệm', memberRole: 'Owner', status: 'Approved' } }))
}
async function image(page: Page) {
  await page.route('**/api/operators/me/evidence/57/image', route => {
    expect(route.request().headers().authorization).toBe('Bearer explain-test-token')
    return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGN8AAAAASUVORK5CYII=', 'base64') })
  })
}
test('farm evidence list reads paged API and searches filters and opens detail', async ({ page }) => {
  await signIn(page); const urls: URL[] = []
  await page.route('**/api/operators/me/evidence?*', route => { const url = new URL(route.request().url()); urls.push(url); return route.fulfill({ json: paged([item], 12, Number(url.searchParams.get('page'))) }) })
  await page.goto('/operator/evidence')
  await expect(page.getByRole('link', { name: 'Xem và giải trình 57' })).toBeVisible()
  expect(urls[0].searchParams.get('status')).toBe('Flagged')
  await page.getByLabel('Tìm bằng chứng', { exact: true }).fill('0014')
  await expect.poll(() => urls.at(-1)?.searchParams.get('q')).toBe('0014')
  await page.getByLabel('Trạng thái', { exact: true }).selectOption('Rejected')
  await page.getByRole('button', { name: 'Sau', exact: true }).click()
  await expect.poll(() => urls.at(-1)?.searchParams.get('page')).toBe('2')
  expect(urls.at(-1)?.searchParams.get('status')).toBe('Rejected')
})
test('operator sends trimmed text once and reviewer sees it while evidence stays Flagged', async ({ page }) => {
  await signIn(page); await image(page)
  let current = { ...item }; let writes = 0; let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/operators/me/evidence/57', route => route.fulfill({ json: current }))
  await page.route('**/api/evidence/57/explanation', async route => {
    writes++; expect(route.request().headers().authorization).toBe('Bearer explain-test-token')
    expect(route.request().postDataJSON()).toEqual({ text: 'Ảnh chụp lại để kiểm tra hộp 0014' })
    await gate
    current = { ...item, explanation: 'Ảnh chụp lại để kiểm tra hộp 0014', explainedAt: '2026-10-14T09:00:00Z' }
    await route.fulfill({ json: current })
  })
  await page.goto('/operator/evidence/57')
  await expect(page.getByText(item.latestReview.note, { exact: true })).toBeVisible()
  const photo = page.getByRole('img', { name: 'Ảnh bằng chứng 57' })
  await expect(photo).toHaveAttribute('src', /^blob:/)
  await expect.poll(() => photo.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  const field = page.getByLabel('Nội dung giải trình', { exact: true })
  await field.fill('   ')
  await expect(page.getByRole('button', { name: 'Gửi giải trình', exact: true })).toBeDisabled()
  await field.fill('  Ảnh chụp lại để kiểm tra hộp 0014  ')
  await page.getByRole('button', { name: 'Gửi giải trình', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Đang gửi…', exact: true })).toBeDisabled()
  await page.locator('form').evaluate(form => (form as HTMLFormElement).requestSubmit())
  expect(writes).toBe(1); release()
  await expect(page.getByRole('status')).toContainText('Đã gửi giải trình')
  await expect(page.getByRole('button', { name: 'Gửi giải trình', exact: true })).toBeDisabled()
  await expect(page.getByText('Chờ thẩm định', { exact: true })).toBeVisible()
  if (process.env.CAPTURE_EXPLANATION_SCREENSHOTS) {
    await page.screenshot({ path: '../docs/validation/assets/cs57-operator-detail.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 }); await page.locator('form').scrollIntoViewIfNeeded()
    await page.screenshot({ path: '../docs/validation/assets/cs57-operator-small.png' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await page.route('**/api/review/evidence/57', route => route.fulfill({ json: { evidence: { id: 57, batchCode: item.batchCode, batchTitle: 'Test', farmName: 'Test', slotCode: item.slotCode, mediaType: 'Invoice', reviewStatus: 'Flagged', riskScore: 100, receivedAt: item.receivedAt }, source: 'InAppCapture', capturedAt: item.capturedAt, latitude: item.latitude, longitude: item.longitude, sha256: 'a'.repeat(64), perceptualHash: null, explanation: current.explanation, explainedAt: current.explainedAt, detections: [], reviews: [], canReview: true } }))
  await page.evaluate(() => { const auth = JSON.parse(localStorage.getItem('crabshare-auth')!); auth.state.user = { ...auth.state.user, userId: 2, roles: ['EvidenceReviewer'], operatorId: null }; localStorage.setItem('crabshare-auth', JSON.stringify(auth)) })
  await page.goto('/admin/evidence/57')
  await expect(page.getByText(current.explanation!, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chấp nhận', exact: true })).toBeVisible()
})
test('stale final verdict keeps the draft and disables further submissions after 409', async ({ page }) => {
  await signIn(page); await image(page); let closed = false
  await page.route('**/api/operators/me/evidence/57', route => route.fulfill({ json: { ...item, canExplain: !closed, reviewStatus: closed ? 'Accepted' : 'Flagged' } }))
  await page.route('**/api/evidence/57/explanation', route => { closed = true; return route.fulfill({ status: 409, json: { detail: 'Bằng chứng không còn chờ thẩm định.' } }) })
  await page.goto('/operator/evidence/57')
  await page.getByLabel('Nội dung giải trình', { exact: true }).fill('Nội dung cần giữ')
  await page.getByRole('button', { name: 'Gửi giải trình', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('không còn chờ thẩm định')
  await expect(page.getByLabel('Nội dung giải trình', { exact: true })).toHaveValue('Nội dung cần giữ')
  await expect(page.getByRole('button', { name: 'Gửi giải trình', exact: true })).toBeDisabled()
})
test('failed validation retains draft and allows retry', async ({ page }) => {
  await signIn(page); await image(page)
  await page.route('**/api/operators/me/evidence/57', route => route.fulfill({ json: item }))
  await page.route('**/api/evidence/57/explanation', route => route.fulfill({ status: 400, json: { detail: 'Giải trình không hợp lệ.' } }))
  await page.goto('/operator/evidence/57')
  await page.getByLabel('Nội dung giải trình', { exact: true }).fill('Nội dung cần giữ')
  await page.getByRole('button', { name: 'Gửi giải trình', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('không hợp lệ')
  await expect(page.getByLabel('Nội dung giải trình', { exact: true })).toHaveValue('Nội dung cần giữ')
  await expect(page.getByRole('button', { name: 'Gửi giải trình', exact: true })).toBeEnabled()
})
test('foreign evidence is unavailable without private image requests', async ({ page }) => {
  await signIn(page); let reads = 0
  await page.route('**/api/operators/me/evidence/57', route => route.fulfill({ status: 404, json: { detail: 'Không tìm thấy bằng chứng của hộ nuôi.' } }))
  await page.route('**/api/operators/me/evidence/57/image', route => { reads++; return route.fulfill({ status: 404 }) })
  await page.goto('/operator/evidence/57')
  await expect(page.getByRole('alert')).toContainText('Không tìm thấy bằng chứng')
  expect(reads).toBe(0)
})
test('empty queue and retry errors use real server results', async ({ page }) => {
  await signIn(page); let failed = true
  await page.route('**/api/operators/me/evidence?*', route => failed ? route.fulfill({ status: 503, json: { detail: 'Không tải được bằng chứng.' } }) : route.fulfill({ json: paged([]) }))
  await page.goto('/operator/evidence')
  await expect(page.getByRole('alert')).toContainText('Không tải được bằng chứng')
  failed = false; await page.getByRole('button', { name: 'Thử lại', exact: true }).click()
  await expect(page.getByText('Không có bằng chứng phù hợp', { exact: true })).toBeVisible()
})
for (const role of ['Investor', 'Customer', 'PlatformAdmin', 'EvidenceReviewer']) {
  test(`${role} cannot request farm evidence`, async ({ page }) => {
    await signIn(page, role); let reads = 0
    await page.route('**/api/operators/me/evidence**', route => { reads++; return route.fulfill({ json: item }) })
    await page.goto('/operator/evidence/57')
    await expect(page).toHaveURL('/'); expect(reads).toBe(0)
  })
}
