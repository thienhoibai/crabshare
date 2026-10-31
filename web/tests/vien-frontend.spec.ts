import { expect, test, type Page } from '@playwright/test'

async function signIn(page: Page, roles = ['OperatorMember']) {
  await page.addInitScript(
    (roles) =>
      localStorage.setItem(
        'crabshare-auth',
        JSON.stringify({
          state: {
            token: 'ui-token',
            expiresAt: '2099-01-01T00:00:00Z',
            user: {
              userId: 1,
              email: 'ui@test.local',
              fullName: 'Viên',
              status: 'Active',
              roles,
              operatorId: 1
            }
          },
          version: 0
        })
      ),
    roles
  )
  await page.route('**/api/operators/me', (route) =>
    route.fulfill({
      json: {
        operatorId: 1,
        legalName: 'Trại Năm Căn',
        status: 'Approved',
        memberRole: 'Owner',
        canEdit: false,
        canSubmit: false
      }
    })
  )
}

test('cost items fit narrow screens and keep decimal rounding and category rules', async ({
  page
}, testInfo) => {
  await signIn(page)
  await page.goto('/operator/create-batch')
  const costs = page.getByRole('region', { name: 'Các khoản chi phí chuẩn' })
  await expect(costs).toBeVisible()
  await page.getByLabel('Số lượng 1', { exact: true }).fill('1.005')
  await page.getByLabel('Đơn giá 1', { exact: true }).fill('100')
  await expect(costs).toContainText('101 đ')
  await page.getByLabel('Hạng mục 1', { exact: true }).selectOption('Depreciation')
  await expect(page.getByLabel('Đợt 1', { exact: true })).toHaveCount(0)
  await expect(costs).toContainText('Quyết toán')
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await costs.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBeTruthy()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('cost-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 320, height: 900 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('cost-mobile.png'), fullPage: true })
})

test('box range previews the exact labels and count without sending a request', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/boxes?*', (route) =>
    route.fulfill({ json: { items: [], page: 1, pageSize: 50, total: 0 } })
  )
  await page.goto('/operator/boxes')
  await page.getByRole('button', { name: 'Tạo hàng loạt', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Từ số', { exact: true }).fill('7')
  await dialog.getByLabel('Đến số', { exact: true }).fill('9')
  await expect(dialog.getByRole('status')).toContainText('0007')
  await expect(dialog.getByRole('status')).toContainText('0009')
  await expect(dialog.getByRole('status')).toContainText('3 hộp')
  await dialog.getByLabel('Số chữ số', { exact: true }).fill('0')
  await expect(dialog.getByRole('button', { name: 'Tạo hộp', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Tạo hàng loạt', exact: true })).toBeFocused()
})

test('tag replacement locks the dialog during submission and keeps the reason after failure', async ({
  page
}) => {
  await signIn(page)
  const tag = {
    tagId: 1,
    tagCode: '23456789ABCD',
    batchCode: 'B-TAGS',
    itemUuid: 'CRAB-1',
    status: 'Printed',
    printedAt: '2026-10-30T00:00:00Z'
  }
  await page.route('**/api/tags?*', (route) =>
    route.fulfill({ json: { items: [tag], page: 1, pageSize: 20, total: 1 } })
  )
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let calls = 0
  await page.route('**/api/tags/23456789ABCD/void', async (route) => {
    calls++
    expect(route.request().postDataJSON()).toEqual({ reason: 'Tem bị rách' })
    await pending
    await route.fulfill({ status: 422, json: { detail: 'Trạng thái tem đã thay đổi.' } })
  })
  await page.goto('/operator/tags')
  await page.getByRole('button', { name: 'Hủy / thay', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Lý do (bắt buộc, tối đa 200 ký tự)').fill('Tem bị rách')
  await dialog.getByRole('button', { name: 'Xác nhận hủy và thay', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Đóng hộp thoại' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Đang hủy và thay…' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  release()
  await expect(dialog.getByRole('alert')).toContainText('Trạng thái tem đã thay đổi.')
  await expect(dialog.getByLabel('Lý do (bắt buộc, tối đa 200 ký tự)')).toHaveValue('Tem bị rách')
  expect(calls).toBe(1)
})

test('public trace uses Vietnamese event names and a readable fallback for new event types', async ({
  page
}, testInfo) => {
  await page.route('**/api/trace/23456789ABCD', (route) =>
    route.fulfill({
      json: {
        tagCode: '23456789ABCD',
        batchCode: 'B-TRACE',
        crabType: 'RoeCrab',
        itemStatus: 'InStock',
        weightG: 300,
        gradeCode: 'L2',
        gradeName: 'Cua Nhì',
        slotCode: 'A-001',
        stockedAt: '2026-09-01T00:00:00Z',
        harvestedAt: '2026-10-30T00:00:00Z',
        events: [
          { eventType: 'Delivered', occurredAt: '2026-10-31T00:00:00Z' },
          { eventType: 'TagVoided', occurredAt: '2026-10-31T00:30:00Z' },
          { eventType: 'FutureEvent', occurredAt: '2026-10-31T01:00:00Z' }
        ]
      }
    })
  )
  await page.goto('/truy-xuat/23456789ABCD')
  await expect(page.getByRole('heading', { name: 'Đã giao hàng', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Hủy tem truy xuất', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sự kiện sản phẩm', exact: true })).toBeVisible()
  await expect(page.getByText('FutureEvent', { exact: true })).toHaveCount(0)
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('trace-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 320, height: 900 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('trace-mobile.png'), fullPage: true })
})

test('submitted operator application explains the next step and stays read-only', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/operators/me', (route) =>
    route.fulfill({
      json: {
        operatorId: 1,
        legalName: 'Trại Năm Căn',
        taxCode: '1234567890',
        businessRegNo: 'DK-01',
        farmAddress: 'Năm Căn',
        status: 'Submitted',
        memberRole: 'Owner',
        canEdit: false,
        canSubmit: false
      }
    })
  )
  await page.goto('/operator/register')
  await expect(
    page.getByText('Hồ sơ đang chờ xét duyệt. Trạng thái sẽ tự cập nhật khi có kết quả.')
  ).toBeVisible()
  await expect(page.getByLabel('Tên pháp nhân')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Lưu và gửi hồ sơ' })).toHaveCount(0)
})

test('operator approval names the action and sends the entered capacity', async ({ page }) => {
  await signIn(page, ['PlatformAdmin'])
  const operator = {
    operatorId: 1,
    legalName: 'Trại Năm Căn',
    taxCode: '1234567890',
    businessRegNo: 'DK-01',
    farmAddress: 'Năm Căn',
    status: 'Submitted',
    approvedSlotCapacity: 0,
    approvedAt: null,
    submittedAt: '2026-10-30T00:00:00Z',
    approvedBy: null
  }
  await page.route('**/api/admin/operators?*', (route) =>
    route.fulfill({ json: { items: [operator], page: 1, pageSize: 10, total: 1 } })
  )
  let body: unknown
  await page.route('**/api/admin/operators/1/approve', (route) => {
    body = route.request().postDataJSON()
    return route.fulfill({ json: { ...operator, status: 'Approved', approvedSlotCapacity: 1200 } })
  })
  await page.goto('/admin/users?tab=operators')
  await page.getByRole('button', { name: 'Duyệt Trại Năm Căn', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Sức chứa được duyệt (ô nuôi)').fill('1200')
  await dialog.getByRole('button', { name: 'Xác nhận duyệt', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã duyệt hộ nuôi Trại Năm Căn.' })).toBeVisible()
  expect(body).toEqual({ approvedSlotCapacity: 1200 })
})
