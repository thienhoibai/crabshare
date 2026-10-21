import { useSearchParams } from 'react-router'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime, formatVnd } from '../../shared/lib/format'
import { SettlementFeedbackList } from '../../shared/settlement/SettlementFeedbackList'
import { SettlementStatement } from '../../shared/settlement/SettlementStatement'
import { settlementStatuses, useOperatorSettlements, useSettlement, type SettlementStatus } from '../../shared/settlement/settlementApi'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpHeading, OpNote, OpPanel, type Tone } from './operatorUi'

const tone: Record<SettlementStatus, Tone> = { Draft: 'mute', Proposed: 'info', Disputed: 'warn', Approved: 'gold', PaidOut: 'ok', Closed: 'ok' }

/**
 * Quyết toán phía người nuôi (TH-13/TH-14): xem bảng đã công bố của các lô của hộ nuôi — doanh thu, chi phí khoá, Pool,
 * thù lao của hộ nuôi, từng dòng nhà đầu tư — và góp ý của nhà đầu tư. Người nuôi không sửa được số liệu (TL-14).
 */
export default function OperatorSettlement() {
  const [params, setParams] = useSearchParams()
  const list = useOperatorSettlements()
  const selected = Number(params.get('id')) || list.data?.[0]?.settlementId || null
  const detail = useSettlement(selected)
  const s = detail.data

  return (
    <OperatorLayout activeTab="settlement">
      <OpHeading eyebrow="Quyết toán (TL-12, TL-14)" title="Đối soát doanh thu"
        description="Bảng quyết toán do nền tảng tính từ doanh thu thực thu và chi phí chuẩn đã khoá. Nhà đầu tư có 7 ngày góp ý trước khi chốt và chi trả." />
      {list.isPending && <p className="rd-muted">Đang tải…</p>}
      {list.isError && <OpNote tone="danger">{errorMessage(list.error)}</OpNote>}
      {list.data?.length === 0 && <OpNote>Chưa có lô nào được công bố quyết toán.</OpNote>}
      <div style={{ display: 'grid', gap: 16 }}>
        {list.data && list.data.length > 0 && (
          <OpPanel title="Các lô đã công bố">
            <div className="op-tablewrap">
              <table className="op-table">
                <thead><tr><th>Lô</th><th className="is-num">Revenue Pool</th><th>Trạng thái</th><th>Hạn góp ý</th><th>Góp ý chờ trả lời</th></tr></thead>
                <tbody>{list.data.map(x => (
                  <tr key={x.settlementId} onClick={() => setParams({ id: String(x.settlementId) }, { replace: true })}
                    style={{ cursor: 'pointer', fontWeight: x.settlementId === selected ? 700 : undefined }}>
                    <td>{x.batchCode}<div className="rd-muted" style={{ fontSize: 12 }}>{x.batchTitle}</div></td>
                    <td className="is-num">{formatVnd(x.revenuePool)}</td>
                    <td><OpBadge tone={tone[x.status]}>{settlementStatuses[x.status]}</OpBadge></td>
                    <td>{formatDateTime(x.feedbackDeadline) || '—'}</td>
                    <td>{x.openFeedback}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </OpPanel>
        )}
        {s && (
          <OpPanel title={`Bảng quyết toán ${s.batchCode} · lần tính ${s.revisionNo}`} subtitle={`Thù lao của hộ nuôi: ${formatVnd(s.operatorRemuneration)} · khấu hao trả khi quyết toán: ${formatVnd(s.depreciationAmount)}`}>
            <SettlementStatement s={s} />
          </OpPanel>
        )}
        {s && <OpPanel title="Góp ý của nhà đầu tư"><SettlementFeedbackList s={s} /></OpPanel>}
      </div>
    </OperatorLayout>
  )
}
