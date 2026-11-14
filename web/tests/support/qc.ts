/* Dữ liệu giả lập và API mặc định của cổng Nhân viên kiểm phẩm (/qc): việc được phân, kiểm đầu vào, duyệt phân hạng,
   thăm trại giữa vụ, chuẩn phân hạng. mockQc(api) đủ cho mọi trang trong QC_PAGES; từng test ghi đè phần cần đổi.
   Số liệu theo bộ quy tắc gốc của cua thịt (size M 200, L 300, XL 350 g; mức C 0,62 và 0,66; sát ngưỡng 2%). */
import type {
  BatchGradingSummary, BatchProgressResponse, BoxStateResponse, CrabUnitResponse, ExploreBatchResponse, GoodsReceiptResponse, GradeDecisionResponse,
  GradeRuleResponse, GradeRuleSetResponse, GradingStandardResponse, ProcurementOrderResponse, QcTaskResponse, SessionMeasurementsResponse,
  SiteVisitReportResponse,
} from '../../src/shared/api/api.gen'
import type { Locator } from '@playwright/test'
import { PNG, dateFromNow, daysFromNow, file, userOf, type Api, type Page, type PageUnderTest } from './app'

/** Nhân viên kiểm phẩm đang đăng nhập (signIn(page, 'QcInspector')) và một người kiểm khác trong pool. */
export const ME = userOf('QcInspector').userId
export const OTHER_QC = 215

export const hoursAgo = (hours: number) => daysFromNow(-hours / 24)

/* ---------- tiện ích cho spec ---------- */

/**
 * Giữ trang đứng yên khi có tệp trong web/ được lưu lúc test đang chạy: máy chủ dev của Vite báo qua kênh HMR và trình duyệt tải lại
 * cả trang (kể cả khi tệp vừa lưu chỉ là một spec khác), làm mất hộp thoại đang mở và số đang nhập. Kênh HMR là WebSocket duy nhất
 * của trang nên được thay bằng một kết nối câm. Gọi trước page.goto. (Cùng cách với noDevReload ở support/operator.ts.)
 */
export const noDevReload = (page: Page) => page.routeWebSocket(() => true, () => {})

const exactly = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)

/** Giá trị đứng sau một nhãn trong ô số liệu (OpFacts) hoặc bảng thông tin (OpKv): <dt>nhãn</dt><dd>giá trị</dd>. */
export const valueOf = (scope: Locator, label: string) =>
  scope.getByRole('term').filter({ hasText: exactly(label) }).locator('xpath=following-sibling::dd[1]')

/** Bấm một lựa chọn trong nhóm thẻ chọn (RadioCards): ô radio thật bị ẩn nên bấm vào chữ của thẻ như người dùng. */
export const pick = (scope: Locator, group: string, option: string) =>
  scope.getByRole('group', { name: group }).getByText(option, { exact: true }).click()

/** Ngày như formatDate của ứng dụng: "12/11/2026" theo giờ Việt Nam. */
export const vnDate = (iso: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso))

/* ---------- Lô ---------- */

/** Với Nhân viên kiểm phẩm, GET /api/batches/{code} trả bản công khai của Lô. */
const batch = (over: Pick<ExploreBatchResponse, 'batchCode' | 'title'> & Partial<ExploreBatchResponse>): ExploreBatchResponse => ({
  batchMode: 'P', status: 'InProduction', crabType: 'FatteningMudCrab', executorName: 'Trại cua Tư Bền',
  plannedQuantity: 40, fundedQuantity: 40, hasHolding: true, holdingDays: 35, saleDays: 14, expectedAvgWeightG: 320, expectedGrade: 'G1',
  expectedReceiptDate: null, deliveryRadiusKm: 400, distanceKm: null, standardCostTotal: 12_000_000, standardCostPerCrab: 300_000,
  offers: [], floorPricePerKg: null, offtakeBuyerName: null, platformFeeRatePct: 3, settlementBasis: 'StandardCost',
  targetCapital: 0, confirmedCapital: 0, reservedCapital: 0, remainingCapital: 0, investorCount: 0, minContribution: 0,
  sellableCrabs: 0, depositedPreorderCrabs: 0, preorderRatioPct: 0, fundingOpenAt: null, fundingDeadline: null, preorderDeadline: null, costByCategory: null,
  ...over,
})

/** Lô T đang mua nguồn: có phiếu nhận hàng chờ kiểm đầu vào. */
export const batchIncoming = batch({ batchCode: 'CS-2611-T2', title: 'Cua thịt Năm Căn giao cuối tháng', batchMode: 'T', status: 'Sourcing', hasHolding: false, holdingDays: null })
/** Lô P cua thịt đang thu hoạch: buổi đo và phân hạng được phân cho tôi. */
export const batchGrading = batch({ batchCode: 'CS-2611-P1', title: 'Cua thịt Ngọc Hiển đợt 11', status: 'Harvesting' })
/** Lô A cua gạch đang thu hoạch: có con bị người kiểm khác giữ lại, chờ tôi xác nhận lần hai. */
export const batchSecond = batch({ batchCode: 'CS-2610-A3', title: 'Cua gạch Đầm Dơi đợt 10', batchMode: 'A', crabType: 'RoeCrab', status: 'Harvesting', executorName: 'Hộ nuôi Sáu Thơ' })
/** Lô P cua gạch đang lưu nuôi: thăm trại giữa vụ. */
export const batchVisit = batch({ batchCode: 'CS-2611-P4', title: 'Cua gạch Rạch Gốc đợt 4', crabType: 'RoeCrab', executorName: 'HTX Rạch Gốc' })

export const batches = [batchIncoming, batchGrading, batchSecond, batchVisit]

/* ---------- việc được phân ---------- */

export const taskIncoming: QcTaskResponse = { assignmentId: 501, kind: 'IncomingInspection', batchCode: batchIncoming.batchCode, targetType: 'GoodsReceipt', targetId: 41, assignedAt: hoursAgo(1) }
export const taskGrading: QcTaskResponse = { assignmentId: 502, kind: 'GradingSession', batchCode: batchGrading.batchCode, targetType: 'Batch', targetId: 12, assignedAt: hoursAgo(3) }
/** Mỗi con bị giữ lại là một việc xác nhận lần hai; hai việc này cùng một Lô. */
export const taskSecondA: QcTaskResponse = { assignmentId: 503, kind: 'SecondReview', batchCode: batchSecond.batchCode, targetType: 'CrabUnit', targetId: 881, assignedAt: hoursAgo(5) }
export const taskSecondB: QcTaskResponse = { assignmentId: 504, kind: 'SecondReview', batchCode: batchSecond.batchCode, targetType: 'CrabUnit', targetId: 882, assignedAt: hoursAgo(4) }
export const taskVisit: QcTaskResponse = { assignmentId: 505, kind: 'SiteVisit', batchCode: batchVisit.batchCode, targetType: 'Batch', targetId: 14, assignedAt: hoursAgo(20) }
/** Loại việc chưa có trang làm việc trên web. */
export const taskDispatch: QcTaskResponse = { assignmentId: 506, kind: 'Dispatch', batchCode: batchGrading.batchCode, targetType: 'Shipment', targetId: 77, assignedAt: hoursAgo(2) }

export const tasks = [taskIncoming, taskGrading, taskSecondA, taskSecondB, taskVisit, taskDispatch]

/* ---------- kiểm đầu vào ---------- */

/** Phiếu nhận đang kiểm, phân cho tôi: khai báo 20 con, đã kiểm 3 (đạt 2, loại 1). */
export const receipt: GoodsReceiptResponse = {
  receiptNo: 'GR7K2M9QXA4T', poNo: 'PO-2611-T2-01', lotCode: 'LN-2611-T2-02', originRegion: 'Năm Căn, Cà Mau', harvestedOn: dateFromNow(-1),
  declaredCount: 20, declaredWeightKg: 6.4, receivedAt: hoursAgo(2), status: 'Inspecting', acceptedCount: 2, rejectedCount: 1, acceptedWeightG: 656,
  qcUserId: ME, completedAt: null,
}

/** Phiếu trước của cùng Lô, người kiểm khác đã kiểm xong. */
export const receiptDone: GoodsReceiptResponse = {
  ...receipt, receiptNo: 'GR3B8D5HN2WV', lotCode: 'LN-2611-T2-01', declaredCount: 30, declaredWeightKg: 9.6, receivedAt: daysFromNow(-2), status: 'Completed',
  acceptedCount: 30, rejectedCount: 0, acceptedWeightG: 9640, qcUserId: OTHER_QC, completedAt: daysFromNow(-1.9),
}

export const order: ProcurementOrderResponse = {
  poNo: receipt.poNo, batchCode: batchIncoming.batchCode, supplierPartyId: 31, supplierName: 'Vựa cua Hai Lúa', orderedOn: dateFromNow(-4),
  agreedSpec: 'Cua thịt 300–350 g, còn sống, đủ càng', quantity: 50, unitPrice: 250_000, status: 'PartiallyReceived', receivedCount: 32,
}

export const crab = (over: Pick<CrabUnitResponse, 'crabCode'> & Partial<CrabUnitResponse>): CrabUnitResponse => ({
  batchCode: batchIncoming.batchCode, lotCode: receipt.lotCode, originRegion: receipt.originRegion, harvestedOn: receipt.harvestedOn,
  species: 'Scylla paramamosain', sex: 'Male', maturity: 'Mature', receivedWeightG: 320, condition: 'Healthy', inventoryStatus: 'Received',
  currentSlotCode: null, replacesCrabCode: null, receivedAt: hoursAgo(1), boxes: [], events: [],
  ...over,
})

/** Cua của Lô đang mua nguồn: hai con đã đạt của phiếu đang kiểm và một con của phiếu trước. */
export const stockedCrabs: CrabUnitResponse[] = [
  crab({ crabCode: 'CU4T7N2K', receivedWeightG: 331.5, receivedAt: hoursAgo(1.5) }),
  crab({ crabCode: 'CU9H3W6P', receivedWeightG: 323.5, receivedAt: hoursAgo(1.2) }),
  crab({ crabCode: 'CU1D5F8G', lotCode: receiptDone.lotCode, receivedWeightG: 318, receivedAt: daysFromNow(-1.95) }),
]

/* ---------- chuẩn phân hạng ---------- */

let ruleId = 0
const rule = (ruleKind: string, metric: string, lowerBound: number | null, upperBound: number | null, unit: string, resultLabel: string, sortOrder: number,
  note: string | null = null, boundary = 'LowerInclusive'): GradeRuleResponse => ({ id: ++ruleId, ruleKind, metric, lowerBound, upperBound, unit, resultLabel, boundary, sortOrder, note })

/** Bộ quy tắc của cua thịt: size theo khối lượng, hạng theo chỉ số C. */
export const ruleSet: GradeRuleSetResponse = {
  id: 1, crabType: 'FatteningMudCrab', versionNo: 1, status: 'Active', effectiveFrom: '2026-01-01T00:00:00+07:00', nearThresholdPct: 2,
  note: 'Cua thịt: size theo bảng 3.2, mức C theo bảng 3.3.', approvedAt: '2026-01-01T00:00:00+07:00',
  rules: [
    rule('Size', 'WeightG', 200, 300, 'g', 'M', 1),
    rule('Size', 'WeightG', 300, 350, 'g', 'L', 2),
    rule('Size', 'WeightG', 350, null, 'g', 'XL', 3),
    rule('PhysicalFactor', 'CIndex', 0.66, null, 'g/cm3', 'SPECIAL', 1),
    rule('PhysicalFactor', 'CIndex', 0.62, 0.66, 'g/cm3', 'G1', 2),
    rule('PhysicalFactor', 'CIndex', null, 0.62, 'g/cm3', 'BELOW', 3),
    rule('Exclusion', 'Alive', 1, null, 'flag', 'REJECT', 1, 'Phải còn sống, khoẻ'),
    rule('Exclusion', 'FoodSafe', 1, null, 'flag', 'REJECT', 2, 'Phải an toàn thực phẩm'),
  ],
}

/** Bộ quy tắc của cua gạch: size theo khối lượng, hạng theo dải mép khi soi đỏ. Ghi chú của backend có dẫn số quy tắc; trang không được hiện. */
export const ruleSetRoe: GradeRuleSetResponse = {
  id: 3, crabType: 'RoeCrab', versionNo: 1, status: 'Active', effectiveFrom: '2026-01-01T00:00:00+07:00', nearThresholdPct: 2,
  note: 'Cua gạch: chỉ size và cảm quan (BR-038).', approvedAt: '2026-01-01T00:00:00+07:00',
  rules: [
    rule('Size', 'WeightG', 200, 250, 'g', 'M', 1),
    rule('Size', 'WeightG', 250, 350, 'g', 'L', 2),
    rule('Size', 'WeightG', 350, null, 'g', 'XL', 3),
    rule('Sensory', 'EdgeBandMm', null, 2, 'mm', 'SPECIAL', 1, 'BR-227: dưới 2 mm'),
    rule('Sensory', 'EdgeBandMm', 2, 4, 'mm', 'G1', 2, 'BR-227: từ 2 đến 4 mm', 'BothInclusive'),
    rule('Sensory', 'EdgeBandMm', 4, null, 'mm', 'BELOW', 3, 'Trên 4 mm: không đạt cấp 1', 'UpperInclusive'),
  ],
}

export const standards: GradingStandardResponse[] = [{
  standardCode: 'T/SCFA 0014-2024', revision: 'Bản sửa đổi hiệu lực 01/08/2026', issuer: 'Hiệp hội Thuỷ sản Trung Quốc',
  scope: 'Cua bùn sống (Scylla paramamosain): size theo khối lượng, mức C, cảm quan', effectiveFrom: '2026-08-01',
  note: 'Chuẩn nội bộ tham chiếu, không phải chứng nhận (BR-038).',
  ruleSets: [ruleSet, ruleSetRoe],
}]

/* ---------- duyệt phân hạng ---------- */

/** Một quyết định phân hạng; mặc định là đề xuất XL, Đặc cấp của Lô cua thịt, chưa ai duyệt. */
export const decision = (over: Pick<GradeDecisionResponse, 'decisionNo' | 'crabCode' | 'sessionNo'> & Partial<GradeDecisionResponse>): GradeDecisionResponse => ({
  batchCode: batchGrading.batchCode, ruleSetVersion: 1, versionNo: 1, status: 'Draft', isCurrent: true,
  weightG: 372.4, carapaceLengthCm: 8.2, cIndex: 0.6754, edgeBandMm: null,
  proposedSize: 'XL', proposedCLevel: 'SPECIAL', proposedSensory: null, proposedGrade: 'SPECIAL', holdReasons: [],
  finalSize: null, finalGrade: null, specCode: null, isSubstandard: false, liveStatus: null, foodSafety: null, sensoryNote: null, reason: null, hasPhoto: false,
  decidedBy: null, decidedAt: null, heldBy: null, secondQcId: null, secondConfirmedAt: null, createdAt: hoursAgo(0.5),
  ...over,
})

/** Đề xuất bình thường: chờ kiểm cảm quan rồi duyệt. */
export const draft = decision({ decisionNo: 'GD4A7K2M9QXA', crabCode: 'CU7K2M9Q', sessionNo: 'MS4A7K2M9QXA', createdAt: hoursAgo(0.5) })

/** Khối lượng 303,5 g cách ngưỡng 300 g chưa tới 2%: hệ thống tự giữ lại để kiểm kỹ. */
export const nearHold = decision({
  decisionNo: 'GD5B8N3P0RYB', crabCode: 'CU8N3P0R', sessionNo: 'MS5B8N3P0RYB', status: 'Hold', holdReasons: ['NearThreshold'],
  weightG: 303.5, carapaceLengthCm: 7.8, cIndex: 0.6396, proposedSize: 'L', proposedCLevel: 'G1', proposedGrade: 'G1', createdAt: hoursAgo(0.4),
})

/** Ảnh kém nên chưa có dài mai, chưa tính được chỉ số C: phải đo thước kẹp trước khi duyệt. */
export const caliperHold = decision({
  decisionNo: 'GD6C9P4Q1SZC', crabCode: 'CU9P4Q1S', sessionNo: 'MS6C9P4Q1SZC', status: 'Hold', holdReasons: ['ImageQuality', 'CaliperRequired'],
  weightG: 331, carapaceLengthCm: null, cIndex: null, proposedSize: 'L', proposedCLevel: null, proposedGrade: null, createdAt: hoursAgo(0.3),
})

const approvedBy = (hours: number): Partial<GradeDecisionResponse> => ({
  status: 'Approved', liveStatus: 'Alive', foodSafety: 'Pass', decidedBy: ME, decidedAt: hoursAgo(hours), createdAt: hoursAgo(hours + 0.2),
})

/** Đã duyệt đúng đề xuất XL, Đặc cấp. */
export const approved = decision({
  decisionNo: 'GD7D0Q5R2TAD', crabCode: 'CU0Q5R2T', sessionNo: 'MS7D0Q5R2TAD', ...approvedBy(1), weightG: 388, carapaceLengthCm: 8.3, cIndex: 0.6786,
  finalSize: 'XL', finalGrade: 'SPECIAL', specCode: 'FAT-XL-SPECIAL', sensoryNote: 'Mai cứng, càng chắc',
})

/** Phiên bản 1 của con đã đổi hạng: duyệt L, Đặc cấp, nay là bản cũ. */
export const revisedOld = decision({
  decisionNo: 'GD8E1R6S3VBE', crabCode: 'CU1R6S3V', sessionNo: 'MS8E1R6S3VBE', ...approvedBy(2.5), status: 'Superseded', isCurrent: false,
  weightG: 342, carapaceLengthCm: 7.9, cIndex: 0.6936, proposedSize: 'L', finalSize: 'L', finalGrade: 'SPECIAL', specCode: 'FAT-L-SPECIAL',
})

/** Phiên bản 2 (hiện hành) của con đã đổi hạng: hạ xuống Cấp 1, có ảnh và lý do. */
export const revised = decision({
  ...revisedOld, decisionNo: 'GD9F2S7T4WCF', ...approvedBy(2), versionNo: 2, isCurrent: true,
  finalGrade: 'G1', specCode: 'FAT-L-G1', reason: 'Yếm mềm khi bóp lại', hasPhoto: true,
})

/** Đã duyệt nhưng dưới chuẩn: size M, mức C dưới ngưỡng. */
export const approvedBelow = decision({
  decisionNo: 'GD0G3T8V5XDG', crabCode: 'CU3T8V5X', sessionNo: 'MS0G3T8V5XDG', ...approvedBy(3), weightG: 262, carapaceLengthCm: 7.7, cIndex: 0.5739,
  proposedSize: 'M', proposedCLevel: 'BELOW', proposedGrade: 'BELOW', finalSize: 'M', finalGrade: 'BELOW', isSubstandard: true,
})

/** Bị loại bỏ: cua chết, có ảnh. */
export const rejected = decision({
  decisionNo: 'GD1H4V9W6YEH', crabCode: 'CU4V9W6Y', sessionNo: 'MS1H4V9W6YEH', status: 'Rejected', weightG: 355, liveStatus: 'Dead', foodSafety: 'Fail',
  reason: 'Chết trước khi kiểm cảm quan', hasPhoto: true, decidedBy: ME, decidedAt: hoursAgo(4), createdAt: hoursAgo(4.2),
})

/** Quyết định hiện hành của Lô đang thu hoạch: 3 con chờ duyệt, 4 con đã xử lý. */
export const decisions = [draft, nearHold, caliperHold, approved, revised, approvedBelow, rejected]

export const summary: BatchGradingSummary = {
  batchCode: batchGrading.batchCode, batchStatus: 'Harvesting', crabType: 'FatteningMudCrab', ruleSetVersion: 1,
  received: 12, notMeasured: 5, draft: 1, hold: 2, approved: 3, rejected: 1, substandard: 1,
  bySpec: [{ specCode: 'FAT-XL-SPECIAL', size: 'XL', grade: 'SPECIAL', count: 1 }, { specCode: 'FAT-L-G1', size: 'L', grade: 'G1', count: 1 }],
  assignedQcUserId: ME,
}

/** Hai con cua gạch của Lô A bị người kiểm khác giữ lại; con đầu tôi chưa xác nhận giữ, con sau tôi đã xác nhận. */
export const heldA = decision({
  decisionNo: 'GD2J5W0X7ZFJ', crabCode: 'CU5W0X7Z', sessionNo: 'MS2J5W0X7ZFJ', batchCode: batchSecond.batchCode, status: 'Hold', holdReasons: ['QcHold'],
  weightG: 362, carapaceLengthCm: 8.4, cIndex: null, edgeBandMm: 1.6, proposedCLevel: null, proposedSensory: 'SPECIAL',
  heldBy: OTHER_QC, reason: 'Mai mềm bất thường, cần người thứ hai xem', createdAt: hoursAgo(6),
})
export const heldB = decision({
  ...heldA, decisionNo: 'GD3K6X1Y8AGK', crabCode: 'CU6X1Y8A', sessionNo: 'MS3K6X1Y8AGK', weightG: 298, proposedSize: 'L', edgeBandMm: 2.6,
  proposedSensory: 'G1', proposedGrade: 'G1', reason: 'Nghi gạch chưa đầy', secondQcId: ME, secondConfirmedAt: hoursAgo(1), createdAt: hoursAgo(5.5),
})

export const summarySecond: BatchGradingSummary = {
  batchCode: batchSecond.batchCode, batchStatus: 'Harvesting', crabType: 'RoeCrab', ruleSetVersion: 1,
  received: 30, notMeasured: 0, draft: 0, hold: 2, approved: 27, rejected: 1, substandard: 2, bySpec: [], assignedQcUserId: OTHER_QC,
}

/** Số đo và kết quả AI của lượt đo ở trạm, dựng từ quyết định: cân của trạm, AI đọc dài mai từ ảnh đèn trắng. */
export const measured = (d: GradeDecisionResponse, over: Partial<SessionMeasurementsResponse> = {}): SessionMeasurementsResponse => {
  const at = d.createdAt
  return {
    session: {
      sessionNo: d.sessionNo, batchCode: d.batchCode, crabCode: d.crabCode, procedure: 'Station', stationCode: 'TRAM-01', status: 'Measured',
      openedAt: at, capturedAt: at, receivedAt: at, weightG: d.weightG, tofMm: 318, cameraHeightMm: 370, hasWhiteImage: true, hasRedImage: true, failReason: null,
    },
    values: [
      { metric: 'WeightG', value: d.weightG ?? 0, unit: 'g', method: 'Scale', confidence: null, verificationStatus: 'Verified', recordedAt: at },
      ...(d.carapaceLengthCm === null ? [] : [{ metric: 'CarapaceLengthCm', value: d.carapaceLengthCm, unit: 'cm', method: 'AI', confidence: 0.93, verificationStatus: 'Unverified', recordedAt: at }]),
      ...(d.cIndex === null ? [] : [{ metric: 'CIndex', value: d.cIndex, unit: 'g/cm3', method: 'Computed', confidence: null, verificationStatus: 'Unverified', recordedAt: at }]),
      ...(d.edgeBandMm === null ? [] : [{ metric: 'EdgeBandMm', value: d.edgeBandMm, unit: 'mm', method: 'AI', confidence: 0.88, verificationStatus: 'Unverified', recordedAt: at }]),
    ],
    inferences: [{
      imageKind: 'White', modelName: 'carapace-seg', modelVersion: '0.3', isSimulated: true, status: 'Succeeded', imageQuality: 'Good',
      carapaceLengthCm: d.carapaceLengthCm, carapaceWidthCm: 11.6, carapaceAreaCm2: 71.35, edgeBandMm: null, confidence: 0.93, errorReason: null, createdAt: at,
    }],
    decision: d,
    ...over,
  }
}

/** Lượt đo của con cần thước kẹp: cân chưa hiệu chuẩn, ảnh đèn trắng kém nên AI không chắc, không có ảnh soi đỏ. */
export const measuredPoor: SessionMeasurementsResponse = (() => {
  const base = measured(caliperHold)
  return {
    ...base,
    session: { ...base.session, hasRedImage: false },
    values: [{ ...base.values[0], verificationStatus: 'Unverified' }],
    inferences: [{ ...base.inferences[0], status: 'LowConfidence', imageQuality: 'Poor', carapaceLengthCm: null, confidence: 0.41, errorReason: 'Mai bị che một phần' }],
  }
})()

/** Con cua của một quyết định, như GET /api/crab-units/{crabCode} trả. */
export const crabOf = (d: GradeDecisionResponse, over: Partial<CrabUnitResponse> = {}): CrabUnitResponse => crab({
  crabCode: d.crabCode, batchCode: d.batchCode, lotCode: 'LN-2611-P1-01', originRegion: 'Rạch Gốc, Ngọc Hiển, Cà Mau', harvestedOn: dateFromNow(-37),
  receivedWeightG: 298, inventoryStatus: 'Holding', currentSlotCode: 'R02-T3-05', receivedAt: daysFromNow(-36), ...over,
})

/**
 * Giả lập những gì thẻ của một quyết định gọi: số đo của lượt đo, hai ảnh của trạm, con cua và lịch sử quyết định của con đó.
 * Test thêm quyết định mới (con bị giữ lại, bản mới sau khi nhập thước kẹp) thì gọi hàm này cho quyết định đó.
 */
export function mockDecision(api: Api, d: GradeDecisionResponse, extra: { measurements?: SessionMeasurementsResponse; crab?: Partial<CrabUnitResponse>; history?: GradeDecisionResponse[] } = {}) {
  const session = `/api/measurement-sessions/${d.sessionNo}`
  api.get(`${session}/measurements`, extra.measurements ?? measured(d))
  api.get(`${session}/images/white`, file(PNG, 'image/png'))
  api.get(`${session}/images/red`, file(PNG, 'image/png'))
  api.get(`/api/crab-units/${d.crabCode}`, crabOf(d, extra.crab))
  api.get(`/api/crab-units/${d.crabCode}/grade-decisions`, extra.history ?? [d])
  if (d.hasPhoto) api.get(`/api/grade-decisions/${d.decisionNo}/photo`, file(PNG, 'image/png'))
}

/* ---------- thăm trại giữa vụ ---------- */

const box = (slotCode: string, crabCode: string | null): BoxStateResponse => ({
  slotCode, slotStatus: crabCode ? 'Occupied' : 'Available', rackNo: 2, tierNo: 1, columnNo: Number(slotCode.slice(-2)),
  crabCode, crabCondition: crabCode ? 'Healthy' : null, assignedAt: crabCode ? daysFromNow(-16) : null,
})

/** Sáu hộp của Lô đang lưu nuôi, hộp cuối đang trống. */
export const boxes: BoxStateResponse[] = [
  box('R02-T1-01', 'CU2A4C6E'), box('R02-T1-02', 'CU3B5D7F'), box('R02-T1-03', 'CU4C6E8G'),
  box('R02-T1-04', 'CU5D7F9H'), box('R02-T1-05', 'CU6E8G0J'), box('R02-T1-06', null),
]

export const progress: BatchProgressResponse = {
  batchCode: batchVisit.batchCode, status: 'InProduction', crabsAlive: 38, daysRaised: 16, isParticipant: false,
  deadCrabs: null, restockedCrabs: null, gradedCrabs: null, deliveredOrSoldCrabs: null,
}

/** Biên bản của lần thăm trước, do người kiểm khác lập. */
export const pastVisit: SiteVisitReportResponse = {
  reportNo: 'TT2M5Q8T1VXC', batchCode: batchVisit.batchCode, qcUserId: OTHER_QC, visitedAt: daysFromNow(-9), latitude: 8.6312, longitude: 104.7421,
  distanceToFarmM: 140, boxCodes: ['R02-T1-01', 'R02-T1-02', 'R02-T1-03'], crabsSeen: 39, findings: 'Cua khoẻ, nước trong, đủ hộp theo sổ.',
}

/* ---------- API mặc định ---------- */

/** Giả lập mặc định cho mọi trang trong QC_PAGES. Chỉ đăng ký đúng đường dẫn của dữ liệu ở trên, không chặn rộng. */
export function mockQc(api: Api): void {
  api.get('/api/qc/tasks', tasks)
  for (const b of batches) api.get(`/api/batches/${b.batchCode}`, b)

  // Kiểm đầu vào.
  const incoming = `/api/batches/${batchIncoming.batchCode}`
  api.get(`${incoming}/goods-receipts`, [receiptDone, receipt])
  api.get(`${incoming}/procurement-orders`, [order])
  api.get(`${incoming}/crab-units`, stockedCrabs)
  api.get(`/api/goods-receipts/${receipt.receiptNo}`, receipt)

  // Duyệt phân hạng.
  api.get('/api/grading/standards', standards)
  api.get(`/api/batches/${batchGrading.batchCode}/grading`, summary)
  api.get(`/api/batches/${batchGrading.batchCode}/grade-decisions`, decisions)
  api.get(`/api/batches/${batchSecond.batchCode}/grading`, summarySecond)
  api.get(`/api/batches/${batchSecond.batchCode}/grade-decisions`, [heldA, heldB])
  for (const d of [draft, nearHold, approved, approvedBelow, rejected, heldA, heldB]) mockDecision(api, d)
  mockDecision(api, caliperHold, { measurements: measuredPoor })
  mockDecision(api, revised, { history: [revisedOld, revised] })

  // Thăm trại giữa vụ.
  const visit = `/api/batches/${batchVisit.batchCode}`
  api.get(`${visit}/boxes`, boxes)
  api.get(`${visit}/progress`, progress)
  api.get(`${visit}/site-visits`, [pastVisit])
}

/** Mọi trang của cổng mà các spec qc-*.spec.ts mở; mỗi trang dựng đủ chỉ với signIn + mockQc(api). */
export const QC_PAGES: PageUnderTest[] = [
  { role: 'QcInspector', path: '/qc', ready: receipt.receiptNo },
  { role: 'QcInspector', path: '/qc/kiem-dau-vao', ready: receipt.receiptNo },
  { role: 'QcInspector', path: `/qc/kiem-dau-vao/${receipt.receiptNo}?lo=${batchIncoming.batchCode}`, ready: order.supplierName },
  { role: 'QcInspector', path: '/qc/phan-hang', ready: '3 con chờ duyệt' },
  { role: 'QcInspector', path: `/qc/phan-hang/${batchGrading.batchCode}`, ready: 'Hộp R02-T3-05' },
  { role: 'QcInspector', path: '/qc/tham-trai', ready: `Người nuôi: ${batchVisit.executorName}` },
  { role: 'QcInspector', path: `/qc/tham-trai/${taskVisit.assignmentId}`, ready: 'Hộp đã xem · 0' },
  { role: 'QcInspector', path: '/qc/chuan', ready: standards[0].standardCode },
]
