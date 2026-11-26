import { expect, paged, signIn, test } from './support/app'
import { CODE, crabOf, deviceOf, measurementsOf, mockOperator, sessionOf } from './support/operator'

for (const busy of [false, true]) test(`cân lại giữ mã và lịch sử, trạm bận=${busy}`, async ({ api, page }) => {
  mockOperator(api)
  await signIn(page, 'OperatorMember')
  const old = sessionOf({ sessionNo: 'OLD', crabCode: 'C-000103', gradeAiTag: 'LA-001', status: 'Measured', weightG: 300 })
  let active: ReturnType<typeof sessionOf> | null = null
  api.get('/api/operators/me/devices', [deviceOf()])
  api.get('/api/operators/me/devices/ST-01/station-state', { fresh: true, receivedAt: new Date().toISOString(), state: { hardwareOnline: true, busy, completed: [] } })
  api.get('/api/operators/me/devices/ST-01/wifi', null)
  api.get(`/api/batches/${CODE}/crab-units`, [crabOf('C-000103', '0103', { gradeAiPrefix: 'LA', gradeAiTag: 'LA-001' })])
  api.get(`/api/batches/${CODE}/measurement-sessions`, call => paged(call.query.status === 'Open' ? active ? [active] : [] : [...(active ? [active] : []), old]))
  api.get('/api/measurement-sessions/OLD/measurements', measurementsOf(old))
  api.get('/api/operators/me/devices/ST-01/measurement-sessions/REPEAT/start', null)
  api.post('/api/measurement-sessions/OLD/remeasure', call => {
    expect(call.body).toEqual({ stationCode: 'ST-01' })
    active = sessionOf({ sessionNo: 'REPEAT', crabCode: old.crabCode, gradeAiTag: old.gradeAiTag })
    return active
  })
  await page.goto(`/operator/devices?batch=${CODE}`)
  const repeat = page.getByRole('button', { name: 'Cân lại LA-001', exact: true })
  await expect(repeat).toBeVisible({ timeout: 12000 })
  if (busy) {
    await expect(repeat).toBeDisabled()
    expect(api.writes()).toEqual([])
    return
  }
  await repeat.click()
  const modal = page.getByRole('dialog', { name: 'Cân lại · LA-001' })
  await expect(modal).toContainText('Số cân và ảnh cũ được giữ')
  expect(api.writes()).toEqual([])
  await modal.getByRole('button', { name: 'Mở lượt cân lại' }).click()
  await expect(modal).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Bắt đầu cân LA-001' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'OLD' })).toContainText('300 g')
  await expect(page.getByRole('row').filter({ hasText: 'REPEAT' })).toContainText('LA-001')
  expect(api.sent('POST', '/api/measurement-sessions/OLD/remeasure')).toHaveLength(1)
  expect(api.writes()).toHaveLength(1)
})
