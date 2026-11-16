/* Bảng tính quyết toán theo BR v1.5 cho ba phương thức Lô P, T, A và các dòng nhà đầu tư (chỉ Lô P).
   Mọi số lấy từ SettlementResponse và SettlementBreakdown; trang không tự tính lại.
   Lô P: còn lại = doanh thu − phí nền tảng − chi phí trừ (BR-187, BR-188); thù lao theo bậc tỷ lệ sống (BR-191); lỗ vượt vốn do người nuôi chịu (BR-196).
   Lô T: kết quả thương vụ của nền tảng (BR-200). Lô A: hoa hồng trên hàng đã thu tiền, còn lại trả nhà cung cấp (BR-201). */
import type { ReactNode } from 'react'
import type { SettlementResponse } from '../../../shared/api/api.gen'
import { Money, OpKv, OpMore, OpNote, OpPanel, OpTable, StatusBadge, formatDateTime, formatVnd } from '../../../shared/ui/console'
import { Cell, extraLabel, formatNumber } from '../quality/shared'
import { sum } from './financeModel'

type Row = { kind?: 'head' | 'sub' | 'total'; label: ReactNode; note?: string; amount?: number; minus?: boolean }

function Sheet({ rows }: { rows: Row[] }) {
  return (
    <div className="op-tablewrap">
      <table className="ab-sheet">
        <tbody>
          {rows.map((r, i) => (r.kind === 'head' ? (
            <tr key={i} className="is-head"><th colSpan={2} scope="colgroup">{r.label}</th></tr>
          ) : (
            <tr key={i} className={r.kind ? `is-${r.kind}` : undefined}>
              <th scope="row">{r.label}{r.note && <small>{r.note}</small>}</th>
              <td>{r.minus && r.amount ? `− ${formatVnd(r.amount)}` : formatVnd(r.amount ?? 0)}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  )
}

export function SettlementSheet({ s }: { s: SettlementResponse }) {
  const b = s.breakdown
  const pct = (value: number | null) => (value === null ? undefined : `${formatNumber(value)}%`)
  const revenue: Row[] = [
    { kind: 'head', label: 'Doanh thu' },
    { kind: 'sub', label: 'Đơn đặt trước đã nghiệm thu', amount: b.preOrderRevenue },
    { kind: 'sub', label: 'Đơn có hoá đơn', amount: b.invoicedSaleRevenue },
    { kind: 'sub', label: 'Đơn hàng cuối', amount: b.finalOrderRevenue },
    { kind: 'sub', label: 'Cọc bị mất', amount: b.forfeitedDeposits },
    { kind: 'total', label: 'Doanh thu thực thu', amount: s.actualRevenue },
  ]
  const rows: Row[] = b.mode === 'P' ? [
    ...revenue,
    { kind: 'head', label: 'Trừ' },
    { label: 'Phí nền tảng', note: pct(b.platformFeeRatePct), amount: b.platformFee, minus: true },
    { label: 'Chi phí trừ', note: b.isLiquidation ? 'Thanh lý sớm' : extraLabel('basis', b.basis), amount: s.lockedStandardCost, minus: true },
    { kind: 'total', label: 'Còn lại sau phí và chi phí', amount: s.revenuePool },
    { kind: 'head', label: 'Chia' },
    { label: 'Thù lao người nuôi', note: s.revenuePool > 0 ? `${formatNumber(s.operatorSharePct)}% · tỷ lệ sống ${pct(b.survivalRatePct) ?? 'chưa có'}` : undefined, amount: s.operatorRemuneration, minus: true },
    { kind: 'total', label: 'Phần chia cho nhà đầu tư', amount: s.distributable },
  ] : b.mode === 'T' ? [
    ...revenue,
    { kind: 'head', label: 'Trừ' },
    { label: 'Giá vốn mua cua và chi phí trực tiếp', amount: s.lockedStandardCost, minus: true },
    { kind: 'total', label: 'Kết quả thương vụ', amount: s.revenuePool },
  ] : [
    ...revenue,
    { kind: 'head', label: 'Chia' },
    { label: 'Hoa hồng của nền tảng', note: pct(b.commissionPct ?? 0), amount: b.commissionAmount, minus: true },
    { kind: 'total', label: 'Trả nhà cung cấp', amount: b.supplierPayout },
  ]

  return (
    <OpPanel>
      {b.mode === 'P' && s.revenuePool < 0 && (
        <OpNote tone="danger">
          Lô không đủ bù chi phí: nhà đầu tư chịu phần thiếu theo tỷ lệ vốn, tối đa bằng vốn đã góp.
          {s.uncoveredLoss > 0 && ` Người nuôi chịu ${formatVnd(s.uncoveredLoss)} vượt tổng vốn.`}
        </OpNote>
      )}
      <Sheet rows={rows} />
      <OpMore label="Số liệu đối chiếu">
        <OpKv items={b.mode === 'P' ? [
          { label: 'Chi phí chuẩn của Lô', value: formatVnd(b.standardCostDeductible) },
          { label: 'Chi phí thực tế có chứng từ', value: formatVnd(b.actualCostTotal) },
          { label: 'Đã giải ngân theo mốc', value: formatVnd(b.disbursedTotal) },
          { label: 'Chi phí chuẩn chưa giải ngân', value: formatVnd(b.undisbursedCost) },
          { label: 'Chi phí loại do lỗi người nuôi', value: formatVnd(b.excludedFaultCost) },
          { label: 'Đã hoàn cho khách', value: formatVnd(b.customerRefunds) },
          { label: 'Cua nhận đạt kiểm đầu vào', value: `${b.receivedCount} con` },
          { label: 'Cua chết', value: `${b.deadCount} con` },
        ] : [
          { label: 'Chi phí thực tế có chứng từ', value: formatVnd(b.actualCostTotal) },
          { label: 'Đã hoàn cho khách', value: formatVnd(b.customerRefunds) },
          { label: 'Cua nhận đạt kiểm đầu vào', value: `${b.receivedCount} con` },
          { label: 'Cua chết', value: `${b.deadCount} con` },
        ]} />
      </OpMore>
      {s.auditAnchors.length > 0 && (
        <OpMore label="Mã neo nhật ký kiểm toán" count={s.auditAnchors.length}>
          <OpTable
            rows={s.auditAnchors}
            rowKey={(a) => a.auditId}
            columns={[
              { key: 'milestone', header: 'Mốc', cell: (a) => <Cell main={a.milestone} sub={`${formatDateTime(a.occurredAt)} · dòng ${a.auditId}`} /> },
              { key: 'hash', header: 'Mã băm', cell: (a) => <span className="op-mono ab-wrap">{a.rowHash}</span> },
            ]}
          />
        </OpMore>
      )}
    </OpPanel>
  )
}

export function InvestorLines({ s }: { s: SettlementResponse }) {
  const paying = s.lines.some((l) => l.payoutStatus)
  return (
    <OpPanel title={`${s.investorCount} nhà đầu tư`} subtitle={s.taxNotice}>
      {s.reconciliationDifference !== 0 && (
        <OpNote tone="danger">Tổng các dòng lệch {formatVnd(Math.abs(s.reconciliationDifference))} so với phần chia. Hãy tính lại bảng.</OpNote>
      )}
      <OpTable
        rows={s.lines}
        rowKey={(l) => l.settlementLineId}
        empty="Bảng này chưa có dòng nhà đầu tư nào"
        columns={[
          { key: 'name', header: 'Nhà đầu tư', cell: (l) => l.investorName },
          { key: 'capital', header: 'Vốn đã chốt', num: true, cell: (l) => <Money value={l.capitalReturn} /> },
          { key: 'share', header: 'Phần chia', num: true, cell: (l) => <span className={l.profitShare < 0 ? 'op-danger' : undefined}><Money value={l.profitShare} /></span> },
          { key: 'net', header: 'Thực nhận', num: true, cell: (l) => <b><Money value={l.netPayout} /></b> },
          ...(paying ? [{ key: 'pay', header: 'Chi trả', cell: (l: SettlementResponse['lines'][number]) => (l.payoutStatus ? <StatusBadge kind="instruction" value={l.payoutStatus} /> : '—') }] : []),
        ]}
        foot={s.lines.length > 1 ? (
          <tr>
            <th scope="row">Tổng</th>
            <td className="is-num"><Money value={s.totalCapital} /></td>
            <td className="is-num"><Money value={sum(s.lines.map((l) => l.profitShare))} /></td>
            <td className="is-num"><b><Money value={s.totalNetPayout} /></b></td>
            {paying && <td />}
          </tr>
        ) : undefined}
      />
    </OpPanel>
  )
}
