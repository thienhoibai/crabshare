/* /nha-dau-tu/quyet-toan — Bảng quyết toán đã công bố của các Lô tôi góp vốn (GET /api/me/settlements). Bấm một dòng để mở bảng. */
import { useNavigate } from 'react-router'
import type { SettlementSummary } from '../../shared/api/api.gen'
import { Money, OpBadge, OpEmpty, OpHeading, OpPanel, OpTable, QueryView, StatusBadge, formatDateTime, useGet } from '../../shared/ui/console'

const amountLabel = (status: string) => status === 'PaidOut' ? 'Tôi thực nhận'
  : status === 'Approved' || status === 'Closed' ? 'Số được nhận đã duyệt' : 'Phần của tôi theo bảng'

export default function SettlementsPage() {
  const navigate = useNavigate()
  const list = useGet<SettlementSummary[]>('/api/me/settlements')

  return (
    <>
      <OpHeading title="Quyết toán" description="Xem phần của bạn, hạn góp ý và trạng thái chi trả." />

      <QueryView query={list}>
        {(rows) => rows.length === 0 ? (
          <OpEmpty title="Chưa có bảng quyết toán nào được công bố" />
        ) : (
          <>
            <OpPanel className="inv-settlement-table">
              <OpTable
                rows={rows}
                rowKey={(r) => r.settlementId}
                onRowClick={(r) => navigate(`/nha-dau-tu/quyet-toan/${r.settlementId}`)}
                columns={[
                  { key: 'batch', header: 'Lô', cell: (r) => <a className="op-link" href={`/nha-dau-tu/quyet-toan/${r.settlementId}`} onClick={(event) => event.stopPropagation()}><b>{r.batchTitle}</b><br /><small className="rd-muted">{r.batchCode}</small></a> },
                  { key: 'status', header: 'Trạng thái', cell: (r) => <StatusBadge kind="settlement" value={r.status} /> },
                  { key: 'mine', header: 'Phần của tôi', num: true, cell: (r) => <><b><Money value={r.myNetPayout} /></b><br /><small className="rd-muted">{amountLabel(r.status)}</small></> },
                  {
                    key: 'window', header: 'Góp ý', cell: (r) => (r.feedbackOpen
                      ? <OpBadge tone="gold">Tới {formatDateTime(r.feedbackDeadline)}</OpBadge>
                      : r.openFeedback > 0 ? <OpBadge tone="warn">{r.openFeedback} chờ trả lời</OpBadge> : '—'),
                  },
                ]}
              />
            </OpPanel>
            <ul className="inv-settlement-list" aria-label="Bảng quyết toán của tôi">
              {rows.map((r) => (
                <li key={r.settlementId} className="inv-settlement-card">
                  <header>
                    <div><h2 className="rd-h3">{r.batchTitle}</h2><p className="rd-muted">{r.batchCode}</p></div>
                    <StatusBadge kind="settlement" value={r.status} />
                  </header>
                  <dl className="inv-settlement-card__amount">
                    <div><dt>{amountLabel(r.status)}</dt><dd><Money value={r.myNetPayout} /></dd></div>
                  </dl>
                  {r.feedbackOpen ? <p>Góp ý tới {formatDateTime(r.feedbackDeadline)}</p>
                    : r.openFeedback > 0 && <p>{r.openFeedback} góp ý chờ trả lời</p>}
                  <a className="op-link" href={`/nha-dau-tu/quyet-toan/${r.settlementId}`}>Xem quyết toán</a>
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryView>
    </>
  )
}
