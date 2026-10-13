import { type FormEvent, useState } from 'react'
import { useParams } from 'react-router'
import { ArrowLeft, RefreshCw, ScanLine } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime, formatVnd } from '../../shared/lib/format'
import OperatorLayout from './OperatorLayout'
import { OpBack, OpBadge, OpBtn, OpFacts, OpHeading, OpNote, OpPanel, OpRow } from './operatorUi'
import {
  useOperatorOrder,
  useOperatorOrders,
  usePackOrder,
  type OperatorOrderDetail,
  type OperatorOrderStatus,
  type OperatorOrderSummary,
} from './operatorOrdersApi'

const kg = (n: number) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(n)} kg`

function statusTone(status: string): 'ok' | 'warn' | 'mute' {
  if (status === 'Packed') return 'ok'
  if (status === 'Paid') return 'warn'
  return 'mute'
}

function statusLabel(status: string) {
  if (status === 'Packed') return 'Đã đóng gói'
  if (status === 'Paid') return 'Chờ đóng gói'
  return status
}

function OrderList({ status, onStatus }: { status: OperatorOrderStatus; onStatus: (s: OperatorOrderStatus) => void }) {
  const query = useOperatorOrders(status)
  const list = query.data ?? []
  return (
    <>
      <OpHeading
        eyebrow="Đơn hàng"
        title="Đóng gói đơn bằng quét tem"
        description="Chọn đơn đã thanh toán, nhập hoặc dán mã tem từng con, đủ kg thì đơn chuyển sang Packed."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 font-bold">
          Trạng thái
          <select aria-label="Trạng thái đơn" className="rd-input" value={status} onChange={(e) => onStatus(e.target.value as OperatorOrderStatus)}>
            <option value="Paid">Chờ đóng gói</option>
            <option value="Packed">Đã đóng gói</option>
          </select>
        </label>
        <OpBtn variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw size={16} /> Làm mới
        </OpBtn>
      </div>
      {query.isPending ? (
        <p role="status" className="op-panel p-6">Đang tải đơn hàng…</p>
      ) : query.isError ? (
        <div role="alert" className="op-panel p-6">
          <p>{errorMessage(query.error)}</p>
          <OpBtn className="mt-3" onClick={() => void query.refetch()}>Thử lại</OpBtn>
        </div>
      ) : (
        <div className="op-panel op-list">
          {list.map((o) => <OrderRow key={o.orderNo} order={o} />)}
          {!list.length && (
            <div className="op-empty">
              <b>Không có đơn {statusLabel(status).toLowerCase()}</b>
              <span>Đơn Paid mới xuất hiện khi khách đã chuyển khoản thành công.</span>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function OrderRow({ order }: { order: OperatorOrderSummary }) {
  return (
    <OpRow
      href={`/operator/orders/${order.orderNo}`}
      media={<ScanLine size={22} />}
      title={<span className="op-mono">{order.orderNo}</span>}
      sub={`${order.customerName} · ${order.batchCode}`}
      mid={<span>{kg(order.totalKg)} · {order.lineCount} dòng · {order.paidAt ? formatDateTime(order.paidAt) : formatDateTime(order.placedAt)}</span>}
      end={<><OpBadge tone={statusTone(order.status)}>{statusLabel(order.status)}</OpBadge><b>{formatVnd(order.totalAmount)}</b></>}
    />
  )
}

function PackForm({ order }: { order: OperatorOrderDetail }) {
  const pack = usePackOrder(order.orderNo)
  const [raw, setRaw] = useState('')
  const codes = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
  if (order.status !== 'Paid') {
    return <OpNote tone="ok">Đơn đã {statusLabel(order.status).toLowerCase()}. Không cần quét thêm tem.</OpNote>
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (codes.length) pack.mutate(codes)
  }
  return (
    <form className="op-form" onSubmit={submit}>
      <div className="op-field">
        <label htmlFor="pack-tags">Mã tem (mỗi dòng một mã, 12 ký tự)</label>
        <textarea
          id="pack-tags"
          className="rd-input"
          rows={5}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="CSAB23CD45EF"
          disabled={pack.isPending}
        />
      </div>
      {pack.isError && <p role="alert" className="text-red-700">{errorMessage(pack.error)}</p>}
      {pack.isSuccess && <p role="status" className="text-green-700">Đã đóng gói {pack.data.lines.reduce((n, l) => n + l.assignedCount, 0)} con. Đơn chuyển sang Packed.</p>}
      <OpBtn type="submit" variant="ink" disabled={!codes.length || pack.isPending}>
        <ScanLine size={16} /> {pack.isPending ? 'Đang đóng gói…' : `Đóng gói ${codes.length || ''} tem`}
      </OpBtn>
    </form>
  )
}

function OrderDetail({ orderNo }: { orderNo: string }) {
  const query = useOperatorOrder(orderNo)
  const order = query.data
  return (
    <>
      <OpHeading
        crumb={<OpBack href="/operator/orders"><ArrowLeft size={16} /> Quay lại danh sách đơn</OpBack>}
        eyebrow="Đóng gói"
        title={order ? `Đơn ${order.orderNo}` : 'Chi tiết đơn'}
        description={order ? `${order.customerName} · lô ${order.batchCode}` : 'Đang tải…'}
      />
      {query.isPending ? (
        <p role="status" className="op-panel p-6">Đang tải đơn…</p>
      ) : query.isError ? (
        <div role="alert" className="op-panel p-6">
          <p>{errorMessage(query.error)}</p>
          <OpBtn className="mt-3" onClick={() => void query.refetch()}>Thử lại</OpBtn>
        </div>
      ) : order ? (
        <>
          <OpFacts items={[
            { label: 'Trạng thái', value: statusLabel(order.status), tone: order.status === 'Packed' ? 'ok' : 'warn' },
            { label: 'Khối lượng', value: kg(order.totalKg) },
            { label: 'Giá trị', value: formatVnd(order.totalAmount) },
            { label: 'Người nhận', value: order.recipientName },
          ]} />
          <div className="op-grid">
            <OpPanel className="op-span-6" title="Dòng hàng" subtitle={order.shippingAddress}>
              {order.lines.map((line) => (
                <div key={line.orderLineId} className="mb-4">
                  <b>{line.title}</b>
                  <p className="op-muted text-sm">{line.gradeName} · cần {kg(line.quantityKg)} · đã gán {kg(line.assignedKg)} ({line.assignedCount} con)</p>
                  {line.tags.length > 0 && (
                    <ul className="mt-2 grid gap-1 text-sm">
                      {line.tags.map((t) => (
                        <li key={t.tagCode} className="op-mono">{t.tagCode} · {t.weightG} g · {t.gradeCode}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </OpPanel>
            <OpPanel accent className="op-span-6" title="Quét tem" subtitle="Dán đủ cua đúng lô và đúng hạng, tổng kg không được thiếu.">
              <PackForm order={order} />
            </OpPanel>
          </div>
        </>
      ) : null}
    </>
  )
}

export default function OperatorOrders() {
  const { orderNo } = useParams()
  const [status, setStatus] = useState<OperatorOrderStatus>('Paid')
  return (
    <OperatorLayout activeTab="orders">
      {orderNo ? <OrderDetail orderNo={orderNo} /> : <OrderList status={status} onStatus={setStatus} />}
    </OperatorLayout>
  )
}
