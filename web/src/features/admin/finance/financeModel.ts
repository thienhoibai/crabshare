/* Kiểu dữ liệu phần tiền của cổng quản trị mà api.gen.ts không sinh đúng.
   Backend có ba record cùng tên TrancheResponse (mốc giải ngân, đợt giao của đơn, mốc trong hồ sơ duyệt Lô); OpenAPI chỉ giữ một,
   nên mốc giải ngân của GET /api/admin/tranches được khai lại ở đây theo Features/Payments/DisbursementDtos.cs. */
import type { SettlementResponse } from '../../../shared/api/api.gen'

export interface DisbursementTranche {
  trancheId: number
  batchCode: string
  batchTitle: string
  operatorName: string
  trancheNo: number
  plannedAmount: number
  /** Ngày dự kiến tới mốc, dạng yyyy-MM-dd. */
  plannedDate: string | null
  unlockCondition: string
  /** Planned, Requested, NeedsExplanation, Released, Blocked. */
  status: string
  requestedAt: string | null
  explanationDeadline: string | null
  releasedAt: string | null
  canRequest: boolean
  /** Vì sao người nuôi chưa xin được mốc này (điều kiện mốc chưa đạt hoặc đang chờ duyệt). */
  blockedReason: string | null
  instructionId: number | null
  instructionStatus: string | null
}

/** Các loại lệnh chi do quyết toán lập ra (BR-207, BR-201). */
export const SETTLEMENT_INSTRUCTION_TYPES = ['PlatformFee', 'Payout', 'Commission', 'SupplierPayout']

/** Lệnh chi còn gửi được: mới lập hoặc lần gửi trước bị cổng thanh toán từ chối. */
export const canSend = (status: string) => status === 'Created' || status === 'Failed'

export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

/** Tiền người nuôi nhận khi duyệt bảng của Lô P: thù lao cộng phần Chi phí chuẩn chưa giải ngân, trừ lỗ vượt tổng vốn (BR-196, BR-207). */
export const operatorPayout = (s: SettlementResponse) =>
  s.breakdown.mode === 'P' ? s.operatorRemuneration + Math.max(0, s.breakdown.undisbursedCost - s.uncoveredLoss) : 0

/** Tổng tiền phải chi khi duyệt, theo cách máy chủ đối chiếu với số dư tài khoản của Lô (BR-199, BR-205). Lô T không chi gì. */
export const requiredPayout = (s: SettlementResponse) =>
  s.breakdown.mode === 'P' ? s.totalNetPayout + operatorPayout(s) + s.breakdown.platformFee
    : s.breakdown.mode === 'A' ? s.breakdown.commissionAmount + s.breakdown.supplierPayout
      : 0

/** Bảng đã duyệt thì số liệu bị khoá (BR-206). */
export const isLocked = (status: string) => ['Approved', 'PaidOut', 'Closed'].includes(status)
