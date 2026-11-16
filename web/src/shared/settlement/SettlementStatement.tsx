import type { SettlementLineResponse, SettlementResponse } from '../api/api.gen'
import { formatDateTime, formatVnd } from '../lib/format'
import { Money, OpBadge, OpDl, OpFacts, OpMore, OpNote, OpTable, StatusBadge, type Column, type Fact, type KvItem } from '../ui/console'

type Row = KvItem & { total?: boolean }

const BASIS: Record<string, string> = { StandardCost: 'Chi phí chuẩn', ActualCost: 'Chi phí thực tế có chứng từ' }

/** Số trừ; tránh hiện "-0 đ". */
const minus = (n: number) => formatVnd(n === 0 ? 0 : -n)

/**
 * Bảng quyết toán của một Lô theo BR v1.5: bốn nguồn doanh thu (BR-185), phí nền tảng (BR-188), chi phí được trừ (BR-187, BR-189),
 * thù lao người nuôi theo tỷ lệ sống (BR-191), rồi từng dòng nhà đầu tư. Lô T hiện kết quả thương vụ (BR-200), Lô A hiện hoa hồng (BR-201).
 * Nhà đầu tư chỉ nhận được dòng của chính mình từ API nên bảng tự hiện đúng phần được xem. Không có khung bao: đặt trong OpPanel.
 * Số phụ (chi tiết chi phí, mã neo kiểm toán) gấp lại, bấm mới hiện.
 */
export function SettlementStatement({ s }: { s: SettlementResponse }) {
  const b = s.breakdown
  const revenue: Row[] = [
    { label: 'Đơn đặt trước đã nghiệm thu', value: formatVnd(b.preOrderRevenue) },
    { label: 'Đơn có hoá đơn', value: formatVnd(b.invoicedSaleRevenue) },
    { label: 'Đơn hàng cuối', value: formatVnd(b.finalOrderRevenue) },
    { label: 'Cọc khách bị mất', value: formatVnd(b.forfeitedDeposits) },
    { label: 'Doanh thu thực thu', value: formatVnd(s.actualRevenue), total: true },
  ]

  const result: Row[] = b.mode === 'P'
    ? [
        { label: `Phí nền tảng (${b.platformFeeRatePct}%)`, value: minus(b.platformFee) },
        { label: 'Chi phí được trừ', value: minus(s.lockedStandardCost) },
        { label: 'Còn lại sau phí và chi phí', value: formatVnd(s.revenuePool), total: true },
        { label: `Thù lao người nuôi (${s.operatorSharePct}%)`, value: minus(s.operatorRemuneration) },
        { label: 'Chia cho nhà đầu tư', value: formatVnd(s.distributable), total: true },
      ]
    : b.mode === 'T'
      ? [
          { label: 'Giá vốn và chi phí trực tiếp', value: minus(s.lockedStandardCost) },
          { label: 'Kết quả thương vụ', value: formatVnd(s.revenuePool), total: true },
        ]
      : [
          { label: `Hoa hồng nền tảng (${b.commissionPct ?? 0}%)`, value: minus(b.commissionAmount) },
          { label: 'Chi cho nhà cung cấp', value: formatVnd(b.supplierPayout), total: true },
        ]

  const facts: Fact[] = [
    b.mode === 'P' ? { label: 'Đã giải ngân theo mốc', value: formatVnd(b.disbursedTotal) } : { label: 'Đã hoàn cho khách', value: formatVnd(b.customerRefunds) },
    { label: 'Cua đã nhận', value: `${b.receivedCount} con` },
    { label: 'Cua chết', value: `${b.deadCount} con`, tone: b.deadCount > 0 ? 'danger' : undefined },
    ...(b.survivalRatePct !== null ? [{ label: 'Tỷ lệ sống', value: `${b.survivalRatePct}%`, tone: 'ok' as const }] : []),
  ]

  const showPayout = s.lines.some((l) => l.payoutStatus)
  const showTax = s.taxTotal > 0
  const columns: Column<SettlementLineResponse>[] = [
    { key: 'name', header: 'Nhà đầu tư', cell: (l) => <b>{l.investorName}{l.isMine ? ' (bạn)' : ''}</b> },
    { key: 'capital', header: 'Vốn hoàn', num: true, cell: (l) => <Money value={l.capitalReturn} /> },
    { key: 'share', header: 'Phần chia', num: true, cell: (l) => <span className={l.profitShare < 0 ? 'op-danger' : ''}><Money value={l.profitShare} /></span> },
    ...(showTax ? [{ key: 'tax', header: 'Khấu trừ thuế', num: true, cell: (l: SettlementLineResponse) => <Money value={l.taxWithheld} /> }] : []),
    { key: 'net', header: 'Thực nhận', num: true, cell: (l) => <b><Money value={l.netPayout} /></b> },
    ...(showPayout ? [{ key: 'payout', header: 'Chi trả', cell: (l: SettlementLineResponse) => (l.payoutStatus ? <StatusBadge kind="instruction" value={l.payoutStatus} /> : '—') }] : []),
  ]

  return (
    <div className="op-stack">
      {b.isLiquidation && <div><OpBadge tone="danger">Lô thanh lý sớm</OpBadge></div>}

      <div className="op-grid">
        <div className="op-span-6"><OpDl items={revenue} /></div>
        <div className="op-span-6"><OpDl items={result} /></div>
      </div>

      {b.mode === 'P' && s.revenuePool < 0 && (
        <OpNote tone="danger">
          Phần còn lại âm: không có thù lao người nuôi, khoản thiếu chia theo vốn góp.
          {s.uncoveredLoss > 0 && ` ${formatVnd(s.uncoveredLoss)} vượt tổng vốn không chia cho nhà đầu tư.`}
        </OpNote>
      )}

      <OpFacts items={facts} />

      {b.mode === 'P' && (
        <OpTable
          columns={columns}
          rows={s.lines}
          rowKey={(l) => l.settlementLineId}
          empty="Bảng chưa có dòng chia nào"
          foot={s.lines.length > 1 ? (
            <tr>
              <td><b>Tổng {s.investorCount} nhà đầu tư</b></td>
              <td className="is-num"><Money value={s.totalCapital} /></td>
              <td className="is-num"><Money value={s.lines.reduce((sum, l) => sum + l.profitShare, 0)} /></td>
              {showTax && <td className="is-num"><Money value={s.taxTotal} /></td>}
              <td className="is-num"><b><Money value={s.totalNetPayout} /></b></td>
              {showPayout && <td />}
            </tr>
          ) : undefined}
        />
      )}

      {b.mode === 'P' && (
        <OpMore label="Chi tiết chi phí">
          <OpDl items={[
            { label: 'Cách trừ chi phí', value: BASIS[b.basis] ?? b.basis },
            { label: 'Chi phí chuẩn được trừ', value: formatVnd(b.standardCostDeductible) },
            { label: 'Chi phí thực tế có chứng từ', value: formatVnd(b.actualCostTotal) },
            { label: 'Chi phí được trừ chưa giải ngân', value: formatVnd(b.undisbursedCost) },
            { label: 'Đã hoàn cho khách', value: formatVnd(b.customerRefunds) },
          ]} />
        </OpMore>
      )}

      {s.auditAnchors.length > 0 && (
        <OpMore label="Mã neo nhật ký kiểm toán" count={s.auditAnchors.length}>
          <ul className="op-feed">
            {s.auditAnchors.map((a) => (
              <li key={a.auditId}>
                <b>{a.milestone} · {formatDateTime(a.occurredAt)}</b>
                <small className="op-mono" style={{ overflowWrap: 'anywhere' }}>{a.rowHash}</small>
              </li>
            ))}
          </ul>
        </OpMore>
      )}

      <p className="rd-muted" style={{ fontSize: 13 }}>{s.taxNotice}</p>
    </div>
  )
}
