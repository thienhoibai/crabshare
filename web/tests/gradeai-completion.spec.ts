import { expect, paged, reply, signIn, test } from './support/app'
import { CODE, decisionOf, deviceOf, measurementsOf, mockOperator, sessionOf } from './support/operator'
import type { SessionMeasurementsResponse, SessionResponse } from '../src/shared/api/api.gen'

test('cân mới tự mở popup đúng mã, cập nhật phân hạng, xếp hàng và không bật lại khi poll trên điện thoại', async ({ api, page }) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 390, height: 844 })
  mockOperator(api)
  await signIn(page, 'OperatorMember')
  const old = sessionOf({ sessionNo: 'OLD', status: 'Measured', weightG: 200, gradeAiTag: 'LA-000' })
  let current = sessionOf({ sessionNo: 'NEW', crabCode: 'C-000101', gradeAiTag: 'LA-001' })
  let records: SessionResponse[] = [current, old]
  let result: SessionMeasurementsResponse = measurementsOf(current)
  const second = sessionOf({ sessionNo: 'SECOND', crabCode: 'C-000102', gradeAiTag: 'LA-002', status: 'Measured', weightG: 501, tofMm: 80 })
  api.get('/api/operators/me/devices', [deviceOf()])
  api.get('/api/operators/me/devices/ST-01/station-state', { fresh: false, receivedAt: null, state: null })
  api.get('/api/operators/me/devices/ST-01/wifi', null)
  api.get('/api/operators/me/devices/ST-01/measurement-sessions/NEW/start', null)
  api.get(`/api/batches/${CODE}/measurement-sessions`, call => paged(call.query.status === 'Open' ? records.filter(s => s.status === 'Open') : records))
  api.get('/api/measurement-sessions/OLD/measurements', measurementsOf(old))
  api.get('/api/measurement-sessions/NEW/measurements', () => result)
  api.get('/api/measurement-sessions/SECOND/measurements', measurementsOf(second))

  await page.goto(`/operator/devices?batch=${CODE}`)
  await expect(page.getByRole('button', { name: 'Xem kết quả lượt gần nhất' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  current = { ...current, status: 'Received', weightG: 452, tofMm: 65, hasWhiteImage: true, hasRedImage: true }
  records = [current, old]
  result = measurementsOf(current)
  const popup = page.getByRole('dialog', { name: 'Kết quả cân · LA-001', exact: true })
  await expect(popup).toBeVisible({ timeout: 12000 })
  await expect(popup).toContainText('452 g')
  await expect(popup).toContainText('65 mm')
  await expect(popup).toContainText('Đang xử lý ảnh và đề xuất phân hạng')
  await expect(popup.getByRole('img', { name: 'Ảnh trắng · LA-001', exact: true })).toBeVisible()
  await expect(popup.getByRole('img', { name: 'Ảnh soi · LA-001', exact: true })).toBeVisible()
  await expect(popup).not.toContainText('LA-000')
  current = { ...current, status: 'Measured' }
  records = [current, old]
  result = measurementsOf(current, { decision: decisionOf({ sessionNo: 'NEW', proposedCLevel: 'G1', status: 'Hold', holdReasons: ['NearThreshold'] }) })
  await expect(popup).toContainText('Cấp 1', { timeout: 12000 })
  await expect(popup).toContainText('Số đo sát ngưỡng')
  await expect(popup.getByText('9,4 cm', { exact: true })).toBeVisible()
  const grading = await popup.getByText('Phân cỡ đề xuất', { exact: true }).boundingBox()
  const weight = await popup.getByText('Cân nặng', { exact: true }).boundingBox()
  const photo = await popup.getByRole('img', { name: 'Ảnh trắng · LA-001', exact: true }).boundingBox()
  expect(grading!.y).toBeLessThan(weight!.y)
  expect(weight!.y).toBeLessThan(photo!.y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('popup-mobile.png') })

  records = [second, current, old]
  await expect(popup).toContainText('Còn 1 kết quả mới đang chờ xem.', { timeout: 12000 })
  await popup.getByRole('button', { name: 'Xem kết quả tiếp theo' }).click()
  const next = page.getByRole('dialog', { name: 'Kết quả cân · LA-002', exact: true })
  await expect(next).toContainText('501 g')
  await expect(next).toContainText('80 mm')
  await expect(next).not.toContainText('LA-001')
  await next.getByRole('button', { name: 'Đóng kết quả', exact: true }).click()
  const pollCount = api.sent('GET', `/api/batches/${CODE}/measurement-sessions`).length
  await expect.poll(() => api.sent('GET', `/api/batches/${CODE}/measurement-sessions`).length, { timeout: 10000 }).toBeGreaterThan(pollCount + 2)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const resultCard = page.getByRole('region', { name: 'Đánh giá phân hạng cua', exact: true })
  await expect(resultCard.getByRole('img', { name: 'Ảnh trắng · LA-001', exact: true })).toBeVisible()
  await expect(resultCard).toContainText('65 mm')
  await page.getByRole('button', { name: 'Xem kết quả lượt gần nhất' }).click()
  await expect(next).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(api.writes()).toEqual([])
})

test('popup xem lại xử lý lỗi API rồi thử lại và thiếu ảnh mà không tự cân hoặc duyệt QC', async ({ api, page }) => {
  mockOperator(api)
  await signIn(page, 'OperatorMember')
  const session = sessionOf({ sessionNo: 'SAVED', gradeAiTag: 'LA-003', status: 'Measured', weightG: 333, tofMm: null })
  let unavailable = true
  api.get('/api/operators/me/devices', [deviceOf()])
  api.get('/api/operators/me/devices/ST-01/station-state', { fresh: false, receivedAt: null, state: null })
  api.get('/api/operators/me/devices/ST-01/wifi', null)
  api.get(`/api/batches/${CODE}/measurement-sessions`, call => paged(call.query.status === 'Open' ? [] : [session]))
  api.get('/api/measurement-sessions/SAVED/measurements', () => unavailable ? reply(503, { detail: 'Chưa nhận được kết quả' }) : measurementsOf(session))
  await page.goto(`/operator/devices?batch=${CODE}`)
  await page.getByRole('button', { name: 'Xem kết quả lượt gần nhất' }).click()
  const popup = page.getByRole('dialog', { name: 'Kết quả cân · LA-003', exact: true })
  await expect(popup).toContainText('Không tải được kết quả', { timeout: 12000 })
  await expect(popup).toContainText('333 g')
  await expect(popup.getByText('Lượt này chưa có ảnh', { exact: true })).toHaveCount(2)
  unavailable = false
  await popup.getByRole('button', { name: 'Thử lại', exact: true }).click()
  await expect(popup).toContainText('Chưa có đề xuất')
  await expect(popup).not.toContainText('Không tải được kết quả')
  expect(api.writes()).toEqual([])
})
