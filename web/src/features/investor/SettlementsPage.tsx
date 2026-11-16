/* /nha-dau-tu/quyet-toan — Bảng quyết toán đã công bố của các Lô tôi góp vốn (GET /api/me/settlements). Bấm một dòng để mở bảng. */
import { useNavigate } from 'react-router'
import type { SettlementSummary } from '../../shared/api/api.gen'
import { Money, OpBadge, OpEmpty, OpHeading, OpPanel, OpTable, QueryView, StatusBadge, formatDateTime, useGet } from '../../shared/ui/console'

export default function SettlementsPage() {
  const navigate = useNavigate()
  const list = useGet<SettlementSummary[]>('/api/me/settlements')

  return (
    <>
      <OpHeading eyebrow="Giấy tờ và tiền" title="Quyết toán" />

      <QueryView query={list}>
        {(rows) => rows.length === 0 ? (
          <OpEmpty title="Chưa có bảng quyết toán nào được công bố" />
        ) : (
          <OpPanel>
            <OpTable
              rows={rows}
              rowKey={(r) => r.settlementId}
              onRowClick={(r) => navigate(`/nha-dau-tu/quyet-toan/${r.settlementId}`)}
              columns={[
                { key: 'batch', header: 'Lô', cell: (r) => <><b>{r.batchCode}</b><br /><small className="rd-muted">{r.batchTitle}</small></> },
                { key: 'status', header: 'Trạng thái', cell: (r) => <StatusBadge kind="settlement" value={r.status} /> },
                { key: 'mine', header: 'Tôi thực nhận', num: true, cell: (r) => <b><Money value={r.myNetPayout} /></b> },
                {
                  key: 'window', header: 'Góp ý', cell: (r) => (r.feedbackOpen
                    ? <OpBadge tone="gold">Tới {formatDateTime(r.feedbackDeadline)}</OpBadge>
                    : r.openFeedback > 0 ? <OpBadge tone="warn">{r.openFeedback} chờ trả lời</OpBadge> : '—'),
                },
              ]}
            />
          </OpPanel>
        )}
      </QueryView>
    </>
  )
}
