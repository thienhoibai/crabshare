/* /admin — Bảng điều khiển của Quản trị.
   Hiển thị 4 chỉ số tổng quan, biểu đồ vốn góp & phân bố lô, danh sách lô gần đây lọc theo trạng thái,
   hàng việc & cảnh báo cần xử lý, cùng số liệu theo kỳ và xuất CSV. */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { AlertTriangle, CheckCircle2, Clock, Download, Plus } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type {
  AdminDashboardResponse,
  AdminSettlementSummary,
  ClaimResponse,
  PagedResultOfAdminKycResponse,
  PagedResultOfAdminOperatorResponse,
  PagedResultOfPartySummaryResponse,
} from '../../shared/api/api.gen'
import {
  Input,
  Money,
  OpBtn,
  OpEmpty,
  OpHeading,
  OpLoading,
  OpMore,
  OpNote,
  OpPanel,
  OpTable,
  OpTabs,
  QueryView,
  StatusBadge,
  formatDate,
  formatDateTime,
  formatVnd,
  label,
  openFile,
  useGet,
} from '../../shared/ui/console'
import { type AdminBatchPage, vnDate } from './adminPartA'

interface Queue {
  title: string
  href: string
  n: number | undefined
  unit: string
  danger?: boolean
  failed: boolean
}

const TABLES = [
  { key: 'batches', label: 'Lô' },
  { key: 'capital', label: 'Vốn theo ngày' },
  { key: 'orders', label: 'Đơn' },
  { key: 'payouts', label: 'Lệnh chi trả' },
] as const
type TableKey = (typeof TABLES)[number]['key']

const BATCH_CHIPS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'active', label: 'Đang vận hành' },
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'done', label: 'Hoàn thành' },
] as const
type BatchChipKey = (typeof BATCH_CHIPS)[number]['key']

const ACTIVE_STATUSES = new Set(['Funding', 'Sourcing', 'Stocked', 'InProduction', 'Harvesting', 'Selling'])
const PENDING_STATUSES = new Set(['Draft', 'PendingApproval', 'NeedsRevision'])
const DONE_STATUSES = new Set(['AwaitingSettlement', 'Settling', 'Settlement', 'Closed'])

const validRange = (from: string, to: string) => {
  const span = (Date.parse(to) - Date.parse(from)) / 86_400_000
  return !!from && !!to && span >= 0 && span <= 365
}

function pillToneClass(status: string) {
  if (ACTIVE_STATUSES.has(status)) return 'admin-pill admin-pill--ok'
  if (PENDING_STATUSES.has(status) || status === 'Liquidating' || status === 'Rejected') return 'admin-pill admin-pill--warn'
  return 'admin-pill admin-pill--mute'
}

export default function AdminDashboard() {
  const [from, setFrom] = useState(() => vnDate(-29))
  const [to, setTo] = useState(() => vnDate())
  const [batchChip, setBatchChip] = useState<BatchChipKey>('all')
  const valid = validRange(from, to)

  const dash = useGet<AdminDashboardResponse>(valid ? '/api/admin/dashboard' : null, { from, to })
  const batchesQuery = useGet<AdminBatchPage>('/api/admin/batches', { page: 1, pageSize: 12 })
  const parties = useGet<PagedResultOfPartySummaryResponse>('/api/admin/parties', { verificationStatus: 'Pending', pageSize: 1 })
  const farms = useGet<PagedResultOfAdminOperatorResponse>('/api/admin/operators', { status: 'Submitted', pageSize: 1 })
  const kyc = useGet<PagedResultOfAdminKycResponse>('/api/admin/kyc-checks', { pageSize: 1 })
  const tranches = useGet<unknown[]>('/api/admin/tranches')
  const settlements = useGet<AdminSettlementSummary[]>('/api/admin/settlements')
  const claims = useGet<ClaimResponse[]>('/api/admin/claims', { status: 'Escalated' })

  const pendingBatches = dash.data ? dash.data.batchesByStatus.find((s) => s.status === 'PendingApproval')?.count ?? 0 : undefined
  const queues: Queue[] = [
    { title: 'Cảnh báo đã chuyển cấp', href: '/admin/alerts', n: dash.data?.escalatedAlerts, unit: 'cảnh báo', danger: true, failed: dash.isError },
    { title: 'Lô chờ duyệt', href: '/admin/batches?status=PendingApproval', n: pendingBatches, unit: 'lô', failed: dash.isError },
    { title: 'Mốc giải ngân chờ duyệt', href: '/admin/tranches', n: tranches.data?.length, unit: 'mốc', failed: tranches.isError },
    { title: 'Khiếu nại chờ quyết định', href: '/admin/claims', n: claims.data?.length, unit: 'khiếu nại', failed: claims.isError },
    { title: 'Quyết toán chưa xong', href: '/admin/settlements', n: settlements.data?.filter((s) => s.status !== 'PaidOut' && s.status !== 'Closed').length, unit: 'lô', failed: settlements.isError },
    { title: 'Hồ sơ hộ nuôi chờ duyệt', href: '/admin/operators', n: farms.data?.total, unit: 'hồ sơ', failed: farms.isError },
    { title: 'Đối tác chờ xác minh', href: '/admin/parties?verificationStatus=Pending', n: parties.data?.total, unit: 'đối tác', failed: parties.isError },
    { title: 'eKYC không đạt', href: '/admin/users?tab=kyc', n: kyc.data?.total, unit: 'lần kiểm tra', failed: kyc.isError },
  ]
  const activeQueues = queues.filter((q) => (q.n ?? 0) > 0)
  const idleQueues = queues.filter((q) => !q.n)
  const countingQueues = queues.some((q) => q.n === undefined && !q.failed)
  const totalAttention = activeQueues.reduce((sum, q) => sum + (q.n ?? 0), 0)

  const totalBatches = dash.data ? dash.data.batchesByStatus.reduce((n, s) => n + s.count, 0) : null
  const activeBatchCount = dash.data
    ? dash.data.batchesByStatus.filter((s) => ACTIVE_STATUSES.has(s.status)).reduce((n, s) => n + s.count, 0)
    : null

  const filteredBatches = (batchesQuery.data?.items ?? []).filter((item) => {
    const st = item.batch.status
    if (batchChip === 'active') return ACTIVE_STATUSES.has(st)
    if (batchChip === 'pending') return PENDING_STATUSES.has(st)
    if (batchChip === 'done') return DONE_STATUSES.has(st)
    return true
  }).slice(0, 6)

  return (
    <>
      <OpHeading
        title="Tổng quan hệ thống"
        description="Theo dõi lô nuôi, vốn góp, hàng việc và cảnh báo trên toàn nền tảng."
        action={
          <a className="rd-btn rd-btn--primary" href="/admin/batches/new">
            <Plus size={16} aria-hidden="true" /> Tạo lô nuôi mới
          </a>
        }
      />

      <section className="admin-kpis" aria-label="Chỉ số tổng quan">
        <div className="admin-kpi">
          <span className="admin-kpi__label">Lô hiện có</span>
          <span className="admin-kpi__value">{totalBatches ?? '—'}</span>
          <span className="admin-kpi__sub">
            {activeBatchCount !== null ? `${activeBatchCount} lô đang vận hành` : 'Đang tải dữ liệu'}
          </span>
        </div>

        <div className="admin-kpi">
          <span className="admin-kpi__label">Vốn góp đã xác nhận</span>
          <span className="admin-kpi__value">{dash.data ? formatVnd(dash.data.confirmedCapital) : '—'}</span>
          <span className="admin-kpi__sub">
            {dash.data ? `${dash.data.confirmedContributions} khoản góp trong kỳ` : 'Đang tải dữ liệu'}
          </span>
        </div>

        <div className="admin-kpi">
          <span className="admin-kpi__label">Doanh thu đơn hoàn tất</span>
          <span className="admin-kpi__value">{dash.data ? formatVnd(dash.data.completedOrderRevenue) : '—'}</span>
          <span className="admin-kpi__sub">
            {dash.data ? `Đã chi trả ${formatVnd(dash.data.succeededPayoutAmount)}` : 'Đang tải dữ liệu'}
          </span>
        </div>

        <div className={`admin-kpi ${totalAttention > 0 ? 'admin-kpi--alert' : ''}`}>
          <span className="admin-kpi__label">Việc cần xử lý</span>
          <span className="admin-kpi__value">{countingQueues ? '…' : totalAttention}</span>
          <span className="admin-kpi__sub">
            <a className="op-link" href="#hang-viec">Xem danh sách bên dưới</a>
          </span>
        </div>
      </section>

      {valid && dash.data && <DashboardCharts dashboard={dash.data} />}

      <section id="hang-viec" className="admin-split">
        <OpPanel
          title="Lô nuôi gần đây"
          subtitle="Lọc nhanh theo nhóm trạng thái"
          action={<a className="op-link" href="/admin/batches">Xem tất cả lô</a>}
        >
          <div className="admin-chips" role="tablist" aria-label="Lọc lô theo trạng thái">
            {BATCH_CHIPS.map((c) => (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={batchChip === c.key}
                className={`admin-chip ${batchChip === c.key ? 'is-on' : ''}`}
                onClick={() => setBatchChip(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <QueryView query={batchesQuery}>
            {() =>
              filteredBatches.length === 0 ? (
                <OpEmpty title="Không có lô phù hợp bộ lọc" />
              ) : (
                <div className="admin-table-wrap">
                  <div className="admin-batch-row admin-batch-row--head" aria-hidden="true">
                    <span>Mã lô</span>
                    <span>Hộ nuôi</span>
                    <span>Phương thức</span>
                    <span>Quy mô</span>
                    <span>Trạng thái</span>
                  </div>
                  {filteredBatches.map(({ batch, operatorName }) => (
                    <a
                      key={batch.batchCode}
                      href={`/admin/batches/${encodeURIComponent(batch.batchCode)}`}
                      className="admin-batch-row"
                    >
                      <b className="admin-batch-row__num">{batch.batchCode}</b>
                      <span>{operatorName || batch.title}</span>
                      <span>{label('batchMode', batch.batchMode)}</span>
                      <span className="admin-batch-row__num">{batch.plannedQuantity} con</span>
                      <span className={pillToneClass(batch.status)}>{label('batch', batch.status)}</span>
                    </a>
                  ))}
                </div>
              )
            }
          </QueryView>
        </OpPanel>

        <OpPanel
          title="Việc & cảnh báo cần xử lý"
          subtitle="Từ thiết bị, hồ sơ và hàng việc quản trị"
          action={<a className="op-link" href="/admin/alerts">Cảnh báo</a>}
        >
          {countingQueues ? (
            <OpLoading />
          ) : activeQueues.length === 0 && (dash.data?.latestEscalatedAlerts.length ?? 0) === 0 ? (
            <OpEmpty title="Không có việc nào đang chờ" icon={<CheckCircle2 size={28} />} />
          ) : (
            <div className="admin-alert-list">
              {(dash.data?.latestEscalatedAlerts ?? []).slice(0, 3).map((alert) => (
                <a key={alert.id} href="/admin/alerts" className="admin-alert-row">
                  <AlertTriangle size={17} aria-hidden="true" />
                  <span>
                    <b>{alert.message}</b>
                    <small>{alert.batchCode}, {alert.farmName}</small>
                  </span>
                  <time dateTime={alert.raisedAt}>{formatDateTime(alert.raisedAt)}</time>
                </a>
              ))}
              {activeQueues.map((q) => (
                <a key={q.title} href={q.href} className="admin-alert-row">
                  <Clock size={17} aria-hidden="true" />
                  <span>
                    <b>{q.title}</b>
                    <small>{q.n} {q.unit} đang chờ xử lý</small>
                  </span>
                </a>
              ))}
            </div>
          )}

          {idleQueues.length > 0 && (
            <OpMore label="Hàng việc khác">
              <div className="op-inline">
                {idleQueues.map((q) => (
                  <a key={q.title} className="op-link" href={q.href}>
                    {q.title}
                  </a>
                ))}
              </div>
            </OpMore>
          )}
        </OpPanel>
      </section>

      <OpPanel title="Số liệu theo kỳ" subtitle={valid ? `Từ ${formatDate(from)} đến ${formatDate(to)}` : undefined}>
        <OpMore label="Chọn kỳ, xem bảng, tải CSV">
          <div className="op-toolbar">
            <Input type="date" aria-label="Từ ngày" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" aria-label="Đến ngày" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
          {!valid && <OpNote tone="danger">Kỳ báo cáo tối đa 366 ngày, ngày bắt đầu không sau ngày kết thúc.</OpNote>}
          {valid && dash.data && <PeriodTables d={dash.data} from={from} to={to} />}
        </OpMore>
      </OpPanel>
    </>
  )
}

function DashboardCharts({ dashboard }: { dashboard: AdminDashboardResponse }) {
  const capital = dashboard.capitalByDay.filter((day) => day.amount > 0)
  const batches = dashboard.batchesByStatus.filter((batch) => batch.count > 0)
  if (capital.length === 0 && batches.length === 0) return null

  const totalBatchCount = Math.max(1, batches.reduce((sum, item) => sum + item.count, 0))
  const barTone = (index: number) => {
    if (index % 3 === 1) return 'admin-status-bars__item--aqua'
    if (index % 3 === 2) return 'admin-status-bars__item--accent'
    return ''
  }

  return (
    <section className={`admin-split ${capital.length === 0 || batches.length === 0 ? 'admin-split--single' : ''}`}>
      {capital.length > 0 && (
        <OpPanel title="Vốn góp đã xác nhận theo ngày" subtitle="Đơn vị: đồng (VND)">
          <div className="admin-chart" role="img" aria-label="Biểu đồ vốn góp đã xác nhận theo ngày">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={capital} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--line-soft)" />
                <XAxis dataKey="date" tickFormatter={(date) => formatDate(date)} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis
                  tickFormatter={(amount) => new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(amount)}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                />
                <Tooltip
                  labelFormatter={(date) => formatDate(String(date))}
                  formatter={(amount) => [formatVnd(Number(amount)), 'Vốn đã xác nhận']}
                  contentStyle={{
                    borderRadius: 10,
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="amount" name="Vốn đã xác nhận" fill="var(--admin-teal)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </OpPanel>
      )}

      {batches.length > 0 && (
        <OpPanel title="Phân bố lô theo trạng thái" subtitle="Tỷ lệ trên tổng số lô">
          <div className="admin-status-bars" aria-label="Phân bố Lô theo trạng thái">
            {batches.map((batch, idx) => {
              const pct = Math.round((batch.count / totalBatchCount) * 100)
              return (
                <div key={batch.status} className={`admin-status-bars__item ${barTone(idx)}`}>
                  <div className="admin-status-bars__head">
                    <span>{label('batch', batch.status)}</span>
                    <span>{batch.count} ({pct}%)</span>
                  </div>
                  <div className="admin-status-bars__track">
                    <i className="admin-status-bars__fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </OpPanel>
      )}
    </section>
  )
}

function PeriodTables({ d, from, to }: { d: AdminDashboardResponse; from: string; to: string }) {
  const navigate = useNavigate()
  const [table, setTable] = useState<TableKey>('batches')
  return (
    <>
      <div className="op-between">
        <OpTabs items={TABLES} value={table} onChange={setTable} label="Chọn bảng" />
        <OpBtn
          variant="ghost"
          sm
          onClick={() => void openFile(`/api/admin/reports/${table}.csv?from=${from}&to=${to}`, `crabshare-${table}-${from}-${to}.csv`)}
        >
          <Download size={15} aria-hidden="true" /> Tải CSV
        </OpBtn>
      </div>
      {table === 'batches' && (
        <OpTable
          rows={d.batchesByStatus}
          rowKey={(r) => r.status}
          empty="Chưa có Lô nào"
          onRowClick={(r) => navigate(`/admin/batches?status=${encodeURIComponent(r.status)}`)}
          columns={[
            { key: 'status', header: 'Trạng thái hiện tại', cell: (r) => <StatusBadge kind="batch" value={r.status} /> },
            { key: 'count', header: 'Số Lô', num: true, cell: (r) => r.count },
          ]}
        />
      )}
      {table === 'capital' && (
        <OpTable
          rows={d.capitalByDay.filter((day) => day.count > 0)}
          rowKey={(r) => r.date}
          empty="Chưa có khoản góp nào được xác nhận trong kỳ"
          columns={[
            { key: 'date', header: 'Ngày', cell: (r) => formatDate(r.date) },
            { key: 'count', header: 'Khoản góp', num: true, cell: (r) => r.count },
            { key: 'amount', header: 'Số tiền', num: true, cell: (r) => <Money value={r.amount} /> },
          ]}
        />
      )}
      {table === 'orders' && (
        <OpTable
          rows={d.ordersByStatus}
          rowKey={(r) => r.status}
          empty="Chưa có đơn nào đặt trong kỳ"
          columns={[
            { key: 'status', header: 'Trạng thái', cell: (r) => <StatusBadge kind="order" value={r.status} /> },
            { key: 'count', header: 'Số đơn', num: true, cell: (r) => r.count },
          ]}
        />
      )}
      {table === 'payouts' && (
        <OpTable
          rows={d.payoutsByStatus}
          rowKey={(r) => r.status}
          empty="Chưa có lệnh chi trả nào trong kỳ"
          columns={[
            { key: 'status', header: 'Trạng thái', cell: (r) => <StatusBadge kind="instruction" value={r.status} /> },
            { key: 'count', header: 'Số lệnh', num: true, cell: (r) => r.count },
            { key: 'amount', header: 'Số tiền', num: true, cell: (r) => <Money value={r.amount} /> },
          ]}
        />
      )}
    </>
  )
}
