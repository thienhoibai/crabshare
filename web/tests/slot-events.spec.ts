import { expect, test, type Page } from '@playwright/test'

const code = 'VI09-TEST'
const policy = { id: 1, versionNo: 1, restockCutoffBasis: 'AfterStocking', restockCutoffDays: 12, mortalityWindowHours: null, mortalityThresholdPercent: null, mortalitySeverity: null, mortalityAckWithinHours: null, createdBy: 1, createdAt: '2026-10-20T01:00:00Z' }
const event = { id: 9, batchCode: code, slotCode: '0001', eventType: 'Molted', occurredAt: '2026-10-20T08:00:00+07:00', quantity: 1, note: 'Theo dõi hộp', crabItemId: 10, itemUuid: 'CRAB-10', destinationSlotCode: null, replacesCrabItemId: null, evidenceId: null, actorId: 1, aliveCount: 2 }
async function setup(page: Page, options: { emptyPolicy?: boolean; staff?: boolean; dead?: boolean; noEvidence?: boolean } = {}) {
  await page.route(`**/api/batches/${code}/timeline?*`, route => route.fulfill({ json: { batchCode: code, timeZone: 'Asia/Ho_Chi_Minh', groups: [], hasMore: false, nextBefore: null } }))
  await page.addInitScript(() => localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token: 'test-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 1, fullName: 'Viên', email: 'test@local', status: 'Active', roles: ['OperatorMember'], operatorId: 1 } }, version: 0 })))
  const state = { current: options.emptyPolicy ? null as typeof policy | null : policy, events: [] as typeof event[], aliveCount: 2, contexts: 0, batches: 0, boxes: [] as string[] }
  await page.route('**/api/operators/me', route => route.fulfill({ json: { operatorId: 1, legalName: 'Trại thử', status: 'Approved', memberRole: options.staff ? 'Staff' : 'Owner' } }))
  await page.route(`**/api/operators/me/batches/${code}`, route => { state.batches++; return route.fulfill({ json: { batchCode: code, title: 'Lô sự kiện hộp', crabType: 'SoftShellCrab', status: 'InProduction', seedQuantity: 2, cycleDays: 90, stockedAt: '2026-10-10T00:00:00+07:00', restockCutoffDays: 7, expectedOutputKg: 1, targetCapital: 100, standardCost: null } }) })
  await page.route(`**/api/batches/${code}/slot-event-policy`, route => route.fulfill({ json: { batchCode: code, canConfigure: !options.staff, current: state.current, restockDeadline: state.current ? '2026-10-22' : null, suggestedRestockCutoffDays: 7, businessDate: '2026-10-20' } }))
  await page.route(`**/api/batches/${code}/slot-event-context?*`, route => { state.contexts++; return route.fulfill({ json: { batchCode: code, slotCode: new URL(route.request().url()).searchParams.get('slotCode'), status: options.dead ? 'Available' : 'Occupied', currentCrab: options.dead ? null : { id: 10, itemUuid: 'CRAB-10', status: 'Growing' }, replacementCandidates: options.dead ? [{ id: 4, itemUuid: 'DEAD-4', diedAt: '2026-10-19T01:00:00Z' }, { id: 5, itemUuid: 'DEAD-5', diedAt: '2026-10-19T02:00:00Z' }] : [], availableEvidence: options.noEvidence ? [] : [{ id: 6, capturedAt: '2026-10-20T01:00:00Z', reviewStatus: 'Pending' }], restockDeadline: '2026-10-22', canRecord: true, aliveCount: state.aliveCount } }) })
  await page.route(`**/api/batches/${code}/slot-events?*`, route => route.fulfill({ json: { items: state.events, total: state.events.length, page: 1, pageSize: 10 } }))
  await page.route('**/api/boxes?*', route => { state.boxes.push(route.request().url()); return route.fulfill({ json: { items: [{ slotCode: '0002', status: 'Available' }], page: 1, pageSize: 50, total: 1 } }) })
  return state
}
async function openSlot(page: Page) {
  await page.goto(`/operator/batch/detail?code=${code}`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Mã hộp nguồn', { exact: true }).fill('0001')
  await page.getByRole('button', { name: 'Tải thông tin hộp', exact: true }).click()
  await expect(page.getByText('Cua đang nuôi: CRAB-10')).toBeVisible()
  await page.getByLabel('Thời điểm xảy ra (UTC+7)').fill('2026-10-20T08:00')
}
async function confirm(page: Page) {
  await page.getByRole('button', { name: 'Kiểm tra sự kiện', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận ghi sự kiện', exact: true }).click()
}

test('records a confirmed event once, keeps retry identity, refreshes count and history, and creates a new identity for a new event', async ({ page }) => {
  const state = await setup(page)
  const requests: Record<string, unknown>[] = []
  await page.route(`**/api/batches/${code}/slot-events`, route => {
    const request = route.request().postDataJSON(); requests.push(request)
    if (requests.length === 1) return route.fulfill({ status: 422, json: { detail: 'Thời điểm chưa hợp lệ.' } })
    state.events = [{ ...event, note: request.note ?? null }]; state.aliveCount = 1
    return route.fulfill({ status: 201, json: { ...event, aliveCount: 1 } })
  })
  await openSlot(page)
  await confirm(page)
  await expect(page.getByRole('alert')).toContainText('Thời điểm chưa hợp lệ.')
  await page.getByRole('button', { name: 'Xác nhận ghi sự kiện', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã ghi sự kiện' })).toBeVisible()
  await expect(page.getByText('Cua còn sống trong lô: 1')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Lịch sử sự kiện hộp' }).getByText('CRAB-10')).toBeVisible()
  expect(requests[0]).toEqual(requests[1])
  expect(requests[0]).toMatchObject({ slotCode: '0001', eventType: 'Molted', quantity: 1, occurredAt: '2026-10-20T08:00:00+07:00' })
  expect(state.contexts).toBeGreaterThan(1); expect(state.batches).toBeGreaterThan(1)
  await confirm(page)
  await expect.poll(() => requests.length).toBe(3)
  expect(requests[2].requestId).not.toBe(requests[1].requestId)
})

test('branches for mortality, relocation and restock using actual evidence, boxes and explicit replacement', async ({ page }) => {
  const state = await setup(page)
  await openSlot(page)
  await page.getByLabel('Loại sự kiện').selectOption('Mortality')
  await expect(page.getByRole('button', { name: 'Kiểm tra sự kiện', exact: true })).toBeDisabled()
  await page.getByLabel('Ảnh chụp từ ứng dụng').selectOption('6')
  await expect(page.locator('input[type=file]')).toHaveCount(0)
  await page.getByLabel('Loại sự kiện').selectOption('Relocated')
  await page.getByLabel('Hộp đích', { exact: true }).selectOption('0002')
  const payloads: Record<string, unknown>[] = []
  await page.route(`**/api/batches/${code}/slot-events`, route => { payloads.push(route.request().postDataJSON()); return route.fulfill({ status: 409, json: { detail: 'Hộp đích đã được sử dụng.' } }) })
  await confirm(page)
  await expect(page.getByRole('alert')).toContainText('Hộp đích đã được sử dụng.')
  expect(payloads[0]).toMatchObject({ destinationSlotCode: '0002', eventType: 'Relocated' })
  expect(payloads[0]).not.toHaveProperty('evidenceId')
  expect(state.boxes.some(url => new URL(url).searchParams.get('status') === 'Available')).toBe(true)
  await page.getByRole('button', { name: 'Sửa sự kiện' }).click()
  await page.getByLabel('Ghi chú sự kiện').fill('Đổi nội dung')
  await confirm(page)
  expect(payloads[1].requestId).not.toBe(payloads[0].requestId)
})

test('requires choosing the dead crab and mobile camera evidence for restock', async ({ page }) => {
  await setup(page, { dead: true, staff: true })
  await page.goto(`/operator/batch/detail?code=${code}`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Mã hộp nguồn', { exact: true }).fill('0001')
  await page.getByRole('button', { name: 'Tải thông tin hộp', exact: true }).click()
  await page.getByLabel('Loại sự kiện').selectOption('Restocked')
  await expect(page.getByLabel('Cá thể được thay thế')).toHaveValue('')
  await page.getByLabel('Ảnh chụp từ ứng dụng').selectOption('6')
  await expect(page.getByRole('button', { name: 'Kiểm tra sự kiện', exact: true })).toBeDisabled()
  await page.getByLabel('Cá thể được thay thế').selectOption('5')
  await page.getByLabel('Thời điểm xảy ra (UTC+7)').fill('2026-10-20T08:00')
  let payload: unknown
  await page.route(`**/api/batches/${code}/slot-events`, route => { payload = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { ...event, eventType: 'Restocked' } }) })
  await confirm(page)
  await expect(page.getByRole('status').filter({ hasText: 'Đã ghi sự kiện' })).toBeVisible()
  expect(payload).toMatchObject({ replacesCrabItemId: 5, evidenceId: 6, eventType: 'Restocked' })
  await expect(page.getByRole('button', { name: 'Lưu chính sách' })).toHaveCount(0)
})

test('Owner configures either cutoff basis without preset alert thresholds, saves immutable versions and reloads conflicts', async ({ page }) => {
  const state = await setup(page, { emptyPolicy: true })
  let saved: Record<string, unknown> | undefined
  await page.route(`**/api/batches/${code}/slot-event-policy`, route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { batchCode: code, canConfigure: true, current: state.current, restockDeadline: state.current ? '2026-12-26' : null, suggestedRestockCutoffDays: 7, businessDate: '2026-10-20' } })
    saved = route.request().postDataJSON()
    if (state.current) { state.current = { ...policy, versionNo: 3 }; return route.fulfill({ status: 409, json: { detail: 'Chính sách đã thay đổi.' } }) }
    state.current = { ...policy, ...saved, versionNo: 2 } as typeof policy
    return route.fulfill({ json: state.current })
  })
  await page.goto(`/operator/batch/detail?code=${code}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('Số ngày hạn thả bù')).toHaveValue('')
  await page.getByLabel('Cách tính hạn thả bù').selectOption('BeforeHarvest')
  await page.getByLabel('Số ngày hạn thả bù').fill('13')
  await page.getByRole('button', { name: 'Lưu chính sách' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu chính sách phiên bản 2' })).toBeVisible()
  expect(saved).toEqual({ expectedVersionNo: 0, restockCutoffBasis: 'BeforeHarvest', restockCutoffDays: 13, mortalityWindowHours: null, mortalityThresholdPercent: null, mortalitySeverity: null, mortalityAckWithinHours: null })
  await expect(page.getByText(/Ngày thả giống \+ chu kỳ − 13 ngày/)).toBeVisible()
  await page.getByLabel('Bật cảnh báo tử vong theo cấu hình trại').check()
  for (const label of ['Cửa sổ tính (giờ)', 'Ngưỡng tử vong (%)', 'Thời hạn phản hồi (giờ)']) await expect(page.getByLabel(label, { exact: true })).toHaveValue('')
  await page.getByLabel('Cửa sổ tính (giờ)', { exact: true }).fill('24')
  await page.getByLabel('Ngưỡng tử vong (%)', { exact: true }).fill('8')
  await page.getByLabel('Mức cảnh báo').selectOption('High')
  await page.getByLabel('Thời hạn phản hồi (giờ)', { exact: true }).fill('6')
  await page.getByRole('button', { name: 'Lưu chính sách' }).click()
  await expect(page.getByRole('alert')).toContainText('Chính sách đã thay đổi.')
  await expect(page.getByLabel('Ngưỡng tử vong (%)', { exact: true })).toHaveValue('8')
  await page.getByRole('button', { name: 'Tải chính sách mới' }).click()
  await expect(page.getByLabel('Số ngày hạn thả bù')).toHaveValue('12')
})

test('missing evidence explains mobile capture and supports narrow layouts', async ({ page }, testInfo) => {
  await setup(page, { noEvidence: true })
  await openSlot(page)
  await page.getByLabel('Loại sự kiện').selectOption('Mortality')
  await expect(page.getByText('Chụp ảnh hộp này bằng camera trong ứng dụng mobile, tải lên rồi tải lại thông tin hộp.')).toBeVisible()
  for (const width of [320, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true) }
  await page.screenshot({ path: testInfo.outputPath('slot-events-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('slot-events-mobile.png'), fullPage: true })
})

test('mortality sends selected evidence after confirmation, locks the pending form and preserves permission errors', async ({ page }) => {
  await setup(page)
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  let calls = 0
  await page.route(`**/api/batches/${code}/slot-events`, async route => {
    calls++
    expect(route.request().postDataJSON()).toMatchObject({ eventType: 'Mortality', evidenceId: 6, quantity: 1 })
    expect(route.request().postDataJSON()).not.toHaveProperty('replacesCrabItemId')
    await pending
    return route.fulfill({ status: 403, json: { detail: 'Bạn không có quyền ghi sự kiện.' } })
  })
  await openSlot(page)
  await page.getByLabel('Loại sự kiện').selectOption('Mortality')
  await page.getByLabel('Ảnh chụp từ ứng dụng').selectOption('6')
  await page.getByRole('button', { name: 'Kiểm tra sự kiện', exact: true }).click()
  expect(calls).toBe(0)
  await page.getByRole('button', { name: 'Xác nhận ghi sự kiện', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Đang ghi sự kiện…' })).toBeDisabled()
  await expect(page.getByLabel('Mã hộp nguồn', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Sửa sự kiện' })).toBeDisabled()
  finish()
  await expect(page.getByRole('alert')).toContainText('Bạn không có quyền ghi sự kiện.')
  await expect(page.getByLabel('Ảnh chụp từ ứng dụng')).toHaveValue('6')
  expect(calls).toBe(1)
})

test('failed policy refresh after an event keeps unsaved Owner policy values', async ({ page }) => {
  await setup(page)
  let failRefresh = false
  await page.route(`**/api/batches/${code}/slot-event-policy`, route => route.fulfill(failRefresh
    ? { status: 503, json: { detail: 'Không tải được chính sách hiện tại.' } }
    : { json: { batchCode: code, canConfigure: true, current: policy, restockDeadline: '2026-10-22', suggestedRestockCutoffDays: 7, businessDate: '2026-10-20' } }))
  await page.route(`**/api/batches/${code}/slot-events`, route => { failRefresh = true; return route.fulfill({ status: 201, json: event }) })
  await openSlot(page)
  await page.getByLabel('Số ngày hạn thả bù').fill('14')
  await confirm(page)
  await expect(page.getByRole('alert')).toContainText('Không tải được chính sách hiện tại.')
  await expect(page.getByLabel('Số ngày hạn thả bù')).toHaveValue('14')
})

test('farm can set an alert above initial seed quantity without a biological ceiling', async ({ page }) => {
  const state = await setup(page)
  let saved: Record<string, unknown> | undefined
  await page.route(`**/api/batches/${code}/slot-event-policy`, route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { batchCode: code, canConfigure: true, current: state.current, restockDeadline: '2026-10-22', suggestedRestockCutoffDays: 7, businessDate: '2026-10-20' } })
    saved = route.request().postDataJSON(); state.current = { ...policy, ...saved, versionNo: 2 } as typeof policy
    return route.fulfill({ json: state.current })
  })
  await page.goto(`/operator/batch/detail?code=${code}`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Bật cảnh báo tử vong theo cấu hình trại').check()
  await page.getByLabel('Cửa sổ tính (giờ)', { exact: true }).fill('48')
  await page.getByLabel('Ngưỡng tử vong (%)', { exact: true }).fill('120.5')
  await page.getByLabel('Mức cảnh báo').selectOption('Medium')
  await page.getByLabel('Thời hạn phản hồi (giờ)', { exact: true }).fill('8')
  await page.getByRole('button', { name: 'Lưu chính sách' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu chính sách phiên bản 2' })).toBeVisible()
  expect(saved).toMatchObject({ expectedVersionNo: 1, restockCutoffBasis: 'AfterStocking', mortalityThresholdPercent: 120.5 })
})

test('history shows legacy stocking and harvest with missing historical associations truthfully', async ({ page }) => {
  await setup(page)
  await page.route(`**/api/batches/${code}/slot-events?*`, route => route.fulfill({ json: { items: [
    { ...event, id: 1, eventType: 'Stocked', crabItemId: null, itemUuid: null, aliveCount: null, actorId: null },
    { ...event, id: 2, eventType: 'Harvested' },
    { ...event, id: 3, eventType: 'LegacyOther' },
  ], total: 3, page: 1, pageSize: 10 } }))
  await page.goto(`/operator/batch/detail?code=${code}`, { waitUntil: 'domcontentloaded' })
  const history = page.getByRole('region', { name: 'Lịch sử sự kiện hộp' })
  await expect(history.getByRole('heading', { name: 'Thả giống · Hộp 0001' })).toBeVisible()
  await expect(history.getByRole('heading', { name: 'Thu hoạch · Hộp 0001' })).toBeVisible()
  await expect(history.getByRole('heading', { name: 'Sự kiện LegacyOther · Hộp 0001' })).toBeVisible()
  await expect(history.getByText('Chưa có liên kết cá thể')).toBeVisible()
  await expect(history.getByText(/Không có số liệu tại thời điểm ghi/)).toBeVisible()
  await expect(page.getByLabel('Loại sự kiện')).not.toContainText('Thả giống')
})

