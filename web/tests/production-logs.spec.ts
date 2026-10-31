import { expect, test, type Page } from '@playwright/test'

const ranges = { phMin: 6.2, phMax: 8.4, waterTempMinC: -1, waterTempMaxC: 32, salinityMinPpt: 8, salinityMaxPpt: 30 }
const version = { id: 1, versionNo: 1, ...ranges, createdBy: 1, createdAt: '2026-10-20T02:00:00Z' }
const measurement = { ph: 7.4, waterTempC: 28.5, salinityPpt: 15, feedKg: 1.234, note: 'Kiểm tra nước buổi sáng' }
const log = { id: 41, batchCode: 'VI08-TEST', logDate: '2026-10-20', ...measurement, source: 'Manual', plausibilityFlag: 'Ok', recordedBy: 1, createdAt: '2026-10-20T03:00:00Z', thresholdVersion: 1, thresholdsApplied: version }
const batch = { batchCode: 'VI08-TEST', title: 'Lô cua đang chăm sóc', crabType: 'SoftShellCrab', status: 'InProduction', cycleDays: 90, seedQuantity: 200, aliveCount: 190, dayOfCycle: 8, latestLog: null, loggedToday: false, canRecord: true, businessDate: '2026-10-20' }

async function setup(page: Page, options: { configured?: boolean; staff?: boolean; status?: string } = {}) {
  await page.addInitScript(() => localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token: 'test-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 1, fullName: 'Viên', email: 'test@local', phone: null, status: 'Active', roles: ['OperatorMember'], operatorId: 1 } }, version: 0 })))
  await page.route('**/api/operators/me', route => route.fulfill({ json: { operatorId: 1, legalName: 'Trại thử', status: 'Approved', memberRole: options.staff ? 'Staff' : 'Owner', canEdit: false, canSubmit: false } }))
  const state = { current: options.configured === false ? null as typeof version | null : version, logs: [] as typeof log[], loggedToday: false, pages: [] as number[] }
  await page.route('**/api/operators/me/production-batches?*', route => {
    const pageNo = Number(new URL(route.request().url()).searchParams.get('page'))
    state.pages.push(pageNo)
    return route.fulfill({ json: { items: [{ ...batch, ...(pageNo === 2 ? { batchCode: 'VI08-HARVEST', title: 'Lô thu hoạch từng phần', status: 'Harvesting' } : { status: options.status ?? batch.status }), loggedToday: state.loggedToday, canRecord: !!state.current }], page: pageNo, pageSize: 1, total: 2 } })
  })
  await page.route('**/api/batches/*/production-thresholds', route => route.fulfill({ json: { businessDate: '2026-10-20', canConfigure: !options.staff, canRecord: !!state.current && options.status !== 'Stocked', current: state.current } }))
  await page.route('**/api/batches/*/production-logs?*', route => route.fulfill({ json: { items: state.logs, page: 1, pageSize: 10, total: state.logs.length } }))
  return state
}

async function fillLog(page: Page, ph = '7.4') {
  await page.getByLabel('Độ pH', { exact: true }).fill(ph)
  await page.getByLabel('Nhiệt độ nước (°C)', { exact: true }).fill('28.5')
  await page.getByLabel('Độ mặn (ppt)', { exact: true }).fill('15')
  await page.getByLabel('Lượng thức ăn (kg)', { exact: true }).fill('1.234')
  await page.getByLabel('Ghi chú', { exact: true }).fill(measurement.note)
}

test('shows applied water ranges beside measurements without rejecting out-of-range readings', async ({ page }) => {
  await setup(page)
  await page.goto('/operator/log')
  await expect(page.getByLabel('Độ pH', { exact: true })).toHaveAccessibleDescription('Ngưỡng đang áp dụng: 6.2 - 8.4')
  await expect(page.getByLabel('Nhiệt độ nước (°C)', { exact: true })).toHaveAccessibleDescription('Ngưỡng đang áp dụng: -1 - 32 °C')
  await expect(page.getByLabel('Độ mặn (ppt)', { exact: true })).toHaveAccessibleDescription('Ngưỡng đang áp dụng: 8 - 30 ppt')
  await fillLog(page, '9.1')
  await expect(page.getByRole('button', { name: 'Lưu nhật ký', exact: true })).toBeEnabled()
})

test('Owner configures blank water ranges before recording and uses the server date', async ({ page }) => {
  const state = await setup(page, { configured: false })
  await page.route('**/api/batches/VI08-TEST/production-thresholds', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { businessDate: '2026-10-20', canConfigure: true, canRecord: !!state.current, current: state.current } })
    expect(route.request().postDataJSON()).toEqual({ expectedVersionNo: 0, ...ranges })
    state.current = version
    return route.fulfill({ json: version })
  })
  await page.goto('/operator/log')
  await expect(page.getByLabel('Lô nuôi', { exact: true })).toContainText('VI08-HARVEST')
  expect(state.pages).toEqual([1, 2])
  await expect(page.getByText('Ngày ghi: 20/10/2026 · UTC+7')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lưu nhật ký', exact: true })).toBeDisabled()
  for (const [label, value] of [['pH tối thiểu', '6.2'], ['pH tối đa', '8.4'], ['Nhiệt độ tối thiểu (°C)', '-1'], ['Nhiệt độ tối đa (°C)', '32'], ['Độ mặn tối thiểu (ppt)', '8'], ['Độ mặn tối đa (ppt)', '30']]) {
    await expect(page.getByLabel(label, { exact: true })).toHaveValue('')
    await page.getByLabel(label, { exact: true }).fill(value)
  }
  await page.getByRole('button', { name: 'Lưu ngưỡng' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu ngưỡng phiên bản 1' })).toBeVisible()
  await fillLog(page)
  await expect(page.getByRole('button', { name: 'Lưu nhật ký', exact: true })).toBeEnabled()
})

test('records all four measurements once while pending then refreshes persisted history', async ({ page }, testInfo) => {
  const state = await setup(page)
  let calls = 0
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  await page.route('**/api/batches/VI08-TEST/production-logs', async route => {
    calls++
    expect(route.request().postDataJSON()).toEqual(measurement)
    await pending
    state.logs = [log]
    state.loggedToday = true
    await route.fulfill({ status: 201, json: log })
  })
  await page.goto('/operator/log')
  await fillLog(page)
  await page.screenshot({ path: testInfo.outputPath('daily-log-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: 'Lưu nhật ký', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Đang lưu nhật ký…' })).toBeDisabled()
  await expect(page.getByLabel('Lô nuôi', { exact: true })).toBeDisabled()
  finish()
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu nhật ký lên máy chủ' })).toBeVisible()
  const history = page.getByRole('region', { name: 'Lịch sử nhật ký' })
  await expect(history.getByText(measurement.note, { exact: true })).toBeVisible()
  await expect(history.getByText('Thủ công', { exact: true })).toBeVisible()
  await expect(history.getByText('Người ghi: #1')).toBeVisible()
  await expect(history.getByText('Ngưỡng áp dụng: phiên bản 1')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lưu nhật ký', exact: true })).toBeDisabled()
  expect(calls).toBe(1)
})

test('duplicate conflict retains all entered values and explains the existing daily record', async ({ page }) => {
  await setup(page)
  await page.route('**/api/batches/VI08-TEST/production-logs', route => route.fulfill({ status: 409, json: { code: 'production.log_exists', detail: 'Lô đã có nhật ký thủ công cho ngày hôm nay.' } }))
  await page.goto('/operator/log')
  await fillLog(page)
  await page.getByRole('button', { name: 'Lưu nhật ký', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Lô đã có nhật ký thủ công cho ngày hôm nay.')
  await expect(page.getByLabel('Độ pH', { exact: true })).toHaveValue('7.4')
  await expect(page.getByLabel('Nhiệt độ nước (°C)', { exact: true })).toHaveValue('28.5')
  await expect(page.getByLabel('Độ mặn (ppt)', { exact: true })).toHaveValue('15')
  await expect(page.getByLabel('Lượng thức ăn (kg)', { exact: true })).toHaveValue('1.234')
  await expect(page.getByLabel('Ghi chú', { exact: true })).toHaveValue(measurement.note)
})

test('threshold conflict keeps Owner edits until the current configuration is explicitly loaded', async ({ page }) => {
  const state = await setup(page)
  await page.route('**/api/batches/VI08-TEST/production-thresholds', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { businessDate: '2026-10-20', canConfigure: true, canRecord: true, current: state.current } })
    state.current = { ...version, versionNo: 2, phMax: 8.8 }
    return route.fulfill({ status: 409, json: { code: 'production.thresholds_changed', detail: 'Ngưỡng đã được người khác cập nhật.' } })
  })
  await page.goto('/operator/log')
  await page.getByLabel('pH tối đa', { exact: true }).fill('8.1')
  await page.getByRole('button', { name: 'Lưu ngưỡng' }).click()
  await expect(page.getByRole('alert')).toContainText('Ngưỡng đã được người khác cập nhật.')
  await expect(page.getByLabel('pH tối đa', { exact: true })).toHaveValue('8.1')
  await page.getByRole('button', { name: 'Tải cấu hình mới' }).click()
  await expect(page.getByLabel('pH tối đa', { exact: true })).toHaveValue('8.8')
})

test('out of range measurement stays recorded and links to the existing alert center on mobile', async ({ page }, testInfo) => {
  const state = await setup(page, { staff: true })
  await page.route('**/api/batches/VI08-TEST/production-logs', route => {
    expect(route.request().postDataJSON()).toEqual({ ...measurement, ph: 9.1 })
    state.logs = [{ ...log, ph: 9.1, plausibilityFlag: 'OutOfRange' }]
    state.loggedToday = true
    return route.fulfill({ status: 201, json: state.logs[0] })
  })
  await page.route('**/api/operators/me/alerts*', route => route.fulfill({ json: [{ id: 7, batchCode: 'VI08-TEST', farmName: 'Trại thử', type: 'WaterQuality', severity: 'Medium', message: 'pH 9.1 ngoài ngưỡng 6.2–8.4', status: 'Open', raisedAt: '2026-10-20T03:00:00Z', ackDeadline: '2026-10-21T03:00:00Z', acknowledgedAt: null, acknowledgedBy: null, responseNote: null, escalatedAt: null }] }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/operator/log')
  await expect(page.getByRole('button', { name: 'Lưu ngưỡng' })).toHaveCount(0)
  await fillLog(page, '9.1')
  await page.getByRole('button', { name: 'Lưu nhật ký', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu nhật ký lên máy chủ' })).toContainText('ngoài ngưỡng')
  await expect(page.getByRole('region', { name: 'Lịch sử nhật ký' }).getByText('Ngoài ngưỡng', { exact: true })).toBeVisible()
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('daily-log-mobile.png'), fullPage: true })
  await page.getByRole('link', { name: 'Xem cảnh báo', exact: true }).click()
  await expect(page).toHaveURL(/\/operator\/alerts/)
  await expect(page.getByText('pH 9.1 ngoài ngưỡng 6.2–8.4')).toBeVisible()
})

test('Staff sees missing configuration guidance and Stocked batches cannot record', async ({ page }) => {
  await setup(page, { configured: false, staff: true, status: 'Stocked' })
  await page.goto('/operator/log')
  await expect(page.getByText('Liên hệ chủ hộ nuôi để cấu hình ngưỡng trước khi ghi nhật ký.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lưu ngưỡng' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Lưu nhật ký', exact: true })).toBeDisabled()
  await page.getByLabel('Lô nuôi', { exact: true }).selectOption('VI08-HARVEST')
  await expect(page.getByText('Đang thu hoạch', { exact: true })).toBeVisible()
})

test('history filters page on the server and preserves legacy evaluation without invented ranges', async ({ page }) => {
  await setup(page)
  const reads: string[] = []
  await page.route('**/api/batches/VI08-TEST/production-logs?*', route => {
    const url = new URL(route.request().url())
    reads.push(url.search)
    const pageNo = Number(url.searchParams.get('page'))
    return route.fulfill({ json: { items: [{ ...log, id: pageNo, logDate: pageNo === 2 ? '2026-10-18' : '2026-10-19', thresholdVersion: null, thresholdsApplied: null, plausibilityFlag: 'Inconsistent' }], page: pageNo, pageSize: 10, total: 11 } })
  })
  await page.goto('/operator/log')
  await expect(page.getByText('Chưa có thông tin ngưỡng lịch sử')).toBeVisible()
  await expect(page.getByText('Cần kiểm tra', { exact: true })).toBeVisible()
  await page.getByLabel('Từ ngày', { exact: true }).fill('2026-10-01')
  await page.getByLabel('Đến ngày', { exact: true }).fill('2026-10-20')
  await page.getByRole('button', { name: 'Lọc nhật ký' }).click()
  await page.getByRole('button', { name: 'Trang sau' }).click()
  await expect(page.getByText('18/10/2026', { exact: true })).toBeVisible()
  expect(reads.some(value => value.includes('from=2026-10-01') && value.includes('to=2026-10-20') && value.includes('page=2'))).toBe(true)
})

test('batch loading errors can retry and an empty operator has no demo records', async ({ page }) => {
  await setup(page)
  let fail = true
  await page.route('**/api/operators/me/production-batches?*', route => fail ? route.fulfill({ status: 500, json: { detail: 'Không tải được lô nuôi.' } }) : route.fulfill({ json: { items: [], page: 1, pageSize: 50, total: 0 } }))
  await page.goto('/operator/log')
  await expect(page.getByRole('alert')).toContainText('Không tải được lô nuôi.')
  fail = false
  await page.getByRole('button', { name: 'Thử lại' }).click()
  await expect(page.getByText('Chưa có lô đang chăm sóc')).toBeVisible()
})

test('switching Operator accounts immediately removes the previous history and draft', async ({ page }) => {
  const state = await setup(page)
  state.logs = [log]
  await page.goto('/operator/log')
  await fillLog(page)
  await expect(page.getByRole('region', { name: 'Lịch sử nhật ký' }).getByText(measurement.note, { exact: true })).toBeVisible()
  await page.route('**/api/operators/me/production-batches?*', route => route.fulfill({ json: { items: [], page: 1, pageSize: 50, total: 0 } }))
  await page.evaluate(async () => {
    const modulePath = '/src/shared/auth/authStore.ts'
    const { useAuthStore } = await import(modulePath)
    useAuthStore.getState().setSession('second-token', '2099-01-01T00:00:00Z', { userId: 2, fullName: 'Second', email: 'second@test.local', phone: null, status: 'Active', roles: ['OperatorMember'], operatorId: 2 })
  })
  await expect(page.getByText('Chưa có lô đang chăm sóc')).toBeVisible()
  await expect(page.getByText(measurement.note, { exact: true })).toHaveCount(0)
})

test('background threshold refresh failure preserves measurements and unsaved Owner ranges', async ({ page }) => {
  await page.clock.install()
  await setup(page)
  let fail = false
  await page.route('**/api/batches/VI08-TEST/production-thresholds', route => fail ? route.fulfill({ status: 500, json: { detail: 'Không tải được cấu hình mới.' } }) : route.fulfill({ json: { businessDate: '2026-10-20', canConfigure: true, canRecord: true, current: version } }))
  await page.goto('/operator/log')
  await fillLog(page)
  await page.getByLabel('pH tối đa', { exact: true }).fill('8.1')
  fail = true
  await page.clock.fastForward(60_001)
  await expect(page.getByRole('alert')).toContainText('Không tải được cấu hình mới.')
  await expect(page.getByLabel('Độ pH', { exact: true })).toHaveValue('7.4')
  await expect(page.getByLabel('Ghi chú', { exact: true })).toHaveValue(measurement.note)
  await expect(page.getByLabel('pH tối đa', { exact: true })).toHaveValue('8.1')
  fail = false
  await page.getByRole('button', { name: 'Thử lại cấu hình' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByLabel('pH tối đa', { exact: true })).toHaveValue('8.1')
})

test('background batch refresh failure preserves the selected batch and its draft', async ({ page }) => {
  await setup(page)
  await page.goto('/operator/log')
  await fillLog(page)
  await page.route('**/api/operators/me/production-batches?*', route => route.fulfill({ status: 500, json: { detail: 'Không làm mới được lô nuôi.' } }))
  await page.getByRole('button', { name: 'Làm mới lô' }).click()
  await expect(page.getByRole('alert')).toContainText('Không làm mới được lô nuôi.')
  await expect(page.getByLabel('Lô nuôi', { exact: true })).toHaveValue('VI08-TEST')
  await expect(page.getByLabel('Độ pH', { exact: true })).toHaveValue('7.4')
  await expect(page.getByLabel('Ghi chú', { exact: true })).toHaveValue(measurement.note)
})

test('a fresh server business date allows today after the cached batch was logged yesterday', async ({ page }) => {
  const state = await setup(page)
  state.loggedToday = true
  await page.route('**/api/batches/VI08-TEST/production-thresholds', route => route.fulfill({ json: { businessDate: '2026-10-21', canConfigure: true, canRecord: true, current: version } }))
  await page.route('**/api/batches/VI08-TEST/production-logs', route => {
    expect(route.request().postDataJSON()).toEqual(measurement)
    return route.fulfill({ status: 201, json: { ...log, logDate: '2026-10-21' } })
  })
  await page.goto('/operator/log')
  await expect(page.getByText('Ngày ghi: 21/10/2026 · UTC+7')).toBeVisible()
  await fillLog(page)
  await expect(page.getByRole('button', { name: 'Lưu nhật ký', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Lưu nhật ký', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu nhật ký lên máy chủ cho ngày 21/10/2026' })).toBeVisible()
})
