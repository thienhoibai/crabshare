import { test, expect, type Page } from '@playwright/test'

const batch = {
  batchCode: 'VI07-TEST', operatorId: 1, title: 'Lô cua thử thả giống', crabType: 'SoftShellCrab', seedQuantity: 2,
  expectedOutputKg: 10, cycleDays: 90, restockCutoffDays: 10, minViableCapital: 100, targetCapital: 200,
  maxCapital: 300, minContribution: 10, operatorSharePct: 7, status: 'Funding', canEdit: false, canSubmit: false,
  standardCost: null, offtakePrices: [], canStock: true, stockingBlockedReason: null, stockedAt: null,
}

async function setup(page: Page, ready = true, memberRole = 'Owner') {
  await page.addInitScript(() => localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token: 'test-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 1, fullName: 'Viên', email: 'test@local', status: 'Active', roles: ['OperatorMember'], operatorId: 1 } }, version: 0 })))
  await page.route('**/api/operators/me', route => route.fulfill({ json: { operatorId: 1, legalName: 'Trại thử', status: 'Approved', memberRole, canEdit: false, canSubmit: false } }))
  let stocked = false
  await page.route('**/api/operators/me/batches/VI07-TEST', route => route.fulfill({ json: { ...batch, canStock: ready && !stocked, status: stocked ? 'InProduction' : 'Funding', stockingBlockedReason: ready ? null : 'Lô chưa hoàn tất chốt vốn và hợp đồng.' } }))
  return () => { stocked = true }
}

test('stocks the chosen range after confirmation and reloads the actual batch', async ({ page }, testInfo) => {
  const markStocked = await setup(page)
  let calls = 0
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  await page.route('**/api/batches/VI07-TEST/stocking', async route => {
    calls++
    expect(route.request().postDataJSON()).toEqual({ range: { from: 1, to: 2, width: 4 } })
    await pending
    markStocked()
    await route.fulfill({ json: { batchCode: 'VI07-TEST', createdCrabs: 2, status: 'InProduction' } })
  })
  await page.goto('/operator/batch/detail?code=VI07-TEST')
  await expect(page.getByRole('heading', { name: batch.title })).toBeVisible()
  await page.getByRole('button', { name: 'Thả giống', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Mỗi hộp chứa 1 con cua. Chỉ xác nhận sau khi đã thả giống thực tế.')).toBeVisible()
  await expect(dialog.getByText('0001–0002')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('stocking-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('stocking-mobile.png'), fullPage: true })
  await dialog.getByRole('button', { name: 'Tiếp tục' }).click()
  expect(calls).toBe(0)
  const confirm = dialog.getByRole('button', { name: 'Xác nhận đã thả giống' })
  await confirm.click()
  await expect(dialog.getByRole('button', { name: 'Đang ghi nhận…' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Đóng hộp thoại' })).toBeDisabled()
  finish()
  await expect(page.getByRole('status').filter({ hasText: 'Đã tạo 2 con cua' })).toBeVisible()
  await expect(page.getByText('Đang sản xuất', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thả giống', exact: true })).toHaveCount(0)
  expect(calls).toBe(1)
})

test('validates count locally and displays server conflicts with the form still open', async ({ page }) => {
  await setup(page)
  await page.route('**/api/batches/VI07-TEST/stocking', route => route.fulfill({ status: 422, json: { code: 'stocking.slot_unavailable', detail: 'Hộp 0002 đã được dùng. Vui lòng chọn lại.' } }))
  await page.goto('/operator/batch/detail?code=VI07-TEST')
  await page.getByRole('button', { name: 'Thả giống', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Số hộp cuối').fill('1')
  await expect(dialog.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled()
  await dialog.getByLabel('Số hộp cuối').fill('2')
  await dialog.getByRole('button', { name: 'Tiếp tục' }).click()
  await dialog.getByRole('button', { name: 'Xác nhận đã thả giống' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Hộp 0002 đã được dùng')
  await expect(dialog).toBeVisible()
})

test('hides stocking for an unready batch and handles a missing batch code', async ({ page }) => {
  await setup(page, false)
  await page.goto('/operator/batch/detail?code=VI07-TEST')
  await expect(page.getByRole('heading', { name: batch.title })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thả giống', exact: true })).toHaveCount(0)
  await page.goto('/operator/batch/detail')
  await expect(page.getByRole('alert')).toContainText('Chưa chọn lô')
  await expect(page.getByRole('link', { name: /Quay lại danh sách lô/ })).toBeVisible()
})

test('staff cannot see the stocking action even if stale cached data claims readiness', async ({ page }) => {
  await setup(page, true, 'Staff')
  await page.goto('/operator/batch/detail?code=VI07-TEST')
  await expect(page.getByRole('heading', { name: batch.title })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thả giống', exact: true })).toHaveCount(0)
})
