import { expect, paged, signIn, test } from './support/app'
import { CODE, batchOf, deviceOf, mockOperator } from './support/operator'

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
  await page.getByRole('button', { name: 'Chọn lô & vào trạm cân' }).click()
  await expect(page.getByRole('heading', { name: `Bắt đầu lượt đo · ${CODE}` })).toBeVisible()
  await page.getByRole('button', { name: 'Đổi lô cân' }).click()
  await page.getByRole('button', { name: 'Chọn lô & vào trạm cân' }).click()
  await expect(page.getByRole('heading', { name: `Bắt đầu lượt đo · ${CODE}` })).toBeVisible()
  expect(errors).toEqual([])
  expect(api.writes()).toEqual([])
})
