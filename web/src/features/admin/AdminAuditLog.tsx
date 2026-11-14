/* /admin/audit-log — Nhật ký kiểm toán (UC43): lọc theo loại đối tượng và khoảng ngày, phân trang, xuất CSV.
   GET /api/admin/audit-log (EntityType, From, To, ThroughAuditId, Page, PageSize) trả kèm kết quả kiểm tra chuỗi băm.
   GET /api/admin/audit-log/export xuất CSV cùng bộ lọc (tối đa 5.000 dòng mỗi lần). */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, RefreshCw } from 'lucide-react'
import type { AuditLogPage, AuditLogRow } from '../../shared/api/api.gen'
import {
  Input, OpBadge, OpBtn, OpHeading, OpKv, OpModal, OpNote, OpPanel, OpTable, QueryView, Select, formatDateTime, openFile, useGet,
} from '../../shared/ui/console'
import { Pager, useUrlFilters } from './adminPartA'

/** Tên dễ đọc của các loại đối tượng hay gặp; loại khác hiện nguyên mã. */
const ENTITY: Record<string, string> = {
  batch: 'Lô', sales_order: 'Đơn hàng', settlement: 'Quyết toán', settlement_feedback: 'Góp ý quyết toán', contribution: 'Khoản góp vốn',
  payment_request: 'Yêu cầu chuyển khoản', payment_instruction: 'Lệnh chi', provider_transaction: 'Giao dịch tiền vào', investment_contract: 'Hợp đồng góp vốn',
  disbursement_tranche: 'Mốc giải ngân', grade_decision: 'Quyết định phân hạng', grade_rule_set: 'Bộ quy tắc phân hạng', measurement_session: 'Lượt đo',
  claim: 'Khiếu nại', shipment: 'Chuyến giao', delivery_tranche: 'Đợt giao', delivery_acceptance: 'Nghiệm thu', invoice: 'Hoá đơn',
  party: 'Đối tác', partner_role: 'Vai trò đối tác', related_party: 'Bên liên quan', operator: 'Hộ nuôi', AppUser: 'Tài khoản', app_user_role: 'Vai trò tài khoản',
  KycCheck: 'Kiểm tra danh tính', qc_assignment: 'Phân công kiểm phẩm', site_visit_report: 'Biên bản thăm trại', device: 'Thiết bị',
  device_calibration: 'Hiệu chuẩn thiết bị', Evidence: 'Bằng chứng', CaptureRequest: 'Yêu cầu chụp', Alert: 'Cảnh báo', collective_decision: 'Biểu quyết',
  platform_parameter: 'Tham số nền tảng', batch_account: 'Tài khoản của Lô', cost_actual: 'Chi phí thực tế', goods_receipt: 'Phiếu nhận hàng',
  procurement_order: 'Đơn mua nguồn', crab_unit: 'Con cua', box_assignment: 'Xếp hộp', inventory_allocation: 'Phân bổ hàng', production_log: 'Nhật ký chăm sóc',
  production_threshold: 'Ngưỡng chăm sóc', risk_acknowledgement: 'Xác nhận rủi ro', revenue_line: 'Dòng doanh thu',
}
const entityName = (type: string) => ENTITY[type] ?? type

const pretty = (json: string | null) => {
  if (!json) return '—'
  try { return JSON.stringify(JSON.parse(json), null, 2) } catch { return json }
}

export default function AdminAuditLog() {
  const filters = useUrlFilters()
  const queryClient = useQueryClient()
  const entityType = filters.get('entityType')
  const from = filters.get('from')
  const to = filters.get('to')
  const through = filters.get('through')
  const [row, setRow] = useState<AuditLogRow | null>(null)
  const rangeOk = !from || !to || from <= to
  const log = useGet<AuditLogPage>(rangeOk ? '/api/admin/audit-log' : null, { entityType, from, to, throughAuditId: through, page: filters.page, pageSize: 50 })

  const exportCsv = () => {
    const query = new URLSearchParams()
    if (entityType) query.set('entityType', entityType)
    if (from) query.set('from', from)
    if (to) query.set('to', to)
    if (log.data) query.set('throughAuditId', String(log.data.throughAuditId))
    void openFile(`/api/admin/audit-log/export?${query.toString()}`, `crabshare-nhat-ky-kiem-toan${log.data ? `-den-${log.data.throughAuditId}` : ''}.csv`)
  }

  return (
    <>
      <OpHeading
        eyebrow="Hệ thống"
        title="Nhật ký kiểm toán"
        description="Chỉ thêm, không sửa, không xoá."
        action={
          <>
            <OpBtn variant="ghost" onClick={() => { filters.set({ through: null }); void queryClient.invalidateQueries({ queryKey: ['/api/admin/audit-log'] }) }}><RefreshCw size={16} /> Làm mới</OpBtn>
            <OpBtn onClick={exportCsv} disabled={!rangeOk}><Download size={17} /> Xuất CSV</OpBtn>
          </>
        }
      />

      <div className="op-toolbar">
        <Select aria-label="Loại đối tượng" value={entityType} onChange={(e) => filters.set({ entityType: e.target.value, through: null })}>
          <option value="">Mọi loại đối tượng</option>
          {Object.entries(ENTITY).sort((a, b) => a[1].localeCompare(b[1], 'vi')).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          {entityType && !ENTITY[entityType] && <option value={entityType}>{entityType}</option>}
        </Select>
        <Input type="date" aria-label="Từ ngày" value={from} max={to || undefined} onChange={(e) => filters.set({ from: e.target.value, through: null })} />
        <Input type="date" aria-label="Đến ngày" value={to} min={from || undefined} onChange={(e) => filters.set({ to: e.target.value, through: null })} />
        {(entityType || from || to) && <OpBtn variant="ghost" sm onClick={() => filters.set({ entityType: null, from: null, to: null, through: null })}>Bỏ lọc</OpBtn>}
      </div>
      {!rangeOk && <OpNote tone="danger">Ngày bắt đầu không được sau ngày kết thúc.</OpNote>}

      {rangeOk && (
        <QueryView query={log}>
          {(page) => (
            <>
              {!page.chain.isValid && (
                <OpNote tone="danger">Chuỗi băm gãy ở dòng số {page.chain.brokenAuditId ?? '?'}: {page.chain.problem ?? 'không rõ lý do'}. Hãy xuất CSV và báo người phụ trách.</OpNote>
              )}
              <OpPanel action={page.chain.isValid ? <OpBadge tone="ok">Chuỗi băm còn nguyên · {page.chain.checkedRows} dòng</OpBadge> : undefined}>
                <OpTable
                  rows={page.items}
                  rowKey={(r) => r.auditId}
                  empty="Không có dòng nhật ký nào khớp"
                  onRowClick={setRow}
                  columns={[
                    { key: 'id', header: 'Số', num: true, width: 70, cell: (r) => r.auditId },
                    { key: 'at', header: 'Thời điểm', cell: (r) => formatDateTime(r.occurredAt) },
                    { key: 'entity', header: 'Đối tượng', cell: (r) => <><b>{entityName(r.entityType)}</b> <span className="op-mono rd-muted">#{r.entityId}</span></> },
                    { key: 'action', header: 'Hành động', cell: (r) => <span className="op-mono">{r.actionType}</span> },
                    { key: 'actor', header: 'Người thực hiện', cell: (r) => (r.actorUserId !== null ? `Tài khoản #${r.actorUserId}` : 'Hệ thống') },
                  ]}
                />
                <Pager page={page.page} pageSize={page.pageSize} total={page.total} onPage={(n) => filters.set({ page: n, through: page.throughAuditId })} />
              </OpPanel>
            </>
          )}
        </QueryView>
      )}

      {row && (
        <OpModal wide title={`Dòng nhật ký số ${row.auditId}`} sub={`${entityName(row.entityType)} #${row.entityId} · ${row.actionType}`} onClose={() => setRow(null)}>
          <div className="op-form">
            <OpKv items={[
              { label: 'Thời điểm', value: formatDateTime(row.occurredAt) },
              { label: 'Loại đối tượng', value: <span className="op-mono">{row.entityType}</span> },
              { label: 'Người thực hiện', value: row.actorUserId !== null ? <a className="op-link" href={`/admin/users/${row.actorUserId}`}>Tài khoản #{row.actorUserId}</a> : 'Hệ thống (job nền hoặc thiết bị)' },
            ]} />
            <AuditValue title="Giá trị trước" json={row.oldValue} />
            <AuditValue title="Giá trị sau" json={row.newValue} />
            <OpKv items={[
              { label: 'Mã băm dòng trước', value: <span className="op-mono" style={{ wordBreak: 'break-all' }}>{row.prevHash ?? 'Dòng đầu chuỗi'}</span> },
              { label: 'Mã băm của dòng', value: <span className="op-mono" style={{ wordBreak: 'break-all' }}>{row.rowHash}</span> },
            ]} />
          </div>
        </OpModal>
      )}
    </>
  )
}

function AuditValue({ title, json }: { title: string; json: string | null }) {
  return (
    <div className="op-field">
      <span className="op-label">{title}</span>
      <pre className="op-mono" style={{ margin: 0, padding: 14, borderRadius: 16, background: 'var(--input)', border: '1px solid var(--line)', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 260, overflow: 'auto' }}>
        {pretty(json)}
      </pre>
    </div>
  )
}
