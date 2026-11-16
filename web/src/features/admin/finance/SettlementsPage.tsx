/* /admin/settlements — Lô đang bán, chờ quyết toán, đang quyết toán hoặc đã đóng, kèm bảng quyết toán nếu đã tính (GET /api/admin/settlements).
   Tính bảng nháp lần đầu ở đây (POST /api/admin/batches/{code}/settlements); các bước sau ở trang chi tiết.
   Bảng nháp lấy số từ dữ liệu đã ghi của Lô, không nhập tay (BR-232). Lô đủ sáu điều kiện thì tự chuyển sang chờ quyết toán (BR-183). */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Calculator } from 'lucide-react'
import type { AdminSettlementSummary, CalculateSettlementRequest, SettlementReadinessResponse, SettlementResponse } from '../../../shared/api/api.gen'
import {
  Money, OpBadge, OpBtn, OpConfirm, OpFlow, OpHeading, OpModal, OpPanel, OpTable, OpTabs, QueryView, StatusBadge,
  formatDateTime, useGet, useSend,
} from '../../../shared/ui/console'
import { Cell } from '../quality/shared'

type Tab = 'all' | 'settling' | 'selling' | 'closed'

const FILTERS: Record<Tab, (r: AdminSettlementSummary) => boolean> = {
  all: () => true,
  settling: (r) => r.batchStatus === 'AwaitingSettlement' || r.batchStatus === 'Settling',
  selling: (r) => r.batchStatus === 'Selling' || r.batchStatus === 'Liquidating',
  closed: (r) => r.batchStatus === 'Closed',
}

const EMPTY: Record<Tab, string> = {
  all: 'Chưa có Lô nào tới giai đoạn quyết toán',
  settling: 'Không có Lô nào chờ quyết toán',
  selling: 'Không có Lô nào đang bán',
  closed: 'Chưa có Lô nào đã đóng',
}

const canCalculate = (r: AdminSettlementSummary) => r.batchStatus === 'AwaitingSettlement' || r.batchStatus === 'Settling'

function CalculateDialog({ row, onClose }: { row: AdminSettlementSummary; onClose: () => void }) {
  const navigate = useNavigate()
  const calculate = useSend<SettlementResponse, CalculateSettlementRequest>('post', `/api/admin/batches/${encodeURIComponent(row.batchCode)}/settlements`, {
    quietError: true,
    success: 'Đã tính bảng quyết toán nháp.',
    onSuccess: (res) => navigate(`/admin/settlements/${res.settlementId}`),
  })
  return (
    <OpConfirm
      title="Tính bảng quyết toán nháp"
      sub={`${row.batchCode} · ${row.operatorName}`}
      confirmLabel="Tính quyết toán"
      pending={calculate.isPending}
      error={calculate.error}
      onClose={onClose}
      onConfirm={() => calculate.mutate({ taxWithholdingPct: 0 })}
    >
      <p>Bảng nháp chỉ bạn thấy, tính lại được cho tới khi duyệt.</p>
    </OpConfirm>
  )
}

/** Sáu điều kiện để Lô chuyển sang chờ quyết toán. */
function ReadinessDialog({ batchCode, onClose }: { batchCode: string; onClose: () => void }) {
  const readiness = useGet<SettlementReadinessResponse>(`/api/batches/${encodeURIComponent(batchCode)}/settlement-readiness`)
  return (
    <OpModal title="Điều kiện chờ quyết toán" sub={`Lô ${batchCode}`} onClose={onClose}>
      <QueryView query={readiness}>
        {(r) => (
          <OpFlow steps={r.conditions.map((c) => ({
            title: c.description,
            sub: c.met ? undefined : `Còn ${c.pending} mục`,
            state: c.met ? 'done' as const : 'bad' as const,
          }))} />
        )}
      </QueryView>
    </OpModal>
  )
}

export default function SettlementsPage() {
  const settlements = useGet<AdminSettlementSummary[]>('/api/admin/settlements')
  const [tab, setTab] = useState<Tab>('all')
  const [calculating, setCalculating] = useState<AdminSettlementSummary | null>(null)
  const [checking, setChecking] = useState<string | null>(null)
  const count = (key: Tab) => (settlements.data ?? []).filter(FILTERS[key]).length

  return (
    <>
      <OpHeading eyebrow="Tiền" title="Quyết toán" />
      <OpTabs
        value={tab}
        onChange={setTab}
        items={[
          { key: 'all', label: 'Tất cả' },
          { key: 'settling', label: 'Chờ và đang quyết toán', count: count('settling') },
          { key: 'selling', label: 'Đang bán' },
          { key: 'closed', label: 'Đã đóng' },
        ]}
      />
      <QueryView query={settlements}>
        {(list) => (
          <OpPanel>
            <OpTable
              rows={list.filter(FILTERS[tab])}
              rowKey={(r) => r.batchCode}
              empty={EMPTY[tab]}
              columns={[
                { key: 'batch', header: 'Lô', cell: (r) => <Cell main={<b>{r.batchCode}</b>} sub={r.operatorName} /> },
                { key: 'batchStatus', header: 'Trạng thái Lô', cell: (r) => <StatusBadge kind="batch" value={r.batchStatus} /> },
                {
                  key: 'settlement', header: 'Bảng quyết toán',
                  cell: (r) => (r.status
                    ? <Cell main={<StatusBadge kind="settlement" value={r.status} />} sub={r.feedbackDeadline ? `Hạn góp ý ${formatDateTime(r.feedbackDeadline)}` : `Lần tính ${r.revisionNo ?? 1}`} />
                    : <span className="op-muted">Chưa tính</span>),
                },
                { key: 'revenue', header: 'Doanh thu thực thu', num: true, cell: (r) => <Money value={r.actualRevenue} /> },
                { key: 'feedback', header: 'Góp ý', cell: (r) => (r.openFeedback > 0 ? <OpBadge tone="danger">{r.openFeedback} chờ trả lời</OpBadge> : '—') },
                {
                  key: 'action', header: '',
                  cell: (r) => (r.settlementId !== null
                    ? <a className={canCalculate(r) ? 'rd-btn rd-btn--primary rd-btn--sm' : 'op-link'} href={`/admin/settlements/${r.settlementId}`}>{canCalculate(r) ? 'Làm tiếp' : 'Xem bảng'}</a>
                    : canCalculate(r)
                      ? <OpBtn sm onClick={() => setCalculating(r)}><Calculator size={15} /> Tính quyết toán</OpBtn>
                      : r.batchStatus === 'Closed' ? null
                        : <OpBtn sm variant="ghost" onClick={() => setChecking(r.batchCode)}>Còn thiếu gì</OpBtn>),
                },
              ]}
            />
          </OpPanel>
        )}
      </QueryView>
      {calculating && <CalculateDialog row={calculating} onClose={() => setCalculating(null)} />}
      {checking && <ReadinessDialog batchCode={checking} onClose={() => setChecking(null)} />}
    </>
  )
}
