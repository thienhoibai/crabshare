/* /khach/don/:orderNo — Chi tiết một đơn đặt trước. Đầu trang là việc khách cần làm ngay (chuyển cọc, xác nhận nghiệm thu,
   trả phần còn lại) và bốn con số chính; phần còn lại nằm trong các tab: quy cách và đợt giao, chuyến giao, hoá đơn,
   khiếu nại và đánh giá. Cột phải: tiến trình, địa chỉ giao, QR truy xuất, huỷ đơn.
   GET /api/preorders/{orderNo}, GET /api/preorders/{orderNo}/deliveries, PUT …/tranches, POST …/cancel (BR-096, BR-097, BR-234).
   Thẻ chuyến giao và bảng hoá đơn ở OrderShipments.tsx; khiếu nại và đánh giá ở OrderClaims.tsx. */
import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeft } from 'lucide-react'
import type { CancelPreorderRequest, ExploreBatchResponse, PreorderResponse, SplitTranchesRequest } from '../../shared/api/api.gen'
import {
  Field, Money, OpAside, OpBack, OpBtn, OpConfirm, OpError, OpFacts, OpFlow, OpHeading, OpKv, OpLoading, OpNote, OpPanel, OpTable, OpTabs, StatusBadge, TextArea,
  formatDate, formatDateTime, formatVnd, useGet, useSend, type Fact, type FlowStep, type TabItem,
} from '../../shared/ui/console'
import { CANCELLABLE, fmtKg, fmtKm, lineQty, shipmentStage, useOrderDeliveries } from './customerData'
import { OrderClaims } from './OrderClaims'
import { InvoiceTable, ShipmentCard } from './OrderShipments'
import { PayBox } from './PayBox'
import { TrancheEditor, splitProblem, toTrancheRequests, type SplitLine, type TrancheDraft } from './TrancheEditor'

type Tab = 'order' | 'ship' | 'invoice' | 'after'

/** Hậu quả của việc huỷ đơn theo trạng thái, hiện trong hộp xác nhận. */
function cancelConsequence(o: PreorderResponse): { text: string; tone: 'info' | 'danger'; confirm: string } {
  if (o.status === 'PendingDeposit') return { tone: 'info', confirm: 'Huỷ đơn', text: 'Đơn chưa cọc nên huỷ không mất gì.' }
  if (o.status === 'Deposited') {
    return { tone: 'danger', confirm: 'Xin huỷ đơn', text: `Tiền cọc ${formatVnd(o.depositAmount)} được giữ tới khi Lô đóng gọi vốn: Lô mở thì mất cọc, Lô không mở thì được hoàn.` }
  }
  return { tone: 'danger', confirm: 'Huỷ đơn và chịu mất cọc', text: `Lô đã mở. Huỷ đơn là mất toàn bộ tiền cọc ${formatVnd(o.depositAmount)}.` }
}

/** Tiến trình của đơn. */
function progress(o: PreorderResponse): FlowStep[] {
  const stopped = ['Cancelled', 'Forfeited', 'Refunded', 'CancelRequested'].includes(o.status)
  const delivered = o.status === 'Delivered' || o.status === 'Completed'
  return [
    { title: 'Đặt trước', state: 'done' },
    { title: 'Đặt cọc', state: o.depositedAt ? 'done' : o.status === 'PendingDeposit' ? 'now' : stopped ? 'bad' : 'todo' },
    { title: 'Lô mở, xác nhận đơn', state: o.confirmedAt ? 'done' : o.status === 'Deposited' ? 'now' : 'todo' },
    { title: 'Giao và nghiệm thu', state: delivered ? 'done' : o.status === 'Confirmed' || o.status === 'Delivering' ? 'now' : 'todo' },
    { title: 'Hoàn tất', state: o.status === 'Completed' ? 'done' : o.status === 'Delivered' ? 'now' : 'todo' },
  ]
}

const HASH_TAB: Record<string, Tab> = { '#dot-giao': 'order', '#hoa-don': 'invoice', '#khieu-nai': 'after', '#danh-gia': 'after' }

export default function OrderDetailPage() {
  const { orderNo = '' } = useParams()
  const { hash } = useLocation()
  const path = `/api/preorders/${encodeURIComponent(orderNo)}`
  const order = useGet<PreorderResponse>(path)
  const deliveries = useOrderDeliveries(orderNo)
  const batch = useGet<ExploreBatchResponse>(order.data ? `/api/batches/${encodeURIComponent(order.data.batchCode)}` : null, undefined, { retry: false })

  const [picked, setPicked] = useState<Tab | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [split, setSplit] = useState<TrancheDraft[] | null>(null)

  const cancel = useSend<PreorderResponse, CancelPreorderRequest>('post', `${path}/cancel`, {
    success: 'Đã ghi nhận huỷ đơn.', quietError: true, onSuccess: () => setCancelling(false),
  })
  const saveSplit = useSend<PreorderResponse, SplitTranchesRequest>('put', `${path}/tranches`, {
    success: 'Đã lưu các đợt giao.', quietError: true, onSuccess: () => setSplit(null),
  })

  // Trang được mở kèm neo (#coc, #chuyen-…): cuộn tới mục đó sau khi dữ liệu đã hiện.
  const ready = order.isSuccess && !deliveries.isPending
  useEffect(() => {
    if (ready && hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' })
  }, [ready, hash])

  if (order.isPending) return <OpLoading />
  if (order.isError) return <OpError error={order.error} onRetry={() => void order.refetch()} />

  const o = order.data
  const d = deliveries.data
  const shipments = d?.shipments ?? []
  const todo = shipments.filter((s) => ['accept', 'pay'].includes(shipmentStage(s)))
  const others = shipments.filter((s) => !todo.includes(s))
  const credit = d ? Math.max(0, d.depositAmount - d.depositApplied) : 0
  const specName = (code: string) => o.lines.find((l) => l.specCode === code)?.specName ?? code
  const minDate = batch.data?.expectedReceiptDate ?? null
  const splitLines: SplitLine[] = o.lines.map((l) => ({ specCode: l.specCode, specName: l.specName, mode: l.mode, qty: (l.mode === 'ByKg' ? l.qtyKg : l.qtyCrabs) ?? 0 }))
  const canSplit = CANCELLABLE.includes(o.status) && o.tranches.every((t) => t.status === 'Planned')
  const consequence = cancelConsequence(o)
  const splitError = split ? splitProblem(splitLines, split, minDate) : null
  const traceUrl = d?.traceCode ? `${window.location.origin}/truy-xuat/${encodeURIComponent(d.traceCode)}` : null

  const tabs: TabItem<Tab>[] = [
    { key: 'order', label: 'Quy cách và đợt giao' },
    ...(others.length > 0 ? [{ key: 'ship' as const, label: 'Chuyến giao', count: others.length }] : []),
    ...(d && d.invoices.length > 0 ? [{ key: 'invoice' as const, label: 'Hoá đơn', count: d.invoices.length }] : []),
    ...(shipments.some((s) => s.status === 'Accepted') ? [{ key: 'after' as const, label: 'Khiếu nại, đánh giá' }] : []),
  ]
  const wanted = picked ?? HASH_TAB[hash] ?? (others.length > 0 ? 'ship' : 'order')
  const tab = tabs.some((t) => t.key === wanted) ? wanted : 'order'

  const facts: Fact[] = [
    { label: 'Số lượng', value: `${o.convertedCrabs} con` },
    { label: 'Giá trị ước tính', value: formatVnd(o.estimatedValue) },
    { label: `Tiền cọc ${o.depositRatePct}%`, value: formatVnd(o.depositAmount) },
    ...(o.status === 'PendingDeposit' ? [{ label: 'Giữ đơn tới', value: formatDateTime(o.holdExpiresAt), tone: 'warn' as const }]
      : d && ['Deposited', 'Confirmed', 'Delivering', 'Delivered', 'Completed'].includes(o.status) ? [{ label: 'Cọc chưa dùng', value: formatVnd(credit) }] : []),
  ]

  const openSplit = () => {
    saveSplit.reset()
    setSplit(o.tranches.map((t) => ({ dueDate: t.dueDate, qty: Object.fromEntries(t.lines.map((l) => [l.specCode, l.qtyKg ?? l.qtyCrabs])) })))
  }

  return (
    <>
      <OpHeading
        crumb={<OpBack href="/khach"><ArrowLeft size={16} /> Đơn của tôi</OpBack>}
        eyebrow={`Lô ${o.batchCode}${batch.data?.title ? ` · ${batch.data.title}` : ''}`}
        title={`Đơn ${o.orderNo}`}
        action={<StatusBadge kind="order" value={o.status} />}
      />

      {o.status === 'Forfeited' ? <OpNote tone="danger">Đơn đã mất cọc.{o.cancelReason ? ` ${o.cancelReason}` : ''}</OpNote>
        : o.status === 'CancelRequested' ? <OpNote tone="info">Đã xin huỷ. Tiền cọc được giữ tới khi Lô đóng gọi vốn.</OpNote>
          : o.cancelReason ? <OpNote>Lý do đóng đơn: {o.cancelReason}</OpNote> : null}

      <div className="op-split">
        <div>
          {o.status === 'PendingDeposit' && o.deposit && (
            <div id="coc" style={{ scrollMarginTop: 90 }}>
              <OpPanel accent title="Chuyển cọc để giữ đơn">
                <PayBox start={{ ...o.deposit, accountNo: o.deposit.batchAccountNo, batchCode: o.batchCode }} />
              </OpPanel>
            </div>
          )}
          {deliveries.isPending ? <OpLoading label="Đang tải chuyến giao…" />
            : deliveries.isError ? <OpError error={deliveries.error} onRetry={() => void deliveries.refetch()} />
              : todo.map((s) => <ShipmentCard key={s.shipmentNo} s={s} credit={credit} batchCode={o.batchCode} specName={specName} />)}

          <OpFacts items={facts} />

          {tabs.length > 1 && <OpTabs<Tab> items={tabs} value={tab} onChange={setPicked} label="Các mục của đơn" />}

          {tab === 'order' && (
            <>
              <OpPanel title="Quy cách đã đặt" subtitle="Giá trị là ước tính. Tiền hàng thật tính theo kg nghiệm thu của từng đợt.">
                <OpTable
                  rows={o.lines}
                  rowKey={(l) => l.lineId}
                  columns={[
                    { key: 'spec', header: 'Quy cách', cell: (l) => <><b>{l.specName}</b><br /><small className="rd-muted">{formatVnd(l.pricePerKg)} / kg</small></> },
                    { key: 'qty', header: 'Đã đặt', num: true, cell: (l) => <><b>{lineQty(l)}</b>{l.mode === 'ByKg' && <><br /><small className="rd-muted">khoảng {l.convertedCrabs} con</small></>}</> },
                    { key: 'value', header: 'Ước tính', num: true, cell: (l) => <><Money value={l.estimatedValue} /><br /><small className="rd-muted">{fmtKg(l.estimatedKg)}</small></> },
                  ]}
                />
              </OpPanel>
              <div id="dot-giao" style={{ scrollMarginTop: 90 }}>
                <OpPanel title="Đợt giao" action={canSplit ? <OpBtn variant="ghost" sm onClick={openSplit}>Chia lại</OpBtn> : undefined}>
                  <OpTable
                    rows={o.tranches}
                    rowKey={(t) => t.trancheId}
                    empty="Đơn chưa có đợt giao"
                    columns={[
                      { key: 'seq', header: 'Đợt', cell: (t) => <><b>Đợt {t.seq}</b><br /><small className="rd-muted">{formatDate(t.dueDate)}</small></> },
                      {
                        key: 'lines', header: 'Số lượng',
                        cell: (t) => t.lines.map((l) => <div key={l.specCode}>{specName(l.specCode)}: <b>{l.qtyKg !== null ? fmtKg(l.qtyKg) : `${l.qtyCrabs ?? 0} con`}</b></div>),
                      },
                      { key: 'status', header: 'Trạng thái', cell: (t) => <StatusBadge kind="deliveryTranche" value={t.status} /> },
                    ]}
                  />
                </OpPanel>
              </div>
            </>
          )}

          {tab === 'ship' && others.map((s) => <ShipmentCard key={s.shipmentNo} s={s} credit={credit} batchCode={o.batchCode} specName={specName} />)}

          {tab === 'invoice' && d && (
            <div id="hoa-don" style={{ scrollMarginTop: 90 }}>
              <OpPanel title="Hoá đơn"><InvoiceTable invoices={d.invoices} /></OpPanel>
            </div>
          )}

          {tab === 'after' && d && <OrderClaims order={o} deliveries={d} />}
        </div>

        <OpAside>
          <OpFlow steps={progress(o)} />
          <OpKv items={[
            { label: 'Giao tới', value: o.deliveryAddress },
            { label: 'Khoảng cách', value: o.deliveryDistanceKm !== null ? fmtKm(o.deliveryDistanceKm) : null },
            { label: 'Đặt lúc', value: formatDateTime(o.placedAt) },
          ]} />
          {traceUrl && (
            <a className="op-tile" href={`/truy-xuat/${encodeURIComponent(d?.traceCode ?? '')}`}>
              <QRCodeSVG value={traceUrl} size={72} level="M" marginSize={1} title={`Mã QR truy xuất của đơn ${o.orderNo}`} />
              <span><b>QR truy xuất của đơn</b><small>Mở trang truy xuất</small></span>
            </a>
          )}
          <a className="op-link" href={`/khach/lo/${encodeURIComponent(o.batchCode)}`}>Xem Lô {o.batchCode}</a>
          {CANCELLABLE.includes(o.status) && <OpBtn variant="ghost" sm onClick={() => { setReason(''); cancel.reset(); setCancelling(true) }}>Huỷ đơn</OpBtn>}
        </OpAside>
      </div>

      {cancelling && (
        <OpConfirm title={`Huỷ đơn ${o.orderNo}`} confirmLabel={consequence.confirm} variant="danger" pending={cancel.isPending} error={cancel.error}
          onConfirm={() => cancel.mutate({ reason: reason.trim() || null })} onClose={() => setCancelling(false)}>
          <OpNote tone={consequence.tone}>{consequence.text}</OpNote>
          <Field label="Lý do huỷ (không bắt buộc)">
            <TextArea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </OpConfirm>
      )}

      {split && (
        <OpConfirm wide title="Chia lại đợt giao" confirmLabel="Lưu các đợt giao" pending={saveSplit.isPending} error={saveSplit.error} disabled={!!splitError}
          onConfirm={() => saveSplit.mutate({ tranches: toTrancheRequests(splitLines, split) })} onClose={() => setSplit(null)}>
          <TrancheEditor lines={splitLines} value={split} onChange={setSplit} minDate={minDate} />
          {splitError && <p className="op-danger" style={{ fontSize: 14 }}>{splitError}</p>}
        </OpConfirm>
      )}
    </>
  )
}
