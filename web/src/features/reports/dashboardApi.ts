import { http } from '../../shared/api/http'

export interface StatusCount { status: string; count: number }
export interface AdminDashboardData {
  from: string; to: string; asOf: string; confirmedCapital: number; confirmedContributions: number; totalUsers: number
  capitalByDay: { date: string; amount: number; count: number }[]
  batchesByStatus: StatusCount[]; escalatedAlerts: number
  latestEscalatedAlerts: { id: number; batchCode: string; farmName: string; severity: string; message: string; raisedAt: string }[]
  ordersByStatus: StatusCount[]; completedOrderRevenue: number
  payoutsByStatus: (StatusCount & { amount: number })[]; succeededPayoutAmount: number
}
export interface OperatorDashboardData {
  from: string; to: string; asOf: string; farmName: string; selectedBatchCode: string | null
  batches: { batchCode: string; title: string; status: string; aliveCount: number; expectedOutputKg: number; openAlerts: number; loggedToday: boolean }[]
  aliveCount: number; openAlerts: number; pendingCaptureRequests: number; logsDueToday: number; ordersToPack: number; ordersToShip: number
  environmentByDay: { date: string; ph: number | null; waterTempC: number | null }[]
  recentLogs: { id: number; batchCode: string; date: string; ph: number | null; waterTempC: number | null; salinityPpt: number | null; feedKg: number | null }[]
}
export const statusLabels: Record<string, string> = {
  Draft: 'Nháp', Submitted: 'Chờ duyệt', Funding: 'Gọi vốn', Stocked: 'Đã thả giống', InProduction: 'Đang nuôi', Harvesting: 'Thu hoạch', Settlement: 'Quyết toán', Closed: 'Đã đóng', Cancelled: 'Đã huỷ',
  PendingPayment: 'Chờ thanh toán', Paid: 'Đã thanh toán', Packed: 'Đã đóng gói', Shipping: 'Đang giao', Delivered: 'Đã giao', Completed: 'Hoàn tất', Disputed: 'Tranh chấp', Created: 'Đã tạo', Sent: 'Đã gửi', Succeeded: 'Thành công', Failed: 'Thất bại',
}
export async function adminDashboard(from: string, to: string, signal: AbortSignal) {
  const { data } = await http.get<AdminDashboardData>('/api/admin/dashboard', { params: { from, to }, signal })
  if (!Array.isArray(data?.capitalByDay) || !Array.isArray(data?.batchesByStatus)) throw new Error('Invalid dashboard response')
  return data
}
export async function operatorDashboard(from: string, to: string, batchCode: string, signal: AbortSignal) {
  const { data } = await http.get<OperatorDashboardData>('/api/operators/me/dashboard', { params: { from, to, batchCode: batchCode || undefined }, signal })
  if (!Array.isArray(data?.batches) || !Array.isArray(data?.environmentByDay)) throw new Error('Invalid dashboard response')
  return data
}
export async function downloadReport(name: string, from: string, to: string) {
  const response = await http.get<Blob>(`/api/admin/reports/${encodeURIComponent(name)}.csv`, { params: { from, to }, responseType: 'blob' })
  if (!String(response.headers['content-type']).includes('text/csv')) throw new Error('Invalid CSV response')
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a'); link.href = url; link.download = `crabshare-${name}-${from}-${to}.csv`; document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function initialPeriod() {
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
  const start = new Date(`${today}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - 29)
  return { from: start.toISOString().slice(0, 10), to: today }
}
export function validPeriod(from: string, to: string) {
  const span = (Date.parse(to) - Date.parse(from)) / 86400_000
  return !!from && !!to && from >= '1900-01-01' && to <= '9998-12-31' && span >= 0 && span <= 365
}
