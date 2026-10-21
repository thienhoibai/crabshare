import { http } from '../../shared/api/http'

/** Giai đoạn gọi vốn của lô (TH-07). */
export type FundingStage = 'Scheduled' | 'Open' | 'AwaitingClose' | 'CapitalClosed' | 'Cancelled'

export type AdminFundingBatch = {
  batchCode: string; title: string; operatorName: string; status: string; stage: FundingStage
  minViableCapital: number; targetCapital: number; maxCapital: number
  confirmedCapital: number; reservedCapital: number; investorCount: number
  fundingOpenAt: string | null; fundingDeadline: string | null; capitalClosedAt: string | null; totalConfirmedCapital: number | null
  refundCount: number; refundOpenCount: number
}

export type FundingCloseResult = {
  expiredReservations: number
  batches: { batchCode: string; outcome: 'CapitalClosed' | 'Cancelled'; confirmedCapital: number; investorCount: number; refundCount: number }[]
}

export type InstructionType = 'Disbursement' | 'Payout' | 'Refund' | 'TaxPayment'
export type InstructionStatus = 'Created' | 'Sent' | 'Succeeded' | 'Failed' | 'Disputed'

export type PaymentInstruction = {
  instructionId: number; type: InstructionType; amount: number; status: InstructionStatus; batchCode: string
  beneficiary: string | null; contributionId: number | null; orderId: number | null; trancheId: number | null; trancheNo: number | null
  settlementLineId: number | null; note: string | null; createdAt: string; sentAt: string | null; completedAt: string | null
}

export const fundingStages: Record<FundingStage, string> = {
  Scheduled: 'Chưa mở', Open: 'Đang nhận góp', AwaitingClose: 'Quá hạn, chờ chốt', CapitalClosed: 'Đã chốt vốn', Cancelled: 'Đã huỷ (thiếu vốn)',
}

export const instructionTypes: Record<InstructionType, string> = {
  Disbursement: 'Giải ngân', Payout: 'Chi trả quyết toán', Refund: 'Hoàn tiền', TaxPayment: 'Nộp thuế',
}

export const instructionStatuses: Record<InstructionStatus, string> = {
  Created: 'Chờ gửi', Sent: 'Đã gửi', Succeeded: 'Thành công', Failed: 'Thất bại', Disputed: 'Đang tranh chấp',
}

export const listFundingBatches = async (signal?: AbortSignal) =>
  (await http.get<AdminFundingBatch[]>('/api/admin/funding/batches', { signal })).data

export const runFundingClose = async () => (await http.post<FundingCloseResult>('/api/admin/funding/close-due')).data

export const listPaymentInstructions = async (filter: { type?: string; status?: string; batchCode?: string }, signal?: AbortSignal) =>
  (await http.get<PaymentInstruction[]>('/api/admin/payment-instructions', {
    params: { type: filter.type || undefined, status: filter.status || undefined, batchCode: filter.batchCode || undefined }, signal,
  })).data
