/* /admin — Bảng điều khiển của Quản trị. Việc chính: mở đúng hàng việc đang có việc chờ.
   Số việc chờ lấy từ danh sách của từng trang; ba con số của kỳ lấy từ GET /api/admin/dashboard.
   Bảng theo kỳ và báo cáo CSV (GET /api/admin/reports/{capital|batches|orders|payouts}.csv) nằm trong phần gấp lại. */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { CheckCircle2, Download } from 'lucide-react'
import type {
  AdminDashboardResponse, AdminSettlementSummary, ClaimResponse, PagedResultOfAdminKycResponse, PagedResultOfAdminOperatorResponse,
  PagedResultOfPartySummaryResponse,
} from '../../shared/api/api.gen'
import {
  Input, Money, OpBtn, OpEmpty, OpFacts, OpHeading, OpLoading, OpMore, OpNote, OpPanel, OpStat, OpTable, OpTabs, OpTodo, QueryView, StatusBadge,
  formatDate, formatVnd, openFile, useGet,
} from '../../shared/ui/console'
import { vnDate } from './adminPartA'

interface Queue { title: string; href: string; n: number | undefined; unit: string; danger?: boolean; failed: boolean }

const TABLES = [
  { key: 'batches', label: 'Lô' },
  { key: 'capital', label: 'Vốn theo ngày' },
  { key: 'orders', label: 'Đơn' },
  { key: 'payouts', label: 'Lệnh chi trả' },
] as const
type TableKey = (typeof TABLES)[number]['key']

const validRange = (from: string, to: string) => {
  const span = (Date.parse(to) - Date.parse(from)) / 86_400_000
  return !!from && !!to && span >= 0 && span <= 365
}

export default function AdminDashboard() {
  const [from, setFrom] = useState(() => vnDate(-29))
  const [to, setTo] = useState(() => vnDate())
  const valid = validRange(from, to)
  const dash = useGet<AdminDashboardResponse>(valid ? '/api/admin/dashboard' : null, { from, to })

  const parties = useGet<PagedResultOfPartySummaryResponse>('/api/admin/parties', { verificationStatus: 'Pending', pageSize: 1 })
  const farms = useGet<PagedResultOfAdminOperatorResponse>('/api/admin/operators', { status: 'Submitted', pageSize: 1 })
  const kyc = useGet<PagedResultOfAdminKycResponse>('/api/admin/kyc-checks', { pageSize: 1 })
  const tranches = useGet<unknown[]>('/api/admin/tranches')
  const settlements = useGet<AdminSettlementSummary[]>('/api/admin/settlements')
  const claims = useGet<ClaimResponse[]>('/api/admin/claims', { status: 'Escalated' })

  const pendingBatches = dash.data ? dash.data.batchesByStatus.find((s) => s.status === 'PendingApproval')?.count ?? 0 : undefined
  const queues: Queue[] = [
    { title: 'Cảnh báo đã chuyển cấp', href: '/admin/alerts', n: dash.data?.escalatedAlerts, unit: 'cảnh báo', danger: true, failed: dash.isError },
    { title: 'Lô chờ duyệt', href: '/admin/batches?status=PendingApproval', n: pendingBatches, unit: 'Lô', failed: dash.isError },
    { title: 'Mốc giải ngân chờ duyệt', href: '/admin/tranches', n: tranches.data?.length, unit: 'mốc', failed: tranches.isError },
    { title: 'Khiếu nại chờ quyết định', href: '/admin/claims', n: claims.data?.length, unit: 'khiếu nại', failed: claims.isError },
    { title: 'Quyết toán chưa xong', href: '/admin/settlements', n: settlements.data?.filter((s) => s.status !== 'PaidOut' && s.status !== 'Closed').length, unit: 'Lô', failed: settlements.isError },
    { title: 'Hồ sơ hộ nuôi chờ duyệt', href: '/admin/operators', n: farms.data?.total, unit: 'hồ sơ', failed: farms.isError },
    { title: 'Đối tác chờ xác minh', href: '/admin/parties?verificationStatus=Pending', n: parties.data?.total, unit: 'đối tác', failed: parties.isError },
    { title: 'eKYC không đạt', href: '/admin/users?tab=kyc', n: kyc.data?.total, unit: 'lần kiểm tra', failed: kyc.isError },
  ]
  const active = queues.filter((q) => (q.n ?? 0) > 0)
  const idle = queues.filter((q) => !q.n)
  const counting = queues.some((q) => q.n === undefined && !q.failed)

  return (
    <>
      <OpHeading eyebrow="Quản trị nền tảng" title="Bảng điều khiển" />

      <div className="op-grid">
        <OpPanel className="op-span-7" title="Việc đang chờ">
          {active.length > 0
            ? <OpTodo items={active.map((q) => ({ title: q.title, sub: `${q.n} ${q.unit}`, href: q.href, tone: q.danger ? 'danger' as const : 'warn' as const }))} />
            : counting ? <OpLoading /> : <OpEmpty title="Không có việc nào đang chờ" icon={<CheckCircle2 size={30} />} />}
          {idle.length > 0 && (
            <OpMore label="Hàng việc khác">
              <div className="op-inline">{idle.map((q) => <a key={q.title} className="op-link" href={q.href}>{q.title}</a>)}</div>
            </OpMore>
          )}
        </OpPanel>

        <div className="op-span-5 op-stack">
          {valid && (
            <QueryView query={dash}>
              {(d) => (
                <>
                  <OpStat
                    label={`Vốn góp đã xác nhận · ${formatDate(d.from)} – ${formatDate(d.to)}`}
                    value={new Intl.NumberFormat('vi-VN').format(d.confirmedCapital)}
                    unit="đ"
                    sub={`${d.confirmedContributions} khoản góp`}
                  />
                  <OpPanel>
                    <OpFacts items={[
                      { label: 'Lô hiện có', value: d.batchesByStatus.reduce((n, s) => n + s.count, 0) },
                      { label: 'Doanh thu đơn hoàn tất', value: formatVnd(d.completedOrderRevenue), tone: 'ok' },
                      { label: 'Đã chi trả nhà đầu tư', value: formatVnd(d.succeededPayoutAmount), tone: 'info' },
                    ]} />
                  </OpPanel>
                </>
              )}
            </QueryView>
          )}
        </div>
      </div>

      <OpPanel title="Số liệu theo kỳ">
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

function PeriodTables({ d, from, to }: { d: AdminDashboardResponse; from: string; to: string }) {
  const navigate = useNavigate()
  const [table, setTable] = useState<TableKey>('batches')
  return (
    <>
      <div className="op-between">
        <OpTabs items={TABLES} value={table} onChange={setTable} label="Chọn bảng" />
        <OpBtn variant="ghost" sm onClick={() => void openFile(`/api/admin/reports/${table}.csv?from=${from}&to=${to}`, `crabshare-${table}-${from}-${to}.csv`)}>
          <Download size={15} /> Tải CSV
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
