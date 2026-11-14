/* Phần dùng chung của nhóm trang A cổng người nuôi (hồ sơ, tạo Lô, nguồn cua, lưu nuôi, nhật ký, thiết bị):
   nhãn cho các mã chưa có trong status.ts, kiểu của endpoint chưa có trong api.gen.ts, gửi ảnh chụp tại hộp. */
import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import type { EvidenceResponse } from '../../shared/api/api.gen'
import { errorMessage, http, toFormData, toast, type Tone } from '../../shared/ui/console'

/* ---------- nhãn bổ sung ---------- */

const text = (map: Record<string, string>) => (code: string | null | undefined) => (code ? map[code] ?? code : '')

/** Sự kiện tồn của một con cua (inventory_event.event_type). */
export const crabEventLabel = text({
  Received: 'Nhận vào tồn',
  Boxed: 'Xếp vào hộp',
  Moved: 'Chuyển hộp',
  Died: 'Chết',
  Molted: 'Lột xác',
  AbnormalFeeding: 'Ăn khác thường',
  Inspected: 'Kiểm tra',
  Graded: 'Phân hạng',
  Destroyed: 'Loại bỏ',
  Allocated: 'Phân bổ cho đơn',
  Released: 'Nhả phân bổ',
  Shipped: 'Xuất hàng',
  Delivered: 'Đã giao',
  Returned: 'Trả về tồn',
  Sold: 'Đã bán',
})

export const crabEventTone = (code: string): Tone =>
  code === 'Died' || code === 'Destroyed' ? 'danger' : code === 'AbnormalFeeding' ? 'warn' : code === 'Molted' || code === 'Moved' ? 'info' : 'mute'

/** Sự kiện người nuôi tự ghi được (POST /api/crab-units/{code}/events). */
export const RECORDABLE_EVENTS = [
  { value: 'Inspected', label: 'Kiểm tra' },
  { value: 'Molted', label: 'Lột xác' },
  { value: 'AbnormalFeeding', label: 'Ăn khác thường' },
  { value: 'Died', label: 'Chết', hint: 'Cần ảnh hộp' },
] as const
export type RecordableEvent = (typeof RECORDABLE_EVENTS)[number]['value']

export const boxReasonLabel = text({ Stock: 'Thả ban đầu', Restock: 'Thả bù', Move: 'Chuyển hộp' })
export const leaveReasonLabel = text({ Moved: 'Chuyển hộp', Died: 'Cua chết', Harvested: 'Thu hoạch' })
export const holdingStatusLabel = text({ Active: 'Đang lưu nuôi', Harvesting: 'Đang thu hoạch', Ended: 'Đã kết thúc', Closed: 'Đã kết thúc' })
export const eventSourceLabel = text({ App: 'Người nuôi ghi', Qc: 'Nhân viên kiểm phẩm', Device: 'Thiết bị', System: 'Hệ thống' })

export const milestoneKindLabel = text({ Receipt: 'Nhận cua xong', MidCycle: 'Giữa vụ', Settlement: 'Quyết toán', Custom: 'Mốc riêng' })
export const costBearerLabel = text({ Batch: 'Lô chịu', Executor: 'Người nuôi tự chịu', Supplier: 'Nhà cung cấp chịu' })
export const settlementBasisLabel = text({ StandardCost: 'Theo Chi phí chuẩn', ActualCost: 'Theo chi phí thực tế' })
export const costPlanStatusLabel = text({ Draft: 'Bản nháp', Submitted: 'Đã gửi duyệt', Approved: 'Đã duyệt', Locked: 'Đã khoá', Superseded: 'Bản cũ' })

export const scopeTypeLabel = text({ Rack: 'Dàn', QcStation: 'Trạm kiểm phẩm', Holding: 'Đợt lưu nuôi', Slot: 'Hộp', Site: 'Địa điểm' })
export const calibrationKinds = [
  { value: 'scale', label: 'Cân (quả cân chuẩn)' },
  { value: 'camera', label: 'Camera' },
  { value: 'tof', label: 'Cảm biến khoảng cách' },
  { value: 'ph', label: 'Đầu dò pH (dung dịch chuẩn)' },
  { value: 'ec', label: 'Đầu dò độ mặn (dung dịch chuẩn)' },
  { value: 'position', label: 'Vị trí camera chạy dàn' },
] as const

export const memberRoleLabel = text({ Owner: 'Chủ hộ', Staff: 'Nhân viên' })
export const logSourceLabel = text({ Manual: 'Ghi tay', FarmApi: 'Phần mềm của trại', Device: 'Thiết bị' })
export const plausibilityLabel = text({ Ok: 'Bình thường', OutOfRange: 'Ngoài khoảng đã đặt', Inconsistent: 'Không nhất quán' })
export const verdictLabel = text({ Pass: 'Đạt', Fail: 'Không đạt', NeedMoreEvidence: 'Cần bổ sung' })

/** Lô đã kết thúc: không còn việc gì cho người nuôi. */
export const isEnded = (status: string) => status === 'Closed' || status === 'Cancelled' || status === 'Rejected'

/* ---------- kiểu của endpoint trả IActionResult ---------- */

/** GET /api/boxes (Features/Boxes/BoxDtos.cs). */
export interface FarmBox {
  slotCode: string
  status: string
  rowCode: string | null
  rackNo: number | null
  tierNo: number | null
  columnNo: number | null
  batchCode: string | null
  latestEvidence: { id: number; receivedAt: string; reviewStatus: string } | null
}
export interface FarmBoxPage { items: FarmBox[]; page: number; pageSize: number; total: number }

/** GET /api/operator/tranches: chỉ lấy các trường trang tổng quan cần (trang giải ngân thuộc nhóm B). */
export interface OperatorTrancheBrief { trancheId: number; batchCode: string; trancheNo: number; plannedAmount: number; canRequest: boolean }

/* ---------- tiện ích ---------- */

/** Mã HTTP của một lỗi gọi API (0 khi không phải lỗi HTTP). */
export const httpStatus = (error: unknown) => (axios.isAxiosError(error) ? error.response?.status ?? 0 : 0)

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD cho ô nhập ngày. */
export const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

const VN = 'Asia/Ho_Chi_Minh'
const part = (iso: string | null | undefined, options: Intl.DateTimeFormatOptions) => {
  const d = iso ? new Date(iso) : null
  return d && !isNaN(d.getTime()) ? new Intl.DateTimeFormat('vi-VN', { ...options, timeZone: VN }).format(d) : ''
}
/** Ngày và tháng "05/11" cho nhãn trục biểu đồ. */
export const dayMonth = (iso: string | null | undefined) => part(iso, { day: '2-digit', month: '2-digit' })
/** Giờ và phút "09:30" theo giờ Việt Nam. */
export const hourMinute = (iso: string | null | undefined) => part(iso, { hour: '2-digit', minute: '2-digit', hour12: false })

export const num = (value: number | null | undefined, unit = '') => (value === null || value === undefined ? '—' : `${new Intl.NumberFormat('vi-VN').format(value)}${unit}`)

/** Vị trí hộp trên dàn: "Dàn 2 · tầng 1 · cột 3". */
export const boxPlace = (b: { rackNo: number | null; tierNo: number | null; columnNo: number | null }) =>
  [b.rackNo ? `Dàn ${b.rackNo}` : '', b.tierNo ? `tầng ${b.tierNo}` : '', b.columnNo ? `cột ${b.columnNo}` : ''].filter(Boolean).join(' · ')

/* ---------- ảnh chụp tại hộp ---------- */

/** Lỗi phát sinh ở trình duyệt (chưa bật định vị, chưa chọn ảnh), có câu thông báo riêng. */
export class LocalError extends Error {}

/** Câu báo lỗi cho cả lỗi của API và lỗi ở trình duyệt. */
export const actionError = (error: unknown) => (error instanceof LocalError ? error.message : errorMessage(error))

function currentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new LocalError('Trình duyệt này không có định vị nên không gửi được ảnh chụp tại hộp.'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => reject(new LocalError('Cần cho phép định vị. Ảnh chụp tại hộp phải kèm vị trí lúc chụp.')),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    )
  })
}

/**
 * Gửi ảnh chụp tại hộp (POST /api/evidence, multipart) rồi trả mã bằng chứng để gắn vào thao tác xếp hộp, thả bù hay báo cua chết.
 * API yêu cầu giờ chụp và toạ độ; giờ chụp lấy từ tệp ảnh, toạ độ lấy từ định vị của máy.
 */
export async function uploadBoxPhoto(input: { batchCode: string; slotCode: string; image: File | null; captureRequestId?: number; boxing?: boolean }): Promise<EvidenceResponse> {
  if (!input.image) throw new LocalError('Chưa có ảnh chụp hộp.')
  const position = await currentPosition()
  const capturedAt = new Date(Math.min(input.image.lastModified || Date.now(), Date.now())).toISOString()
  const form = toFormData({
    BatchCode: input.batchCode,
    SlotCode: input.slotCode,
    CapturedAt: capturedAt,
    Latitude: position.latitude.toFixed(6),
    Longitude: position.longitude.toFixed(6),
    CaptureRequestId: input.captureRequestId,
    // Ảnh hộp trống chụp ngay trước khi xếp cua vào: thả lần đầu hoặc thả bù.
    SlotEventType: input.boxing ? 'Boxed' : undefined,
    Image: input.image,
  })
  return (await http.post<EvidenceResponse>('/api/evidence', form)).data
}

/**
 * Gửi ảnh hộp và nhớ mã bằng chứng của ảnh vừa gửi. Khi bước ghi tiếp theo lỗi và người dùng bấm lại với cùng ảnh, cùng hộp,
 * ảnh không bị gửi lần hai (ảnh trùng sẽ bị hệ thống gắn cờ).
 */
export function usePhotoUpload() {
  const last = useRef<{ key: string; id: number } | null>(null)
  return async (input: { batchCode: string; slotCode: string; image: File | null; boxing?: boolean }): Promise<number> => {
    const f = input.image
    const key = f ? `${input.batchCode}|${input.slotCode}|${f.name}|${f.size}|${f.lastModified}` : ''
    if (f && last.current?.key === key) return last.current.id
    const evidence = await uploadBoxPhoto(input)
    last.current = { key, id: evidence.id }
    return evidence.id
  }
}

/** Một thao tác ghi gồm nhiều lần gọi nối tiếp (gửi ảnh rồi ghi sự kiện). Thành công thì tải lại mọi truy vấn. */
export function useAction<TRes, TBody = void>(run: (body: TBody) => Promise<TRes>, options: { success?: string; onSuccess?: (res: TRes) => void } = {}) {
  const queryClient = useQueryClient()
  return useMutation<TRes, unknown, TBody>({
    retry: false,
    mutationFn: run,
    onSuccess: (res) => {
      void queryClient.invalidateQueries()
      if (options.success) toast(options.success)
      options.onSuccess?.(res)
    },
  })
}
