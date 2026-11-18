import type { SettlementResponse, SettlementSummary } from '../src/shared/api/api.gen'
import { daysFromNow, expect, signIn, test, vnd } from './support/app'
import { fact, mockInvestor, settlementDone, settlementPaid } from './support/investor'

test.beforeEach(async ({ page, api }) => {
  mockInvestor(api)
  await signIn(page, 'Investor')
})

// A published or approved statement is not evidence that this investor's payment succeeded.
for (const scenario of [
  { status: 'Proposed', payout: null, amountLabel: 'Phần của tôi theo bảng' },
  { status: 'Approved', payout: 'Pending', amountLabel: 'Số được nhận đã duyệt' },
  { status: 'PaidOut', payout: 'Failed', amountLabel: 'Số được nhận đã duyệt' },
  { status: 'Approved', payout: 'Succeeded', amountLabel: 'Tôi thực nhận' },
]) {
  test(`chi tiết ${scenario.status}, lệnh chi ${scenario.payout ?? 'chưa có'} diễn đạt đúng số tiền của tôi`, async ({ page, api }) => {
    const statement: SettlementResponse = {
      ...settlementDone,
      status: scenario.status,
      feedbackDeadline: scenario.status === 'Proposed' ? daysFromNow(5) : null,
      lines: [{ ...settlementDone.lines[0], payoutStatus: scenario.payout }],
    }
    api.get('/api/settlements/31', statement)
    await page.goto('/nha-dau-tu/quyet-toan/31', { waitUntil: 'domcontentloaded' })
    await expect(fact(page, scenario.amountLabel)).toContainText(vnd(21_757_500))
    if (scenario.payout !== 'Succeeded') await expect(page.getByText('Tôi thực nhận', { exact: true })).toHaveCount(0)
  })
}

test('mở bảng quyết toán bằng liên kết và phím Enter trên desktop', async ({ page }) => {
  await page.goto('/nha-dau-tu/quyet-toan', { waitUntil: 'domcontentloaded' })
  const link = page.locator('.inv-settlement-table').getByRole('link', { name: /Cua gạch Đầm Dơi tháng 9/ })
  await expect(link).toHaveAttribute('href', '/nha-dau-tu/quyet-toan/31')
  await link.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/nha-dau-tu\/quyet-toan\/31$/)
  await expect(page.getByRole('heading', { name: settlementDone.batchTitle, level: 1 })).toBeVisible()
})

test('trên điện thoại đọc đủ tên lô, số tiền theo bảng và mở đúng quyết toán', async ({ page, api }) => {
  const proposed: SettlementSummary = { ...settlementPaid, status: 'Proposed', feedbackOpen: true, feedbackDeadline: daysFromNow(5) }
  api.get('/api/me/settlements', [proposed])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/nha-dau-tu/quyet-toan', { waitUntil: 'domcontentloaded' })
  const card = page.locator('.inv-settlement-list').getByRole('listitem')
  await expect(card).toBeVisible()
  await expect(card.getByRole('heading', { name: settlementPaid.batchTitle })).toBeVisible()
  await expect(card.getByText('P-2608-02', { exact: true })).toBeVisible()
  await expect(fact(card, 'Phần của tôi theo bảng')).toContainText(vnd(21_757_500))
  await expect(card).not.toContainText('thực nhận')
  await expect(page.locator('.inv-settlement-table')).toBeHidden()
  expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await card.getByRole('link', { name: 'Xem quyết toán' }).click()
  await expect(page).toHaveURL(/\/nha-dau-tu\/quyet-toan\/31$/)
})
