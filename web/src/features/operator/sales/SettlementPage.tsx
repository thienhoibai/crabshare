/* /operator/settlement — Bảng quyết toán đã công bố của các Lô của hộ nuôi tôi. Đầu trang là bốn con số chính, rồi doanh thu, các khoản trừ
   và thù lao theo tỷ lệ sống (Business Rule v1.5); từng dòng nhà đầu tư, góp ý đã trả lời và mã neo kiểm toán gấp lại.
   GET /api/operator/settlements, GET /api/settlements/{id}. Chỉ nhà đầu tư gửi được góp ý (POST /feedback) nên người nuôi chỉ đọc. */
import { useSearchParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import type { SettlementFeedbackResponse, SettlementResponse, SettlementSummary } from '../../../shared/api/api.gen'
import {
  Money, OpBack, OpBadge, OpDl, OpEmpty, OpFacts, OpHeading, OpMore, OpNote, OpPanel, OpTable, QueryView, StatusBadge, formatDateTime, formatVnd,
  label, useGet,
} from '../../../shared/ui/console'
import { dueText, fmtNum } from './common'
import './sales.css'

export default function SettlementPage() {
  const [params, setParams] = useSearchParams()
  const list = useGet<SettlementSummary[]>('/api/operator/settlements')
  const byBatch = params.get('lo') ? list.data?.find((s) => s.batchCode === params.get('lo'))?.settlementId : undefined
  const id = Number(params.get('bang')) || byBatch || 0

  if (id > 0) return <SettlementDetail id={id} />
  return (
    <>
      <OpHeading eyebrow="Tiền" title="Quyết toán" />
      <QueryView query={list}>
        {(rows) => rows.length === 0
          ? <OpEmpty title="Chưa có bảng quyết toán nào được công bố" />
          : (
            <OpPanel>
              <OpTable
                rows={rows}
                rowKey={(s) => s.settlementId}
                onRowClick={(s) => setParams({ bang: String(s.settlementId) })}
                columns={[
                  { key: 'batch', header: 'Lô', cell: (s) => <><b>{s.batchTitle}</b><span className="os-sub">{s.batchCode}</span></> },
                  { key: 'pool', header: 'Còn lại sau chi phí', num: true, cell: (s) => <Money value={s.revenuePool} /> },
                  {
                    key: 'feedback', header: 'Góp ý', cell: (s) => {
                      const due = s.feedbackOpen ? dueText(s.feedbackDeadline) : null
                      return <>{s.openFeedback > 0 ? <b className="op-warn">{s.openFeedback} chờ trả lời</b> : 'Không có'}{due && <span className="os-sub">Hạn góp ý {due.text}</span>}</>
                    },
                  },
                  { key: 'status', header: 'Trạng thái', cell: (s) => <StatusBadge kind="settlement" value={s.status} /> },
                ]}
              />
            </OpPanel>
          )}
      </QueryView>
    </>
  )
}

function SettlementDetail({ id }: { id: number }) {
  const settlement = useGet<SettlementResponse>(`/api/settlements/${id}`)
  return <QueryView query={settlement}>{(s) => <Statement s={s} />}</QueryView>
}

const neg = (amount: number) => (amount === 0 ? formatVnd(0) : `− ${formatVnd(amount)}`)

function Feedback({ f }: { f: SettlementFeedbackResponse }) {
  return (
    <div className="os-item">
      <div className="op-between"><b>{f.authorName}</b><StatusBadge kind="feedback" value={f.status} /></div>
      <p>{f.content}</p>
      {f.response && <p className="rd-muted">Admin: {f.response}</p>}
    </div>
  )
}

function Statement({ s }: { s: SettlementResponse }) {
  const b = s.breakdown
  const due = s.feedbackDeadline && (s.status === 'Proposed' || s.status === 'Disputed') ? dueText(s.feedbackDeadline) : null
  const showPayout = s.lines.some((l) => l.payoutStatus)
  const result = b.mode === 'T' ? 'Kết quả thương vụ' : 'Còn lại sau phí và chi phí'
  const openFeedback = s.feedback.filter((f) => f.status === 'Open')
  const closedFeedback = s.feedback.filter((f) => f.status !== 'Open')

  return (
    <>
      <OpHeading
        crumb={<OpBack href="/operator/settlement"><ArrowLeft size={16} /> Quyết toán</OpBack>}
        eyebrow={`${s.batchCode} · ${label('batchMode', b.mode)} · lần tính ${s.revisionNo}`}
        title={s.batchTitle}
        action={
          <>
            {b.isLiquidation && <OpBadge tone="danger">Thanh lý sớm</OpBadge>}
            {due && <OpBadge tone="warn">Góp ý {due.text}</OpBadge>}
            <StatusBadge kind="settlement" value={s.status} />
          </>
        }
      />

      <OpFacts items={[
        { label: 'Doanh thu thực thu', value: formatVnd(s.actualRevenue) },
        { label: result, value: formatVnd(s.revenuePool), tone: s.revenuePool < 0 ? 'danger' : 'ok' },
        ...(b.mode === 'P' ? [
          { label: `Thù lao người nuôi (${fmtNum(s.operatorSharePct)}%)`, value: formatVnd(s.operatorRemuneration), tone: 'info' as const },
          { label: 'Chia cho nhà đầu tư', value: formatVnd(s.distributable) },
        ] : []),
        ...(b.mode === 'A' ? [
          { label: `Hoa hồng (${fmtNum(b.commissionPct)}%)`, value: formatVnd(b.commissionAmount), tone: 'info' as const },
          { label: 'Chi cho nhà cung cấp', value: formatVnd(b.supplierPayout) },
        ] : []),
      ]} />

      {s.revenuePool < 0 && (
        <OpNote tone="danger">
          Lô lỗ, không có thù lao. Nhà đầu tư chịu tối đa bằng vốn đã góp.
          {s.uncoveredLoss > 0 ? ` Phần ${formatVnd(s.uncoveredLoss)} vượt tổng vốn không chia cho nhà đầu tư.` : ''}
        </OpNote>
      )}

      {openFeedback.length > 0 && (
        <OpPanel title="Góp ý chờ Admin trả lời">
          {openFeedback.map((f) => <Feedback key={f.feedbackId} f={f} />)}
        </OpPanel>
      )}

      <div className="op-grid">
        <OpPanel className="op-span-6" title="Doanh thu">
          <OpDl items={[
            { label: 'Đơn đặt trước', value: formatVnd(b.preOrderRevenue) },
            { label: 'Đơn có hoá đơn', value: formatVnd(b.invoicedSaleRevenue) },
            { label: 'Đơn hàng cuối', value: formatVnd(b.finalOrderRevenue) },
            { label: 'Cọc khách bị mất', value: formatVnd(b.forfeitedDeposits) },
            { label: 'Hoàn tiền khiếu nại', value: neg(b.customerRefunds) },
            { label: 'Doanh thu thực thu', value: formatVnd(s.actualRevenue), total: true },
          ]} />
        </OpPanel>

        <OpPanel className="op-span-6" title="Các khoản trừ">
          <OpDl items={[
            ...(b.mode === 'P' ? [
              { label: `Phí nền tảng (${fmtNum(b.platformFeeRatePct)}%)`, value: neg(b.platformFee) },
              { label: 'Chi phí chuẩn được trừ', value: neg(s.lockedStandardCost) },
              { label: 'Đã giải ngân theo mốc', value: formatVnd(b.disbursedTotal) },
              { label: 'Chưa giải ngân', value: formatVnd(b.undisbursedCost) },
            ] : []),
            ...(b.mode === 'T' ? [{ label: 'Giá vốn và chi phí trực tiếp', value: neg(s.lockedStandardCost) }] : []),
            ...(b.mode === 'A' ? [
              { label: 'Hoa hồng', value: neg(b.commissionAmount) },
              { label: 'Chi cho nhà cung cấp', value: neg(b.supplierPayout) },
            ] : []),
            { label: 'Chi phí thực tế đã ghi', value: formatVnd(b.actualCostTotal) },
            ...(b.excludedFaultCost > 0 ? [{ label: 'Chi phí do lỗi, không được trừ', value: formatVnd(b.excludedFaultCost) }] : []),
            { label: result, value: formatVnd(s.revenuePool), total: true },
          ]} />
        </OpPanel>
      </div>

      {b.mode === 'P' && (
        <OpPanel title="Thù lao theo tỷ lệ sống" subtitle="Tỷ lệ thù lao lấy theo bậc tỷ lệ sống đã công bố khi mở Lô.">
          <OpDl items={[
            { label: `Tỷ lệ sống (${b.receivedCount - b.deadCount} / ${b.receivedCount} con)`, value: b.survivalRatePct === null ? '—' : `${fmtNum(b.survivalRatePct)}%` },
            { label: 'Tỷ lệ thù lao áp dụng', value: `${fmtNum(s.operatorSharePct)}%` },
            ...(s.depreciationAmount > 0 ? [{ label: 'Khấu hao trả cho người nuôi', value: formatVnd(s.depreciationAmount) }] : []),
            { label: 'Thù lao người nuôi', value: formatVnd(s.operatorRemuneration), total: true },
          ]} />
        </OpPanel>
      )}

      {s.lines.length > 0 && (
        <OpMore label="Từng nhà đầu tư" count={s.investorCount}>
          <OpTable
            rows={s.lines}
            rowKey={(l) => l.settlementLineId}
            columns={[
              { key: 'name', header: 'Nhà đầu tư', cell: (l) => l.investorName },
              { key: 'capital', header: 'Vốn hoàn', num: true, cell: (l) => <Money value={l.capitalReturn} /> },
              { key: 'share', header: 'Phần chia', num: true, cell: (l) => <span className={l.profitShare < 0 ? 'op-danger' : ''}><Money value={l.profitShare} /></span> },
              { key: 'net', header: 'Thực nhận', num: true, cell: (l) => <b><Money value={l.netPayout} /></b> },
              ...(showPayout ? [{ key: 'pay', header: 'Lệnh chi', cell: (l: SettlementResponse['lines'][number]) => <StatusBadge kind="instruction" value={l.payoutStatus} /> }] : []),
            ]}
            foot={
              <tr>
                <td><b>Tổng</b></td>
                <td className="is-num"><Money value={s.totalCapital} /></td>
                <td className="is-num"><Money value={s.lines.reduce((n, l) => n + l.profitShare, 0)} /></td>
                <td className="is-num"><b><Money value={s.totalNetPayout} /></b></td>
                {showPayout && <td />}
              </tr>
            }
          />
          <small className="rd-muted">{s.taxNotice}</small>
        </OpMore>
      )}

      {closedFeedback.length > 0 && (
        <OpMore label="Góp ý đã trả lời" count={closedFeedback.length}>
          <div className="op-stack">{closedFeedback.map((f) => <Feedback key={f.feedbackId} f={f} />)}</div>
        </OpMore>
      )}

      {s.auditAnchors.length > 0 && (
        <OpMore label="Mã neo nhật ký kiểm toán" count={s.auditAnchors.length}>
          <div className="op-stack">
            {s.auditAnchors.map((a) => (
              <div key={a.auditId}>
                <div className="op-between"><OpBadge tone="info">{a.milestone}</OpBadge><small className="rd-muted">{formatDateTime(a.occurredAt)}</small></div>
                <code className="os-hash">{a.rowHash}</code>
              </div>
            ))}
          </div>
        </OpMore>
      )}
    </>
  )
}
