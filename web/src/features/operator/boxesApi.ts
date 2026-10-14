import { http } from '../../shared/api/http'

export type BoxStatus = 'Available' | 'Occupied' | 'Maintenance'
export type Box = { slotCode: string; status: BoxStatus; rowCode: string | null; rackNo: number | null; tierNo: number | null; columnNo: number | null }
export type BoxPage = { items: Box[]; page: number; pageSize: number; total: number }
export const boxLabels: Record<BoxStatus, string> = { Available: 'Sẵn sàng', Occupied: 'Đang nuôi', Maintenance: 'Bảo trì' }
export const listBoxes = async (status: string, search: string, page: number, signal?: AbortSignal) =>
  (await http.get<BoxPage>('/api/boxes', { params: { status: status || undefined, search: search.trim() || undefined, page, pageSize: 50 }, signal })).data
export const createBoxRange = async (request: { from: number; to: number; width: number }) =>
  (await http.post<{ created: number; from: string; to: string }>('/api/boxes/range', request)).data
export const createBox = async (request: Omit<Box, 'status'>) => (await http.post<Box>('/api/boxes', request)).data
export const updateBox = async (slotCode: string, status: 'Available' | 'Maintenance') =>
  (await http.patch<Box>(`/api/boxes/${encodeURIComponent(slotCode)}`, { status })).data
