/* Bảng đơn đặt trước mà người nuôi thấy: quy cách, giá trị ước tính, cọc, đợt giao. Mã đơn dẫn tới mục giao hàng của Lô. */
import type { PreorderResponse } from '../../../shared/api/api.gen'
import { Money, OpTable, StatusBadge, formatDate } from '../../../shared/ui/console'
import { batchHref } from './common'
import './sales.css'

export function PreorderTable({ rows, showBatch = false, empty = 'Chưa có đơn đặt trước nào' }: { rows: PreorderResponse[]; showBatch?: boolean; empty?: string }) {
  return (
    <OpTable
      rows={rows}
      rowKey={(o) => o.orderNo}
      empty={empty}
      columns={[
        {
          key: 'no', header: 'Đơn', cell: (o) => (
            <>
              <a className="op-link op-mono" href={batchHref(o.batchCode, 'giao-hang')}>{o.orderNo}</a>
              <span className="os-sub">{formatDate(o.placedAt)}{showBatch ? ` · Lô ${o.batchCode}` : ''}</span>
            </>
          ),
        },
        {
          key: 'lines', header: 'Quy cách', cell: (o) => (
            <div className="os-lines">
              {o.lines.map((l) => <span key={l.lineId}>{l.specName}: <b>{l.convertedCrabs} con</b></span>)}
            </div>
          ),
        },
        { key: 'value', header: 'Giá trị ước tính', num: true, cell: (o) => <Money value={o.estimatedValue} /> },
        { key: 'deposit', header: 'Đặt cọc', num: true, cell: (o) => <><Money value={o.depositAmount} /><span className="os-sub">{o.depositedAt ? 'Đã cọc' : 'Chưa cọc'}</span></> },
        {
          key: 'tranches', header: 'Đợt giao', cell: (o) => o.tranches.length === 0 ? '—' : (
            <div className="os-lines">
              {o.tranches.map((t) => <span key={t.trancheId}>Đợt {t.seq} · {formatDate(t.dueDate)}</span>)}
            </div>
          ),
        },
        { key: 'status', header: 'Trạng thái', cell: (o) => <><StatusBadge kind="order" value={o.status} />{o.cancelReason && <span className="os-sub">{o.cancelReason}</span>}</> },
      ]}
    />
  )
}
