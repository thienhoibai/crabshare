import { http } from '../../shared/api/http'

export type AlertStatus = 'Open' | 'Acknowledged' | 'Escalated' | 'Resolved'
export interface AlertItem {
  id: number; batchCode: string; farmName: string; type: string; severity: string; message: string
  raisedAt: string; ackDeadline: string; status: AlertStatus; acknowledgedAt: string | null
  acknowledgedBy: number | null; responseNote: string | null; escalatedAt: string | null
}
export const alertTypes: Record<string, string> = { Mortality: 'Hao hụt', WaterQuality: 'Chất lượng nước', MilestoneDelay: 'Trễ mốc', LowStock: 'Sắp hết hàng', DataSilence: 'Thiếu nhật ký', EvidenceFlag: 'Bằng chứng bị gắn cờ' }
export const alertSeverities: Record<string, string> = { Low: 'Thấp', Medium: 'Trung bình', High: 'Cao', Critical: 'Nghiêm trọng' }
export const alertStatuses: Record<AlertStatus, string> = { Open: 'Chờ phản hồi', Acknowledged: 'Đã xác nhận', Escalated: 'Đã leo thang', Resolved: 'Đã xử lý' }
export const myAlerts = async (status?: string) => (await http.get<AlertItem[]>('/api/operators/me/alerts', { params: { status: status || undefined } })).data
export const acknowledgeAlert = async (id: number, responseNote: string) => (await http.post<AlertItem>(`/api/alerts/${id}/acknowledge`, { responseNote })).data
