/* Bảng quyết toán (Features/Settlement, BR-183 đến BR-206). Tiền là số nguyên đồng, chỉ có số đã ghi nhận thật (BR-219).
   Kiểu dữ liệu lấy từ api.gen.ts; mã trạng thái được thu hẹp để tra nhãn. Sau mỗi lần ghi mọi truy vấn đang hiển thị được tải lại. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AdminSettlementSummary as AdminSettlementSummaryDto, SettlementFeedbackResponse, SettlementLineResponse, SettlementResponse,
  SettlementSummary as SettlementSummaryDto,
} from '../api/api.gen'
import { http } from '../api/http'

export type SettlementStatus = 'Draft' | 'Proposed' | 'Disputed' | 'Approved' | 'PaidOut' | 'Closed'

export type SettlementLine = SettlementLineResponse

export type SettlementFeedback = Omit<SettlementFeedbackResponse, 'status'> & { status: 'Open' | 'Answered' | 'Withdrawn' | 'Unresolved' }

export type Settlement = Omit<SettlementResponse, 'status' | 'feedback'> & { status: SettlementStatus; feedback: SettlementFeedback[] }

export type AdminSettlementSummary = Omit<AdminSettlementSummaryDto, 'status'> & { status: SettlementStatus | null }

export type SettlementSummary = Omit<SettlementSummaryDto, 'status'> & { status: SettlementStatus }

export const settlementStatuses: Record<SettlementStatus, string> = {
  Draft: 'Bản nháp (chưa công bố)',
  Proposed: 'Đã công bố, đang nhận góp ý',
  Disputed: 'Có góp ý chờ trả lời',
  Approved: 'Đã duyệt, đang chi trả',
  PaidOut: 'Đã chi trả xong',
  Closed: 'Đã đóng Lô',
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
    enabled: id !== null,
    retry: false,
  })
}

/** Gọi một thao tác trên bảng quyết toán rồi cập nhật bảng đó và tải lại mọi danh sách đang hiển thị. */
function useSettlementAction<TArgs>(call: (args: TArgs) => Promise<Settlement>, party = false) {
  const queryClient = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: call,
    onSuccess: async (s) => {
      queryClient.setQueryData(party ? [...settlementKeys.one(s.settlementId), 'party'] : settlementKeys.one(s.settlementId), s)
      await queryClient.invalidateQueries()
    },
  })
}

/** UC38: tính (hoặc tính lại) bảng nháp. Bảng v1.5 không khấu trừ thuế nên taxWithholdingPct thường là 0. */
export const useCalculateSettlement = () => useSettlementAction(async ({ code, taxWithholdingPct }: { code: string; taxWithholdingPct: number }) =>
  (await http.post<Settlement>(`/api/admin/batches/${encodeURIComponent(code)}/settlements`, { taxWithholdingPct })).data)

/** UC35: sao kê cho các bên của Lô (nhà đầu tư chỉ nhận dòng và góp ý của mình). */
export function useSettlement(id: number | null) {
  return useQuery({
    queryKey: [...settlementKeys.one(id ?? 0), 'party'],
    queryFn: async () => (await http.get<Settlement>(`/api/settlements/${id}`)).data,
    enabled: id !== null,
    retry: false,
  })
}

export function useMySettlements() {
  return useQuery({ queryKey: [...settlementKeys.root, 'mine'], queryFn: async () => (await http.get<SettlementSummary[]>('/api/me/settlements')).data })
}

export function useOperatorSettlements() {
  return useQuery({ queryKey: [...settlementKeys.root, 'operator'], queryFn: async () => (await http.get<SettlementSummary[]>('/api/operator/settlements')).data })
}

/** UC37: công bố bảng nháp, mở cửa sổ góp ý (7 đến 14 ngày). */
export const useProposeSettlement = () => useSettlementAction(async ({ id, feedbackDays }: { id: number; feedbackDays: number }) =>
  (await http.post<Settlement>(`/api/admin/settlements/${id}/propose`, { feedbackDays })).data)

export const useAnswerFeedback = () => useSettlementAction(async ({ feedbackId, response, unresolved }: { feedbackId: number; response: string; unresolved: boolean }) =>
  (await http.post<Settlement>(`/api/admin/settlement-feedback/${feedbackId}/answer`, { response, unresolved })).data)

/** UC36: góp ý trong hạn, kèm căn cứ (10 đến 1.000 ký tự). */
export const useSendFeedback = () => useSettlementAction(async ({ id, content }: { id: number; content: string }) =>
  (await http.post<Settlement>(`/api/settlements/${id}/feedback`, { content })).data, true)

/** UC39: duyệt sau hạn góp ý, khoá số liệu và lập lệnh chi. */
export const useApproveSettlement = () => useSettlementAction(async (id: number) =>
  (await http.post<Settlement>(`/api/admin/settlements/${id}/approve`)).data)

/** Gửi mọi lệnh chi quyết toán còn chờ; nhà đầu tư nhận đủ thì Lô tự đóng. */
export const useSendSettlementPayouts = () => useSettlementAction(async (id: number) =>
  (await http.post<Settlement>(`/api/admin/settlements/${id}/send-payouts`)).data)

/** Chỉ khi chạy dev: kết thúc hạn góp ý ngay để demo đầu cuối (API trả 404 ngoài Development). */
export const useEndFeedbackWindowForDemo = () => useSettlementAction(async (id: number) =>
  (await http.post<Settlement>(`/api/dev/settlements/${id}/end-feedback-window`)).data)
