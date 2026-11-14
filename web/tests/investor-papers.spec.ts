/* Ba trang giấy tờ của nhà đầu tư: /nha-dau-tu/bieu-quyet (biểu quyết tập thể của các Lô đã chốt vốn), /nha-dau-tu/hop-dong (hợp đồng góp vốn),
   /nha-dau-tu/quyet-toan và /nha-dau-tu/quyet-toan/:id (bảng quyết toán đã công bố, góp ý trong hạn). */
import type { ContractResponse, ContractSummary, DecisionResponse, SettlementFeedbackRequest, SettlementResponse, SettlementSummary } from '../src/shared/api/api.gen'
import { daysFromNow, expect, reply, signIn, test, vnd } from './support/app'
import {
  DONE, LEGAL_NOTICE, OPEN, RUN, closed, contractDetail, contractToSign, contracts, decisionOpen, decisionPassed, fact, investor, mockInvestor, more, panel,
  PDF, running, settlementDone, settlementPaid, viDateTime,
} from './support/investor'

test.beforeEach(async ({ page, api }) => {
  mockInvestor(api)
  await signIn(page, 'Investor')
})

test.describe('biểu quyết', () => {
  test('gom các cuộc biểu quyết của mọi Lô đã chốt vốn, tách đang mở và đã kết thúc; bỏ phiếu ngay tại trang', async ({ page, api }) => {
    const path = `/api/decisions/${decisionOpen.decisionNo}/votes`
    let decisions: DecisionResponse[] = [decisionPassed, decisionOpen]
    api.get(`/api/batches/${RUN}/decisions`, () => decisions)
    api.post(path, () => {
      const voted: DecisionResponse = { ...decisionOpen, myChoice: 'No', canVote: false, noCapital: 50_000_000, noPct: 25 }
      decisions = [decisionPassed, voted]
      return voted
    })
    await page.goto('/nha-dau-tu/bieu-quyet')
    await expect(page.getByRole('heading', { name: 'Biểu quyết', level: 1 })).toBeVisible()

    // Mục Đang mở đếm số cuộc tôi còn được bỏ phiếu; tên Lô nằm trong tiêu đề từng cuộc.
    const openTab = page.getByRole('tab', { name: /^Đang mở/ })
    await expect(openTab).toHaveAttribute('aria-selected', 'true')
    await expect(openTab).toContainText('1')
    const current = panel(page, `Thanh lý sớm · Lô ${RUN}`)
    await expect(current.getByText(decisionOpen.proposal)).toBeVisible()
    await expect(page.getByText('Bán phần dư')).toHaveCount(0)

    await current.getByRole('button', { name: 'Không đồng ý' }).click()
    await page.getByRole('dialog', { name: 'Biểu quyết: Không đồng ý' }).getByRole('button', { name: 'Gửi phiếu không đồng ý' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Đã ghi nhận phiếu của bạn.' })).toBeVisible()
    await expect(current.getByText('Bạn đã chọn: Không đồng ý')).toBeVisible()
    await expect(current.getByText(`${vnd(50_000_000)} · 25%`)).toBeVisible()
    await expect(current.getByRole('button')).toHaveCount(0)
    await expect(openTab).toHaveText('Đang mở')
    expect(api.sent('POST', path).map((c) => c.body)).toEqual([expect.objectContaining({ choice: 'No' })])

    await page.getByRole('tab', { name: 'Đã kết thúc' }).click()
    const past = panel(page, `Bán phần dư · Lô ${RUN}`)
    await expect(past.getByText('Thông qua', { exact: true })).toBeVisible()
    await expect(past.getByText('Bạn đã chọn: Đồng ý')).toBeVisible()
    await expect(page.getByText('Thanh lý sớm')).toHaveCount(0)

    // Chỉ hỏi biểu quyết của Lô đã chốt vốn (RUN, DONE), không hỏi Lô còn gọi vốn.
    expect(api.sent('GET', '/api/investor/portfolio').map((c) => c.query)).toContainEqual({ pageSize: '100' })
    expect([...new Set(api.sent('GET', /\/decisions$/).map((c) => c.path))].sort()).toEqual([`/api/batches/${DONE}/decisions`, `/api/batches/${RUN}/decisions`])
  })

  test('một Lô không tải được biểu quyết thì báo số Lô lỗi; không có cuộc nào thì nói rõ', async ({ page, api }) => {
    api.get(`/api/batches/${RUN}/decisions`, () => reply(500, { status: 500, detail: 'Máy chủ đang bận.' }))
    await page.goto('/nha-dau-tu/bieu-quyet')
    await expect(page.getByText('Chưa tải được biểu quyết của 1 Lô.')).toBeVisible()
    await expect(page.getByText('Không có cuộc biểu quyết nào đang mở')).toBeVisible()
    await page.getByRole('tab', { name: 'Đã kết thúc' }).click()
    await expect(page.getByText('Chưa có cuộc biểu quyết nào đã kết thúc')).toBeVisible()
  })
})

test.describe('hợp đồng', () => {
  test('mở sẵn hợp đồng đang chờ tôi ký; ký xong thì danh sách và hợp đồng cùng chuyển sang đủ chữ ký', async ({ page, api }) => {
    let list: ContractSummary[] = contracts
    let detail: ContractResponse = contractDetail(contractToSign)
    api.get('/api/me/contracts', () => list)
    api.get('/api/contracts/731', () => detail)
    api.post('/api/contracts/731/sign', () => {
      const signed: ContractSummary = { ...contractToSign, status: 'FullySigned', nextSigner: null, fullySignedAt: daysFromNow(0) }
      list = contracts.map((c) => (c.contractId === 731 ? signed : c))
      return (detail = contractDetail(signed))
    })
    await page.goto('/nha-dau-tu/hop-dong')
    await expect(page.getByRole('heading', { name: 'Hợp đồng', level: 1 })).toBeVisible()

    const rows = page.getByRole('row').filter({ has: page.getByRole('cell') })
    await expect(rows).toHaveCount(4)
    const waiting = rows.filter({ hasText: 'HD-2611-0731' })
    await expect(waiting).toContainText(`Lô ${OPEN}`)
    await expect(waiting).toContainText(vnd(10_000_000))
    await expect(waiting.getByText('Tới lượt bạn ký')).toBeVisible()
    await expect(waiting.getByRole('button', { name: 'Xem và ký' })).toBeVisible()
    await expect(rows.filter({ hasText: 'HD-2610-0412' }).getByText('Đủ chữ ký')).toBeVisible()

    const viewer = panel(page, 'Hợp đồng HD-2611-0731')
    await expect(viewer.getByText(LEGAL_NOTICE)).toBeVisible()
    await expect(fact(viewer, 'Vốn góp')).toContainText(vnd(10_000_000))
    await expect(viewer.getByRole('listitem')).toHaveText([/Người nuôi: Trại cua Tư Bền.*Đã ký/, /Nhà đầu tư: Lê Minh Khôi.*Đang chờ ký/])
    await expect(viewer.getByTitle('Hợp đồng HD-2611-0731')).toBeVisible()

    await viewer.getByRole('button', { name: 'Ký số hợp đồng' }).click()
    const signing = page.getByRole('dialog', { name: 'Ký số hợp đồng HD-2611-0731' })
    await expect(signing).toContainText(`Lô ${OPEN} · vốn góp ${vnd(10_000_000)}`)
    expect(api.writes()).toEqual([])
    await signing.getByRole('button', { name: 'Ký số', exact: true }).click()

    // Ký xong hợp đồng vẫn mở (được ghim lên ?id=) để thấy kết quả, dù không còn là hợp đồng chờ tôi ký.
    await expect(signing).toHaveCount(0)
    await expect(page).toHaveURL(/\/nha-dau-tu\/hop-dong\?id=731$/)
    await expect(viewer.getByRole('listitem')).toHaveText([/Người nuôi.*Đã ký/, /Nhà đầu tư: Lê Minh Khôi.*Đã ký/])
    await expect(viewer.getByRole('button', { name: 'Ký số hợp đồng' })).toHaveCount(0)
    await expect(waiting.getByText('Đủ chữ ký')).toBeVisible()
    await expect(page.getByText('Tới lượt bạn ký')).toHaveCount(0)
    expect(api.writes()).toEqual(['POST /api/contracts/731/sign'])
  })

  test('?id= mở đúng hợp đồng đã đủ chữ ký; bấm Xem đổi hợp đồng; tải PDF qua endpoint cần đăng nhập', async ({ page, api }) => {
    await page.goto('/nha-dau-tu/hop-dong?id=412')
    const viewer = panel(page, 'Hợp đồng HD-2610-0412')
    await expect(fact(viewer, 'Lô')).toContainText(RUN)
    await expect(viewer.getByRole('listitem')).toHaveText([/Người nuôi: HTX Năm Căn.*Đã ký/, /Nhà đầu tư: Lê Minh Khôi.*Đã ký/])
    await expect(viewer.getByRole('button', { name: 'Ký số hợp đồng' })).toHaveCount(0)
    const technical = more(viewer, 'Chi tiết kỹ thuật')
    await technical.locator('summary').click()
    await expect(fact(technical, 'Cách ký')).toContainText('Ký số')
    await expect(technical.getByText('f6'.repeat(32))).toBeVisible()

    await page.getByRole('row').filter({ hasText: 'HD-2610-0415' }).getByRole('button', { name: 'Xem', exact: true }).click()
    await expect(page).toHaveURL(/\/nha-dau-tu\/hop-dong\?id=415$/)
    await expect(panel(page, 'Hợp đồng HD-2610-0415')).toBeVisible()

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Tải PDF hợp đồng HD-2608-0208' }).click()
    expect((await download).suggestedFilename()).toBe('HD-2608-0208.pdf')
    expect(api.sent('GET', '/api/contracts/208/file').map((c) => c.auth)).toEqual(['Bearer test-token'])
    expect(api.writes()).toEqual([])
  })

  test('khoản góp hết thời gian giữ chỗ: không còn "tới lượt bạn ký", hợp đồng nói rõ không ký được và dẫn đi góp lại', async ({ page, api }) => {
    const expired: ContractSummary = { ...contractToSign, contributionStatus: 'Expired' }
    api.get('/api/me/contracts', [expired, ...contracts.slice(1)])
    api.get('/api/contracts/731', contractDetail(expired, { canSign: false }))
    api.get('/api/contracts/731/file', PDF)
    await page.goto('/nha-dau-tu/hop-dong?id=731')

    const row = page.getByRole('row').filter({ hasText: expired.contractNo })
    await expect(row).toContainText('Hết hạn giữ chỗ')
    await expect(row).not.toContainText('Tới lượt bạn ký')
    await expect(row.getByRole('button', { name: 'Xem', exact: true })).toBeVisible()

    const detail = panel(page, `Hợp đồng ${expired.contractNo}`)
    await expect(detail).toContainText('Khoản góp đã hết thời gian giữ chỗ nên hợp đồng này không ký được nữa.')
    await expect(detail.getByRole('link', { name: `Góp lại vào Lô ${OPEN}` })).toHaveAttribute('href', `/nha-dau-tu/gop-von/${OPEN}`)
    await expect(detail.getByRole('button', { name: 'Ký số hợp đồng' })).toHaveCount(0)
    expect(api.writes()).toEqual([])
  })

  test('chưa có hợp đồng nào thì dẫn sang Lô đang gọi vốn', async ({ page, api }) => {
    api.get('/api/me/contracts', [])
    await page.goto('/nha-dau-tu/hop-dong')
    await expect(page.getByText('Bạn chưa có hợp đồng nào')).toBeVisible()
    await expect(page.getByRole('main').getByRole('link', { name: 'Xem Lô đang gọi vốn' })).toHaveAttribute('href', '/nha-dau-tu/lo')
    expect(api.sent('GET', /^\/api\/contracts\//)).toEqual([])
  })
})

test.describe('quyết toán', () => {
  /** Bảng của Lô RUN vừa công bố, còn 5 ngày góp ý. */
  const proposed: SettlementResponse = {
    ...settlementDone, settlementId: 32, batchCode: RUN, batchTitle: running.batch.title, operatorName: running.batch.operatorName, batchStatus: 'Settling',
    status: 'Proposed', feedbackDeadline: daysFromNow(5), approvedAt: null,
    lines: [{ ...settlementDone.lines[0], settlementLineId: 3201, capitalReturn: 30_000_000, profitShare: 1_200_000, taxWithheld: 60_000, netPayout: 31_140_000, payoutStatus: null }],
  }
  const proposedRow: SettlementSummary = {
    ...settlementPaid, settlementId: 32, batchCode: RUN, batchTitle: running.batch.title, status: 'Proposed', myNetPayout: 31_140_000,
    feedbackDeadline: proposed.feedbackDeadline, feedbackOpen: true,
  }

  test('danh sách bảng quyết toán đã công bố; bấm một dòng để mở bảng', async ({ page, api }) => {
    api.get('/api/me/settlements', [proposedRow, settlementPaid])
    await page.goto('/nha-dau-tu/quyet-toan')
    await expect(page.getByRole('heading', { name: 'Quyết toán', level: 1 })).toBeVisible()
    await expect(page.getByRole('columnheader')).toHaveText(['Lô', 'Trạng thái', 'Tôi thực nhận', 'Góp ý'])

    const rows = page.getByRole('row').filter({ has: page.getByRole('cell') })
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText(RUN)
    await expect(rows.nth(0)).toContainText('Đang lấy góp ý')
    await expect(rows.nth(0)).toContainText(vnd(31_140_000))
    await expect(rows.nth(0)).toContainText(`Tới ${viDateTime(proposedRow.feedbackDeadline!)}`)
    await expect(rows.nth(1)).toContainText(closed.batch.title)
    await expect(rows.nth(1)).toContainText('Đã chi trả')
    await expect(rows.nth(1)).toContainText(vnd(21_757_500))

    await rows.nth(1).click()
    await expect(page).toHaveURL(/\/nha-dau-tu\/quyet-toan\/31$/)
    await expect(page.getByRole('heading', { name: closed.batch.title, level: 1 })).toBeVisible()
  })

  test('chưa có bảng nào được công bố', async ({ page, api }) => {
    api.get('/api/me/settlements', [])
    await page.goto('/nha-dau-tu/quyet-toan')
    await expect(page.getByText('Chưa có bảng quyết toán nào được công bố')).toBeVisible()
  })

  test('sao kê đã chi trả: bốn số của tôi, các bước tính của Lô và dòng của tôi; hết hạn thì không còn góp ý', async ({ page, api }) => {
    await page.goto('/nha-dau-tu/quyet-toan/31')
    await expect(page.getByRole('heading', { name: closed.batch.title, level: 1 })).toBeVisible()
    await expect(page.getByText(`${DONE} · lần tính 1`)).toBeVisible()
    await expect(page.getByRole('main').getByText('Đã chi trả', { exact: true })).toBeVisible()

    await expect(fact(page, 'Vốn hoàn')).toContainText(vnd(20_000_000))
    await expect(fact(page, 'Phần chia')).toContainText(vnd(1_850_000))
    await expect(fact(page, 'Tôi thực nhận')).toContainText(vnd(21_757_500))
    await expect(fact(page, 'Chi trả')).toContainText('Thành công')

    const statement = panel(page, 'Bảng quyết toán của Lô')
    await expect(fact(statement, 'Đơn đặt trước đã nghiệm thu')).toContainText(vnd(170_000_000))
    await expect(fact(statement, 'Cọc khách bị mất')).toContainText(vnd(3_000_000))
    await expect(fact(statement, 'Doanh thu thực thu')).toContainText(vnd(220_000_000))
    await expect(fact(statement, 'Phí nền tảng (3%)')).toContainText(vnd(-6_600_000))
    await expect(fact(statement, 'Chi phí được trừ')).toContainText(vnd(-190_275_000))
    await expect(fact(statement, 'Còn lại sau phí và chi phí')).toContainText(vnd(23_125_000))
    await expect(fact(statement, 'Thù lao người nuôi (20%)')).toContainText(vnd(-4_625_000))
    await expect(fact(statement, 'Chia cho nhà đầu tư')).toContainText(vnd(18_500_000))
    await expect(fact(statement, 'Cua chết')).toContainText('21 con')
    await expect(fact(statement, 'Tỷ lệ sống')).toContainText('96.5%')

    // Nhà đầu tư chỉ thấy dòng của chính mình.
    const lines = statement.getByRole('row').filter({ has: page.getByRole('cell') })
    await expect(lines).toHaveCount(1)
    await expect(lines).toContainText(`${investor.fullName} (bạn)`)
    await expect(lines).toContainText(vnd(92_500))
    await expect(lines).toContainText('Thành công')
    await expect(statement.getByText(settlementDone.taxNotice)).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Góp ý của tôi' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Gửi góp ý' })).toHaveCount(0)
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /api/settlements/31'])
  })

  test('góp ý trong hạn: từ 10 ký tự mới gửi được; gửi xong bảng chuyển sang chờ trả lời', async ({ page, api }) => {
    let current = proposed
    api.get('/api/settlements/32', () => current)
    api.post('/api/settlements/32/feedback', (call) => (current = {
      ...proposed, status: 'Disputed',
      feedback: [{ feedbackId: 77, authorName: investor.fullName, content: (call.body as SettlementFeedbackRequest).content, status: 'Open', response: null, createdAt: daysFromNow(0), respondedAt: null, isMine: true }],
    }))
    await page.goto('/nha-dau-tu/quyet-toan/32')
    await expect(page.getByText(`Góp ý tới ${viDateTime(proposed.feedbackDeadline!)}`)).toBeVisible()
    await expect(page.getByRole('main').getByText('Đang lấy góp ý', { exact: true })).toBeVisible()
    await expect(fact(page, 'Chi trả')).toContainText('Chưa chi')
    const mine = panel(page, 'Góp ý của tôi')
    await expect(mine.getByText('Chưa có góp ý nào.')).toBeVisible()

    await mine.getByRole('button', { name: 'Gửi góp ý' }).click()
    const dialog = page.getByRole('dialog', { name: 'Gửi góp ý' })
    await expect(dialog).toContainText(`Lô ${RUN} · lần tính 1`)
    const send = dialog.getByRole('button', { name: 'Gửi góp ý' })
    await expect(send).toBeDisabled()
    await dialog.getByLabel('Nội dung').fill('Thiếu đơn')
    await expect(send).toBeDisabled()
    await dialog.getByLabel('Nội dung').fill('  Doanh thu đơn hàng cuối thiếu đơn DH-0931 ngày 02/11.  ')
    await send.click()

    await expect(page.getByRole('status').filter({ hasText: 'Đã gửi góp ý.' })).toBeVisible()
    await expect(dialog).toHaveCount(0)
    const body: SettlementFeedbackRequest = { content: 'Doanh thu đơn hàng cuối thiếu đơn DH-0931 ngày 02/11.' }
    expect(api.sent('POST', '/api/settlements/32/feedback').map((c) => c.body)).toEqual([body])
    await expect(mine.getByText(body.content)).toBeVisible()
    await expect(mine.getByText(`${investor.fullName} (bạn)`)).toBeVisible()
    await expect(mine.getByText('Chờ trả lời')).toBeVisible()
    await expect(page.getByRole('main').getByText('Có góp ý chưa xử lý', { exact: true })).toBeVisible()
  })

  test('đường dẫn sai hoặc bảng không thuộc về tôi: báo lỗi, không dựng số mẫu', async ({ page, api }) => {
    await page.goto('/nha-dau-tu/quyet-toan/abc')
    await expect(page.getByText('Đường dẫn bảng quyết toán không hợp lệ.')).toBeVisible()
    expect(api.calls).toEqual([])

    api.get('/api/settlements/999', () => reply(404, { status: 404, detail: 'Không tìm thấy bảng quyết toán.' }))
    await page.goto('/nha-dau-tu/quyet-toan/999')
    await expect(page.getByRole('alert')).toContainText('Không tìm thấy bảng quyết toán.')
    await expect(page.getByText('Tôi thực nhận')).toHaveCount(0)
  })
})
