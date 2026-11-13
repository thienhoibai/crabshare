/* Nhãn tiếng Việt và màu cho các mã trạng thái mà backend trả về (BR v1.5).
   Dùng qua <StatusBadge kind="batch" value={b.status} /> hoặc label('batch', b.status).
   Mã chưa có trong bảng thì hiện nguyên mã để dễ phát hiện và bổ sung. */

export type Tone = 'ok' | 'warn' | 'info' | 'mute' | 'gold' | 'danger'
type Entry = [label: string, tone: Tone]

const MAPS = {
  /** Trạng thái Lô (batch.status). */
  batch: {
    Draft: ['Bản nháp', 'mute'],
    PendingApproval: ['Chờ duyệt', 'warn'],
    NeedsRevision: ['Cần sửa lại', 'warn'],
    Rejected: ['Bị từ chối', 'danger'],
    Funding: ['Đang gọi vốn', 'gold'],
    Cancelled: ['Đã huỷ', 'mute'],
    Sourcing: ['Đang mua nguồn', 'info'],
    Stocked: ['Đã thả nuôi', 'info'],
    InProduction: ['Đang lưu nuôi', 'ok'],
    Harvesting: ['Đang thu hoạch', 'gold'],
    Selling: ['Đang bán và giao', 'gold'],
    Liquidating: ['Thanh lý sớm', 'danger'],
    AwaitingSettlement: ['Chờ quyết toán', 'warn'],
    Settling: ['Đang quyết toán', 'info'],
    Settlement: ['Đang quyết toán', 'info'],
    Closed: ['Đã đóng', 'mute'],
  },
  /** Phương thức của Lô (batch_mode). */
  batchMode: {
    P: ['Lô P · góp vốn', 'gold'],
    T: ['Lô T · thương mại', 'info'],
    A: ['Lô A · đại lý', 'ok'],
  },
  /** Đơn đặt trước, đơn có hoá đơn, đơn hàng cuối (sales_order.status). */
  order: {
    PendingDeposit: ['Chờ đặt cọc', 'warn'],
    Deposited: ['Đã đặt cọc', 'info'],
    Confirmed: ['Đã xác nhận', 'ok'],
    Delivering: ['Đang giao theo đợt', 'gold'],
    Delivered: ['Đã giao đủ', 'ok'],
    Completed: ['Hoàn tất', 'ok'],
    CancelRequested: ['Đã xin huỷ', 'warn'],
    Cancelled: ['Đã huỷ', 'mute'],
    Forfeited: ['Mất cọc', 'danger'],
    Refunded: ['Đã hoàn tiền', 'mute'],
    PendingPayment: ['Chờ thanh toán', 'warn'],
    Paid: ['Đã thanh toán', 'ok'],
    Returned: ['Đã trả hàng', 'mute'],
  },
  orderType: {
    PreOrder: ['Đơn đặt trước', 'gold'],
    InvoicedSale: ['Đơn có hoá đơn', 'info'],
    FinalOrder: ['Đơn hàng cuối', 'ok'],
  },
  deposit: {
    Pending: ['Chưa cọc', 'warn'],
    Held: ['Đang giữ cọc', 'info'],
    Applied: ['Đã trừ vào tiền hàng', 'ok'],
    Forfeited: ['Mất cọc', 'danger'],
    Refunded: ['Đã hoàn cọc', 'mute'],
  },
  /** Đợt giao của đơn đặt trước. */
  deliveryTranche: {
    Planned: ['Đã lên lịch', 'mute'],
    Allocated: ['Đã phân bổ cua', 'info'],
    Dispatched: ['Đã xuất hàng', 'gold'],
    Accepted: ['Đã nghiệm thu', 'ok'],
    Completed: ['Hoàn tất', 'ok'],
    Cancelled: ['Đã huỷ', 'mute'],
  },
  shipment: {
    Scheduled: ['Chờ xuất', 'mute'],
    Dispatched: ['Đang giao', 'gold'],
    Accepted: ['Đã nghiệm thu', 'ok'],
    Refused: ['Khách từ chối nhận', 'danger'],
    Cancelled: ['Đã huỷ', 'mute'],
  },
  acceptance: {
    Pending: ['Chờ khách xác nhận', 'warn'],
    Confirmed: ['Khách đã xác nhận', 'ok'],
    Refused: ['Khách từ chối', 'danger'],
  },
  allocation: {
    Active: ['Đang giữ', 'info'],
    Shipped: ['Đã xuất', 'gold'],
    Delivered: ['Đã giao', 'ok'],
    Released: ['Đã nhả', 'mute'],
    Returned: ['Đã trả về', 'mute'],
  },
  claim: {
    Open: ['Chờ người nuôi phản hồi', 'warn'],
    OperatorAccepted: ['Người nuôi chấp nhận', 'ok'],
    OperatorRejected: ['Người nuôi từ chối', 'danger'],
    Escalated: ['Chuyển Admin quyết định', 'warn'],
    Accepted: ['Chấp nhận', 'ok'],
    Rejected: ['Không chấp nhận', 'mute'],
  },
  invoice: { Active: ['Còn hiệu lực', 'ok'], Cancelled: ['Đã huỷ', 'mute'] },
  /** Lý do một quyết định phân hạng bị giữ lại. */
  holdReason: {
    NearThreshold: ['Số đo sát ngưỡng', 'warn'],
    ImageQuality: ['Ảnh chưa đạt', 'warn'],
    LowConfidence: ['AI chưa chắc', 'warn'],
    CaliperRequired: ['Cần đo thước kẹp', 'warn'],
    SensoryPending: ['Chờ kiểm cảm quan', 'info'],
    QcHold: ['Kiểm phẩm giữ lại', 'danger'],
  },
  measureMethod: {
    Scale: ['Cân của trạm', 'mute'],
    ManualScale: ['Cân tay', 'mute'],
    AI: ['AI đọc ảnh', 'mute'],
    Caliper: ['Thước kẹp', 'mute'],
    Computed: ['Tính từ số đo', 'mute'],
  },
  imageQuality: { Good: ['Ảnh tốt', 'ok'], Poor: ['Ảnh kém', 'warn'], Unusable: ['Ảnh không dùng được', 'danger'] },
  maturity: { Mature: ['Trưởng thành', 'mute'], Immature: ['Chưa trưởng thành', 'mute'], Unknown: ['Chưa rõ', 'mute'] },
  claimType: { Return: ['Trả hàng', 'info'], Complaint: ['Khiếu nại', 'warn'] },
  issueType: {
    Dead: ['Cua chết', 'danger'],
    Weak: ['Cua yếu', 'warn'],
    WrongSize: ['Sai size', 'warn'],
    WrongWeight: ['Sai khối lượng', 'warn'],
    Late: ['Giao trễ', 'info'],
    FoodSafety: ['An toàn thực phẩm', 'danger'],
  },
  /** Khoản góp vốn. */
  contribution: {
    Reserved: ['Đang giữ chỗ', 'warn'],
    Confirmed: ['Đã xác nhận', 'ok'],
    Expired: ['Hết hạn giữ chỗ', 'mute'],
    Refunded: ['Đã hoàn', 'mute'],
  },
  contract: {
    Draft: ['Chờ ký', 'warn'],
    OperatorSigned: ['Người nuôi đã ký', 'info'],
    FullySigned: ['Đủ chữ ký', 'ok'],
    Void: ['Đã huỷ', 'mute'],
  },
  payment: {
    Pending: ['Chờ chuyển khoản', 'warn'],
    Paid: ['Đã nhận tiền', 'ok'],
    Expired: ['Hết hạn', 'mute'],
    Cancelled: ['Đã huỷ', 'mute'],
  },
  /** Lệnh chi. */
  instruction: {
    Created: ['Chờ gửi', 'warn'],
    Sent: ['Đã gửi', 'info'],
    Succeeded: ['Thành công', 'ok'],
    Failed: ['Thất bại', 'danger'],
    Disputed: ['Tranh chấp', 'danger'],
  },
  instructionType: {
    Disbursement: ['Giải ngân', 'gold'],
    Payout: ['Chi trả nhà đầu tư', 'ok'],
    Refund: ['Hoàn tiền', 'info'],
    TaxPayment: ['Nộp thuế', 'mute'],
    PlatformFee: ['Phí nền tảng', 'info'],
    Commission: ['Hoa hồng', 'info'],
    SupplierPayout: ['Trả nhà cung cấp', 'info'],
  },
  /** Mốc giải ngân. */
  tranche: {
    Planned: ['Chưa tới mốc', 'mute'],
    Requested: ['Đã xin giải ngân', 'warn'],
    NeedsExplanation: ['Cần giải trình', 'danger'],
    Released: ['Đã giải ngân', 'ok'],
    Blocked: ['Bị dừng chi', 'danger'],
    Stopped: ['Dừng do thanh lý', 'mute'],
  },
  settlement: {
    Draft: ['Bảng nháp', 'mute'],
    Proposed: ['Đang lấy góp ý', 'warn'],
    Disputed: ['Có góp ý chưa xử lý', 'danger'],
    Approved: ['Đã duyệt', 'info'],
    PaidOut: ['Đã chi trả', 'ok'],
    Closed: ['Đã đóng', 'mute'],
  },
  /** Biểu quyết tập thể. */
  decision: {
    Open: ['Đang biểu quyết', 'gold'],
    Passed: ['Thông qua', 'ok'],
    Rejected: ['Không thông qua', 'danger'],
    Cancelled: ['Đã huỷ', 'mute'],
  },
  decisionKind: { EarlyLiquidation: ['Thanh lý sớm', 'danger'], SurplusSale: ['Bán phần dư', 'info'] },
  /** Hồ sơ đối tác và vai trò. */
  verification: {
    Unverified: ['Chưa xác minh', 'mute'],
    Pending: ['Chờ xác minh', 'warn'],
    Verified: ['Đã xác minh', 'ok'],
    Rejected: ['Bị từ chối', 'danger'],
    Disputed: ['Đang tranh chấp', 'danger'],
  },
  partyRole: {
    Pending: ['Chờ duyệt', 'warn'],
    Active: ['Đang hoạt động', 'ok'],
    Suspended: ['Tạm dừng', 'danger'],
    Revoked: ['Đã thu hồi', 'mute'],
  },
  roleType: {
    Farmer: ['Người nuôi', 'ok'],
    Investor: ['Nhà đầu tư', 'gold'],
    Customer: ['Khách hàng', 'info'],
    Supplier: ['Nhà cung cấp', 'mute'],
    OfftakeBuyer: ['Bên cam kết thu mua', 'mute'],
  },
  partyType: {
    Individual: ['Cá nhân', 'mute'],
    Household: ['Hộ kinh doanh', 'mute'],
    Company: ['Doanh nghiệp', 'mute'],
    Cooperative: ['Hợp tác xã', 'mute'],
  },
  customerType: {
    Restaurant: ['Nhà hàng', 'mute'],
    Trader: ['Thương lái', 'mute'],
    Wholesaler: ['Đầu mối sỉ', 'mute'],
    Agent: ['Đại lý', 'mute'],
    CentralKitchen: ['Bếp trung tâm', 'mute'],
    Other: ['Khác', 'mute'],
  },
  siteType: {
    Farm: ['Trại nuôi', 'ok'],
    QcStation: ['Trạm kiểm phẩm', 'info'],
    Warehouse: ['Kho', 'mute'],
    DeliveryAddress: ['Địa chỉ giao', 'gold'],
  },
  operator: {
    Draft: ['Bản nháp', 'mute'],
    Submitted: ['Chờ duyệt', 'warn'],
    Approved: ['Đã duyệt', 'ok'],
    Rejected: ['Bị từ chối', 'danger'],
    Suspended: ['Tạm dừng', 'danger'],
  },
  user: {
    PendingVerification: ['Chờ xác minh', 'warn'],
    Active: ['Đang hoạt động', 'ok'],
    Locked: ['Đã khoá', 'danger'],
  },
  kyc: {
    Pending: ['Đang kiểm tra', 'warn'],
    Passed: ['Đạt', 'ok'],
    Failed: ['Không đạt', 'danger'],
    ExceptionApproved: ['Duyệt ngoại lệ', 'info'],
  },
  /** Mua nguồn và nhận hàng. */
  procurement: {
    Ordered: ['Đã đặt mua', 'info'],
    PartiallyReceived: ['Nhận một phần', 'warn'],
    Received: ['Đã nhận đủ', 'ok'],
    Cancelled: ['Đã huỷ', 'mute'],
  },
  receipt: {
    Inspecting: ['Đang kiểm đầu vào', 'warn'],
    Completed: ['Đã kiểm xong', 'ok'],
    Cancelled: ['Đã huỷ', 'mute'],
  },
  inspection: { Accepted: ['Đạt', 'ok'], Rejected: ['Loại', 'danger'], Hold: ['Giữ lại', 'warn'] },
  /** Con cua. */
  crabInventory: {
    Received: ['Mới nhận', 'mute'],
    Holding: ['Đang lưu nuôi', 'ok'],
    Graded: ['Đã phân hạng', 'info'],
    Allocated: ['Đã phân bổ', 'gold'],
    Shipped: ['Đã xuất', 'gold'],
    Delivered: ['Đã giao', 'ok'],
    Sold: ['Đã bán', 'ok'],
    Dead: ['Đã chết', 'danger'],
    Destroyed: ['Đã loại bỏ', 'danger'],
    Returned: ['Trả về tồn', 'warn'],
  },
  crabCondition: {
    Healthy: ['Khoẻ', 'ok'],
    Weak: ['Yếu', 'warn'],
    Molting: ['Đang lột', 'info'],
    Dead: ['Chết', 'danger'],
  },
  crabType: {
    FatteningMudCrab: ['Cua thịt vỗ béo', 'mute'],
    RoeCrab: ['Cua gạch', 'mute'],
    YoungFemaleCrab: ['Cua cái non', 'mute'],
    OilRoeCrab: ['Cua gạch dầu', 'mute'],
    SoftShellCrab: ['Cua lột', 'mute'],
  },
  sex: { Male: ['Đực', 'mute'], Female: ['Cái', 'mute'] },
  box: {
    Available: ['Trống', 'mute'],
    Occupied: ['Đang có cua', 'ok'],
    Maintenance: ['Bảo trì', 'warn'],
  },
  /** Thiết bị và lượt đo. */
  device: { Active: ['Đang hoạt động', 'ok'], Offline: ['Mất kết nối', 'danger'], Removed: ['Đã gỡ', 'mute'] },
  deviceType: {
    Station: ['Trạm đo và phân hạng', 'gold'],
    RailCamera: ['Camera chạy dàn', 'info'],
    WaterSensor: ['Cảm biến nước', 'ok'],
    Camera: ['Camera hộp', 'mute'],
  },
  readingQuality: {
    Calibrated: ['Đã hiệu chuẩn', 'ok'],
    Uncalibrated: ['Chưa hiệu chuẩn', 'warn'],
    Suspect: ['Nghi sai', 'danger'],
  },
  command: { Pending: ['Chờ thiết bị nhận', 'warn'], Acked: ['Thiết bị đã nhận', 'ok'], Cancelled: ['Đã huỷ', 'mute'] },
  commandType: {
    ScanRack: ['Quét cả dàn', 'info'],
    ScanBox: ['Quét một hộp', 'info'],
    Park: ['Về chỗ đỗ', 'mute'],
    Calibrate: ['Hiệu chuẩn', 'mute'],
  },
  session: {
    Open: ['Chờ đặt cua vào trạm', 'warn'],
    Received: ['Đã nhận bản tin', 'info'],
    Measured: ['Đã có số đo', 'ok'],
    Failed: ['Đo lỗi', 'danger'],
    Cancelled: ['Đã huỷ', 'mute'],
  },
  ai: { Succeeded: ['AI đọc được', 'ok'], LowConfidence: ['AI chưa chắc', 'warn'], Failed: ['AI không đọc được', 'danger'] },
  /** Quyết định phân hạng. */
  grade: {
    Draft: ['Đề xuất, chờ duyệt', 'warn'],
    Hold: ['Giữ lại kiểm thêm', 'warn'],
    Approved: ['Đã duyệt hạng', 'ok'],
    Rejected: ['Loại bỏ', 'danger'],
    Superseded: ['Bản cũ', 'mute'],
  },
  /** Nhãn kết quả phân hạng theo chuẩn tham chiếu T/SCFA 0014-2024. */
  gradeCode: {
    SPECIAL: ['Đặc cấp', 'gold'],
    G1: ['Cấp 1', 'ok'],
    BELOW: ['Dưới chuẩn', 'warn'],
    REJECT: ['Loại', 'danger'],
  },
  sizeCode: { M: ['Size M', 'mute'], L: ['Size L', 'mute'], XL: ['Size XL', 'mute'], OUT: ['Ngoài cỡ', 'warn'] },
  ruleKind: {
    Size: ['Phân size theo khối lượng', 'mute'],
    PhysicalFactor: ['Chỉ số độ chắc', 'mute'],
    Sensory: ['Kiểm cảm quan', 'mute'],
    Exclusion: ['Điều kiện loại bỏ', 'mute'],
  },
  metric: {
    WeightG: ['Khối lượng', 'mute'],
    CIndex: ['Chỉ số C', 'mute'],
    EdgeBandMm: ['Dải mép khi soi đỏ', 'mute'],
    CarapaceLengthCm: ['Dài mai', 'mute'],
    CarapaceWidthCm: ['Rộng mai', 'mute'],
    CarapaceAreaCm2: ['Diện tích mai', 'mute'],
    Alive: ['Còn sống', 'mute'],
    FoodSafe: ['An toàn thực phẩm', 'mute'],
  },
  ruleSet: { Draft: ['Bản nháp', 'warn'], Active: ['Đang áp dụng', 'ok'], Retired: ['Đã thay thế', 'mute'] },
  /** Việc của Nhân viên kiểm phẩm. */
  qcTask: {
    Assigned: ['Chờ làm', 'warn'],
    Completed: ['Đã xong', 'ok'],
    Reassigned: ['Đã chuyển người', 'mute'],
    Cancelled: ['Đã huỷ', 'mute'],
  },
  qcKind: {
    IncomingInspection: ['Kiểm đầu vào', 'info'],
    GradingSession: ['Duyệt phân hạng', 'gold'],
    SecondReview: ['Xác nhận lần hai', 'warn'],
    SiteVisit: ['Thăm trại giữa vụ', 'ok'],
    Dispatch: ['Kiểm xuất hàng', 'info'],
    Dispute: ['Kiểm khi tranh chấp', 'danger'],
  },
  /** Bằng chứng và cảnh báo. */
  evidence: {
    Accepted: ['Chấp nhận', 'ok'],
    Watch: ['Theo dõi', 'warn'],
    Flagged: ['Gắn cờ', 'danger'],
    Rejected: ['Không chấp nhận', 'danger'],
  },
  alert: {
    Open: ['Đang mở', 'danger'],
    Acknowledged: ['Đã ghi nhận', 'warn'],
    Escalated: ['Đã chuyển cấp', 'danger'],
    Resolved: ['Đã xử lý', 'ok'],
  },
  severity: { Low: ['Thấp', 'mute'], Medium: ['Vừa', 'warn'], High: ['Cao', 'danger'], Critical: ['Nghiêm trọng', 'danger'] },
  alertType: {
    Mortality: ['Cua chết nhiều', 'danger'],
    WaterQuality: ['Chất lượng nước', 'warn'],
    MilestoneDelay: ['Trễ mốc', 'warn'],
    LowStock: ['Tồn thấp', 'info'],
    DataSilence: ['Thiếu dữ liệu', 'warn'],
    EvidenceFlag: ['Bằng chứng bị gắn cờ', 'danger'],
    DeviceOffline: ['Thiết bị mất kết nối', 'danger'],
    NoCrabDetected: ['Ảnh hộp không thấy cua', 'warn'],
    MissingCareLog: ['Thiếu nhật ký chăm sóc', 'warn'],
  },
  costCategory: {
    Seed: ['Mua cua nguồn', 'mute'],
    Feed: ['Thức ăn', 'mute'],
    Utilities: ['Điện nước', 'mute'],
    Labour: ['Nhân công', 'mute'],
    MortalityReserve: ['Dự phòng hao hụt', 'mute'],
    Depreciation: ['Khấu hao', 'mute'],
    Other: ['Khác', 'mute'],
  },
  saleReason: {
    LowGrade: ['Cua dưới chuẩn', 'warn'],
    ForfeitResale: ['Bán lại do mất cọc', 'info'],
    Surplus: ['Phần dư', 'ok'],
  },
  feedback: {
    Open: ['Chờ trả lời', 'warn'],
    Answered: ['Đã trả lời', 'ok'],
    Withdrawn: ['Đã rút', 'mute'],
    Unresolved: ['Chưa thống nhất', 'danger'],
  },
  match: { Matched: ['Đã khớp', 'ok'], Unmatched: ['Chưa khớp', 'danger'], LatePayment: ['Trả trễ, sẽ hoàn', 'warn'] },
} satisfies Record<string, Record<string, Entry>>

export type StatusKind = keyof typeof MAPS

const lookup = (kind: StatusKind, value: string | null | undefined): Entry | undefined =>
  value == null ? undefined : (MAPS[kind] as Record<string, Entry>)[value]

/** Nhãn tiếng Việt của một mã trạng thái; mã lạ thì trả nguyên mã. */
export const label = (kind: StatusKind, value: string | null | undefined): string => lookup(kind, value)?.[0] ?? value ?? ''

/** Màu của một mã trạng thái. */
export const tone = (kind: StatusKind, value: string | null | undefined): Tone => lookup(kind, value)?.[1] ?? 'mute'

/** Danh sách [mã, nhãn] để dựng ô chọn. */
export const options = (kind: StatusKind): { value: string; label: string }[] =>
  Object.entries(MAPS[kind] as Record<string, Entry>).map(([value, [text]]) => ({ value, label: text }))

/** Tên quy cách dễ đọc từ loại cua, size, hạng: "Cua gạch · XL · Hạng 1". */
export function specName(crabType?: string | null, sizeCode?: string | null, gradeCode?: string | null): string {
  return [crabType ? label('crabType', crabType) : null, sizeCode ? label('sizeCode', sizeCode) : null, gradeCode ? label('gradeCode', gradeCode) : null]
    .filter(Boolean)
    .join(' · ')
}
