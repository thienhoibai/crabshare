import { test, expect, type Page } from '@playwright/test'

const batch = { batchCode: 'B-REVIEW', operatorId: 1, title: 'Lô duyệt thật', crabType: 'SoftShellCrab', seedQuantity: 1500, expectedOutputKg: 300, cycleDays: 45, restockCutoffDays: 10, minViableCapital: 60000000, targetCapital: 75000000, maxCapital: 90000000, minContribution: 1000000, operatorSharePct: 7, status: 'PendingApproval', canEdit: false, canSubmit: false,
  standardCost: { versionNo: 1, status: 'Submitted', lockedAt: null, total: 35000000,
    items: [{ category: 'Seed', description: 'Con giống', quantity: 1500, unit: 'con', unitPrice: 20000, trancheNo: 1, amount: 30000000 }, { category: 'MortalityReserve', description: 'Dự phòng hao hụt', quantity: 1, unit: 'khoản', unitPrice: 5000000, trancheNo: null, amount: 5000000 }],
    tranches: [{ trancheNo: 1, plannedDate: '2099-12-01', unlockCondition: 'Đủ vốn và hợp đồng', amount: 30000000 }] } }
const detail = { batch, operator: { operatorId: 1, legalName: 'HTX Cà Mau', farmAddress: 'Cà Mau', status: 'Approved' }, fundingOpenAt: null, fundingDeadline: null, feeTierId: null, feeTierCode: null, platformFeeAmount: null, rejectionReason: null, approvedAt: null, approvedBy: null, tranches: [] }
async function setup(page: Page) {
  await page.addInitScript(() => localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token: 'test-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 1, email: 'admin@test.local', fullName: 'Admin', status: 'Active', roles: ['PlatformAdmin'] } }, version: 0 })))
}
test('admin list uses server filter, empty and error states', async ({ page }) => {
  await setup(page); let fail = true
  await page.route('**/api/admin/batches?*', route => fail ? route.fulfill({ status: 500, json: { detail: 'Lỗi tải danh sách' } }) : route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } }))
  await page.goto('/admin/batches'); await expect(page.getByRole('alert')).toContainText('Lỗi tải danh sách')
  fail = false; await page.getByRole('button', { name: 'Thử lại' }).click()
  await expect(page.getByText('Không có lô nào ở trạng thái này.')).toBeVisible()
  const req = page.waitForRequest(r => r.url().includes('/api/admin/batches?') && r.url().includes('status=Funding'))
  await page.getByLabel('Trạng thái lô').selectOption('Funding'); await req
})
test('approval submits explicit Vietnam offset, disables repeat and shows locked server data', async ({ page }) => {
  await setup(page); let current: unknown = detail; let calls = 0
  await page.route('**/api/admin/batches/B-REVIEW', route => route.fulfill({ json: current }))
  await page.route('**/api/admin/batches/B-REVIEW/approve', async route => {
    calls++; const req = route.request().postDataJSON()
    expect(req.fundingOpenAt).toBe('2099-11-01T09:00:00+07:00')
    expect(req.fundingDeadline).toBe('2099-11-10T18:00:00+07:00')
    current = { ...detail, batch: { ...batch, status: 'Funding', standardCost: { ...batch.standardCost, status: 'Locked', lockedAt: '2099-11-01T02:00:00Z' } }, fundingOpenAt: req.fundingOpenAt, fundingDeadline: req.fundingDeadline, platformFeeAmount: 1000000, feeTierCode: 'T2', tranches: [{ trancheNo: 1, plannedAmount: 30000000, plannedDate: '2099-12-01', unlockCondition: 'Đủ vốn và hợp đồng', status: 'Planned' }] }
    await new Promise(r => setTimeout(r, 200)); await route.fulfill({ json: current })
  })
  await page.goto('/admin/batches/detail?id=B-REVIEW')
  await expect(page.getByText('HTX Cà Mau')).toBeVisible()
  await page.getByLabel('Mở gọi vốn (giờ Việt Nam)').fill('2099-11-01T09:00')
  await page.getByLabel('Hạn gọi vốn (giờ Việt Nam)').fill('2099-11-10T18:00')
  await page.getByRole('button', { name: 'Duyệt & Mở gọi vốn' }).click()
  await expect(page.getByRole('button', { name: 'Đang xử lý…' })).toBeDisabled()
  await expect(page.getByRole('status')).toContainText('Đã duyệt')
  await expect(page.getByText('Locked', { exact: true })).toBeVisible()
  await expect(page.getByText(/1.000.000/)).toBeVisible(); expect(calls).toBe(1)
  await expect(page.getByText(/ROI|lợi suất|lợi nhuận.*ước tính/i)).toHaveCount(0)
})
test('reject requires reason and concurrent state conflict refreshes detail', async ({ page }) => {
  await setup(page); let current: unknown = detail
  await page.route('**/api/admin/batches/B-REVIEW', route => route.fulfill({ json: current }))
  await page.route('**/api/admin/batches/B-REVIEW/reject', async route => {
    expect(route.request().postDataJSON().reason).toBe('Thiếu hồ sơ')
    current = { ...detail, batch: { ...batch, status: 'Rejected' }, rejectionReason: 'Admin khác đã xử lý' }
    await route.fulfill({ status: 422, json: { detail: 'Lô đã thay đổi trạng thái.' } })
  })
  await page.goto('/admin/batches/detail?id=B-REVIEW')
  await page.getByLabel('Lý do từ chối').fill('   ')
  await page.getByRole('button', { name: 'Từ chối lô' }).click()
  await expect(page.getByRole('alert')).toContainText('Nhập lý do')
  await page.getByLabel('Lý do từ chối').fill('Thiếu hồ sơ')
  await page.getByRole('button', { name: 'Từ chối lô' }).click()
  await expect(page.getByRole('alert')).toContainText('Lô đã thay đổi trạng thái.')
  await expect(page.getByText('Admin khác đã xử lý')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Từ chối lô' })).toHaveCount(0)
})

test('admin returns an application for revision without rejecting it', async ({ page }) => {
  await setup(page)
  let current: unknown = detail
  await page.route('**/api/admin/batches/B-REVIEW',route=>route.fulfill({ json:current }))
  await page.route('**/api/admin/batches/B-REVIEW/request-revision',async route=> {
    expect(route.request().postDataJSON().reason).toBe('Bổ sung lịch đợt')
    current={ ...detail,batch:{ ...batch,status:'Draft',canEdit:true,canSubmit:true,rejectionReason:'Bổ sung lịch đợt' },rejectionReason:'Bổ sung lịch đợt' }
    await route.fulfill({ json:current })
  })
  await page.goto('/admin/batches/detail?id=B-REVIEW')
  await page.getByLabel('Lý do từ chối').fill('Bổ sung lịch đợt')
  await page.getByRole('button',{name:'Yêu cầu bổ sung',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Đã trả hồ sơ về nháp')
  await expect(page.getByText('Lô đã được xử lý: Nháp.')).toBeVisible()
})

test('operator schedule to admin approval and rejection with real API', async ({ page, request }, testInfo) => {
  test.skip(!process.env.VI05_API_URL, 'Requires an isolated seeded VI05 test API.')
  const api = process.env.VI05_API_URL!
  const login = async (email: string) => {
    const res = await request.post(`${api}/api/auth/login`, { data: { email, password: 'CrabShare@2026' } })
    expect(res.ok()).toBeTruthy(); return res.json()
  }
  const owner = await login('operator@crabshare.local')
  await page.addInitScript(auth => {
    if (!localStorage.getItem('crabshare-auth')) localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token: auth.accessToken, expiresAt: auth.expiresAt, user: auth.user }, version: 0 }))
  }, owner)
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const url = new URL(route.request().url())
    await route.fulfill({ response: await route.fetch({ url: `${api}${url.pathname}${url.search}` }) })
  })
  const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
  await page.goto('/operator/create-batch')
  await page.getByLabel('Tên lô (tiêu đề gọi vốn)').fill('VI05 trình duyệt API thật')
  await page.getByLabel('Mốc tính lịch đợt 1').selectOption('FundingReady')
  await page.getByLabel('Số ngày sau mốc đợt 1').fill('0')
  await page.getByLabel('Điều kiện đợt 1').fill('Đủ vốn và hợp đồng hai bên đầy đủ chữ ký')
  await page.getByRole('button', { name: 'Lưu nháp', exact: true }).click()
  await expect(page.getByText(/Đã lưu nháp B-/)).toBeVisible()
  const code = new URL(page.url()).searchParams.get('code')!
  await page.reload()
  await expect(page.getByLabel('Mốc tính lịch đợt 1')).toHaveValue('FundingReady')
  await expect(page.getByLabel('Số ngày sau mốc đợt 1')).toHaveValue('0')
  await expect(page.getByLabel('Điều kiện đợt 1')).toHaveValue('Đủ vốn và hợp đồng hai bên đầy đủ chữ ký')
  await page.getByRole('button', { name: 'Gửi duyệt', exact: true }).click()
  await expect(page).toHaveURL(/\/operator\/batch$/)
  const ownerHeaders = { Authorization: `Bearer ${owner.accessToken}` }
  const source = await (await request.get(`${api}/api/batches/${code}`, { headers: ownerHeaders })).json()
  const admin = await login('admin@crabshare.local')
  await page.evaluate(auth => localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token: auth.accessToken, expiresAt: auth.expiresAt, user: auth.user }, version: 0 })), admin)
  await page.goto('/admin/settings')
  await page.getByRole('button', { name: 'Sửa T2', exact: true }).click()
  await page.getByLabel('Phí cố định (đồng)').fill('1000001')
  await page.getByRole('button', { name: 'Lưu bậc phí' }).click()
  await expect(page.getByRole('status')).toContainText('Đã lưu bậc phí')
  await page.goto(`/admin/batches/detail?id=${code}`)
  await page.getByLabel('Lý do từ chối').fill('Bổ sung điều kiện giải ngân đợt 1')
  await page.getByRole('button',{name:'Yêu cầu bổ sung',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Đã trả hồ sơ về nháp')
  await page.evaluate(auth=>localStorage.setItem('crabshare-auth',JSON.stringify({ state:{ token:auth.accessToken,expiresAt:auth.expiresAt,user:auth.user },version:0 })),owner)
  await page.goto(`/operator/create-batch?code=${code}`)
  await expect(page.getByText(/Yêu cầu bổ sung: Bổ sung điều kiện/)).toBeVisible()
  await page.getByLabel('Điều kiện đợt 1').fill('Đủ vốn, hợp đồng và xác nhận sẵn sàng nhận giống')
  await page.getByRole('button',{name:'Gửi duyệt',exact:true}).click()
  await expect(page).toHaveURL(/\/operator\/batch$/)
  await page.evaluate(auth=>localStorage.setItem('crabshare-auth',JSON.stringify({ state:{ token:auth.accessToken,expiresAt:auth.expiresAt,user:auth.user },version:0 })),admin)
  await page.goto(`/admin/batches/detail?id=${code}`)
  await page.getByLabel('Mở gọi vốn (giờ Việt Nam)').fill(`${day(1)}T09:00`)
  await page.getByLabel('Hạn gọi vốn (giờ Việt Nam)').fill(`${day(10)}T18:00`)
  await page.getByRole('button', { name: 'Duyệt & Mở gọi vốn' }).click()
  await expect(page.getByRole('status')).toContainText('Đã duyệt')
  await expect(page.getByText('Locked', { exact: true })).toBeVisible()
  await expect(page.getByText(/1.000.001/)).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('vi05-approved-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('vi05-approved-mobile.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  const adminHeaders = { Authorization: `Bearer ${admin.accessToken}` }
  const approved = await (await request.get(`${api}/api/admin/batches/${code}`, { headers: adminHeaders })).json()
  expect(approved.batch.status).toBe('Funding'); expect(approved.tranches[0].plannedAmount).toBe(30000000)
  expect(approved.platformFeeAmount).toBe(1000001)
  expect(approved.batch.standardCost.versionNo).toBe(2)
  expect(approved.tranches[0].plannedDate).toBeNull()
  expect(approved.tranches[0].anchorCode).toBe('FundingReady')
  const blocked = await request.put(`${api}/api/batches/${code}/standard-cost`, { headers: ownerHeaders, data: { items: source.standardCost.items, tranches: source.standardCost.tranches } })
  expect(blocked.status()).toBe(422); expect((await blocked.json()).code).toBe('batch.cost_locked')
  const second = await request.post(`${api}/api/batches`, { headers: ownerHeaders, data: { ...source, title: 'VI05 từ chối API thật' } })
  expect(second.ok()).toBeTruthy(); const secondCode = (await second.json()).batchCode
  expect((await request.put(`${api}/api/batches/${secondCode}/standard-cost`, { headers: ownerHeaders, data: { items: source.standardCost.items, tranches: source.standardCost.tranches } })).ok()).toBeTruthy()
  expect((await request.post(`${api}/api/batches/${secondCode}/submit`, { headers: ownerHeaders })).ok()).toBeTruthy()
  await page.goto(`/admin/batches/detail?id=${secondCode}`)
  await page.getByLabel('Lý do từ chối').fill('Cần bổ sung hồ sơ theo đề nghị của hộ nuôi')
  await page.getByRole('button', { name: 'Từ chối lô' }).click()
  await expect(page.getByRole('status')).toContainText('Đã từ chối')
  const rejected = await (await request.get(`${api}/api/admin/batches/${secondCode}`, { headers: adminHeaders })).json()
  expect(rejected.batch.status).toBe('Rejected'); expect(rejected.batch.standardCost.lockedAt).toBeNull(); expect(rejected.tranches).toEqual([])
})
