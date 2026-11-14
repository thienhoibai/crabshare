/* /operator — Hôm nay làm gì: ba con số, danh sách việc cần làm, các Lô đang chạy.
   GET /api/operators/me/dashboard (nhật ký còn thiếu, yêu cầu chụp, biểu đồ), /api/operators/me/batches, /api/operators/me/alerts,
   /api/operators/me/evidence, /api/operator/tranches, /api/batches/{code}/goods-receipts (phiếu chờ kiểm đầu vào). */
import { useQueries } from '@tanstack/react-query'
import { NotebookPen, Plus } from 'lucide-react'
import type {
  AlertResponse, GoodsReceiptResponse, OperatorDashboardResponse, PagedResultOfBatchResponse, PagedResultOfOperatorEvidenceItem,
} from '../../shared/api/api.gen'
import {
  OpBadge, OpEmpty, OpFacts, OpHeading, OpMore, OpNote, OpPanel, OpRow, OpTodo, QueryView, StatusBadge, crabImg, http, label, tone, useGet, type Todo,
} from '../../shared/ui/console'
import { dayMonth, isEnded, num, type OperatorTrancheBrief } from './opA'
import TrendChart from './TrendChart'

const round = (value: number | null) => (value === null ? null : Math.round(value * 100) / 100)

export default function OperatorDashboard() {
  const dash = useGet<OperatorDashboardResponse>('/api/operators/me/dashboard', undefined, { retry: false })
  const batches = useGet<PagedResultOfBatchResponse>('/api/operators/me/batches', { pageSize: 100 })
  const alerts = useGet<AlertResponse[]>('/api/operators/me/alerts', undefined, { retry: false })
  const flagged = useGet<PagedResultOfOperatorEvidenceItem>('/api/operators/me/evidence', { status: 'Flagged', pageSize: 50 }, { retry: false })
  const tranches = useGet<OperatorTrancheBrief[]>('/api/operator/tranches', undefined, { retry: false })

  const active = (batches.data?.items ?? []).filter((b) => !isEnded(b.status))
  // Phiếu nhận hàng đang chờ Nhân viên kiểm phẩm: hỏi từng Lô đang mua nguồn hoặc đang lưu nuôi.
  const receiving = active.filter((b) => b.status === 'Sourcing' || b.status === 'InProduction').slice(0, 8)
  const receipts = useQueries({
    queries: receiving.map((b) => {
      const url = `/api/batches/${encodeURIComponent(b.batchCode)}/goods-receipts`
      return { queryKey: [url, undefined], queryFn: async () => (await http.get<GoodsReceiptResponse[]>(url)).data, retry: false }
    }),
  })

  const d = dash.data
  const openAlerts = (alerts.data ?? []).filter((a) => a.status === 'Open' || a.status === 'Escalated')
  const toExplain = (flagged.data?.items ?? []).filter((e) => e.canExplain && !e.explanation).length
  const reachable = (tranches.data ?? []).filter((t) => t.canRequest)
  const logsDue = d?.logsDueToday ?? 0

  const todos: Todo[] = []
  if (openAlerts.length) todos.push({ title: `${openAlerts.length} cảnh báo cần phản hồi`, sub: openAlerts[0].message, href: '/operator/alerts', tone: 'danger' })
  if (logsDue) todos.push({ title: `${logsDue} Lô chưa ghi nhật ký hôm nay`, sub: 'Ghi lượng thức ăn và chỉ số nước', href: '/operator/log' })
  if (d?.pendingCaptureRequests) todos.push({ title: `${d.pendingCaptureRequests} hộp cần chụp ảnh`, sub: 'Chụp tại hộp trước hạn', href: '/operator/evidence' })
  if (toExplain) todos.push({ title: `${toExplain} ảnh cần giải trình`, sub: 'Ảnh bị gắn cờ', href: '/operator/evidence', tone: 'warn' })
  receiving.forEach((b, i) => {
    const waiting = (receipts[i]?.data ?? []).filter((r) => r.status === 'Inspecting').length
    if (waiting) todos.push({ title: `${b.batchCode}: ${waiting} phiếu nhận chờ kiểm đầu vào`, sub: 'Xem kết quả kiểm', href: `/operator/batches/${encodeURIComponent(b.batchCode)}/nguon-cua`, tone: 'info' })
  })
  if (reachable.length) todos.push({ title: `${reachable.length} mốc giải ngân xin được`, sub: reachable.map((t) => `${t.batchCode} mốc ${t.trancheNo}`).join(', '), href: '/operator/disbursements', tone: 'ok' })

  return (
    <>
      <OpHeading
        eyebrow="Hôm nay"
        title={d ? `Chào ${d.farmName}` : 'Tổng quan hộ nuôi'}
        action={
          <>
            <a className="rd-btn rd-btn--ghost" href="/operator/batches/new"><Plus size={16} /> Tạo Lô P</a>
            <a className="rd-btn rd-btn--primary" href="/operator/log"><NotebookPen size={16} /> Ghi nhật ký</a>
          </>
        }
      />

      {dash.isError && <OpNote tone="danger">Hồ sơ hộ nuôi chưa được duyệt. <a className="op-link" href="/operator/register">Xem hồ sơ</a></OpNote>}

      <OpFacts items={[
        { label: 'Lô đang chạy', value: batches.isPending ? '…' : active.length },
        { label: 'Cảnh báo đang mở', value: openAlerts.length, tone: openAlerts.length ? 'danger' : 'ok' },
        { label: 'Chưa ghi nhật ký hôm nay', value: d ? `${logsDue} Lô` : '—', tone: logsDue ? 'warn' : 'ok' },
      ]} />

      <OpPanel title="Việc hôm nay">
        {todos.length ? <OpTodo items={todos} /> : <p className="rd-muted">Không có việc đang chờ.</p>}
      </OpPanel>

      <QueryView query={batches}>
        {() => active.length === 0 ? (
          <OpEmpty title="Chưa có Lô nào đang chạy"><a className="op-link" href="/operator/batches/new">Tạo Lô P đầu tiên</a></OpEmpty>
        ) : (
          <OpPanel className="op-list" title="Lô đang chạy" action={<a className="op-link" href="/operator/batches">Tất cả Lô</a>}>
            {active.slice(0, 8).map((b) => {
              const inFarm = d?.batches.find((x) => x.batchCode === b.batchCode)
              return (
                <OpRow
                  key={b.batchCode}
                  href={`/operator/batches/${encodeURIComponent(b.batchCode)}`}
                  media={crabImg(b.crabType)}
                  title={b.title}
                  sub={`${b.batchCode} · ${label('crabType', b.crabType)} · ${num(b.fundedQuantity ?? b.plannedQuantity, ' con')}`}
                  mid={
                    <span className="op-inline">
                      <OpBadge tone={tone('batchMode', b.batchMode)}>Lô {b.batchMode}</OpBadge>
                      {inFarm && inFarm.openAlerts > 0 && <OpBadge tone="danger">{inFarm.openAlerts} cảnh báo</OpBadge>}
                      {inFarm && b.status === 'InProduction' && !inFarm.loggedToday && <OpBadge tone="warn">Chưa ghi nhật ký</OpBadge>}
                    </span>
                  }
                  end={<StatusBadge kind="batch" value={b.status} />}
                />
              )
            })}
          </OpPanel>
        )}
      </QueryView>

      {d && d.environmentByDay.length > 0 && (
        <OpPanel>
          <OpMore label="Chỉ số nước 30 ngày qua">
            <TrendChart
              data={d.environmentByDay.map((e) => ({ date: e.date, ph: round(e.ph), waterTempC: round(e.waterTempC) }))}
              xKey="date"
              formatX={dayMonth}
              label="Biểu đồ pH và nhiệt độ nước theo ngày, lấy trung bình từ nhật ký chăm sóc"
              series={[{ key: 'ph', name: 'pH', color: 'var(--info)' }, { key: 'waterTempC', name: 'Nhiệt độ (°C)', color: 'var(--accent)', right: true }]}
            />
          </OpMore>
        </OpPanel>
      )}
    </>
  )
}
