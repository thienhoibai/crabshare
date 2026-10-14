import { test, expect, type Page } from '@playwright/test'

const profile = { operatorId: 1, legalName: 'HTX VI04', taxCode: '1234567890', businessRegNo: 'VI04', farmAddress: 'Cà Mau', status: 'Approved', memberRole: 'Owner', canEdit: false, canSubmit: false, submittedAt: null }
const batch = { batchCode: 'B-TEST', operatorId: 1, title: 'Lô thử', crabType: 'SoftShellCrab', seedQuantity: 1500, expectedOutputKg: 300, cycleDays: 45, restockCutoffDays: 10, minViableCapital: 60000000, targetCapital: 75000000, maxCapital: 90000000, minContribution: 1000000, operatorSharePct: 7, status: 'Draft', standardCost: null, canEdit: true, canSubmit: true }
async function setup(page: Page) {
  await page.addInitScript(() => localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token: 'test-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 1, email: 'vi04@test.local', fullName: 'VI04', phone: null, status: 'Active', roles: ['OperatorMember'], operatorId: 1 } }, version: 0 })))
  await page.route('**/api/operators/me', route => route.fulfill({ json: profile }))
  await page.route('**/api/operators/me/batches*', route => route.fulfill({ json: { items: [{ ...batch, status: 'PendingApproval', canEdit: false, canSubmit: false }], page: 1, pageSize: 20, total: 1 } }))
}

test('cost save failure keeps form and code; retry updates same batch before submit', async ({ page }) => {
  await setup(page)
  let creates = 0; let costs = 0
  const sequence: string[] = []
  await page.route('**/api/batches', async route => { creates++; sequence.push('create'); await route.fulfill({ status: 201, json: batch }) })
  await page.route('**/api/batches/B-TEST', async route => { sequence.push('update'); await route.fulfill({ json: batch }) })
  await page.route('**/api/batches/B-TEST/standard-cost', async route => {
    costs++; sequence.push('cost')
    expect(route.request().postDataJSON().items.some((i: { category: string }) => i.category === 'MortalityReserve')).toBeTruthy()
    if (costs === 1) await route.fulfill({ status: 422, json: { detail: 'Lỗi lưu chi phí thử nghiệm', code: 'batch.test' } })
    else await route.fulfill({ json: batch })
  })
  await page.route('**/api/batches/B-TEST/submit', async route => { sequence.push('submit'); await route.fulfill({ json: { ...batch, status: 'PendingApproval', canEdit: false, canSubmit: false } }) })
  await page.goto('/operator/create-batch')
  await page.getByLabel('Tên lô (tiêu đề gọi vốn)').fill('Lô giữ khi lỗi')
  await page.getByRole('button', { name: 'Gửi duyệt', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Lỗi lưu chi phí thử nghiệm')
  await expect(page.getByLabel('Tên lô (tiêu đề gọi vốn)')).toHaveValue('Lô giữ khi lỗi')
  await expect(page).toHaveURL(/code=B-TEST/)
  expect(sequence).toEqual(['create', 'cost'])
  await page.getByRole('button', { name: 'Gửi duyệt', exact: true }).click()
  await expect(page).toHaveURL(/\/operator\/batch$/)
  await expect(page.getByText('Chờ duyệt', { exact: true }).last()).toBeVisible()
  expect(creates).toBe(1)
  expect(sequence).toEqual(['create', 'cost', 'update', 'cost', 'submit'])
})

test('capital field validation prevents API calls and mortality reserve is required', async ({ page }) => {
  await setup(page)
  let requests = 0
  await page.route('**/api/batches', async route => { requests++; await route.fulfill({ json: batch }) })
  await page.goto('/operator/create-batch')
  await page.getByLabel('Vốn tối thiểu khả thi (đồng)').fill('80000000')
  await page.getByRole('button', { name: 'Lưu nháp', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('tối thiểu khả thi ≤ mục tiêu ≤ tối đa')
  expect(requests).toBe(0)
})

test('list shows API errors, retry, empty state and server status filter', async ({ page }) => {
  await setup(page)
  let failed = true
  await page.route('**/api/operators/me/batches*', route => failed
    ? route.fulfill({ status: 403, json: { detail: 'Bạn không còn quyền truy cập.' } })
    : route.fulfill({ json: { items: [], page: 1, pageSize: 20, total: 0 } }))
  await page.goto('/operator/batch')
  await expect(page.getByRole('alert')).toContainText('Bạn không còn quyền truy cập.')
  failed = false
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click()
  await expect(page.getByText('Không có lô nào ở trạng thái này.')).toBeVisible()
  const request = page.waitForRequest(r => r.url().includes('/api/operators/me/batches') && r.url().includes('status=Draft'))
  await page.getByRole('button', { name: 'Nháp', exact: true }).click()
  await request
})

test('back after submission shows current status and disables editing cached draft', async ({ page }) => {
  await setup(page)
  let current = { ...batch }
  await page.route('**/api/batches/B-TEST', route => route.fulfill({ json: current }))
  await page.route('**/api/batches/B-TEST/standard-cost', route => route.fulfill({ json: current }))
  await page.route('**/api/batches/B-TEST/submit', async route => {
    current = { ...batch, status: 'PendingApproval', canEdit: false, canSubmit: false }
    await route.fulfill({ json: current })
  })
  await page.goto('/operator/create-batch?code=B-TEST')
  await page.getByRole('button', { name: 'Gửi duyệt', exact: true }).click()
  await expect(page).toHaveURL(/\/operator\/batch$/)
  await page.goBack()
  await expect(page.getByText('Trạng thái: Chờ duyệt')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lưu nháp', exact: true })).toBeDisabled()
})

test('real API creates, saves, reloads and submits from the browser', async ({ page, request }, testInfo) => {
  test.skip(!process.env.VI04_API_URL, 'Set VI04_API_URL to an isolated API with demo seed enabled.')
  const apiUrl = process.env.VI04_API_URL!
  const login = await request.post(`${apiUrl}/api/auth/login`, { data: { email: 'operator@crabshare.local', password: 'CrabShare@2026' } })
  expect(login.ok()).toBeTruthy()
  const auth = await login.json()
  await page.addInitScript(session => localStorage.setItem('crabshare-auth', JSON.stringify({ state: {
    token: session.accessToken, expiresAt: session.expiresAt, user: session.user,
  }, version: 0 })), auth)
  // Forward requests to the live isolated backend; no response or domain data is mocked.
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const url = new URL(route.request().url())
    const response = await route.fetch({ url: `${apiUrl}${url.pathname}${url.search}` })
    await route.fulfill({ response })
  })
  await page.goto('/operator/create-batch')
  await page.getByLabel('Tên lô (tiêu đề gọi vốn)').fill('VI04 kiểm thử trình duyệt API thật')
  await page.getByRole('button', { name: 'Lưu nháp', exact: true }).click()
  await expect(page.getByText(/Đã lưu nháp B-/)).toBeVisible()
  const code = new URL(page.url()).searchParams.get('code')!
  await page.reload()
  await expect(page.getByLabel('Tên lô (tiêu đề gọi vốn)')).toHaveValue('VI04 kiểm thử trình duyệt API thật')
  await expect(page.getByLabel('Hạng mục 2')).toHaveValue('MortalityReserve')
  await page.screenshot({ path: testInfo.outputPath('batch-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Gửi duyệt', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('batch-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: 'Gửi duyệt', exact: true }).click()
  await expect(page).toHaveURL(/\/operator\/batch$/)
  await expect(page.getByText(code, { exact: false })).toBeVisible()
  const saved = await request.get(`${apiUrl}/api/batches/${code}`, { headers: { Authorization: `Bearer ${auth.accessToken}` } })
  expect(saved.ok()).toBeTruthy()
  const result = await saved.json()
  expect(result.status).toBe('PendingApproval')
  expect(result.standardCost.status).toBe('Submitted')
  expect(result.standardCost.total).toBe(35000000)
  await page.unrouteAll({ behavior: 'wait' })
})
