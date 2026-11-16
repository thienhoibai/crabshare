/* Đơn vị, khoảng giá trị và một câu giải thích ngắn cho từng khoá tham số nền tảng (BR-217).
   Khoảng giá trị và tên khoá chép từ backend: Common/Parameters/PlatformParameters.cs (ParamKeys.Known).
   Số quy tắc ghi ở chú thích cuối dòng, không hiện trên màn hình. */
import { formatVnd } from '../../shared/ui/console'
import { formatNumber } from './adminPartA'

export interface ParameterMeta {
  group: string
  name: string
  unit: string
  min: number
  max: number
  help: string
}

export const PARAMETER_GROUPS = ['Góp vốn', 'Đặt trước', 'Khiếu nại', 'Cảnh báo', 'Thiết bị']

export const PARAMETER_META: Record<string, ParameterMeta> = {
  PlatformFeeRatePct: { group: 'Góp vốn', name: 'Phí nền tảng', unit: '%', min: 0, max: 20, help: 'Tính trên doanh thu thực thu của Lô P.' }, // BR-188
  MinContributionVnd: { group: 'Góp vốn', name: 'Mức góp tối thiểu', unit: 'đ', min: 1, max: 10_000_000_000, help: 'Số tiền nhỏ nhất của một khoản góp.' }, // BR-059
  ContributionHoldMinutes: { group: 'Góp vốn', name: 'Giữ chỗ góp vốn', unit: 'phút', min: 1, max: 1440, help: 'Thời gian chờ nhà đầu tư chuyển khoản.' }, // BR-060
  MinPreorderRatioPct: { group: 'Góp vốn', name: 'Tỷ lệ đặt trước tối thiểu để mở Lô', unit: '%', min: 0, max: 100, help: 'Số con đã đặt cọc trên số con được cấp vốn.' }, // BR-077
  OrderHoldMinutes: { group: 'Đặt trước', name: 'Giữ đơn chờ cọc', unit: 'phút', min: 1, max: 1440, help: 'Thời gian chờ khách đặt cọc.' }, // BR-090
  DepositRatePct: { group: 'Đặt trước', name: 'Tỷ lệ cọc', unit: '%', min: 1, max: 100, help: 'Tính trên giá trị đơn đặt trước.' }, // BR-092
  MinOrderCrabs: { group: 'Đặt trước', name: 'Số con tối thiểu mỗi đơn', unit: 'con', min: 1, max: 100_000, help: 'Tính theo số con quy đổi.' }, // BR-087
  BalancePaymentHours: { group: 'Đặt trước', name: 'Hạn trả phần còn lại', unit: 'giờ', min: 1, max: 720, help: 'Tính từ lúc nghiệm thu.' }, // BR-168
  ReturnWindowHours: { group: 'Khiếu nại', name: 'Hạn đổi trả', unit: 'giờ', min: 1, max: 720, help: 'Tính từ lúc giao hàng.' }, // BR-172
  ClaimResponseHours: { group: 'Khiếu nại', name: 'Hạn người nuôi xử lý khiếu nại', unit: 'giờ', min: 1, max: 720, help: 'Tính từ lúc khách gửi khiếu nại.' }, // BR-172
  SettlementFeedbackDays: { group: 'Khiếu nại', name: 'Hạn góp ý quyết toán', unit: 'ngày', min: 1, max: 60, help: 'Tính từ lúc công bố bảng quyết toán.' }, // BR-202
  EvidenceRiskThreshold: { group: 'Cảnh báo', name: 'Ngưỡng điểm rủi ro bằng chứng', unit: 'điểm', min: 1, max: 100, help: 'Dùng khi thẩm định bằng chứng.' }, // BR-138
  CaptureRequestHours: { group: 'Cảnh báo', name: 'Hạn trả lời yêu cầu chụp', unit: 'giờ', min: 1, max: 72, help: 'Tính từ lúc có yêu cầu chụp.' }, // BR-134
  MassMortalityPct: { group: 'Cảnh báo', name: 'Ngưỡng chết hàng loạt', unit: '% số hộp', min: 1, max: 100, help: 'Tỷ lệ hộp có cua chết trong khung giờ.' }, // BR-122
  MassMortalityWindowHours: { group: 'Cảnh báo', name: 'Khung giờ tính chết hàng loạt', unit: 'giờ', min: 1, max: 168, help: 'Khoảng thời gian gần nhất dùng để đếm.' }, // BR-122
  DeviceOfflineMinutes: { group: 'Thiết bị', name: 'Thời gian coi là mất kết nối', unit: 'phút', min: 1, max: 10_080, help: 'Thiết bị không gửi dữ liệu quá thời gian này.' }, // BR-118, BR-231
  CalibrationPeriodDays: { group: 'Thiết bị', name: 'Kỳ hiệu chuẩn thiết bị', unit: 'ngày', min: 1, max: 365, help: 'Thiết bị đo phải hiệu chuẩn lại trong kỳ này.' }, // BR-225, BR-229
  AiConfidenceThreshold: { group: 'Thiết bị', name: 'Ngưỡng tin cậy của AI đo mai', unit: '', min: 0, max: 1, help: 'Từ 0 đến 1. Thấp hơn ngưỡng thì đo tay.' }, // BR-153, BR-226
}

/** Giá trị kèm đơn vị: 1.000.000 đ, 30 phút, 2 %, 0,8. */
export function formatParameter(key: string, value: number): string {
  const unit = PARAMETER_META[key]?.unit ?? ''
  if (unit === 'đ') return formatVnd(value)
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value)
}
