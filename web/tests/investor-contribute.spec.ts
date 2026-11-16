/* /nha-dau-tu/gop-von/:code — Luồng góp vốn năm bước: xác minh danh tính, công bố rủi ro, số tiền và giữ chỗ, chuyển khoản VietQR, hợp đồng.
   Bước hiện tại do dữ liệu của máy chủ quyết định, nên máy chủ giả lập ở đây đổi trạng thái theo từng lời gọi ghi như backend thật. */
import type {
  AcknowledgeRiskRequest, ContractResponse, ContractSummary, ContributionResponse, FundingBatchResponse, PaymentRequestResponse, PortfolioDetail,
  ReserveContributionRequest, RiskAcknowledgementResponse, RiskDisclosureResponse,
} from '../src/shared/api/api.gen'
import { daysFromNow, expect, reply, signIn, test, vnd, type Api, type Page } from './support/app'
import { LEGAL_NOTICE, NEW, PDF, REFERENCE, fundingNew, investor, panel, paymentFor, reserved, riskDisclosure } from './support/investor'

const URL = `/nha-dau-tu/gop-von/${NEW}`
const CONTRACT_NO = 'HD-2611-0905'
/** Mã băm của file hợp đồng đổi sau mỗi chữ ký; trang tải lại PDF khi mã băm đổi. */
const HASH = { Draft: 'd4'.repeat(32), OperatorSigned: 'e5'.repeat(32), FullySigned: 'f6'.repeat(32) }

interface Server {
  funding: FundingBatchResponse
  /** Các khoản góp của tôi ở Lô này. */
  mine: ContributionResponse[]
  risk: RiskDisclosureResponse
  payment: PaymentRequestResponse | null
  contract: ContractResponse | null
}

const operatorSignature = { role: 'Operator', order: 1, signerName: 'Nguyễn Văn Năm', signedAt: daysFromNow(0), signedHash: HASH.OperatorSigned, providerReference: 'SIG-OP-905' }

/** Hợp đồng của khoản góp 905 ở từng chặng: vừa lập (chờ người nuôi), người nuôi đã ký (tới lượt tôi), đủ chữ ký. */
const contractAt = (stage: 'Draft' | 'OperatorSigned' | 'FullySigned', c: ContributionResponse): ContractResponse => ({
  contractId: 4905, contractNo: CONTRACT_NO, status: stage, signingMethod: 'DigitalSignature', batchCode: NEW, batchTitle: fundingNew.title,
  operatorName: fundingNew.operatorName, investorName: investor.fullName, contributionId: c.contributionId, amount: c.amount, contributionStatus: c.status,
  templateVersion: 'HDGV-2026.1', draftHash: HASH.Draft, currentHash: HASH[stage],
  finalHash: stage === 'FullySigned' ? HASH.FullySigned : null, fullySignedAt: stage === 'FullySigned' ? daysFromNow(0) : null, createdAt: daysFromNow(0),
  signatures: stage === 'Draft' ? [] : stage === 'OperatorSigned' ? [operatorSignature]
    : [operatorSignature, { role: 'Investor', order: 2, signerName: investor.fullName, signedAt: daysFromNow(0), signedHash: HASH.FullySigned, providerReference: 'SIG-IV-905' }],
  nextSigner: stage === 'Draft' ? 'Operator' : stage === 'OperatorSigned' ? 'Investor' : null,
  canSign: stage === 'OperatorSigned', legalNotice: LEGAL_NOTICE,
})

const summaryOf = (c: ContractResponse): ContractSummary => ({
  contractId: c.contractId, contractNo: c.contractNo, status: c.status, signingMethod: c.signingMethod, batchCode: c.batchCode, batchTitle: c.batchTitle,
  investorName: c.investorName, amount: c.amount, contributionStatus: c.contributionStatus, nextSigner: c.nextSigner, createdAt: c.createdAt, fullySignedAt: c.fullySignedAt,
})

const confirmed = (c: ContributionResponse): ContributionResponse => ({ ...c, status: 'Confirmed', confirmedAt: daysFromNow(0) })

/** Chi tiết danh mục của Lô NEW: chỉ có khi tôi đã có khoản được xác nhận. */
const detailOf = (s: Server): PortfolioDetail | null => {
  const paid = s.mine.filter((c) => c.status === 'Confirmed')
  if (paid.length === 0) return null
  const amount = paid.reduce((sum, c) => sum + c.amount, 0)
  return {
    position: {
      batch: {
        code: NEW, title: s.funding.title, operatorName: s.funding.operatorName, crabType: s.funding.crabType, status: 'Funding',
        targetCapital: s.funding.targetCapital, raisedCapital: s.funding.confirmedCapital, minContribution: s.funding.minContribution, cycleDays: 30, seedQuantity: 500,
        fundingDeadline: s.funding.fundingDeadline, stockedAt: null, expectedHarvestDate: null, dayOfCycle: null, aliveCount: null, openAlerts: 0,
      },
      confirmedAmount: amount, capitalRatio: amount / s.funding.confirmedCapital, capitalBasis: 'LiveConfirmed', lastConfirmedAt: paid[0].confirmedAt, settlement: null,
    },
    contributions: paid.map((c) => ({
      id: c.contributionId, amount: c.amount, status: c.status, reservedAt: c.reservedAt, confirmedAt: c.confirmedAt,
      contractNo: s.contract?.contractNo ?? null, contractStatus: s.contract?.status ?? null, fullySignedAt: s.contract?.fullySignedAt ?? null,
    })),
    timeline: [], latestProduction: null,
  }
}

/**
 * Máy chủ giả lập của luồng góp vốn ở Lô NEW. Mặc định: đã xác minh danh tính, chưa xác nhận rủi ro, chưa có khoản góp nào.
 * Trả về trạng thái để test đặt tình huống ban đầu hoặc giả lập việc xảy ra ngoài trang (người nuôi ký, hết hạn giữ chỗ).
 */
function serve(api: Api, start: Partial<Server> = {}): Server {
  const s: Server = {
    funding: { ...fundingNew, me: { kycVerified: true, riskAcknowledged: false } },
    mine: [], risk: { ...riskDisclosure, acknowledgedAt: null }, payment: null, contract: null, ...start,
  }
  const holding = () => s.funding.myActiveReservation

  api.get(`/api/funding/batches/${NEW}`, () => s.funding)
  api.get('/api/me/contributions', () => s.mine)
  api.get('/api/risk-disclosures/active', () => s.risk)
  api.post('/api/risk-acknowledgements', (): RiskAcknowledgementResponse => {
    const acknowledgedAt = daysFromNow(0)
    s.risk = { ...s.risk, acknowledgedAt }
    s.funding = { ...s.funding, me: { ...s.funding.me, riskAcknowledged: true } }
    return { riskDisclosureId: s.risk.riskDisclosureId, versionCode: s.risk.versionCode, acknowledgedAt }
  })
  api.post(`/api/batches/${NEW}/contributions`, (call) => {
    const body = call.body as ReserveContributionRequest
    const amount = body.amount ?? Math.round(((body.pct ?? 0) / 100) * s.funding.targetCapital)
    const made = reserved({ amount })
    s.mine = [...s.mine, made]
    s.funding = { ...s.funding, myActiveReservation: made, reservedCapital: s.funding.reservedCapital + amount, remainingCapacity: s.funding.remainingCapacity - amount }
    return reply(201, made)
  })
  // Gọi lại khi mã còn hạn thì nhận đúng mã cũ.
  api.post('/api/contributions/905/payment-requests', () => (s.payment ??= paymentFor(holding()!)))
  api.get('/api/payment-requests/6001', () => s.payment)
  api.post('/api/dev/payments/simulate', () => {
    const paid = confirmed(holding()!)
    s.payment = { ...s.payment!, status: 'Paid', qrContent: null }
    s.mine = s.mine.map((c) => (c.contributionId === paid.contributionId ? paid : c))
    s.funding = { ...s.funding, myActiveReservation: null, confirmedCapital: s.funding.confirmedCapital + paid.amount, reservedCapital: s.funding.reservedCapital - paid.amount }
    if (s.contract) s.contract = { ...s.contract, contributionStatus: 'Confirmed' }
    return { outcome: 'Matched', transactionId: 77, referenceCode: REFERENCE, paymentRequestId: 6001, purpose: 'Contribution', refundInstructionId: null }
  })
  api.delete('/api/contributions/905', () => {
    const gone = holding()!
    s.mine = s.mine.filter((c) => c.contributionId !== gone.contributionId)
    s.funding = { ...s.funding, myActiveReservation: null, reservedCapital: s.funding.reservedCapital - gone.amount, remainingCapacity: s.funding.remainingCapacity + gone.amount }
    if (s.payment) s.payment = { ...s.payment, status: 'Cancelled', qrContent: null }
    return reply(204)
  })
  api.get('/api/me/contracts', () => (s.contract ? [summaryOf(s.contract)] : []))
  api.get(`/api/investor/portfolio/${NEW}`, () => detailOf(s) ?? reply(404, { status: 404, detail: 'Không tìm thấy lô trong danh mục của bạn.' }))
  api.post('/api/contributions/905/contract', () => reply(201, (s.contract ??= contractAt('Draft', s.mine.find((c) => c.contributionId === 905)!))))
  api.get('/api/contracts/4905', () => s.contract)
  api.get('/api/contracts/4905/file', PDF)
  api.post('/api/contracts/4905/sign', () => (s.contract = contractAt('FullySigned', s.mine.find((c) => c.contributionId === 905)!)))
  return s
}

/** Tình huống quay lại trang khi đang giữ chỗ 10 triệu: đã xác nhận rủi ro, chưa chuyển khoản. */
const holdingSpot = (): Partial<Server> => {
  const spot = reserved()
  return {
    funding: { ...fundingNew, myActiveReservation: spot, reservedCapital: fundingNew.reservedCapital + spot.amount, remainingCapacity: fundingNew.remainingCapacity - spot.amount },
    mine: [spot], risk: riskDisclosure,
  }
}

const step = (page: Page, n: number) => page.getByText(`Góp vốn · bước ${n} / 5`)

test.beforeEach(async ({ page }) => {
  await signIn(page, 'Investor')
})

test('góp vốn trọn luồng: xác nhận rủi ro, giữ chỗ, chuyển khoản VietQR, lập hợp đồng và ký sau người nuôi', async ({ page, api }) => {
  test.slow() // có một lần chờ trang tự hỏi lại hợp đồng (5 giây một lần)
  const server = serve(api)
  await page.goto(URL)
  await expect(page.getByRole('heading', { name: fundingNew.title, level: 1 })).toBeVisible()

  // Bước 2: phải cuộn hết bản công bố rồi mới đánh dấu và xác nhận được.
  await expect(step(page, 2)).toBeVisible()
  await expect(panel(page, 'Công bố rủi ro').getByText('RR-2026.2')).toBeVisible()
  const disclosure = page.getByRole('document', { name: 'Nội dung công bố rủi ro' })
  await expect(disclosure.getByRole('heading', { name: 'Công bố rủi ro khi góp vốn vào Lô' })).toBeVisible()
  await expect(disclosure.getByRole('listitem')).toHaveCount(14)
  const acknowledge = page.getByRole('button', { name: 'Xác nhận đã đọc' })
  await expect(page.getByRole('checkbox', { name: 'Cuộn tới cuối để xác nhận.' })).toBeDisabled()
  await expect(acknowledge).toBeDisabled()
  await disclosure.evaluate((box) => box.scrollTo(0, box.scrollHeight))
  await expect(acknowledge).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Tôi đã đọc hết và hiểu các rủi ro trên.' }).check()
  await acknowledge.click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã ghi nhận xác nhận rủi ro.' })).toBeVisible()
  const acknowledged: AcknowledgeRiskRequest = { riskDisclosureId: 4, scrolledToEnd: true }
  expect(api.sent('POST', '/api/risk-acknowledgements').map((c) => c.body)).toEqual([acknowledged])

  // Bước 3: chọn nhanh 10 triệu, xác nhận trong hộp thoại rồi mới giữ chỗ.
  await expect(step(page, 3)).toBeVisible()
  await expect(page.getByText(`Từ ${vnd(2_000_000)} đến ${vnd(90_000_000)}`)).toBeVisible()
  const reserve = page.getByRole('button', { name: 'Giữ chỗ 15 phút' })
  await expect(reserve).toBeDisabled()
  await page.getByRole('button', { name: vnd(10_000_000), exact: true }).click()
  await expect(page.getByRole('textbox', { name: /^Số tiền/ })).toHaveValue('10.000.000')
  await reserve.click()
  const confirm = page.getByRole('dialog', { name: `Giữ chỗ ${vnd(10_000_000)}` })
  await expect(confirm).toContainText(`Lô ${NEW}`)
  await expect(confirm).toContainText('Mười triệu đồng')
  expect(api.sent('POST', `/api/batches/${NEW}/contributions`)).toEqual([])
  await confirm.getByRole('button', { name: 'Giữ chỗ', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: `Đã giữ chỗ ${vnd(10_000_000)} tới` })).toBeVisible()
  const reservation: ReserveContributionRequest = { amount: 10_000_000 }
  expect(api.sent('POST', `/api/batches/${NEW}/contributions`).map((c) => c.body)).toEqual([reservation])

  // Bước 4: trang tự xin mã VietQR một lần; số tài khoản nằm sau bước chuyển khoản thủ công.
  await expect(step(page, 4)).toBeVisible()
  await expect(page.getByText(/Giữ chỗ còn \d\d:\d\d/)).toBeVisible()
  await expect(page.getByRole('img', { name: `Mã VietQR chuyển ${vnd(10_000_000)}, nội dung ${REFERENCE}` })).toBeVisible()
  await expect(page.getByText('Mã thử nghiệm, không chuyển tiền thật.')).toBeVisible()
  await expect(page.getByRole('timer')).toContainText('Mã hết hạn sau')
  await expect(page.getByText('9704001122334455')).toBeHidden()
  await page.getByRole('button', { name: 'Không quét được mã? Chuyển khoản thủ công' }).click()
  await expect(page.getByText('9704001122334455')).toBeVisible()
  await expect(page.getByText('Ngân hàng thử nghiệm')).toBeVisible()
  expect(api.sent('POST', '/api/contributions/905/payment-requests').map((c) => c.body)).toEqual([null])

  // Ngân hàng báo có (nút giả lập của bản dev): trang tự sang bước hợp đồng, không cần gửi biên lai.
  await page.getByRole('button', { name: 'Giả lập đã chuyển khoản' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã nhận tiền. Khoản góp đã được xác nhận.' })).toBeVisible()
  expect(api.sent('POST', '/api/dev/payments/simulate').map((c) => c.body)).toEqual([{ referenceCode: REFERENCE }])

  // Bước 5: lập hợp đồng từ mẫu; người nuôi ký trước nên chưa có nút ký.
  await expect(step(page, 5)).toBeVisible()
  const contract = panel(page, 'Hợp đồng')
  await expect(contract.getByText('Đã xác nhận')).toBeVisible()
  await contract.getByRole('button', { name: 'Lập hợp đồng từ mẫu' }).click()
  await expect(contract.getByText(LEGAL_NOTICE)).toBeVisible()
  await expect(contract.getByText(CONTRACT_NO, { exact: true })).toBeVisible()
  const signers = contract.getByRole('listitem')
  await expect(signers).toHaveText([/Người nuôi: HTX Phú Tân.*Đang chờ ký/, /Nhà đầu tư: Lê Minh Khôi.*Chưa tới lượt/])
  await expect(contract.getByTitle(`Hợp đồng ${CONTRACT_NO}`)).toBeVisible()
  await expect(contract.getByRole('link', { name: 'Tải file PDF' })).toHaveAttribute('download', `${CONTRACT_NO}.pdf`)
  const sign = contract.getByRole('button', { name: 'Ký số hợp đồng' })
  await expect(sign).toHaveCount(0)

  // Người nuôi ký ở nơi khác: trang tự hỏi lại và hiện nút ký.
  server.contract = contractAt('OperatorSigned', server.mine[0])
  await expect(sign).toBeVisible({ timeout: 12_000 })
  await sign.click()
  const signing = page.getByRole('dialog', { name: `Ký số hợp đồng ${CONTRACT_NO}` })
  await expect(signing).toContainText(`Lô ${NEW} · vốn góp ${vnd(10_000_000)}`)
  await signing.getByRole('button', { name: 'Ký số', exact: true }).click()
  await expect(signing).toHaveCount(0)
  await expect(contract.getByText('Đủ chữ ký')).toBeVisible()
  await expect(signers).toHaveText([/Người nuôi: HTX Phú Tân.*Đã ký/, /Nhà đầu tư: Lê Minh Khôi.*Đã ký/])
  await expect(sign).toHaveCount(0)
  await expect(contract.getByRole('link', { name: 'Xem Lô đã góp' })).toHaveAttribute('href', `/nha-dau-tu/danh-muc/${NEW}`)

  expect(api.writes()).toEqual([
    'POST /api/risk-acknowledgements',
    `POST /api/batches/${NEW}/contributions`,
    'POST /api/contributions/905/payment-requests',
    'POST /api/dev/payments/simulate',
    'POST /api/contributions/905/contract',
    'POST /api/contracts/4905/sign',
  ])
})

test('chưa xác minh danh tính thì dừng ở bước 1 và chỉ có lối sang hồ sơ', async ({ page, api }) => {
  serve(api, { funding: { ...fundingNew, me: { kycVerified: false, riskAcknowledged: false } } })
  await page.goto(URL)
  await expect(step(page, 1)).toBeVisible()
  await expect(page.getByText('Bạn chưa xác minh danh tính.')).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Xác minh danh tính' })).toHaveAttribute('href', '/nha-dau-tu/ho-so?tab=xac-minh')
  await expect(page.getByRole('button', { name: 'Xác nhận đã đọc' })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: /^Số tiền/ })).toHaveCount(0)
  // Chưa tới bước rủi ro nên chưa tải bản công bố, và không ghi gì.
  expect(api.sent('GET', '/api/risk-disclosures/active')).toEqual([])
  expect(api.writes()).toEqual([])
})

test('số tiền dưới mức tối thiểu hoặc quá phần còn nhận thì không giữ chỗ được', async ({ page, api }) => {
  serve(api, { funding: fundingNew, risk: riskDisclosure })
  await page.goto(URL)
  await expect(step(page, 3)).toBeVisible()
  const amount = page.getByRole('textbox', { name: /^Số tiền/ })
  const reserve = page.getByRole('button', { name: 'Giữ chỗ 15 phút' })

  await amount.fill('1500000')
  await expect(amount).toHaveValue('1.500.000')
  await expect(page.getByText(`Góp tối thiểu ${vnd(2_000_000)}.`)).toBeVisible()
  await expect(reserve).toBeDisabled()

  await amount.fill('95000000')
  await expect(page.getByText(`Lô chỉ còn nhận ${vnd(90_000_000)}.`)).toBeVisible()
  await expect(reserve).toBeDisabled()
  // Enter trong ô cũng không mở hộp xác nhận.
  await amount.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Nút chọn nhanh chỉ có các mức nằm trong khoảng được góp.
  await expect(page.getByRole('button', { name: vnd(2_000_000), exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: vnd(50_000_000), exact: true })).toBeVisible()
  await amount.fill('90000000')
  await expect(reserve).toBeEnabled()
  expect(api.writes()).toEqual([])
})

test('nhập theo tỷ lệ thì gửi tỷ lệ; máy chủ từ chối thì báo ngay trong hộp xác nhận và ở lại bước số tiền', async ({ page, api }) => {
  serve(api, { funding: fundingNew, risk: riskDisclosure })
  // Người khác vừa giữ hết chỗ: lần đầu máy chủ từ chối, câu báo lỗi của backend có kèm số quy tắc.
  let refused = false
  api.post(`/api/batches/${NEW}/contributions`, (call) => {
    if (!refused) {
      refused = true
      return reply(422, { status: 422, code: 'funding.capacity_exceeded', detail: `Lô chỉ còn nhận ${vnd(2_500_000)} (BR-057).` })
    }
    return reply(201, reserved({ amount: (call.body as ReserveContributionRequest).amount }))
  })
  await page.goto(URL)
  await expect(step(page, 3)).toBeVisible()
  const amount = page.getByRole('textbox', { name: /^Số tiền/ })
  const reserve = page.getByRole('button', { name: 'Giữ chỗ 15 phút' })

  await page.getByText('Nhập theo tỷ lệ vốn mục tiêu').click()
  const pct = page.getByLabel(`Tỷ lệ của ${vnd(120_000_000)}`)
  await pct.fill('2,555')
  await expect(page.getByText('Tỷ lệ nhận tối đa hai chữ số thập phân.')).toBeVisible()
  await expect(reserve).toBeDisabled()
  await pct.fill('2,5')
  await expect(amount).toHaveValue('3.000.000')
  await reserve.click()

  const confirm = page.getByRole('dialog', { name: `Giữ chỗ ${vnd(3_000_000)}` })
  await confirm.getByRole('button', { name: 'Giữ chỗ', exact: true }).click()
  await expect(confirm.getByText(`Lô chỉ còn nhận ${vnd(2_500_000)}.`)).toBeVisible()
  const byPct: ReserveContributionRequest = { pct: 2.5 }
  expect(api.sent('POST', `/api/batches/${NEW}/contributions`).map((c) => c.body)).toEqual([byPct])
  await page.keyboard.press('Escape')
  await expect(confirm).toHaveCount(0)
  await expect(step(page, 3)).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Đã giữ chỗ' })).toHaveCount(0)

  // Gõ lại số tiền thì gửi số tiền, không gửi tỷ lệ cũ.
  await amount.fill('2500000')
  await expect(pct).toHaveValue('')
  await reserve.click()
  await page.getByRole('dialog', { name: `Giữ chỗ ${vnd(2_500_000)}` }).getByRole('button', { name: 'Giữ chỗ', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: `Đã giữ chỗ ${vnd(2_500_000)} tới` })).toBeVisible()
  const byAmount: ReserveContributionRequest = { amount: 2_500_000 }
  expect(api.sent('POST', `/api/batches/${NEW}/contributions`).map((c) => c.body)).toEqual([byPct, byAmount])
})

test('Lô đã hết hạn góp vốn thì không còn ô nhập, chỉ có lối sang Lô khác', async ({ page, api }) => {
  serve(api, { funding: { ...fundingNew, isOpen: false }, risk: riskDisclosure })
  await page.goto(URL)
  await expect(page.getByText('Lô đã hết hạn hoặc đã chốt vốn.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Xem Lô khác' })).toHaveAttribute('href', '/nha-dau-tu/lo')
  await expect(page.getByRole('textbox', { name: /^Số tiền/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Giữ chỗ/ })).toHaveCount(0)
  expect(api.writes()).toEqual([])
})

test('phần còn lại không đủ mức tối thiểu: người đã góp vẫn mở được hợp đồng của mình và ký; ký lỗi thì báo trong hộp', async ({ page, api }) => {
  const paid = confirmed(reserved())
  const server = serve(api, {
    funding: { ...fundingNew, confirmedCapital: 149_000_000, reservedCapital: 0, remainingCapacity: 1_000_000 },
    mine: [paid], risk: riskDisclosure, contract: contractAt('OperatorSigned', paid),
  })
  // Lần ký đầu máy chủ từ chối, lần sau thành công.
  let failed = false
  api.post('/api/contracts/4905/sign', () => {
    if (failed) return (server.contract = contractAt('FullySigned', paid))
    failed = true
    return reply(422, { status: 422, code: 'contract.hash_mismatch', detail: 'File hợp đồng đã thay đổi, tải lại trang rồi ký lại.' })
  })
  await page.goto(URL)
  await expect(page.getByText('Phần còn lại không đủ cho mức góp tối thiểu.')).toBeVisible()
  await expect(page.getByRole('textbox', { name: /^Số tiền/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Hợp đồng của khoản đã góp' }).click()
  await expect(step(page, 5)).toBeVisible()
  const contract = panel(page, 'Hợp đồng')
  await expect(contract.getByText('Người nuôi đã ký')).toBeVisible()
  await contract.getByRole('button', { name: 'Ký số hợp đồng' }).click()
  const signing = page.getByRole('dialog', { name: `Ký số hợp đồng ${CONTRACT_NO}` })
  await expect(signing).toContainText('Sau khi ký không sửa được nội dung hợp đồng.')
  await signing.getByRole('button', { name: 'Ký số', exact: true }).click()
  await expect(signing.getByText('File hợp đồng đã thay đổi, tải lại trang rồi ký lại.')).toBeVisible()
  await expect(contract.getByText('Người nuôi đã ký')).toBeVisible()

  await signing.getByRole('button', { name: 'Ký số', exact: true }).click()
  await expect(signing).toHaveCount(0)
  await expect(contract.getByText('Đủ chữ ký')).toBeVisible()
  expect(api.writes()).toEqual(['POST /api/contracts/4905/sign', 'POST /api/contracts/4905/sign'])
  expect(api.sent('POST', '/api/contracts/4905/sign').map((c) => c.body)).toEqual([null, null])
})

test('?buoc=hop-dong mở thẳng bước hợp đồng của khoản đã góp', async ({ page, api }) => {
  const paid = confirmed(reserved())
  serve(api, { funding: fundingNew, mine: [paid], risk: riskDisclosure })
  await page.goto(`${URL}?buoc=hop-dong`)
  await expect(step(page, 5)).toBeVisible()
  const contract = panel(page, 'Hợp đồng')
  await expect(contract.getByText(vnd(10_000_000))).toBeVisible()
  await expect(contract.getByRole('button', { name: 'Lập hợp đồng từ mẫu' })).toBeEnabled()
  expect(api.writes()).toEqual([])
})

test('quay lại khi đang giữ chỗ: lấy đúng một mã QR; huỷ giữ chỗ phải xác nhận rồi về bước số tiền', async ({ page, api }) => {
  serve(api, holdingSpot())
  await page.goto(URL)
  await expect(step(page, 4)).toBeVisible()
  await expect(page.getByRole('img', { name: `Mã VietQR chuyển ${vnd(10_000_000)}, nội dung ${REFERENCE}` })).toBeVisible()

  await page.getByText('Tuỳ chọn khác').click()
  await page.getByRole('button', { name: 'Huỷ giữ chỗ' }).click()
  const cancel = page.getByRole('dialog', { name: 'Huỷ giữ chỗ' })
  await expect(cancel).toContainText(`${vnd(10_000_000)} ở Lô ${NEW}`)
  await expect(cancel).toContainText('Đừng chuyển tiền theo mã cũ.')
  expect(api.sent('DELETE', '/api/contributions/905')).toEqual([])
  await cancel.getByRole('button', { name: 'Huỷ giữ chỗ' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã huỷ giữ chỗ.' })).toBeVisible()
  await expect(step(page, 3)).toBeVisible()
  await expect(page.getByRole('img', { name: /Mã VietQR chuyển/ })).toHaveCount(0)
  await expect(page.getByText(/Giữ chỗ còn/)).toHaveCount(0)
  // Chỗ được trả lại: lại góp được tới 90 triệu.
  await expect(page.getByText(`Từ ${vnd(2_000_000)} đến ${vnd(90_000_000)}`)).toBeVisible()
  expect(api.writes()).toEqual(['POST /api/contributions/905/payment-requests', 'DELETE /api/contributions/905'])
})

test('lập hợp đồng trước khi chuyển khoản rồi quay về đúng mã QR cũ', async ({ page, api }) => {
  serve(api, holdingSpot())
  await page.goto(URL)
  await expect(page.getByRole('img', { name: /Mã VietQR chuyển/ })).toBeVisible()

  await page.getByText('Tuỳ chọn khác').click()
  await page.getByRole('button', { name: 'Lập hợp đồng trước' }).click()
  await expect(step(page, 5)).toBeVisible()
  const contract = panel(page, 'Hợp đồng')
  await expect(contract.getByText('Đang giữ chỗ')).toBeVisible()
  await contract.getByRole('button', { name: 'Lập hợp đồng từ mẫu' }).click()
  await expect(contract.getByText(CONTRACT_NO, { exact: true })).toBeVisible()
  await expect(contract.getByRole('listitem').first()).toContainText('Đang chờ ký')

  await contract.getByRole('button', { name: 'Về bước chuyển khoản' }).click()
  await expect(step(page, 4)).toBeVisible()
  await expect(page.getByRole('img', { name: /Mã VietQR chuyển/ })).toBeVisible()
  expect(api.writes()).toEqual(['POST /api/contributions/905/payment-requests', 'POST /api/contributions/905/contract'])
})

test('hết hạn giữ chỗ khi đang chờ chuyển khoản thì mã QR biến mất và trang về bước số tiền', async ({ page, api }) => {
  test.slow() // chờ một lần trang tự hỏi lại yêu cầu chuyển khoản (3 giây một lần)
  const server = serve(api, holdingSpot())
  await page.goto(URL)
  await expect(page.getByRole('img', { name: /Mã VietQR chuyển/ })).toBeVisible()

  // Máy chủ trả chỗ: yêu cầu chuyển khoản hết hạn, khoản giữ chỗ không còn.
  server.payment = { ...server.payment!, status: 'Expired', qrContent: null }
  server.mine = []
  server.funding = { ...fundingNew }

  await expect(step(page, 3)).toBeVisible({ timeout: 12_000 })
  await expect(page.getByRole('img', { name: /Mã VietQR chuyển/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Giữ chỗ 15 phút' })).toBeDisabled()
  expect(api.writes()).toEqual(['POST /api/contributions/905/payment-requests'])
})
