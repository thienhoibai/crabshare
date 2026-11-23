import { expect, paged, signIn, test } from './support/app'
import { CODE, batchOf, crabOf, deviceOf, mockOperator, sessionOf } from './support/operator'

test('chọn lô và quay lại danh sách trạm giữ nguyên thứ tự React hooks', async ({ api, page }) => {
  mockOperator(api)
  await signIn(page, 'OperatorMember')
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const selected = batchOf({ status: 'Harvesting' })
  api.get('/api/operators/me/batches', paged([selected]))
  api.get(`/api/operators/me/batches/${CODE}`, selected)
  api.get('/api/operators/me/devices', [deviceOf()])
  api.get(`/api/batches/${CODE}/measurement-sessions`, paged([]))
  api.get(`/api/batches/${CODE}/crab-units`, [])
  api.get('/api/operators/me/devices/ST-01/station-state', { fresh: false, receivedAt: null, state: null })
  api.get('/api/operators/me/devices/ST-01/wifi', null)

  await page.goto('/operator/devices')
  await expect(page.getByLabel('Tên Wi-Fi (SSID)')).toBeVisible()
  await expect(page.getByLabel('Mật khẩu Wi-Fi')).toBeVisible()
  await page.getByRole('button', { name: 'Chọn lô & vào trạm cân' }).click()
  await expect(page.getByRole('heading', { name: `Bắt đầu lượt đo · ${CODE}` })).toBeVisible()
  await page.getByRole('button', { name: 'Đổi lô cân' }).click()
  await page.getByRole('button', { name: 'Chọn lô & vào trạm cân' }).click()
  await expect(page.getByRole('heading', { name: `Bắt đầu lượt đo · ${CODE}` })).toBeVisible()
  expect(errors).toEqual([])
  expect(api.writes()).toEqual([])
})

test('tự nối lượt chỉ mở khi được chọn và dùng tiếp mã cua đã gắn', async ({ api, page }) => {
  mockOperator(api)
  await signIn(page, 'OperatorMember')
  const prefix = 'LA'
  const crabs = [crabOf('C-000103', '0103', { gradeAiPrefix: prefix, gradeAiTag: 'LA-001' }),
    crabOf('C-000104', '0104', { gradeAiPrefix: prefix, gradeAiTag: 'LA-002' })]
  let current: ReturnType<typeof sessionOf> | null = null
  let completed: ReturnType<typeof sessionOf> | null = null
  api.get('/api/operators/me/devices', [deviceOf()])
  api.get(`/api/batches/${CODE}/crab-units`, crabs)
  api.get('/api/operators/me/devices/ST-01/station-state', { fresh: true, receivedAt: new Date().toISOString(),
    state: { hardwareOnline: true, busy: false, completed: [], note: 'Chờ mở lượt đo' } })
  api.get('/api/operators/me/devices/ST-01/wifi', null)
  api.get(`/api/batches/${CODE}/measurement-sessions`, call => paged(call.query.status === 'Open'
    ? current ? [current] : [] : [...(current ? [current] : []), ...(completed ? [completed] : [])]))
  api.get('/api/measurement-sessions/FIRST/measurements', () => ({ session: completed, values: [], inferences: [], decision: null }))
  api.get(/^\/api\/operators\/me\/devices\/ST-01\/measurement-sessions\/[^/]+\/start$/, null)
  api.post('/api/measurement-sessions', call => {
    const body = call.body as { crabNumber: number }
    current = sessionOf({ sessionNo: body.crabNumber === 1 ? 'FIRST' : 'SECOND',
      gradeAiTag: `LA-${String(body.crabNumber).padStart(3, '0')}`, status: 'Open' })
    return current
  })

  await page.goto(`/operator/devices?batch=${CODE}`)
  await expect(page.getByRole('button', { name: 'Mở lượt LA-001', exact: true })).toBeVisible()
  expect(api.writes()).toEqual([])
  await page.getByRole('checkbox', { name: 'Tự nối lượt' }).check()
  await expect.poll(() => api.sent('POST', '/api/measurement-sessions').length).toBe(1)
  await expect(page.getByRole('button', { name: 'Bắt đầu cân LA-001' })).toBeVisible()
  completed = { ...current!, status: 'Measured', weightG: 300 }
  current = null
  await expect.poll(() => api.sent('POST', '/api/measurement-sessions').length, { timeout: 12000 }).toBe(2)
  const bodies = api.sent('POST', '/api/measurement-sessions').map(call => call.body as { gradeAiPrefix: string; crabNumber: number })
  expect(bodies.map(body => [body.gradeAiPrefix, body.crabNumber])).toEqual([['LA', 1], ['LA', 2]])
  expect(api.sent('POST', `/api/batches/${CODE}/gradeai-labels`)).toEqual([])
})
