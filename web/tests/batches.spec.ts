/* Soạn một Lô P (/operator/batches/new và /operator/batches/:code/edit) qua bốn bước: Lô → Giá và vốn → Chi phí → Gửi duyệt.
   Danh sách Lô nằm ở operator-lists.spec.ts, trang làm việc của Lô ở operator-workspace.spec.ts. */
import type { BatchRequest, BatchResponse, CostPlanRequest, OperatorResponse } from '../src/shared/api/api.gen'
import { dateFromNow, expect, reply, signIn, test, vnd } from './support/app'
import { CODE, batchDraft, batchOf, batchRaising, fact, farm, mockOperator, more, noDevReload, panel } from './support/operator'

const NEW_URL = '/operator/batches/new'
const DRAFT = batchDraft.batchCode
const EDIT_URL = `/operator/batches/${DRAFT}/edit`
const SPEC_L = 'Cua gạch · Size L · Cấp 1'

test.beforeEach(async ({ page, api }) => {
  mockOperator(api)
  await noDevReload(page)
  await signIn(page, 'OperatorMember')
})

test('tạo Lô P nháp qua hai bước ngắn rồi sang bước chi phí', async ({ page, api }) => {
  const created = batchOf({ ...batchDraft, batchCode: 'P-2612-02', title: 'Cua gạch Năm Căn vụ Tết đợt 2', costPlan: null, canSubmit: false })
  api.post('/api/batches', () => reply(201, created))
  api.get(`/api/operators/me/batches/${created.batchCode}`, created)
  await page.goto(NEW_URL)
  await expect(page.getByRole('heading', { name: 'Tạo Lô P', level: 1 })).toBeVisible()
  const steps = page.getByRole('navigation', { name: 'Các bước soạn Lô' })
  // Chưa lưu Lô thì chưa vào được bước chi phí và gửi duyệt.
  await expect(steps.getByRole('button', { name: '3. Chi phí' })).toBeDisabled()
  await expect(steps.getByRole('button', { name: '4. Gửi duyệt' })).toBeDisabled()

  // Bước 1: mỗi lần chỉ nhắc một điều còn thiếu.
  const next = page.getByRole('button', { name: 'Tiếp tục' })
  await expect(page.getByText('Nhập tên Lô')).toBeVisible()
  await expect(next).toBeDisabled()
  await page.getByLabel('Tên Lô').fill(created.title)
  await page.getByLabel('Loại cua').selectOption({ label: 'Cua gạch' })
  await page.getByLabel('Số con').fill('600')
  await expect(page.getByText('Khối lượng trung bình từ 50 g')).toBeVisible()
  await page.getByLabel('Khối lượng trung bình').fill('420')
  await expect(page.getByText('Ngày nhận cua phải sau hôm nay')).toBeVisible()
  await page.getByLabel('Ngày nhận cua dự kiến').fill(dateFromNow(30))
  await expect(page.getByLabel('Số ngày nuôi')).toHaveValue('30')
  await next.click()

  // Bước 2: chọn quy cách, giá sàn, bên thu mua, vốn tối thiểu và thù lao.
  await expect(steps.getByRole('button', { name: '2. Giá và vốn' })).toHaveAttribute('aria-current', 'step')
  const save = page.getByRole('button', { name: 'Tạo Lô nháp' })
  await expect(page.getByText('Chọn ít nhất một quy cách và điền đủ ba ô')).toBeVisible()
  await page.getByLabel(SPEC_L).check()
  // Khối lượng quy đổi mỗi con lấy sẵn từ khối lượng trung bình của Lô.
  await expect(page.getByLabel(`Khối lượng quy đổi mỗi con của ${SPEC_L}`)).toHaveValue('420')
  await page.getByLabel(`Giá mỗi kg của ${SPEC_L}`).fill('520000')
  await page.getByLabel(`Số con chào bán của ${SPEC_L}`).fill('360')
  await expect(page.getByText('Tổng số con chào bán').locator('..')).toContainText('360 con')
  await page.getByLabel('Giá sàn mỗi kg').fill('600000')
  await expect(page.getByText(`Giá sàn không cao hơn ${vnd(520_000)}`)).toBeVisible()
  await expect(save).toBeDisabled()
  await page.getByLabel('Giá sàn mỗi kg').fill('380000')
  await page.getByLabel('Bên cam kết thu mua').selectOption({ label: 'Công ty Hải sản Đất Mũi' })
  await page.getByLabel('Vốn tối thiểu khả thi').fill('150000000')
  await page.getByLabel('Căn cứ của vốn tối thiểu').fill('  Đủ nuôi 500 con  ')
  await expect(page.getByText('Nhập ngưỡng tỷ lệ sống và thù lao')).toBeVisible()
  await page.getByLabel('Thù lao khi đạt ngưỡng').fill('12')
  // Bậc thù lao mặc định: dưới ngưỡng nhận một nửa.
  await expect(more(page, 'Bậc thù lao: dưới ngưỡng 6%, đạt ngưỡng 12%')).toBeVisible()
  // Quy cách chỉ được hỏi cho loại cua đã chọn.
  expect(api.sent('GET', '/api/specs').map((c) => c.query)).toEqual([{ crabType: 'RoeCrab' }])
  await save.click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã tạo Lô nháp.' })).toBeVisible()
  const body: BatchRequest = {
    title: created.title, crabType: 'RoeCrab', plannedQuantity: 600, hasHolding: true, holdingDays: 30, restockCutoffDays: 15, expectedAvgWeightG: 420, expectedGrade: null,
    saleDays: 14, deliveryRadiusKm: 50, dispatchSiteId: null, expectedReceiptDate: dateFromNow(30), minViableCapital: 150_000_000, minViableBasis: 'Đủ nuôi 500 con',
    survivalThresholdPct: 85, baseRemunerationPct: 12, remunerationTiers: [], floorPricePerKg: 380_000, offtakeBuyerPartyId: 33, settlementBasis: 'StandardCost',
    offers: [{ specCode: 'RC-L-G1', pricePerKg: 520_000, conversionWeightG: 420, offeredQuantity: 360 }],
  }
  expect(api.sent('POST', '/api/batches').map((c) => c.body)).toEqual([body])

  // Lưu xong chuyển sang bước chi phí của Lô vừa tạo, có sẵn ba khoản gợi ý.
  await expect(page).toHaveURL(new RegExp(`/operator/batches/${created.batchCode}/edit\\?buoc=chi-phi$`))
  await expect(page.getByRole('heading', { name: created.title, level: 1 })).toBeVisible()
  await expect(panel(page, 'Các khoản chi').getByLabel('Mô tả')).toHaveCount(3)
  await expect(page.getByText('Mỗi khoản cần mô tả, số lượng, đơn vị và đơn giá')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lưu chi phí' })).toBeDisabled()
})

test('Lô không lưu nuôi thì không gửi số ngày nuôi và hạn thả bù', async ({ page, api }) => {
  api.put(`/api/batches/${DRAFT}`, (call) => ({ ...batchDraft, ...(call.body as BatchRequest), hasHolding: false, holdingDays: null }) as BatchResponse)
  await page.goto(EDIT_URL)
  await expect(page.getByLabel('Tên Lô')).toHaveValue(batchDraft.title)
  await page.getByText('Không lưu nuôi', { exact: true }).click()
  await expect(page.getByLabel('Số ngày nuôi')).toHaveCount(0)
  await page.getByRole('button', { name: 'Tiếp tục' }).click()
  await expect(page).toHaveURL(/\?buoc=gia$/)
  // Điều khoản đã lưu được điền lại đủ nên lưu được ngay.
  await expect(page.getByLabel(`Giá mỗi kg của ${SPEC_L}`)).toHaveValue('520.000')
  await page.getByRole('button', { name: 'Lưu Lô' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu Lô.' })).toBeVisible()
  const sent = api.sent('PUT', `/api/batches/${DRAFT}`)
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({
    title: batchDraft.title, hasHolding: false, holdingDays: null, restockCutoffDays: null, dispatchSiteId: 3, offtakeBuyerPartyId: 33, floorPricePerKg: 380_000,
    offers: [
      { specCode: 'RC-L-G1', pricePerKg: 520_000, conversionWeightG: 420, offeredQuantity: 360 },
      { specCode: 'RC-XL-SP', pricePerKg: 680_000, conversionWeightG: 520, offeredQuantity: 180 },
    ],
  } satisfies Partial<BatchRequest>)
  await expect(page).toHaveURL(/\?buoc=chi-phi$/)
})

test('bước chi phí: hệ thống tự tính Chi phí chuẩn mỗi con và vốn mục tiêu, lưu đủ các khoản', async ({ page, api }) => {
  api.put(`/api/batches/${DRAFT}/cost-plan`, batchDraft)
  await page.goto(`${EDIT_URL}?buoc=chi-phi`)
  await expect(fact(page, 'Tổng Chi phí chuẩn')).toHaveText(vnd(180_000_000))
  await expect(fact(page, 'Mỗi con')).toHaveText(vnd(300_000))
  await expect(fact(page, 'Vốn mục tiêu')).toHaveText(vnd(180_000_000))

  // Tăng đơn giá thức ăn từ 30.000 lên 35.000 đồng mỗi kg: 1.200 kg thêm 6 triệu, mỗi con 310.000 đồng.
  const items = panel(page, 'Các khoản chi')
  await expect(items.getByLabel('Mô tả').nth(1)).toHaveValue('Thức ăn')
  await items.getByLabel('Đơn giá').nth(1).fill('35000')
  await expect(fact(page, 'Tổng Chi phí chuẩn')).toHaveText(vnd(186_000_000))
  await expect(fact(page, 'Mỗi con')).toHaveText(vnd(310_000))
  await page.getByRole('button', { name: 'Lưu chi phí' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu kế hoạch chi phí.' })).toBeVisible()
  const body: CostPlanRequest = {
    items: [
      { category: 'Seed', description: 'Cua đầu vào', quantity: 600, unit: 'con', unitPrice: 220_000, basis: null, costBearer: 'Batch' },
      { category: 'Feed', description: 'Thức ăn', quantity: 1_200, unit: 'kg', unitPrice: 35_000, basis: null, costBearer: 'Batch' },
      { category: 'MortalityReserve', description: 'Dự phòng hao hụt', quantity: 1, unit: 'gói', unitPrice: 12_000_000, basis: null, costBearer: 'Batch' },
    ],
    milestones: null,
  }
  expect(api.sent('PUT', `/api/batches/${DRAFT}/cost-plan`).map((c) => c.body)).toEqual([body])

  // Bỏ khoản dự phòng hao hụt thì không lưu được.
  await items.getByRole('button', { name: 'Xoá khoản 3' }).click()
  await expect(page.getByText('Cần khoản dự phòng hao hụt do Lô chịu')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lưu chi phí' })).toBeDisabled()
})

test('gửi Lô nháp cho Admin duyệt sau khi đủ bốn điều kiện', async ({ page, api }) => {
  let current: BatchResponse = batchDraft
  api.get(`/api/operators/me/batches/${DRAFT}`, () => current)
  api.post(`/api/batches/${DRAFT}/submit`, () => {
    current = { ...batchDraft, status: 'PendingApproval', canEdit: false, canSubmit: false, canCancel: false }
    return current
  })
  await page.goto(`${EDIT_URL}?buoc=gui-duyet`)
  await expect(panel(page, 'Kiểm tra trước khi gửi').getByRole('listitem')).toHaveText([
    /Thông tin Lô.*600 con · nuôi 30 ngày/,
    /Giá bán và bên thu mua.*2 quy cách · Công ty Hải sản Đất Mũi/,
    new RegExp(`Chi phí và mốc giải ngân.*3 khoản · 3 mốc · ${vnd(180_000_000)}`),
    new RegExp(`Vốn tối thiểu không quá vốn mục tiêu.*${vnd(150_000_000)} / ${vnd(180_000_000)}`),
  ])
  await page.getByRole('button', { name: 'Gửi Admin duyệt' }).click()
  const dialog = page.getByRole('dialog', { name: 'Gửi Lô cho Admin duyệt' })
  await expect(dialog.getByText('Trong lúc chờ duyệt Lô không sửa được.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Gửi duyệt' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Đã gửi Lô cho Admin duyệt.' })).toBeVisible()
  expect(api.sent('POST', `/api/batches/${DRAFT}/submit`).map((c) => c.body)).toEqual([null])
  // Gửi xong về trang làm việc của Lô, Lô chuyển sang chờ duyệt.
  await expect(page).toHaveURL(new RegExp(`/operator/batches/${DRAFT}$`))
  await expect(page.getByRole('heading', { name: 'Chờ Admin duyệt' })).toBeVisible()
  await expect(page.locator('.op-heading').getByText('Chờ duyệt')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sửa Lô' })).toHaveCount(0)
})

test('chưa lưu chi phí thì chưa gửi duyệt được', async ({ page, api }) => {
  api.get(`/api/operators/me/batches/${DRAFT}`, batchOf({ ...batchDraft, costPlan: null }))
  await page.goto(`${EDIT_URL}?buoc=gui-duyet`)
  await expect(panel(page, 'Kiểm tra trước khi gửi').getByRole('listitem').nth(2)).toHaveText(/Chi phí và mốc giải ngân.*Chưa lưu/)
  await expect(page.getByRole('button', { name: 'Gửi Admin duyệt' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Huỷ Lô' })).toBeEnabled()
  expect(api.writes()).toEqual([])
})

test('Lô đã mở hoặc Lô do Admin soạn thì không sửa được và form không tải', async ({ page, api }) => {
  await page.goto(`/operator/batches/${CODE}/edit`)
  await expect(page.getByText('Lô đang thu hoạch nên không sửa được.')).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Về trang của Lô' }).last()).toHaveAttribute('href', `/operator/batches/${CODE}`)
  await expect(page.getByLabel('Tên Lô')).toHaveCount(0)

  await page.goto(`/operator/batches/${batchRaising.batchCode}/edit`)
  await expect(page.getByText('Lô T do Admin soạn.')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Các bước soạn Lô' })).toHaveCount(0)
  expect(api.sent('GET', '/api/me/sites')).toEqual([])
  expect(api.writes()).toEqual([])
})

test('hồ sơ hộ nuôi chưa được duyệt thì trang tạo Lô nhắc ngay', async ({ page, api }) => {
  const pending: OperatorResponse = { ...farm, status: 'Submitted' }
  api.get('/api/operators/me', pending)
  await page.goto(NEW_URL)
  await expect(page.getByText('Hồ sơ hộ nuôi chưa được duyệt nên chưa tạo được Lô.')).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Xem hồ sơ' })).toHaveAttribute('href', '/operator/register')
})
