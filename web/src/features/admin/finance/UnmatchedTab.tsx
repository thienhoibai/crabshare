/* Tab "Tiền vào chưa khớp" của /admin/finance: giao dịch tiền vào không khớp khoản thu nào hoặc về sau khi khoản thu hết hạn
   (GET /api/admin/payments/unmatched, tối đa 200 dòng). Chỉ để đối soát; hệ thống chưa có thao tác khớp tay.
   Lô còn giao dịch chưa khớp thì chưa đủ điều kiện chờ quyết toán (BR-183). */
import type { UseQueryResult } from '@tanstack/react-query'
import type { UnmatchedTransactionResponse } from '../../../shared/api/api.gen'
import { Money, OpBadge, OpPanel, OpTable, QueryView, StatusBadge, formatDateTime, formatVnd, label } from '../../../shared/ui/console'
import { Cell } from '../quality/shared'

export default function UnmatchedTab({ query }: { query: UseQueryResult<UnmatchedTransactionResponse[]> }) {
  return (
    <QueryView query={query}>
      {(list) => (
        <OpPanel
          title="Giao dịch chờ đối soát"
          subtitle="Chưa khớp: sai mã, sai tài khoản hoặc sai số tiền. Trả trễ: tiền về sau hạn, đã có sẵn lệnh hoàn."
          action={list.some((t) => t.matchStatus === 'LatePayment') ? <a className="op-link" href="/admin/finance?type=Refund">Xem lệnh hoàn tiền</a> : undefined}
        >
          <OpTable
            rows={list}
            rowKey={(t) => t.transactionId}
            empty="Mọi giao dịch tiền vào đều đã khớp"
            columns={[
              { key: 'txn', header: 'Giao dịch', cell: (t) => <Cell main={<span className="ab-wrap">{t.content ?? 'Không có nội dung'}</span>} sub={<span className="op-mono ab-wrap">{t.providerTxnId}</span>} /> },
              { key: 'batch', header: 'Lô', cell: (t) => t.batchCode },
              { key: 'amount', header: 'Số tiền vào', num: true, cell: (t) => <Money value={t.amount} /> },
              { key: 'status', header: 'Phân loại', cell: (t) => <StatusBadge kind="match" value={t.matchStatus} /> },
              { key: 'time', header: 'Thời điểm', cell: (t) => formatDateTime(t.occurredAt) },
              {
                key: 'request', header: 'Khoản thu gần khớp',
                cell: (t) => {
                  if (!t.paymentRequestReference) return <span className="op-muted">Không có mã</span>
                  const diff = t.paymentRequestAmount === null ? 0 : t.amount - t.paymentRequestAmount
                  return (
                    <Cell
                      main={
                        <span className="op-inline">
                          <span className="op-mono">{t.paymentRequestReference}</span>
                          {diff !== 0 && <OpBadge tone="danger">{diff > 0 ? 'Thừa' : 'Thiếu'} {formatVnd(Math.abs(diff))}</OpBadge>}
                        </span>
                      }
                      sub={[
                        t.paymentRequestAmount !== null ? `Cần thu ${formatVnd(t.paymentRequestAmount)}` : null,
                        t.paymentRequestStatus ? label('payment', t.paymentRequestStatus) : null,
                      ].filter(Boolean).join(' · ')}
                    />
                  )
                },
              },
            ]}
          />
        </OpPanel>
      )}
    </QueryView>
  )
}
