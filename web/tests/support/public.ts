/* Dữ liệu giả lập của các trang công khai: /lo, /lo/:code, /chuan-phan-hang, /truy-xuat/:traceCode. */
import type {
  AvailabilityResponse, BatchProgressResponse, ExploreBatchResponse, GradingStandardResponse, OrderTraceResponse, PagedResultOfExploreBatchResponse,
} from '../../src/shared/api/api.gen'
import { dateFromNow, daysFromNow, reply, type Api, type PageUnderTest } from './app'

/** Lô P đang gọi vốn, có bảng chào giá nên cũng nhận đặt trước. */
export const batchP: ExploreBatchResponse = {
  batchCode: 'P-2611-01', batchMode: 'P', status: 'Funding', title: 'Cua gạch Năm Căn tháng 12', crabType: 'RoeCrab', executorName: 'HTX Năm Căn',
  plannedQuantity: 600, fundedQuantity: null, hasHolding: true, holdingDays: 30, saleDays: 14, expectedAvgWeightG: 420, expectedGrade: 'A',
  expectedReceiptDate: dateFromNow(20), deliveryRadiusKm: 350, distanceKm: null, standardCostTotal: 180_000_000, standardCostPerCrab: 300_000,
  offers: [
    { specCode: 'RC-L-A', specName: 'Cua gạch L hạng A', sizeCode: 'L', gradeCode: 'A', pricePerKg: 520_000, conversionWeightG: 420, offeredQuantity: 300 },
    { specCode: 'RC-M-A', specName: 'Cua gạch M hạng A', sizeCode: 'M', gradeCode: 'A', pricePerKg: 480_000, conversionWeightG: 380, offeredQuantity: 240 },
  ],
  floorPricePerKg: 380_000, offtakeBuyerName: 'Công ty Hải sản Đất Mũi', platformFeeRatePct: 3, settlementBasis: 'Pool',
  targetCapital: 200_000_000, confirmedCapital: 120_000_000, reservedCapital: 10_000_000, remainingCapital: 70_000_000, investorCount: 8, minContribution: 5_000_000,
  sellableCrabs: 540, depositedPreorderCrabs: 140, preorderRatioPct: 26,
  fundingOpenAt: daysFromNow(-5), fundingDeadline: daysFromNow(10), preorderDeadline: daysFromNow(15),
  costByCategory: [{ category: 'Seed', amount: 120_000_000 }, { category: 'Feed', amount: 40_000_000 }, { category: 'Labour', amount: 20_000_000 }],
}

/** Lô T đang lưu nuôi: chỉ nhận đặt trước, không gọi vốn. */
export const batchT: ExploreBatchResponse = {
  ...batchP,
  batchCode: 'T-2611-02', batchMode: 'T', status: 'InProduction', title: 'Cua thịt Ngọc Hiển đợt 2', crabType: 'FatteningMudCrab', executorName: 'Trại cua Tư Bền',
  plannedQuantity: 400, holdingDays: 21, expectedAvgWeightG: 350, offtakeBuyerName: null, saleDays: null, floorPricePerKg: null,
  offers: [{ specCode: 'FM-L-A', specName: 'Cua thịt L hạng A', sizeCode: 'L', gradeCode: 'A', pricePerKg: 360_000, conversionWeightG: 350, offeredQuantity: 360 }],
  targetCapital: 0, confirmedCapital: 0, reservedCapital: 0, remainingCapital: 0, investorCount: 0, minContribution: 0,
  sellableCrabs: 360, depositedPreorderCrabs: 60, fundingOpenAt: null, fundingDeadline: null, preorderDeadline: daysFromNow(6), costByCategory: null,
}

/** Lô P đang gọi vốn nhưng chưa có bảng chào giá: không nhận đặt trước. */
export const batchPNoOffers: ExploreBatchResponse = {
  ...batchP, batchCode: 'P-2611-03', title: 'Cua cốm Đầm Dơi', crabType: 'YoungFemaleCrab', executorName: 'Hộ nuôi Sáu Thơ', offers: [], preorderDeadline: null,
  confirmedCapital: 30_000_000, remainingCapital: 170_000_000, investorCount: 2,
}

export const exploreBatches = [batchP, batchT, batchPNoOffers]
export const explorePage = (items: ExploreBatchResponse[]): PagedResultOfExploreBatchResponse => ({ items, page: 1, pageSize: 60, total: items.length })

export const availabilityP: AvailabilityResponse = {
  batchCode: batchP.batchCode, acceptingPreorders: true, sellableCrabs: 540, committedCrabs: 140, remainingCrabs: 400,
  specs: [
    { specCode: 'RC-L-A', specName: 'Cua gạch L hạng A', pricePerKg: 520_000, conversionWeightG: 420, offeredQuantity: 300, committed: 100, remaining: 200 },
    { specCode: 'RC-M-A', specName: 'Cua gạch M hạng A', pricePerKg: 480_000, conversionWeightG: 380, offeredQuantity: 240, committed: 40, remaining: 200 },
  ],
  minOrderCrabs: 20, depositRatePct: 30, holdMinutes: 30,
}

export const availabilityT: AvailabilityResponse = {
  batchCode: batchT.batchCode, acceptingPreorders: true, sellableCrabs: 360, committedCrabs: 60, remainingCrabs: 300,
  specs: [{ specCode: 'FM-L-A', specName: 'Cua thịt L hạng A', pricePerKg: 360_000, conversionWeightG: 350, offeredQuantity: 360, committed: 60, remaining: 300 }],
  minOrderCrabs: 10, depositRatePct: 30, holdMinutes: 30,
}

/** Lô chưa thả nuôi: trang Lô không hiện mục Tiến độ. */
export const progressP: BatchProgressResponse = {
  batchCode: batchP.batchCode, status: 'Funding', crabsAlive: 0, daysRaised: null, isParticipant: false,
  deadCrabs: null, restockedCrabs: null, gradedCrabs: null, deliveredOrSoldCrabs: null,
}

/** Người ngoài chỉ thấy số cua đang nuôi và số ngày nuôi. */
export const progressT: BatchProgressResponse = {
  batchCode: batchT.batchCode, status: 'InProduction', crabsAlive: 372, daysRaised: 9, isParticipant: false,
  deadCrabs: null, restockedCrabs: null, gradedCrabs: null, deliveredOrSoldCrabs: null,
}

export const trace: OrderTraceResponse = {
  traceCode: 'TRC7K2M9QX', batchCode: batchT.batchCode, batchTitle: batchT.title, crabType: batchT.crabType, farmName: 'Trại cua Tư Bền',
  sourceLots: [
    { originRegion: 'Ngọc Hiển, Cà Mau', harvestedOn: '2026-11-02', species: 'Scylla paramamosain' },
    { originRegion: null, harvestedOn: null, species: 'Scylla olivacea' },
  ],
  lines: [{ specCode: 'FM-L-A', specName: 'Cua thịt L hạng A', crabs: 24 }, { specCode: 'FM-XL-A', specName: 'Cua thịt XL hạng A', crabs: 12 }],
  deliveries: ['2026-11-08T02:30:00Z'],
  // Backend ghi kèm số quy tắc trong câu chú thích; trang phải bỏ đi trước khi hiện.
  standardNote: 'Hạng theo chuẩn nội bộ tham chiếu, không phải chứng nhận (BR-038).',
}

export const standards: GradingStandardResponse[] = [{
  standardCode: 'CS-GRADE-01', revision: '2026', issuer: 'CrabShare', scope: 'Cua biển sống', effectiveFrom: '2026-09-01', note: null,
  ruleSets: [{
    id: 3, crabType: 'RoeCrab', versionNo: 2, status: 'Active', effectiveFrom: '2026-09-01', nearThresholdPct: 3, note: null, approvedAt: '2026-08-28T03:00:00Z',
    rules: [
      { id: 31, ruleKind: 'Size', metric: 'WeightG', lowerBound: 400, upperBound: null, unit: 'g', boundary: 'LowerInclusive', resultLabel: 'L', sortOrder: 1, note: null },
      { id: 32, ruleKind: 'Size', metric: 'WeightG', lowerBound: 300, upperBound: 400, unit: 'g', boundary: 'LowerInclusive', resultLabel: 'M', sortOrder: 2, note: null },
      { id: 33, ruleKind: 'Exclusion', metric: 'Alive', lowerBound: null, upperBound: null, unit: '', boundary: 'None', resultLabel: 'REJECT', sortOrder: 9, note: 'Cua chết' },
    ],
  }],
}]

const notFound = (what: string) => reply(404, { status: 404, detail: `Không tìm thấy ${what}.` })

/** Giả lập mặc định cho mọi trang trong PUBLIC_PAGES. */
export function mockPublic(api: Api) {
  api.get('/api/batches', (call) => explorePage(exploreBatches.filter((b) => !call.query.crabType || b.crabType === call.query.crabType)))
  api.get(/^\/api\/batches\/[^/]+$/, (call) => exploreBatches.find((b) => call.path.endsWith(`/${b.batchCode}`)) ?? notFound('Lô'))
  api.get(/^\/api\/batches\/[^/]+\/progress$/, (call) => (call.path.includes(batchT.batchCode) ? progressT : progressP))
  api.get(/^\/api\/batches\/[^/]+\/availability$/, (call) => (call.path.includes(batchT.batchCode) ? availabilityT : availabilityP))
  api.get('/api/grading/standards', standards)
  api.get(`/api/trace/orders/${trace.traceCode}`, trace)
}

export const PUBLIC_PAGES: PageUnderTest[] = [
  { role: null, path: '/lo', ready: batchP.title },
  { role: null, path: `/lo/${batchP.batchCode}`, ready: 'Bảng giá theo quy cách' },
  { role: null, path: `/lo/${batchT.batchCode}`, ready: 'Tiến độ' },
  { role: null, path: '/chuan-phan-hang', ready: 'CS-GRADE-01' },
  { role: null, path: `/truy-xuat/${trace.traceCode}`, ready: trace.farmName },
]
