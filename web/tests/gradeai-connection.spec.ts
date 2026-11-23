import { expect, reply, signIn, test } from './support/app'
import { mockOperator } from './support/operator'

test('chờ Pi tự chuyển sang Wi-Fi và đánh dấu thông tin cũ khi mất mạng', async ({ api, page }) => {
  mockOperator(api)
  await signIn(page, 'OperatorMember')
  let report = { receivedAt: null as string | null, fresh: false, state: null as object | null }
  api.get('/api/operators/me/devices/ST-01/station-state', () => report)
  api.get('/api/operators/me/devices/ST-01/wifi', null)
  await page.goto('/operator/devices')
  const connection = page.getByRole('region', { name: 'Kết nối thiết bị' })
  await expect(connection.getByText('Đang chờ Pi kết nối…', { exact: true })).toBeVisible()
  await expect(connection.locator('.ga-connect-spinner')).toBeVisible()
  await expect(connection).toHaveAttribute('aria-busy', 'true')
  report = { receivedAt: new Date().toISOString(), fresh: true, state: {
    hardwareOnline: true, connectionType: 'wifi', networkInterface: 'wlan0', networkIp: '192.168.1.94',
  } }
  await expect(connection.getByText('Thiết bị đã kết nối', { exact: true })).toBeVisible()
  await expect(connection.getByText('Đường truyền: Wi-Fi', { exact: true })).toBeVisible()
  await expect(connection.getByText('IP Pi: 192.168.1.94', { exact: true })).toBeVisible()
  report = { ...report, fresh: false }
  await expect(connection.getByText('Đường truyền lần gần nhất: Wi-Fi', { exact: true })).toBeVisible()
  await expect(connection).toHaveAttribute('aria-busy', 'true')
  expect(api.writes()).toEqual([])
})

test('báo lỗi máy chủ riêng, kiểm tra lại nhận đúng LAN', async ({ api, page }) => {
  mockOperator(api)
  await signIn(page, 'OperatorMember')
  const path = '/api/operators/me/devices/ST-01/station-state'
  api.get(path, reply(503, { detail: 'Không kết nối được BE' }))
  api.get('/api/operators/me/devices/ST-01/wifi', null)
  await page.goto('/operator/devices')
  const connection = page.getByRole('region', { name: 'Kết nối thiết bị' })
  await expect(connection.getByText('Chưa liên lạc được với máy chủ', { exact: true })).toBeVisible()
  api.get(path, { fresh: true, receivedAt: new Date().toISOString(), state: {
    hardwareOnline: true, connectionType: 'ethernet', networkInterface: 'eth0', networkIp: '192.168.137.2',
  } })
  await connection.getByRole('button', { name: 'Kiểm tra lại kết nối' }).click()
  await expect(connection.getByText('Đường truyền: LAN (dây mạng)', { exact: true })).toBeVisible()
  await expect(connection.getByText(/SSH: truy cập quản trị/)).toBeVisible()
  expect(api.writes()).toEqual([])
})
