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

// ---------- TH-10: giải ngân theo mốc, gửi lệnh chi, đối soát ----------

export type TrancheStatus = 'Planned' | 'Requested' | 'NeedsExplanation' | 'Released' | 'Blocked'

export type Tranche = {
  trancheId: number; batchCode: string; batchTitle: string; operatorName: string; trancheNo: number; plannedAmount: number
  plannedDate: string | null; unlockCondition: string; status: TrancheStatus; requestedAt: string | null
  explanationDeadline: string | null; releasedAt: string | null; canRequest: boolean; blockedReason: string | null
  instructionId: number | null; instructionStatus: InstructionStatus | null
}

export type UnmatchedTransaction = {
  transactionId: number; providerTxnId: string; batchCode: string; amount: number; content: string | null
  matchStatus: 'Unmatched' | 'LatePayment'; occurredAt: string; receivedAt: string
  paymentRequestReference: string | null; paymentRequestStatus: string | null; paymentRequestAmount: number | null
}

export const trancheStatuses: Record<TrancheStatus, string> = {
  Planned: 'Chưa xin', Requested: 'Đang xin giải ngân', NeedsExplanation: 'Cần giải trình', Released: 'Đã giải ngân', Blocked: 'Dừng chi',
}

export const listAdminTranches = async (status: string, signal?: AbortSignal) =>
  (await http.get<Tranche[]>('/api/admin/tranches', { params: { status: status || undefined }, signal })).data

export const releaseTranche = async (id: number) => (await http.post<Tranche>(`/api/admin/tranches/${id}/release`)).data
export const askTrancheExplanation = async (id: number, reason: string) =>
  (await http.post<Tranche>(`/api/admin/tranches/${id}/need-explanation`, { reason })).data
export const blockTranche = async (id: number, reason: string) => (await http.post<Tranche>(`/api/admin/tranches/${id}/block`, { reason })).data

export const sendPaymentInstruction = async (id: number) => (await http.post<PaymentInstruction>(`/api/admin/payment-instructions/${id}/send`)).data

export const listUnmatchedTransactions = async (signal?: AbortSignal) =>
  (await http.get<UnmatchedTransaction[]>('/api/admin/payments/unmatched', { signal })).data
