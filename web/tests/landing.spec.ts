/* Landing uses public HTTP data. Fixtures here are test responses, never landing fallbacks. */
import type { AvailabilityResponse, ExploreBatchResponse } from '../src/shared/api/api.gen'
import { daysFromNow, expect, forbiddenWords, reply, signIn, test, vnd, type Api } from './support/app'
import { availabilityP, batchP, mockPublic, progressP, trace } from './support/public'

type PublicBatch = ExploreBatchResponse & { publicFarm?: {
  id: string; name: string; latitude: number; longitude: number; province: string
  ratingAverage?: number | null; ratingCount?: number | null
} }
const openBatch = (code: string, extra: Partial<PublicBatch> = {}): PublicBatch => ({
  ...batchP, batchCode: code, title: `Lô công khai ${code}`, batchMode: 'P', status: 'Funding',
  fundingOpenAt: daysFromNow(-2), fundingDeadline: daysFromNow(8), preorderDeadline: daysFromNow(12),
  targetCapital: 200_000_000, confirmedCapital: 50_000_000, reservedCapital: 90_000_000,
  remainingCapital: 60_000_000, minContribution: 5_000_000, investorCount: 8, ...extra,
})
const first = openBatch('P-LIVE-01', { publicFarm: { id: 'farm-public-01', name: 'Trại đã công bố A', latitude: 8.78, longitude: 104.98, province: 'Cà Mau' } })
const second = openBatch('P-LIVE-02', { minContribution: 2_000_000, confirmedCapital: 20_000_000, remainingCapital: 90_000_000 })
const third = openBatch('P-LIVE-03', { minContribution: 8_000_000, confirmedCapital: 80_000_000, remainingCapital: 30_000_000 })
const growing = openBatch('P-GROW-01', {
  title: 'Lô đang nuôi theo kế hoạch công khai', status: 'InProduction', plannedQuantity: 600, expectedAvgWeightG: 450, crabType: 'FatteningMudCrab',
  offers: [{ specCode: 'FM-TEST-A', specName: 'Cua thịt quy cách thử', sizeCode: 'M', gradeCode: 'A', pricePerKg: 360_000, conversionWeightG: 450, offeredQuantity: 500 }],
})
const defaultRows = [first, second, third, growing]
const listResponse = (items: PublicBatch[]) => ({ items, page: 1, pageSize: 100, total: items.length })
const availability = (batch: PublicBatch): AvailabilityResponse => ({
  ...availabilityP, batchCode: batch.batchCode, acceptingPreorders: true,
  sellableCrabs: batch.offers.reduce((n, offer) => n + offer.offeredQuantity, 0),
  remainingCrabs: batch.offers.length === 1 ? 77 : 123,
  committedCrabs: batch.offers.reduce((n, offer) => n + offer.offeredQuantity, 0) - (batch.offers.length === 1 ? 77 : 123), depositRatePct: 35,
  specs: batch.offers.map((offer, i) => ({ specCode: offer.specCode, specName: offer.specName, pricePerKg: offer.pricePerKg,
    conversionWeightG: offer.conversionWeightG, offeredQuantity: offer.offeredQuantity,
    committed: offer.offeredQuantity - (i === 0 ? 77 : 46), remaining: i === 0 ? 77 : 46 })),
})
function mockLanding(api: Api, rows: PublicBatch[] = defaultRows) {
  mockPublic(api)
  api.get('/api/batches', listResponse(rows))
  api.get(/^\/api\/batches\/[^/]+\/availability$/, (call) => {
    const b = rows.find((row) => call.path === `/api/batches/${row.batchCode}/availability`)
    return b ? availability(b) : reply(404, { detail: 'Không tìm thấy lô.' })
  })
}
test.beforeEach(async ({ api }) => { mockLanding(api) })

test('bố cục mới lấy danh sách công khai, giữ hai CTA và không gọi API ghi', async ({ page, api }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Góp vốn nuôi cua hộp. Thấy từng hộp, rõ từng đồng.')
  await expect(page.locator('#gop-von')).toContainText(first.title)
  const expectedOrder = ['top', 'gop-von', 'trai-nuoi', 'san-luong', 'gia-si', 'thiet-bi', 'truy-xuat', 'hoi-dap', 'bat-dau']
  const order = await page.locator('section[id]').evaluateAll((sections, expected) => sections.map((s) => s.id).filter((id) => expected.includes(id)), expectedOrder)
  // Data-dependent sections may be absent; their order must still follow the brief.
  expect(order).toEqual(expectedOrder.filter((id) => order.includes(id)))
  for (const id of ['top', 'gop-von', 'san-luong', 'gia-si', 'truy-xuat', 'hoi-dap', 'bat-dau']) await expect(page.locator(`#${id}`)).toHaveCount(1)
  expect(api.sent('GET', '/api/batches')[0].query).toEqual({ scope: 'all', batchMode: 'P', page: '1', pageSize: '100' })
  expect(api.sent('GET', '/api/batches')[0].auth).toBeUndefined()
  expect(api.writes()).toEqual([])
  await expect(page.locator('#top').getByRole('link', { name: 'Góp vốn', exact: true })).toHaveAttribute('href', '/lo')
  await expect(page.locator('#top').getByRole('link', { name: 'Đặt trước cua', exact: true })).toHaveAttribute('href', '/lo')
  expect(await forbiddenWords(page)).toEqual([])
})

test('vốn xác nhận / mục tiêu tạo phần trăm thật, không cộng vốn giữ chỗ', async ({ page }) => {
  await page.goto('/')
  const card = page.getByRole('article', { name: first.title })
  await expect(card).toContainText(vnd(50_000_000))
  await expect(card).toContainText(vnd(200_000_000))
  await expect(card).toContainText('25%')
  await expect(card).not.toContainText('70%')
  await expect(card).toContainText(/8\s*nhà đầu tư/i)
  await expect(card.getByRole('link').first()).toHaveAttribute('href', `/lo/${first.batchCode}`)
  await expect(page.locator('#gop-von')).toContainText(vnd(2_000_000))
})

test('tối đa ba lô nhận vốn, bỏ lô chưa mở, hết hạn, hết chỗ hoặc khác mô hình', async ({ page, api }) => {
  const excluded = [openBatch('P-FUTURE', { fundingOpenAt: daysFromNow(2) }), openBatch('P-EXPIRED', { fundingDeadline: daysFromNow(-1) }),
    openBatch('P-FULL', { remainingCapital: 0, confirmedCapital: 200_000_000 }),
    openBatch('P-RESERVED', { remainingCapital: 0, confirmedCapital: 50_000_000, reservedCapital: 150_000_000 }),
    openBatch('P-BELOW-MIN', { remainingCapital: 1_000_000 }), openBatch('P-CLOSED', { status: 'Closed' }), openBatch('T-NOT-P', { batchMode: 'T' })]
  mockLanding(api, [...excluded, first, second, third, openBatch('P-LIVE-04'), openBatch('P-LIVE-05'), growing])
  await page.goto('/')
  const section = page.locator('#gop-von')
  await expect(section.getByRole('article')).toHaveCount(3)
  for (const b of [...excluded, growing]) await expect(section).not.toContainText(b.title)
})

test('sản lượng kế hoạch là số con × gam / 1000, loại lô đóng khỏi mục đang nuôi', async ({ page, api }) => {
  const closed = openBatch('P-OLD', { status: 'Closed', plannedQuantity: 99999, expectedAvgWeightG: 99999 })
  mockLanding(api, [first, growing, closed])
  await page.goto('/')
  const section = page.locator('#san-luong')
  await expect(section).toContainText(growing.title)
  await expect(section).toContainText('270') // 600 × 450 / 1000 = 270 kg.
  await expect(section).toContainText(/kg/i)
  await expect(section).not.toContainText(closed.title)
})

test('trại chỉ lấy từ publicFarm, không biến tên pháp nhân thành địa điểm trại', async ({ page, api }) => {
  const noFarm = openBatch('P-NO-FARM', { executorName: 'Tên pháp nhân không phải trại' })
  mockLanding(api, [first, noFarm, growing])
  await page.goto('/')
  await expect(page.locator('#trai-nuoi')).toContainText(first.publicFarm!.name)
  await expect(page.locator('#trai-nuoi')).not.toContainText(noFarm.executorName)
})

test('hồ sơ trại hiển thị vị trí cùng điểm và số lượt đánh giá đã công bố', async ({ page, api }) => {
  const farm = { ...first.publicFarm!, ratingAverage: 4.6, ratingCount: 17 }
  mockLanding(api, [openBatch('P-FARM-RATED', { status: 'InProduction', publicFarm: farm })])
  await page.goto('/#san-luong')
  const section = page.locator('#san-luong')
  await expect(section).toContainText(farm.name)
  await expect(section).toContainText(farm.province)
  await expect(section).toContainText(/4[,.]6/)
  await expect(section).toContainText(/17\s*(lượt|đánh giá)/)
})

test('hợp tác xã đứng tên hai lô có tổng sản lượng đúng khi thiếu hồ sơ trại', async ({ page, api }) => {
  const operator = 'HTX Cua Biển'
  const lots = [40, 30].map((plannedQuantity, i) => openBatch(`P-COOP-${i}`, {
    status: 'InProduction', executorName: operator, plannedQuantity, expectedAvgWeightG: 420,
  }))
  mockLanding(api, lots)
  await page.goto('/#san-luong')
  const section = page.locator('#san-luong')
  await expect(section).toContainText(operator)
  await expect(section).toContainText(/29[,.]4\s*kg/)
  await expect(section.locator('iframe')).toHaveCount(0)
  await expect(section).not.toContainText(/\d[,.]\d\s*\/\s*5/)
})

test('sản lượng gộp đúng theo trại đã công bố, lô chưa có trại vẫn tách riêng', async ({ page, api }) => {
  const farmA = openBatch('P-FARM-GROW-A', { status: 'InProduction', publicFarm: first.publicFarm, plannedQuantity: 600, expectedAvgWeightG: 450 })
  const farmB = openBatch('P-FARM-GROW-B', { status: 'Harvesting', publicFarm: first.publicFarm, plannedQuantity: 100, expectedAvgWeightG: 600 })
  mockLanding(api, [farmA, farmB, growing])
  await page.goto('/')
  const section = page.locator('#san-luong')
  const grouped = section.getByRole('article', { name: first.publicFarm!.name, exact: true })
  await expect(grouped).toHaveCount(1)
  await expect(grouped).toContainText('700 con')
  await expect(grouped).toContainText('330 kg') // 600 × .45 + 100 × .6.
  await grouped.locator('details:not([open]) > summary').click()
  await expect(grouped.locator(`a[href="/lo/${farmA.batchCode}"]`)).toBeVisible()
  await expect(grouped.locator(`a[href="/lo/${farmB.batchCode}"]`)).toBeVisible()
  await expect(grouped).not.toContainText(growing.title)
  await expect(section).toContainText(growing.title)
})

const viDate = (ms: number) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(ms))

test('chào giá mỗi lô một thẻ: trại nuôi, số còn theo availability mới nhất, tiền cọc và lọc loại cua', async ({ page, api }) => {
  mockLanding(api, [first, growing])
  await page.goto('/')
  const prices = page.locator('#gia-si')
  const card = prices.locator(`[data-batch-code="${first.batchCode}"]`)
  await expect(card).toContainText(first.publicFarm!.name)
  await expect(card).toContainText(vnd(first.offers[0].pricePerKg))
  await expect(card.locator('[data-spec-code="RC-L-A"]')).toContainText('Còn 77 con')
  await expect(card.locator('[data-spec-code="RC-M-A"]')).toContainText('Còn 46 con')
  await expect(card).toContainText('Cọc 35%')
  await expect(card.getByRole('link', { name: /^Đặt mua/ })).toHaveAttribute('href', `/lo/${first.batchCode}`)
  expect(api.sent('GET', `/api/batches/${first.batchCode}/availability`).length).toBeGreaterThan(0)
  // The response accounts for reservations: not the stale list's 540 − 140 = 400.
  await expect(prices).not.toContainText('400 con')
  await expect(prices).not.toContainText('30%')
  await prices.getByRole('group', { name: 'Lọc loại cua' }).getByRole('button', { name: 'Cua gạch', exact: true }).click()
  await expect(prices.locator('[data-spec-code="RC-L-A"]')).toHaveCount(1)
  await expect(prices.locator('[data-spec-code="FM-TEST-A"]')).toHaveCount(0)
})

test('chào giá ghi số ngày đã nuôi từ tiến độ công khai; lô chưa nuôi ghi ngày dự kiến có cua', async ({ page, api }) => {
  mockLanding(api, [first, growing])
  api.get(`/api/batches/${growing.batchCode}/progress`, { ...progressP, batchCode: growing.batchCode, status: 'InProduction', crabsAlive: 590, daysRaised: 12 })
  await page.goto('/')
  const grown = page.locator(`#gia-si [data-batch-code="${growing.batchCode}"]`)
  await expect(grown).toContainText('Đã nuôi')
  await expect(grown).toContainText(`12 / ${growing.holdingDays} ngày`)
  await expect(grown).toContainText(`Dự kiến có cua ${viDate(Date.now() + (growing.holdingDays! - 12) * 86_400_000)}`)
  const funding = page.locator(`#gia-si [data-batch-code="${first.batchCode}"]`)
  await expect(funding).toContainText('Dự kiến có cua')
  // Lô chưa thả nuôi: ngày nhận cua dự kiến cộng số ngày nuôi, không bịa số ngày đã nuôi.
  await expect(funding).toContainText(viDate(Date.parse(first.expectedReceiptDate!) + first.holdingDays! * 86_400_000))
  await expect(funding).not.toContainText('Đã nuôi')
})

test('availability lỗi không được thay bằng số tồn hoặc tiền cọc dự phòng', async ({ page, api }) => {
  mockLanding(api, [first])
  api.get(`/api/batches/${first.batchCode}/availability`, () => reply(503, { detail: 'Chưa xác nhận được khả năng đặt trước.' }))
  await page.goto('/')
  await expect(page.locator('#gop-von')).toContainText(first.title)
  await expect.poll(() => api.sent('GET', `/api/batches/${first.batchCode}/availability`).length).toBeGreaterThan(0)
  await expect(page.locator('#gia-si')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(/400 con|30%|35%|NaN|Infinity/)
})

test('chào giá: mỗi lô giữ giá, tồn và cọc riêng, không cộng tồn giữa các lô và vừa màn 320 px', async ({ page, api }) => {
  mockLanding(api, [first, second])
  const secondCurrent = availability(second)
  api.get(`/api/batches/${second.batchCode}/availability`, {
    ...secondCurrent, depositRatePct: 40,
    specs: secondCurrent.specs.map((spec) => ({ ...spec, pricePerKg: spec.pricePerKg - 30_000, remaining: 11 })),
  })
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/')
  const prices = page.locator('#gia-si')
  await expect(prices.getByRole('article')).toHaveCount(2)
  await expect(prices.locator('img, table')).toHaveCount(0)
  const firstLot = prices.locator(`[data-batch-code="${first.batchCode}"]`)
  const secondLot = prices.locator(`[data-batch-code="${second.batchCode}"]`)
  await expect(firstLot.locator('[data-spec-code="RC-L-A"]')).toContainText('Còn 77 con')
  await expect(firstLot).toContainText('35%')
  await expect(firstLot).toContainText(vnd(520_000))
  await expect(secondLot.locator('[data-spec-code="RC-L-A"]')).toContainText('Còn 11 con')
  await expect(secondLot).toContainText('40%')
  await expect(secondLot).toContainText(vnd(490_000))
  const buy = secondLot.getByRole('link', { name: /^Đặt mua/ })
  await expect(buy).toHaveAttribute('href', `/lo/${second.batchCode}`)
  await expect(prices).not.toContainText('88 con')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  for (const block of await prices.locator('.wb-card, .wb-specs li, .wb-buy').all()) {
    const bounds = await block.boundingBox()
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320)
  }
  await buy.focus()
  await expect(buy).toBeFocused()
})

test('thiếu trường số và địa điểm không tạo số không hay tên trại giả', async ({ page, api }) => {
  const incomplete = { ...first, publicFarm: undefined, targetCapital: null, confirmedCapital: null, investorCount: null,
    minContribution: null, executorName: 'Pháp nhân chưa công bố trại' } as unknown as PublicBatch
  const noPlan = { ...growing, plannedQuantity: null, expectedAvgWeightG: null } as unknown as PublicBatch
  mockLanding(api, [incomplete, noPlan])
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect.poll(() => api.sent('GET', '/api/batches').length).toBeGreaterThan(0)
  await expect(page.locator('#gop-von').getByRole('article')).toHaveCount(0)
  await expect(page.locator('#san-luong iframe')).toHaveCount(0)
  await expect(page.locator('#san-luong')).not.toContainText(incomplete.executorName!)
  await expect(page.locator('body')).not.toContainText(/NaN|Infinity|undefined|0 nhà đầu tư|0 kg/)
})

test('danh sách rỗng hoặc response sai cấu trúc không tạo lô và minimum giả', async ({ page, api }) => {
  for (const response of [listResponse([]), { items: null, total: 100, page: 1, pageSize: 100 }]) {
    api.get('/api/batches', response)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('#gop-von').getByRole('article')).toHaveCount(0)
    await expect(page.locator('#gop-von')).not.toContainText(first.title)
    await expect(page.locator('body')).not.toContainText(/NaN|Infinity/)
  }
})

test('lỗi API có thử lại và phục hồi dữ liệu thật, không thay bằng lô mẫu', async ({ page, api }) => {
  api.get('/api/batches', () => reply(503, { detail: 'Tạm ngừng dữ liệu lô công khai.' }))
  await page.goto('/')
  const retry = page.getByRole('button', { name: /Thử lại/i }).first()
  await expect(retry).toBeVisible({ timeout: 10000 })
  await expect(page.locator('#gop-von').getByRole('article')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(first.title)
  api.get('/api/batches', listResponse(defaultRows))
  await retry.click()
  await expect(page.locator('#gop-von')).toContainText(first.title)
  expect(api.writes()).toEqual([])
})

test('minimum lấy cả trang sau nhưng thẻ nhận vốn vẫn tối đa ba', async ({ page, api }) => {
  const archived = Array.from({ length: 97 }, (_, index) => openBatch(`P-ARCHIVE-${index}`, { status: 'Closed', offers: [] }))
  const late = openBatch('P-LATE-CHEAP', { minContribution: 500_000, offers: [], fundingDeadline: daysFromNow(20) })
  api.get('/api/batches', (call) => ({ items: call.query.page === '1' ? [first, second, third, ...archived] : [late], page: Number(call.query.page), pageSize: 100, total: 101 }))
  await page.goto('/')
  await expect(page.locator('#gop-von')).toContainText(vnd(500_000))
  await expect(page.getByTestId('landing-funding-card')).toHaveCount(3)
  expect(api.sent('GET', '/api/batches').map((call) => call.query.page)).toEqual(['1', '2'])
  await page.locator('#hoi-dap').getByRole('button', { name: 'Cẩm nang đầu tư' }).click()
  await page.locator('#hoi-dap').getByRole('region', { name: 'Cẩm nang đầu tư' }).locator('summary').first().click()
  await expect(page.locator('#hoi-dap')).toContainText(vnd(500_000))
})

test('trang sau lỗi không công bố số tổng hay minimum từ trang đầu thiếu dữ liệu', async ({ page, api }) => {
  const archived = Array.from({ length: 97 }, (_, index) => openBatch(`P-ARCHIVE-${index}`, { status: 'Closed', offers: [] }))
  api.get('/api/batches', (call) => call.query.page === '1'
    ? { items: [first, second, third, ...archived], page: 1, pageSize: 100, total: 101 }
    : reply(503, { detail: 'Trang thứ hai tạm không khả dụng.' }))
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Thử lại/i })).toBeVisible()
  expect(api.sent('GET', '/api/batches').map((call) => call.query.page)).toEqual(['1', '2'])
  await expect(page.getByTestId('landing-funding-card')).toHaveCount(0)
  await expect(page.locator('#gop-von')).not.toContainText(vnd(2_000_000))
  await expect(page.locator('#gop-von')).toContainText('Góp vốn có rủi ro.')
})

test('hạn đặt trước của P theo fundingDeadline hiện hành, không dùng mốc riêng khác hợp đồng backend', async ({ page, api }) => {
  mockLanding(api, [first])
  await page.goto('/')
  const card = page.locator(`#gia-si [data-batch-code="${first.batchCode}"]`)
  await expect(card).toContainText(`Đặt trước đến ${viDate(Date.parse(first.fundingDeadline!))}`)
  await expect(card).not.toContainText(viDate(Date.parse(first.preorderDeadline!)))
})

test('availability đóng nhận đơn giữ giá công khai nhưng không mời đặt theo tồn cũ', async ({ page, api }) => {
  mockLanding(api, [first])
  api.get(`/api/batches/${first.batchCode}/availability`, { ...availability(first), acceptingPreorders: false })
  await page.goto('/')
  const card = page.locator(`#gia-si [data-batch-code="${first.batchCode}"]`)
  await expect(card).toContainText('Đã đóng đặt trước')
  await expect(card).toContainText(vnd(first.offers[0].pricePerKg))
  await expect(card).not.toContainText('77 con')
  await expect(card).not.toContainText('Cọc')
  await expect(card.getByRole('link', { name: /^Đặt mua/ })).toHaveCount(0)
  await expect(card.getByRole('link', { name: /^Xem lô/ })).toHaveAttribute('href', `/lo/${first.batchCode}`)
  await expect(page.locator('#gia-si .wb-foot')).toContainText('Giá do người nuôi chào, khóa khi lô được duyệt.')
})

test('nhãn hết quy cách cần tồn đã xác nhận bằng không; tồn chưa biết không bị coi là hết', async ({ page, api }) => {
  mockLanding(api, [first])
  for (const remaining of [0, null]) {
    api.get(`/api/batches/${first.batchCode}/availability`, {
      ...availability(first), specs: availability(first).specs.map((spec) => ({ ...spec, remaining })),
    })
    await page.goto('/')
    const card = page.locator(`#gia-si [data-batch-code="${first.batchCode}"]`), spec = card.locator('[data-spec-code="RC-L-A"]')
    await expect(spec).toBeVisible()
    if (remaining === 0) {
      await expect(spec).toContainText('Hết quy cách này')
      await expect(card.getByRole('link', { name: /^Đặt mua/ })).toHaveCount(0)
    } else {
      await expect(spec).not.toContainText(/Hết quy cách|Đã đóng|chưa nhận đặt/)
      await expect(card.getByRole('link', { name: /^Đặt mua/ })).toHaveCount(1)
    }
  }
})

test('mã truy xuất được trim rồi mở đúng đơn hàng; không dùng QR mẫu', async ({ page, api }) => {
  await page.goto('/')
  const section = page.locator('#truy-xuat'), code = section.getByLabel('Mã truy xuất', { exact: true })
  await code.fill('   ')
  await section.getByRole('button', { name: 'Tra cứu', exact: true }).click()
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/)
  await expect(section).toContainText('Nhập mã in trên đơn hàng để tra cứu.')
  expect(api.sent('GET', `/api/trace/orders/${trace.traceCode}`)).toHaveLength(0)
  await code.fill(`  ${trace.traceCode} `)
  await section.getByRole('button', { name: 'Tra cứu', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/truy-xuat/${trace.traceCode}$`))
  await expect(page.getByText(trace.farmName)).toBeVisible()
})

test('không có màn hình mẫu, QR mẫu hay nút video giả; mục mô hình 3D đang tạm ẩn', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('img[src*="/landing/man-hinh/"], img[src*="/landing/thiet-ke/"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Xem video|Xem camera|Xem nhật ký|Xem demo cân/i })).toHaveCount(0)
  await expect(page.getByText('Bản thiết kế in 3D', { exact: true })).toHaveCount(0)
  await expect(page.locator('#thiet-bi')).toHaveCount(0)
  // Trang chủ không còn QR mẫu; ô tra mã nằm ở chân trang.
  await expect(page.locator('#truy-xuat svg[role="img"], .ldm-trace__demo')).toHaveCount(0)
  await expect(page.locator('#cong-nghe, iframe')).toHaveCount(0)
  await expect(page.getByRole('banner').getByRole('link', { name: 'Công nghệ' })).toHaveCount(0)
})

// Mục Công nghệ có mô hình 3D đang tạm ẩn (SHOW_TWIN = false trong Landing.tsx). Bật lại mục đó thì bỏ .skip.
test.describe.skip('mục mô hình 3D (đang tạm ẩn)', () => {
test('3D chỉ là mô hình Twin ghi rõ mô phỏng', async ({ page }) => {
  await page.goto('/')
  const tech = page.locator('#cong-nghe')
  await expect(tech).toContainText('Số liệu trong mô hình là dữ liệu mẫu.')
  const frame = tech.locator('iframe')
  await expect(frame).toHaveAttribute('src', 'https://crabshare-twin.vercel.app/?view=quy-trinh')
  await expect(frame).toHaveAttribute('loading', 'lazy')
  await tech.getByRole('tab', { name: /Trạm cân đo/ }).click()
  await expect(frame).toHaveAttribute('src', 'https://crabshare-twin.vercel.app/?view=tram-do')
  // Khung 3D chỉ nhận chuột sau khi bấm, để cuộn trang không bị kẹt.
  await tech.getByRole('button', { name: 'Bấm để xoay, phóng to mô hình' }).click()
  await expect(tech.getByRole('button', { name: 'Bấm để xoay, phóng to mô hình' })).toHaveCount(0)
})

test('điện thoại mở mô hình 3D ở trang riêng thay vì nhúng khung nặng', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const tech = page.locator('#cong-nghe')
  await expect(tech.locator('iframe')).toHaveCount(0)
  await expect(tech.getByRole('link', { name: /Mở mô hình 3D/ })).toHaveAttribute('href', 'https://crabshare-twin.vercel.app/?view=quy-trinh')
})
})

test('cẩm nang chỉ là hai nút; bấm mới mở câu hỏi, ghi rõ trợ lý AI chưa có', async ({ page }) => {
  await page.goto('/')
  const books = page.locator('#hoi-dap')
  const farming = books.getByRole('button', { name: 'Cẩm nang nuôi cua' }), investing = books.getByRole('button', { name: 'Cẩm nang đầu tư' })
  await expect(books.getByRole('button')).toHaveCount(2)
  await expect(books.locator('summary').filter({ visible: true })).toHaveCount(0)
  await investing.click()
  await expect(investing).toHaveAttribute('aria-expanded', 'true')
  const panel = books.getByRole('region', { name: 'Cẩm nang đầu tư' })
  await expect(panel.locator('summary')).toHaveText(['Góp tối thiểu bao nhiêu?', 'Lô bị lỗ thì sao?'])
  await expect(panel).toContainText('Trợ lý AI cho cẩm nang này đang được làm.')
  await farming.click()
  await expect(investing).toHaveAttribute('aria-expanded', 'false')
  await expect(books.getByRole('region', { name: 'Cẩm nang nuôi cua' }).locator('summary')).toHaveCount(2)
  await expect(books.getByRole('textbox')).toHaveCount(0)
})

test('liên kết "Cách chia tiền" (/#chia) mở sẵn cẩm nang đầu tư ở câu lỗ', async ({ page }) => {
  await page.goto('/#chia')
  await expect(page.getByRole('button', { name: 'Cẩm nang đầu tư' })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#chia')).toBeVisible()
  await expect(page.locator('#chia')).toHaveAttribute('open', '')
})

test('thanh trên chỉ trỏ tới mục đang có trên trang', async ({ page, api }) => {
  mockLanding(api, [second])
  await page.goto('/')
  await expect(page.locator('#gia-si')).toBeVisible()
  const nav = page.getByRole('banner').getByRole('navigation', { name: 'Điều hướng chính' })
  await expect(nav.getByRole('link', { name: 'Chào giá' })).toHaveAttribute('href', '#gia-si')
  // Lô không có hồ sơ trại công khai: không có mục Hộ nuôi nên không có liên kết tới nó.
  await expect(page.locator('#trai-nuoi')).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Hộ nuôi' })).toHaveCount(0)
})

test('liên kết và điều hướng tài khoản trỏ tới trang có thật', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#gop-von')).toContainText(first.title)
  const hrefs = await page.locator('a[href]').evaluateAll((links) => [...new Set(links.map((a) => a.getAttribute('href')!))])
  for (const href of hrefs) {
    if (href.startsWith('#')) await expect(page.locator(`[id="${href.slice(1)}"]`), `mục ${href}`).toHaveCount(1)
    else if (href.startsWith('https://crabshare-twin.vercel.app/')) expect(href).toMatch(/^https:\/\/crabshare-twin\.vercel\.app\/(?:\?view=[a-z-]+)?$/)
    else if (href.startsWith('https://www.google.com/maps/search/')) {
      const url = new URL(href)
      expect(url.searchParams.get('api')).toBe('1')
      expect(url.searchParams.get('query')).toBe(`${first.publicFarm!.latitude},${first.publicFarm!.longitude}`)
    } else expect(href).toMatch(/^\/(?:lo(?:\/[^/?#]+)?|chuan-phan-hang|dang-nhap|dang-ky|dang-ky-ho-nuoi)(?:\?[^#]*)?$/)
  }
  await expect(page.locator('#chia')).toHaveCount(1)
  await page.getByRole('banner').getByRole('link', { name: 'Đăng ký', exact: true }).click()
  await expect(page).toHaveURL(/\/dang-ky$/)
  await page.getByRole('link', { name: 'Về trang chủ' }).click()
  await page.getByRole('banner').getByRole('link', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL(/\/dang-nhap$/)
})

test('người đã đăng nhập vẫn thấy nút về cổng của mình', async ({ page }) => {
  await signIn(page, 'Investor')
  await page.goto('/')
  await expect(page.getByRole('banner').getByRole('link', { name: 'Vào trang của tôi' })).toHaveAttribute('href', '/nha-dau-tu')
  await expect(page.getByRole('banner').getByRole('link', { name: 'Đăng nhập', exact: true })).toHaveCount(0)
})

test('bốn câu hỏi trong hai cẩm nang mở được bằng bàn phím', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#hoi-dap summary')).toHaveCount(4)
  for (const name of ['Cẩm nang nuôi cua', 'Cẩm nang đầu tư']) {
    const button = page.locator('#hoi-dap').getByRole('button', { name })
    await button.focus(); await page.keyboard.press('Enter')
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    for (const summary of await page.locator('#hoi-dap').getByRole('region', { name }).locator('summary').all()) {
      await summary.focus(); await page.keyboard.press('Enter')
      await expect(summary.locator('..')).toHaveAttribute('open', '')
    }
  }
  expect(await forbiddenWords(page)).toEqual([])
})

test('điện thoại không tràn ngang và các ảnh hiện có đều tải được', async ({ page }) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await page.goto('/')
    await expect(page.locator('#gop-von')).toContainText(first.title)
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    for (let y = 0; y < height; y += 700) await page.evaluate((top) => window.scrollTo(0, top), y)
    const layout = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll('body *')].map((el) => ({
        element: `${el.tagName.toLowerCase()}.${typeof el.className === 'string' ? el.className : ''}`,
        right: Math.round(el.getBoundingClientRect().right), width: Math.round(el.getBoundingClientRect().width),
      })).filter((rect) => rect.right > innerWidth + 1).slice(0, 15),
    }))
    expect(layout.width, JSON.stringify(layout.overflow)).toBeLessThanOrEqual(width)
    for (const img of await page.locator('img').filter({ visible: true }).all()) {
      await img.scrollIntoViewIfNeeded()
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { message: await img.getAttribute('src') ?? '' }).toBe(true)
    }
  }
})
