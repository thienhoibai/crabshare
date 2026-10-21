import { expect, test, type Page } from '@playwright/test'

const code = 'HARVEST-TEST'
const session = { id: 12, batchCode: code, name: 'Buổi sáng', note: null, status: 'Open', startedAt: '2026-10-21T01:00:00Z', completedAt: null, declaredBy: 1, completedBy: null, harvestedCount: 0, totalWeightKg: 0, revision: 1, canRecord: true, canComplete: true }
const result = { crabItemId: 42, itemUuid: 'CRAB-42', harvestId: 12, batchCode: code, slotCode: '0006', weightG: 250, shellCondition: 'HardShell', gradeCode: 'L3', gradeName: 'Hạng do máy chủ', tagCode: '23456789ABCD', tagStatus: 'Printed', tracePath: '/truy-xuat/23456789ABCD', recordedAt: '2026-10-21T02:00:00Z', harvestedCount: 1, totalWeightKg: 0.25, remainingGrowingCount: 1 }

async function setup(page: Page, options: { staff?: boolean; open?: boolean } = {}) {
  await page.addInitScript(() => localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token: 'test-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 1, fullName: 'Viên', email: 'test@local', status: 'Active', roles: ['OperatorMember'], operatorId: 1 } }, version: 0 })))
  const state = { active: options.open ? { ...session, canComplete: !options.staff } : null as typeof session | null, sessions: [] as typeof session[], records: [] as typeof result[], currentCrabId: 42, currentCrabUuid: 'CRAB-42', contextCalls: 0, boxCalls: [] as string[], starts: [] as Record<string, unknown>[], recordsSent: [] as Record<string, unknown>[] }
  if (state.active) state.sessions = [state.active]
  await page.route('**/api/operators/me', route => route.fulfill({ json: { operatorId: 1, legalName: 'Trại thử', status: 'Approved', memberRole: options.staff ? 'Staff' : 'Owner' } }))
  await page.route('**/api/operators/me/batches?*', route => route.fulfill({ json: { items: [{ batchCode: code, title: 'Lô thu hoạch thật', crabType: 'RoeCrab', status: 'Harvesting', seedQuantity: 2 }], total: 1, page: 1, pageSize: 20 } }))
  await page.route(`**/api/batches/${code}/harvest-context*`, route => { state.contextCalls++; return route.fulfill({ json: { batchCode: code, batchStatus: state.active ? 'Harvesting' : 'InProduction', activeHarvest: state.active, canStart: !options.staff && !state.active, canRecord: !!state.active, canComplete: !options.staff && !!state.active, remainingGrowingCount: 2 - state.records.length, harvestedCount: state.records.length, totalWeightKg: state.records.length * 0.25, slotStatus: state.records.length ? 'Available' : 'Occupied', currentCrab: state.records.length ? null : { id: state.currentCrabId, itemUuid: state.currentCrabUuid, allocationId: 7 }, latestMoltedAt: '2026-10-20T01:00:00Z' } }) })
  await page.route(`**/api/batches/${code}/harvests*`, route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { items: state.sessions, total: state.sessions.length, page: 1, pageSize: 20 } })
    state.starts.push(route.request().postDataJSON()); state.active = { ...session, name: String(state.starts.at(-1)?.name ?? '') }; state.sessions = [state.active]
    return route.fulfill({ status: 201, json: state.active })
  })
  await page.route('**/api/harvests/12/crabs*', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { items: state.records, total: state.records.length, page: 1, pageSize: 20 } })
    state.recordsSent.push(route.request().postDataJSON()); state.records = [result]
    if (state.active) { state.active = { ...state.active, harvestedCount: 1, totalWeightKg: 0.25, revision: 2 }; state.sessions = [state.active] }
    return route.fulfill({ status: 201, json: result })
  })
  await page.route('**/api/harvests/12', route => route.fulfill({ json: state.sessions.find(item => item.id === 12) ?? session }))
  await page.route('**/api/boxes?*', route => { state.boxCalls.push(route.request().url()); return route.fulfill({ json: { items: [{ slotCode: '0006', status: 'Occupied' }], total: 1, page: 1, pageSize: 50 } }) })
  await page.route('**/api/operators/me/listings/options', route => route.fulfill({ json: [{ batchCode: code, gradeCode: 'L3', gradeName: 'Hạng do máy chủ', existingListingId: 8, inStockCount: state.records.length, inStockKg: state.records.length * 0.25 }] }))
  await page.route('**/api/operators/me/listings', route => route.fulfill({ json: [] }))
  return state
}
async function weigh(page: Page) {
  await page.getByLabel('Hộp nuôi', { exact: true }).selectOption('0006')
  await expect(page.getByText('Cua đang nuôi: CRAB-42')).toBeVisible()
  await page.getByLabel('Trọng lượng (gram)', { exact: true }).fill('250')
  await page.getByLabel('Tình trạng vỏ lúc cân').selectOption('HardShell')
  await page.getByRole('button', { name: 'Kiểm tra lần cân', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận ghi thu hoạch', exact: true }).click()
}

test('starts a real session, records the expected crab and renders server grade, tag and reloadable history', async ({ page }, testInfo) => {
  const state = await setup(page)
  await page.goto(`/operator/harvest?batchId=${code}`)
  await page.getByLabel('Tên đợt thu hoạch').fill('Buổi sáng')
  await page.getByRole('button', { name: 'Bắt đầu đợt thu hoạch', exact: true }).click()
  await weigh(page)
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu thu hoạch' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Kết quả lần cân' })).toContainText('Hạng do máy chủ')
  await expect(page.getByRole('region', { name: 'Kết quả lần cân' })).toContainText('23456789ABCD')
  expect(state.recordsSent[0]).toEqual({ requestId: expect.any(String), slotCode: '0006', expectedCrabItemId: 42, weightG: 250, shellCondition: 'HardShell' })
  expect(state.starts[0]).toMatchObject({ requestId: expect.any(String), name: 'Buổi sáng' })
  expect(state.boxCalls.every(url => new URL(url).searchParams.get('batchCode') === code)).toBe(true)
  expect(state.contextCalls).toBeGreaterThan(1)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('harvest-result-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('harvest-result-mobile.png'), fullPage: true })
  await page.reload()
  await expect(page.getByRole('region', { name: 'Cá thể đã thu hoạch' })).toContainText('CRAB-42')
})

test('unknown record outcome locks its payload and retries the identical request even after the box is released', async ({ page }) => {
  const state = await setup(page, { open: true })
  await page.route('**/api/harvests/12/crabs', route => {
    state.recordsSent.push(route.request().postDataJSON())
    if (state.recordsSent.length === 1) { state.records = [result]; return route.abort('failed') }
    return route.fulfill({ json: result })
  })
  await page.goto(`/operator/harvest?batchId=${code}`)
  await weigh(page)
  await expect(page.getByRole('alert')).toContainText('Chưa xác định kết quả')
  await expect(page.getByLabel('Trọng lượng (gram)', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('Hộp nuôi', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Gửi lại lần cân', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu thu hoạch' })).toBeVisible()
  expect(state.recordsSent[1]).toEqual(state.recordsSent[0])
})

test('Staff can weigh but cannot start, rename or close and must explicitly confirm shell and integer grams', async ({ page }) => {
  await setup(page, { staff: true, open: true })
  await page.goto(`/operator/harvest?batchId=${code}`)
  for (const name of ['Bắt đầu đợt thu hoạch', 'Chốt đợt thu hoạch', 'Lưu thông tin đợt']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  await page.getByLabel('Hộp nuôi', { exact: true }).selectOption('0006')
  await page.getByLabel('Trọng lượng (gram)', { exact: true }).fill('250')
  await expect(page.getByRole('button', { name: 'Kiểm tra lần cân', exact: true })).toBeDisabled()
  await page.getByLabel('Tình trạng vỏ lúc cân').selectOption('SoftShell')
  await page.getByLabel('Trọng lượng (gram)', { exact: true }).fill('250.5')
  await expect(page.getByRole('button', { name: 'Kiểm tra lần cân', exact: true })).toBeDisabled()
  await page.getByLabel('Trọng lượng (gram)', { exact: true }).fill('32768')
  await expect(page.getByRole('button', { name: 'Kiểm tra lần cân', exact: true })).toBeDisabled()
})

test('catalog refresh failure retains the saved harvest and does not resubmit it', async ({ page }) => {
  const state = await setup(page, { open: true })
  await page.route('**/api/listings/8/refresh-stock', route => route.fulfill({ status: 503, json: { detail: 'Catalog tạm gián đoạn.' } }))
  await page.goto(`/operator/harvest?batchId=${code}`)
  await weigh(page)
  await page.getByRole('button', { name: 'Làm mới tồn niêm yết', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Đã lưu thu hoạch; chưa làm mới tồn niêm yết')
  expect(state.recordsSent).toHaveLength(1)
  await expect(page.getByRole('region', { name: 'Kết quả lần cân' })).toContainText('23456789ABCD')
})

test('Owner saves metadata with the current revision, closes once and can open the next session', async ({ page }) => {
  const state = await setup(page, { open: true })
  const edits: unknown[] = [], completions: unknown[] = []
  await page.route('**/api/harvests/12', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: state.sessions[0] })
    edits.push(route.request().postDataJSON()); state.active = { ...session, name: 'Ca chiều', note: 'Khu B', revision: 2 }; state.sessions = [state.active]
    return route.fulfill({ json: state.active })
  })
  await page.route('**/api/harvests/12/complete', route => {
    completions.push(route.request().postDataJSON()); state.sessions = [{ ...state.sessions[0], status: 'Completed', completedAt: '2026-10-21T03:00:00Z', completedBy: 1, revision: 3, canRecord: false, canComplete: false }]; state.active = null
    return route.fulfill({ json: state.sessions[0] })
  })
  await page.goto(`/operator/harvest?batchId=${code}`)
  await page.getByLabel('Tên đợt thu hoạch').fill('Ca chiều')
  await page.getByLabel('Ghi chú đợt').fill('Khu B')
  await page.getByRole('button', { name: 'Lưu thông tin đợt', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Đã lưu thông tin đợt')
  expect(edits).toEqual([{ expectedRevision: 1, name: 'Ca chiều', note: 'Khu B' }])
  await page.getByRole('button', { name: 'Chốt đợt thu hoạch', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận chốt đợt', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Đã chốt đợt thu hoạch')
  expect(completions).toEqual([{ expectedRevision: 2 }])
  await expect(page.getByRole('button', { name: 'Chốt đợt thu hoạch', exact: true })).toHaveCount(0)
  await page.getByLabel('Tên đợt thu hoạch').fill('Đợt tiếp theo')
  await page.getByRole('button', { name: 'Bắt đầu đợt thu hoạch', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Chốt đợt thu hoạch', exact: true })).toBeVisible()
})

test('unknown start outcome retains the original UUID and metadata until replay resolves it', async ({ page }) => {
  const state = await setup(page)
  await page.route(`**/api/batches/${code}/harvests`, route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { items: state.sessions, total: state.sessions.length, page: 1, pageSize: 20 } })
    state.starts.push(route.request().postDataJSON()); state.active = { ...session }; state.sessions = [state.active]
    if (state.starts.length === 1) return route.abort('failed')
    return route.fulfill({ json: state.active })
  })
  await page.goto(`/operator/harvest?batchId=${code}`)
  await page.getByLabel('Tên đợt thu hoạch').fill('Buổi sáng')
  await page.getByRole('button', { name: 'Bắt đầu đợt thu hoạch', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Chưa xác định kết quả mở đợt')
  await expect(page.getByLabel('Tên đợt thu hoạch')).toBeDisabled()
  await page.getByRole('button', { name: 'Gửi lại yêu cầu mở đợt', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Chốt đợt thu hoạch', exact: true })).toBeVisible()
  expect(state.starts[1]).toEqual(state.starts[0])
})

for (const status of [403, 409]) test(`record ${status} shows the API problem and refreshes context before another confirmation`, async ({ page }) => {
  const state = await setup(page, { open: true })
  await page.route('**/api/harvests/12/crabs', route => {
    state.recordsSent.push(route.request().postDataJSON())
    return route.fulfill({ status, json: { code: status === 409 ? 'harvest.crab_changed' : 'harvest.forbidden', detail: status === 409 ? 'Cá thể trong hộp đã thay đổi.' : 'Bạn không còn quyền thu hoạch.' } })
  })
  await page.goto(`/operator/harvest?batchId=${code}`)
  await weigh(page)
  await expect(page.getByRole('alert')).toContainText(status === 409 ? 'Cá thể trong hộp đã thay đổi.' : 'Bạn không còn quyền thu hoạch.')
  await expect(page.getByRole('button', { name: 'Xác nhận ghi thu hoạch', exact: true })).toHaveCount(0)
  await expect.poll(() => state.contextCalls).toBeGreaterThan(2)
  expect(state.recordsSent).toHaveLength(1)
})

test('batch, occupied boxes and harvest history expose subsequent server pages and fit narrow screens', async ({ page }, testInfo) => {
  await setup(page, { open: true })
  const boxPages: string[] = [], batchPages: string[] = [], recordPages: string[] = []
  await page.route('**/api/operators/me/batches?*', route => {
    const params = new URL(route.request().url()).searchParams; batchPages.push(`${params.get('status')}:${params.get('page')}`)
    return route.fulfill({ json: { items: [{ batchCode: code, title: 'Lô thu hoạch thật', crabType: 'RoeCrab', status: 'Harvesting', seedQuantity: 2 }], total: 21, page: Number(params.get('page')), pageSize: 20 } })
  })
  await page.route('**/api/boxes?*', route => {
    const pageNo = new URL(route.request().url()).searchParams.get('page')!; boxPages.push(pageNo)
    return route.fulfill({ json: { items: [{ slotCode: pageNo === '1' ? '0005' : '0006', status: 'Occupied' }], total: 51, page: Number(pageNo), pageSize: 50 } })
  })
  await page.route('**/api/harvests/12/crabs?*', route => {
    const pageNo = new URL(route.request().url()).searchParams.get('page')!; recordPages.push(pageNo)
    return route.fulfill({ json: { items: [{ ...result, itemUuid: pageNo === '1' ? 'CRAB-FIRST' : 'CRAB-LAST' }], total: 21, page: Number(pageNo), pageSize: 20 } })
  })
  await page.goto('/operator/harvest')
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click()
  await expect.poll(() => batchPages).toContain('Harvesting:2')
  await page.getByLabel('Trạng thái lô').selectOption('InProduction')
  await expect.poll(() => batchPages).toContain('InProduction:1')
  await page.getByRole('link', { name: /Lô thu hoạch thật/ }).click()
  await page.locator('section').filter({ has: page.getByRole('heading', { name: 'Cân từng con', exact: true }) }).getByRole('button', { name: 'Trang sau', exact: true }).click()
  await expect(page.getByLabel('Hộp nuôi', { exact: true }).getByRole('option', { name: '0006', exact: true })).toHaveCount(1)
  await page.getByRole('region', { name: 'Cá thể đã thu hoạch' }).getByRole('button', { name: 'Trang sau', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Cá thể đã thu hoạch' })).toContainText('CRAB-LAST')
  expect(boxPages).toContain('2'); expect(recordPages).toContain('2')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('harvest-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('harvest-mobile.png'), fullPage: true })
})

test('an unknown manually entered box can be corrected without losing the active session', async ({ page }) => {
  await setup(page, { open: true })
  await page.route(`**/api/batches/${code}/harvest-context?slotCode=BAD`, route => route.fulfill({ status: 404, json: { detail: 'Không tìm thấy hộp.' } }))
  await page.goto(`/operator/harvest?batchId=${code}`)
  await page.getByLabel('Hoặc nhập mã hộp').fill('BAD')
  await page.getByRole('button', { name: 'Tải thông tin hộp', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Không tìm thấy hộp.')
  await expect(page.getByLabel('Hoặc nhập mã hộp')).toBeEnabled()
  await page.getByLabel('Hoặc nhập mã hộp').fill('0006')
  await page.getByRole('button', { name: 'Tải thông tin hộp', exact: true }).click()
  await expect(page.getByText('Cua đang nuôi: CRAB-42')).toBeVisible()
})

test('a refreshed box occupant invalidates measurements and confirmation instead of rebinding them to the new crab', async ({ page }) => {
  const state = await setup(page, { open: true })
  await page.goto(`/operator/harvest?batchId=${code}`)
  await page.getByLabel('Hộp nuôi', { exact: true }).selectOption('0006')
  await expect(page.getByText('Cua đang nuôi: CRAB-42')).toBeVisible()
  await page.getByLabel('Trọng lượng (gram)', { exact: true }).fill('250')
  await page.getByLabel('Tình trạng vỏ lúc cân').selectOption('HardShell')
  await page.getByRole('button', { name: 'Kiểm tra lần cân', exact: true }).click()
  state.currentCrabId = 43; state.currentCrabUuid = 'CRAB-43'
  // Saving session metadata refreshes server context while the weighing confirmation is open.
  await page.getByRole('button', { name: 'Lưu thông tin đợt', exact: true }).click()
  await expect(page.getByText('Cua đang nuôi: CRAB-43')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Xác nhận ghi thu hoạch', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Tình trạng vỏ lúc cân')).toHaveValue('')
  await expect(page.getByLabel('Trọng lượng (gram)', { exact: true })).toHaveValue('')
  expect(state.recordsSent).toHaveLength(0)
})
