import { formatVnd } from '../lib/format'
import type { Settlement } from './settlementApi'
import './settlement.css'

/**
 * Bảng quyết toán của một lô: từ doanh thu tới phần chia, rồi từng dòng nhà đầu tư (trước thuế, khấu trừ, sau thuế — TL-07 §6.1).
 * Nhà đầu tư chỉ nhận được dòng của chính mình từ API nên bảng tự hiện đúng phần được xem.
 */
export function SettlementStatement({ s }: { s: Settlement }) {
  const minus = (n: number) => (n === 0 ? 0 : -n) // tránh hiện "-0 đ"
  const rows: [string, number, string?][] = [
    ['Tiền bán cua từ đơn đã hoàn tất', s.orderRevenue],
    ['Cọc đặt trước bị mất (cộng vào doanh thu)', s.forfeitedDeposits],
    ['Tiền hoàn cho khiếu nại đã giải quyết (trừ)', minus(s.complaintRefunds)],
    ['Doanh thu thực thu', s.actualRevenue, 'is-sub'],
    ['Chi phí chuẩn đã khoá khi mở gọi vốn', minus(s.lockedStandardCost)],
    ['Revenue Pool', s.revenuePool, 'is-total'],
    [`Thù lao người nuôi (${s.operatorSharePct}% trên Pool dương)`, minus(s.operatorRemuneration)],
    ['Phần chia cho nhà đầu tư', s.distributable, 'is-total'],
  ]
  return (
    <div className="st">
      <table className="st-sum">
        <tbody>{rows.map(([label, amount, cls]) => (
          <tr key={label} className={cls}><th scope="row">{label}</th><td>{formatVnd(amount)}</td></tr>
        ))}</tbody>
      </table>
      <p className="st-note">Doanh thu bán cua chỉ tính đơn đã hoàn tất. Chi phí chuẩn là con số đã khoá và công bố trước khi góp vốn (TL-12). Trong đó khấu hao {formatVnd(s.depreciationAmount)} trả cho người nuôi khi quyết toán.</p>
      {s.revenuePool < 0 && <p className="st-warn">Lô lỗ: không có thù lao; khoản lỗ chia theo tỷ lệ vốn, mỗi người lỗ tối đa bằng vốn đã góp (TL-13).{s.uncoveredLoss > 0 && ` Phần lỗ ${formatVnd(s.uncoveredLoss)} vượt tổng vốn không chia cho nhà đầu tư.`}</p>}

      <div className="st-tablewrap">
        <table className="st-lines">
          <thead><tr><th>Nhà đầu tư</th><th>Vốn hoàn</th><th>Phần chia</th><th>Số trước thuế</th><th>Khấu trừ thuế</th><th>Số thực nhận</th>{s.status !== 'Draft' && s.lines.some(l => l.payoutStatus) && <th>Chi trả</th>}</tr></thead>
          <tbody>{s.lines.map(l => (
            <tr key={l.settlementLineId} className={l.isMine ? 'is-mine' : ''}>
              <td>{l.investorName}{l.isMine && ' (bạn)'}</td>
              <td>{formatVnd(l.capitalReturn)}</td>
              <td className={l.profitShare < 0 ? 'is-neg' : ''}>{formatVnd(l.profitShare)}</td>
              <td>{formatVnd(l.capitalReturn + l.profitShare)}</td>
              <td>{l.taxWithheld > 0 ? formatVnd(l.taxWithheld) : s.taxTotal === 0 ? 'Chưa khai' : formatVnd(0)}</td>
              <td><b>{formatVnd(l.netPayout)}</b></td>
              {s.status !== 'Draft' && s.lines.some(x => x.payoutStatus) && <td>{l.payoutStatus ?? '—'}</td>}
            </tr>
          ))}</tbody>
          {s.lines.length > 1 && <tfoot><tr><th>Tổng {s.investorCount} nhà đầu tư</th><td>{formatVnd(s.totalCapital)}</td><td>{formatVnd(s.lines.reduce((a, l) => a + l.profitShare, 0))}</td><td /><td>{formatVnd(s.taxTotal)}</td><td><b>{formatVnd(s.totalNetPayout)}</b></td></tr></tfoot>}
        </table>
      </div>
      <p className="st-note">Phần chia tính theo số vốn đã chốt, làm tròn tới đồng bằng phương pháp largest-remainder: tổng các dòng khớp đúng phần chia. {s.taxNotice}</p>
    </div>
  )
}
