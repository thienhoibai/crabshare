/* /operator/deliveries/:shipmentNo — Một chuyến giao: việc cần làm tiếp (xuất hàng hoặc nhận hàng), dòng hàng, biên bản nghiệm thu,
   tiến trình, mã QR của đơn, in phiếu. GET /api/shipments/{shipmentNo}, POST /dispatch, POST /receipt (BR-162…168).
   QR gắn theo đơn, không có mã cho từng con. */
import { useParams } from 'react-router'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeft, Printer } from 'lucide-react'
import type { AllocationResponse, PagedResultOfPreorderResponse, PreorderResponse, ShipmentResponse, TrancheStatusResponse } from '../../../shared/api/api.gen'
import {
  Money, OpAside, OpBack, OpBtn, OpDl, OpFlow, OpHeading, OpNote, OpPanel, OpTable, QueryView, StatusBadge, formatDateTime, useGet,
  type FlowStep,
} from '../../../shared/ui/console'
import { DispatchForm, ReceiptForm } from './ShipmentForms'
import { batchHref, dueText, enc, fmtKg } from './common'
import './sales.css'

export default function ShipmentPage() {
  const { shipmentNo = '' } = useParams()
  const shipment = useGet<ShipmentResponse>(`/api/shipments/${enc(shipmentNo)}`)
  return <QueryView query={shipment}>{(s) => <ShipmentView s={s} />}</QueryView>
}

function ShipmentView({ s }: { s: ShipmentResponse }) {
  // Người nuôi không đọc được đơn của khách qua /api/preorders/{orderNo} (chỉ khách đọc được), nên tìm đơn trong danh sách đơn của hộ nuôi.
  const mine = useGet<PagedResultOfPreorderResponse>('/api/operators/me/preorders', { pageSize: 100 })
  const order = { data: mine.data?.items.find((o) => o.orderNo === s.orderNo) as PreorderResponse | undefined, isError: mine.isError || (mine.isSuccess && !mine.data.items.some((o) => o.orderNo === s.orderNo)) }
  const code = order.data?.batchCode
  const tranches = useGet<TrancheStatusResponse[]>(code ? `/api/batches/${enc(code)}/delivery-tranches` : null)
  const allocations = useGet<AllocationResponse[]>(code ? `/api/batches/${enc(code)}/allocations` : null)

  const tranche = tranches.data?.find((t) => t.orderNo === s.orderNo && t.seq === s.trancheSeq)
  // Số con đã phân bổ theo dòng; null khi còn đang tải, rỗng khi đợt giao không còn mở.
  const allocated: Record<number, number> | null = tranche
    ? Object.fromEntries(tranche.lines.map((l) => [l.lineId, l.allocatedCrabs]))
    : tranches.isSuccess || tranches.isError || order.isError ? {} : null
  const shipped = (allocations.data ?? []).filter((a) => a.orderNo === s.orderNo && a.trancheSeq === s.trancheSeq && a.status === 'Shipped')
  const nameOf = (specCode: string) => order.data?.lines.find((l) => l.specCode === specCode)?.specName ?? specCode
  const acc = s.acceptance
  const refused = acc?.status === 'Refused' || s.status === 'Refused'
  const balanceDue = acc?.balanceDueAt && !acc.balancePaidAt ? dueText(acc.balanceDueAt) : null
  const address = tranche?.deliveryAddress || order.data?.deliveryAddress
  const info = [
    ...(tranche?.recipientPhone ? [{ label: 'Điện thoại', value: tranche.recipientPhone }] : []),
    ...(address ? [{ label: 'Giao tới', value: address }] : []),
    ...(s.transportCondition ? [{ label: 'Vận chuyển', value: s.transportCondition }] : []),
    ...(s.returnWindowEndsAt ? [{ label: 'Hạn đổi trả', value: formatDateTime(s.returnWindowEndsAt) }] : []),
  ]

  const steps: FlowStep[] = [
    { title: 'Xuất hàng', sub: s.dispatchedAt ? formatDateTime(s.dispatchedAt) : `Dự kiến ${formatDateTime(s.scheduledAt)}`, state: s.dispatchedAt ? 'done' : s.status === 'Scheduled' ? 'now' : 'todo' },
    { title: 'Nhận hàng, cân lần hai', sub: acc ? formatDateTime(acc.operatorRecordedAt) : undefined, state: acc ? 'done' : s.status === 'Dispatched' ? 'now' : 'todo' },
    { title: refused ? 'Khách từ chối nhận' : 'Khách xác nhận nghiệm thu', sub: formatDateTime(acc?.customerConfirmedAt) || undefined, state: refused ? 'bad' : acc?.customerConfirmedAt ? 'done' : acc ? 'now' : 'todo' },
    {
      title: 'Thu phần còn lại',
      sub: acc?.balancePaidAt ? formatDateTime(acc.balancePaidAt) : balanceDue ? `Hạn ${formatDateTime(acc?.balanceDueAt)} (${balanceDue.text})` : undefined,
      state: acc?.balancePaidAt ? 'done' : balanceDue?.late ? 'bad' : acc?.customerConfirmedAt ? 'now' : 'todo',
    },
  ]

  return (
    <>
      <OpHeading
        crumb={<OpBack href="/operator/deliveries"><ArrowLeft size={16} /> Giao hàng</OpBack>}
        eyebrow={`Đơn ${s.orderNo} · đợt ${s.trancheSeq}`}
        title={tranche?.recipientName ? `Giao cho ${tranche.recipientName}` : `Chuyến giao ${s.shipmentNo}`}
        action={
          <>
            <StatusBadge kind="shipment" value={s.status} />
            <OpBtn variant="ghost" sm className="os-noprint" onClick={() => window.print()}><Printer size={15} /> In phiếu</OpBtn>
          </>
        }
      />

      <div className="op-split os-sheet">
        <div>
          {refused && <OpNote tone="danger">Khách từ chối nhận. Đơn mất cọc, cua quay về tồn để bán lại.</OpNote>}
          {s.status === 'Scheduled' && <DispatchForm s={s} allocated={allocated} nameOf={nameOf} />}
          {s.status === 'Dispatched' && (!acc || acc.status === 'Pending') && <ReceiptForm key={acc?.operatorRecordedAt ?? 'new'} s={s} shipped={shipped} nameOf={nameOf} />}

          <OpPanel title="Hàng trong chuyến" action={acc ? <StatusBadge kind="acceptance" value={acc.status} /> : undefined}>
            <OpTable
              rows={s.lines}
              rowKey={(l) => l.lineId}
              empty="Chuyến giao chưa có dòng hàng"
              columns={[
                { key: 'spec', header: 'Quy cách', cell: (l) => <><b>{nameOf(l.specCode)}</b><span className="os-sub"><Money value={l.pricePerKg} /> / kg</span></> },
                { key: 'out', header: 'Xuất', num: true, cell: (l) => l.dispatchedCrabs === null ? (allocated ? `${allocated[l.lineId] ?? 0} con` : '—') : <>{l.dispatchedCrabs} con<span className="os-sub">{fmtKg(l.dispatchedKg)}</span></> },
                { key: 'in', header: 'Nhận', num: true, cell: (l) => l.receivedCrabs === null ? '—' : <>{l.receivedCrabs} con<span className="os-sub">{fmtKg(l.receivedKg)}{l.transportLossKg ? ` · hao ${fmtKg(l.transportLossKg)}` : ''}</span></> },
                { key: 'ok', header: 'Chấp nhận', num: true, cell: (l) => l.acceptedCrabs === null ? '—' : <><b>{l.acceptedCrabs} con</b><span className="os-sub">{fmtKg(l.acceptedKg)}{l.rejectedCrabs ? ` · từ chối ${l.rejectedCrabs}` : ''}</span></> },
                { key: 'value', header: 'Tiền hàng', num: true, cell: (l) => <Money value={l.goodsValue} /> },
              ]}
            />
            {acc?.discrepancyReason && <p className="rd-muted">Chênh lệch: {acc.discrepancyReason}</p>}
            {acc && acc.goodsValue !== null && (
              <OpDl items={[
                { label: 'Tiền hàng', value: <Money value={acc.goodsValue} /> },
                { label: 'Trừ cọc', value: <Money value={acc.depositApplied} /> },
                { label: 'Khách còn phải trả', value: <span className="op-inline"><Money value={acc.balanceDue} />{s.balance && <StatusBadge kind="payment" value={s.balance.status} />}</span>, total: true },
              ]} />
            )}
          </OpPanel>
        </div>

        <OpAside>
          <OpFlow steps={steps} />
          {info.length > 0 && <OpDl items={info} />}
          {s.traceCode && (
            <div className="os-qr">
              <QRCodeSVG value={`${window.location.origin}/truy-xuat/${enc(s.traceCode)}`} size={168} level="M" marginSize={2} title={`Mã QR của đơn ${s.orderNo}`} />
              <small>Mã QR của đơn</small>
              <a className="op-link os-noprint" href={`/truy-xuat/${enc(s.traceCode)}`} target="_blank" rel="noreferrer">Mở trang truy xuất</a>
            </div>
          )}
          {code && <a className="op-link os-noprint" href={batchHref(code, 'giao-hang')}>Lô {code}</a>}
        </OpAside>
      </div>
    </>
  )
}
