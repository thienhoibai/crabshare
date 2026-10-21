import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '../api/http'

/** Bảng quyết toán (TH-12 → TH-14). Tiền là số nguyên đồng; không có lợi suất kỳ vọng (BR-49). */
export type SettlementStatus = 'Draft' | 'Proposed' | 'Disputed' | 'Approved' | 'PaidOut' | 'Closed'

export type SettlementLine = {
  settlementLineId: number; investorId: number; investorName: string; capitalReturn: number; profitShare: number
  taxWithheld: number; netPayout: number; isMine: boolean; payoutStatus: string | null
}

export type SettlementFeedback = {
  feedbackId: number; authorName: string; content: string; status: 'Open' | 'Answered' | 'Withdrawn' | 'Unresolved'
  response: string | null; createdAt: string; respondedAt: string | null; isMine: boolean
}

export type Settlement = {
  settlementId: number; batchCode: string; batchTitle: string; operatorName: string; batchStatus: string; status: SettlementStatus
  revisionNo: number; orderRevenue: number; forfeitedDeposits: number; complaintRefunds: number; actualRevenue: number
  lockedStandardCost: number; revenuePool: number; operatorSharePct: number; operatorRemuneration: number; distributable: number
  depreciationAmount: number; taxTotal: number; uncoveredLoss: number; reconciliationDifference: number; totalCapital: number
  totalNetPayout: number; investorCount: number; proposedAt: string | null; feedbackDeadline: string | null; approvedAt: string | null
  createdAt: string; updatedAt: string; lines: SettlementLine[]; feedback: SettlementFeedback[]; taxNotice: string
}

export type AdminSettlementSummary = {
  batchCode: string; batchTitle: string; operatorName: string; batchStatus: string; settlementId: number | null
  status: SettlementStatus | null; revisionNo: number | null; actualRevenue: number | null; revenuePool: number | null
  feedbackDeadline: string | null; openFeedback: number; updatedAt: string | null
}

export const settlementStatuses: Record<SettlementStatus, string> = {
  Draft: 'Bản nháp (chưa công bố)', Proposed: 'Đã công bố, đang nhận góp ý', Disputed: 'Có góp ý chờ trả lời',
  Approved: 'Đã duyệt, đang chi trả', PaidOut: 'Đã chi trả xong', Closed: 'Đã đóng lô',
}

export const settlementKeys = {
  root: ['settlements'] as const,
  admin: ['settlements', 'admin'] as const,
  one: (id: number) => ['settlements', 'one', id] as const,
}

export function useAdminSettlements() {
  return useQuery({ queryKey: settlementKeys.admin, queryFn: async () => (await http.get<AdminSettlementSummary[]>('/api/admin/settlements')).data, retry: false })
}

export function useAdminSettlement(id: number | null) {
  return useQuery({
    queryKey: settlementKeys.one(id ?? 0),
    queryFn: async () => (await http.get<Settlement>(`/api/admin/settlements/${id}`)).data,
    enabled: id !== null, retry: false,
  })
}

/** Gọi một thao tác trên bảng quyết toán rồi cập nhật bộ nhớ đệm của bảng đó và danh sách. */
function useSettlementAction<TArgs>(call: (args: TArgs) => Promise<Settlement>) {
  const queryClient = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: call,
    onSuccess: async (s) => {
      queryClient.setQueryData(settlementKeys.one(s.settlementId), s)
      await queryClient.invalidateQueries({ queryKey: settlementKeys.root })
    },
  })
}

/** UC38: tính (hoặc tính lại) bảng nháp với tỷ lệ khấu trừ thuế người nuôi khai. */
export const useCalculateSettlement = () => useSettlementAction(async ({ code, taxWithholdingPct }: { code: string; taxWithholdingPct: number }) =>
  (await http.post<Settlement>(`/api/admin/batches/${encodeURIComponent(code)}/settlements`, { taxWithholdingPct })).data)

// ---------- TH-13: công bố, sao kê, góp ý ----------

export type SettlementSummary = {
  settlementId: number; batchCode: string; batchTitle: string; status: SettlementStatus; revisionNo: number; revenuePool: number
  myNetPayout: number | null; feedbackDeadline: string | null; feedbackOpen: boolean; openFeedback: number
}

/** UC35: sao kê cho các bên của lô (nhà đầu tư chỉ nhận dòng của mình). */
export function useSettlement(id: number | null) {
  return useQuery({
    queryKey: [...settlementKeys.one(id ?? 0), 'party'],
    queryFn: async () => (await http.get<Settlement>(`/api/settlements/${id}`)).data,
    enabled: id !== null, retry: false,
  })
}

export function useMySettlements() {
  return useQuery({ queryKey: [...settlementKeys.root, 'mine'], queryFn: async () => (await http.get<SettlementSummary[]>('/api/me/settlements')).data })
}

export function useOperatorSettlements() {
  return useQuery({ queryKey: [...settlementKeys.root, 'operator'], queryFn: async () => (await http.get<SettlementSummary[]>('/api/operator/settlements')).data })
}

/** UC37: công bố bảng nháp, mở cửa sổ góp ý (7–14 ngày). */
export const useProposeSettlement = () => useSettlementAction(async ({ id, feedbackDays }: { id: number; feedbackDays: number }) =>
  (await http.post<Settlement>(`/api/admin/settlements/${id}/propose`, { feedbackDays })).data)

export const useAnswerFeedback = () => useSettlementAction(async ({ feedbackId, response, unresolved }: { feedbackId: number; response: string; unresolved: boolean }) =>
  (await http.post<Settlement>(`/api/admin/settlement-feedback/${feedbackId}/answer`, { response, unresolved })).data)

/** UC36: góp ý trong hạn, kèm căn cứ. */
export function useSendFeedback() {
  const queryClient = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async ({ id, content }: { id: number; content: string }) => (await http.post<Settlement>(`/api/settlements/${id}/feedback`, { content })).data,
    onSuccess: async (s) => {
      queryClient.setQueryData([...settlementKeys.one(s.settlementId), 'party'], s)
      await queryClient.invalidateQueries({ queryKey: settlementKeys.root })
    },
  })
}
