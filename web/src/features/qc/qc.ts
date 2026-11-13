/* Phần dùng chung của cổng Nhân viên kiểm phẩm: việc được phân (GET /api/qc/tasks, BR-017), tra phiếu nhận của việc
   kiểm đầu vào, thứ hạng size và hạng (giống GradeLabels ở backend), nhãn của lý do giữ lại và cách đo. */
import { useQueries } from '@tanstack/react-query'
import type {
  ExploreBatchResponse, GoodsReceiptResponse, GradeDecisionResponse, GradeRuleSetResponse, GradingStandardResponse, QcTaskResponse,
} from '../../shared/api/api.gen'
import { useAuthStore } from '../../shared/auth/authStore'
import { http, useGet } from '../../shared/ui/console'
import './qc.css'

/** Các loại việc có trang làm việc trên web. */
export const WORK_KINDS = ['IncomingInspection', 'GradingSession', 'SecondReview', 'SiteVisit'] as const

export const useMyId = () => useAuthStore((s) => s.user?.userId ?? null)

/** Việc đang chờ của tôi. Tự hỏi lại mỗi phút vì việc được phân ngẫu nhiên bất kỳ lúc nào. */
export const useQcTasks = () => useGet<QcTaskResponse[]>('/api/qc/tasks', undefined, { refetchInterval: 60_000 })

export const newestFirst = (tasks: QcTaskResponse[]) => [...tasks].sort((a, b) => Date.parse(b.assignedAt) - Date.parse(a.assignedAt))

/** Thông tin chung của Lô (với Nhân viên kiểm phẩm, GET /api/batches/{code} trả bản công khai). */
export type BatchHead = Pick<ExploreBatchResponse, 'batchCode' | 'title' | 'crabType' | 'status' | 'batchMode'> & { executorName?: string | null }
export const useBatchHead = (code: string | null | undefined) =>
  useGet<BatchHead>(code ? `/api/batches/${encodeURIComponent(code)}` : null, undefined, { staleTime: 300_000, retry: false })

export const receiptHref = (receiptNo: string, batchCode: string) =>
  `/qc/kiem-dau-vao/${encodeURIComponent(receiptNo)}?lo=${encodeURIComponent(batchCode)}`

export interface ReceiptTask { task: QcTaskResponse; receipt: GoodsReceiptResponse | null }

/**
 * Việc kiểm đầu vào chỉ mang id của phiếu nhận, không mang số phiếu. Tra số phiếu qua danh sách phiếu nhận của Lô:
 * phiếu đang kiểm được phân cho tôi, xếp theo thứ tự lập, khớp lần lượt với việc xếp theo id phiếu.
 */
export function useIncomingReceipts(tasks: QcTaskResponse[] | undefined) {
  const me = useMyId()
  const incoming = (tasks ?? []).filter((t) => t.kind === 'IncomingInspection')
  const codes = [...new Set(incoming.map((t) => t.batchCode))]
  const results = useQueries({
    queries: codes.map((code) => {
      const url = `/api/batches/${encodeURIComponent(code)}/goods-receipts`
      return { queryKey: [url, undefined], queryFn: async () => (await http.get<GoodsReceiptResponse[]>(url)).data }
    }),
  })
  const rows: ReceiptTask[] = []
  codes.forEach((code, i) => {
    const mine = (results[i]?.data ?? []).filter((r) => r.status === 'Inspecting' && r.qcUserId === me)
    incoming.filter((t) => t.batchCode === code).sort((a, b) => a.targetId - b.targetId)
      .forEach((task, k) => rows.push({ task, receipt: mine[k] ?? null }))
  })
  return { rows, loading: results.some((r) => r.isPending), error: results.find((r) => r.isError)?.error ?? null }
}

/* ---------- size và hạng ---------- */

const SIZE_RANK: Record<string, number> = { OUT: 0, M: 1, L: 2, XL: 3 }
const GRADE_RANK: Record<string, number> = { BELOW: 0, G1: 1, SPECIAL: 2 }

/** Hạng cuối chỉ được bằng hoặc thấp hơn hạng đề xuất từ số đo (BR-155); chưa có đề xuất thì chọn cả ba. */
export const gradesUpTo = (proposed: string | null) =>
  ['SPECIAL', 'G1', 'BELOW'].filter((g) => proposed === null || GRADE_RANK[g] <= (GRADE_RANK[proposed] ?? 0))

/** Size cuối không lớn hơn size theo khối lượng cân (BR-157). */
export const sizesUpTo = (proposed: string | null) => ['XL', 'L', 'M', 'OUT'].filter((s) => SIZE_RANK[s] <= (SIZE_RANK[proposed ?? 'OUT'] ?? 0))

/** Ngoài cỡ hoặc dưới ngưỡng mức C là cua dưới chuẩn (BR-158). */
export const isSubstandard = (size: string | null, grade: string | null) => size === 'OUT' || grade === 'BELOW'

/* ---------- nhãn ---------- */

/* Lý do giữ lại, cách đo, chất lượng ảnh, độ trưởng thành lấy từ status.ts (holdReason, measureMethod, imageQuality, maturity). */
export const LIVE_STATUS: Record<string, string> = { Alive: 'Còn sống, khoẻ', Weak: 'Yếu nặng', Dead: 'Đã chết' }
export const FOOD_SAFETY: Record<string, string> = { Pass: 'An toàn', Fail: 'Không an toàn' }

/** Số có dấu phẩy thập phân kiểu Việt Nam: 412,3. */
export const num = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(value)

/* ---------- số đo sát ngưỡng ---------- */

/** Bộ quy tắc mà quyết định đã dùng, nếu còn trong danh sách chuẩn đang công bố. */
export const ruleSetOf = (standards: GradingStandardResponse[] | undefined, crabType: string | undefined, versionNo: number) =>
  standards?.flatMap((s) => s.ruleSets).find((set) => set.crabType === crabType && set.versionNo === versionNo)

export interface NearHit { metric: 'WeightG' | 'CIndex' | 'EdgeBandMm'; bound: number; unit: string }

/** Số đo cách một ngưỡng không quá near% của ngưỡng đó (cùng cách tính với GradeEngine.IsNear ở backend). */
export function nearHits(d: GradeDecisionResponse, set: GradeRuleSetResponse | undefined): NearHit[] {
  if (!set || set.nearThresholdPct <= 0) return []
  const checks: { kind: string; metric: NearHit['metric']; value: number | null }[] = [
    { kind: 'Size', metric: 'WeightG', value: d.weightG },
    { kind: 'PhysicalFactor', metric: 'CIndex', value: d.cIndex },
    { kind: 'Sensory', metric: 'EdgeBandMm', value: d.edgeBandMm },
  ]
  const hits: NearHit[] = []
  for (const c of checks) {
    if (c.value === null) continue
    for (const rule of set.rules.filter((r) => r.ruleKind === c.kind && r.metric === c.metric))
      for (const bound of [rule.lowerBound, rule.upperBound])
        if (bound !== null && bound > 0 && Math.abs(c.value - bound) <= (bound * set.nearThresholdPct) / 100 &&
            !hits.some((h) => h.metric === c.metric && h.bound === bound))
          hits.push({ metric: c.metric, bound, unit: rule.unit })
  }
  return hits
}
