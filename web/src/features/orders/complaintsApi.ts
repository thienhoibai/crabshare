import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '../../shared/api/http'

export type ComplaintType = 'LateDelivery' | 'WrongGrade' | 'Damaged' | 'NotReceived' | 'Other'
export type ComplaintStatus = 'Open' | 'OperatorResponded' | 'Escalated' | 'Resolved' | 'Rejected'
export type ComplaintResolution = 'Refund' | 'Compensation' | 'Replacement' | 'NoAction'

export const COMPLAINT_TYPE_LABELS: Record<ComplaintType, string> = {
  LateDelivery: 'Giao trễ hẹn',
  WrongGrade: 'Sai hạng / sai kích cỡ',
  Damaged: 'Hàng hư hỏng / cua chết',
  NotReceived: 'Chưa nhận được hàng',
  Other: 'Lý do khác',
}

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  Open: 'Chờ hộ nuôi phản hồi',
  OperatorResponded: 'Hộ nuôi đã giải trình',
  Escalated: 'Chờ Admin phân xử (Quá hạn 24h)',
  Resolved: 'Đã giải quyết',
  Rejected: 'Đã bác bỏ',
}

export const COMPLAINT_RESOLUTION_LABELS: Record<ComplaintResolution, string> = {
  Refund: 'Hoàn tiền cho khách',
  Compensation: 'Bồi thường thoả thuận',
  Replacement: 'Giao bù hàng',
  NoAction: 'Không bồi hoàn (Bác bỏ)',
}

export interface CreateComplaintPayload {
  complaintType: ComplaintType
  description: string
  evidenceUri?: string | null
}

export interface RespondComplaintPayload {
  response: string
  evidenceUri?: string | null
}

export interface ResolveComplaintPayload {
  resolution: string
  refundAmount?: number | null
  adminNotes?: string | null
}

export interface ComplaintSummary {
  complaintId: number
  orderId: number
  orderNo: string
  batchCode: string
  farmName: string
  customerName: string
  totalAmount: number
  complaintType: ComplaintType
  status: ComplaintStatus
  openedAt: string
  resolvedAt?: string | null
  refundAmount?: number | null
}

export interface ComplaintDetail extends ComplaintSummary {
  customerEmail: string
  description: string
  evidenceUri?: string | null
  operatorResponse?: string | null
  operatorEvidenceUri?: string | null
  respondedAt?: string | null
  escalatedAt?: string | null
  resolution?: ComplaintResolution | null
  adminNotes?: string | null
  resolvedBy?: number | null
  resolvedByName?: string | null
  createdAt: string
  updatedAt: string
}

export interface PagedComplaints {
  items: ComplaintSummary[]
  totalItems: number
  page: number
  pageSize: number
  totalPages: number
}

export const complaintsApi = {
  // Khách hàng gửi khiếu nại (UC31)
  submitComplaint: (orderNo: string, payload: CreateComplaintPayload) =>
    http.post<ComplaintDetail>(`/api/orders/${orderNo}/complaints`, payload).then((r) => r.data),

  // Khách hàng / người dùng xem khiếu nại của đơn
  getOrderComplaint: (orderNo: string) =>
    http.get<ComplaintDetail | null>(`/api/orders/${orderNo}/complaints`).then((r) => r.data).catch((err) => {
      if (err.response?.status === 404) return null
      throw err
    }),

  // Hộ nuôi gửi giải trình
  respondComplaint: (complaintId: number, payload: RespondComplaintPayload) =>
    http.post<ComplaintDetail>(`/api/complaints/${complaintId}/respond`, payload).then((r) => r.data),

  // Danh sách khiếu nại của hộ nuôi
  getOperatorComplaints: () =>
    http.get<ComplaintSummary[]>('/api/operators/me/complaints').then((r) => r.data),

  // Admin xem danh sách
  getAdminComplaints: (status?: string, page = 1, pageSize = 20) => {
    const params = new URLSearchParams()
    if (status && status !== 'all') params.append('status', status)
    params.append('page', String(page))
    params.append('pageSize', String(pageSize))
    return http.get<PagedComplaints>(`/api/admin/complaints?${params.toString()}`).then((r) => r.data)
  },

  // Admin xem chi tiết
  getAdminComplaintDetail: (id: number) =>
    http.get<ComplaintDetail>(`/api/admin/complaints/${id}`).then((r) => r.data),

  // Admin phân xử giải quyết (UC32)
  resolveAdminComplaint: (id: number, payload: ResolveComplaintPayload) =>
    http.post<ComplaintDetail>(`/api/admin/complaints/${id}/resolve`, payload).then((r) => r.data),
}

export function useOrderComplaint(orderNo?: string) {
  return useQuery({
    queryKey: ['complaints', 'order', orderNo],
    queryFn: () => (orderNo ? complaintsApi.getOrderComplaint(orderNo) : Promise.resolve(null)),
    enabled: Boolean(orderNo),
  })
}

export function useSubmitComplaint(orderNo: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateComplaintPayload) => complaintsApi.submitComplaint(orderNo, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaints', 'order', orderNo] })
      queryClient.invalidateQueries({ queryKey: ['orders', 'tracking', orderNo] })
    },
  })
}

export function useOperatorComplaints() {
  return useQuery({
    queryKey: ['operator', 'complaints'],
    queryFn: complaintsApi.getOperatorComplaints,
  })
}

export function useRespondComplaint(complaintId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: RespondComplaintPayload) => complaintsApi.respondComplaint(complaintId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operator', 'complaints'] })
      queryClient.invalidateQueries({ queryKey: ['complaints'] })
    },
  })
}

export function useAdminComplaints(status?: string, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['admin', 'complaints', status, page, pageSize],
    queryFn: () => complaintsApi.getAdminComplaints(status, page, pageSize),
  })
}

export function useAdminComplaintDetail(id?: number) {
  return useQuery({
    queryKey: ['admin', 'complaints', id],
    queryFn: () => (id ? complaintsApi.getAdminComplaintDetail(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  })
}

export function useResolveAdminComplaint(complaintId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ResolveComplaintPayload) => complaintsApi.resolveAdminComplaint(complaintId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'complaints'] })
    },
  })
}
