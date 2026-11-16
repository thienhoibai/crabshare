/* Bảng đợt giao của đơn đặt trước: số con đã phân bổ theo dòng, lập chuyến giao, huỷ đợt vì thiếu cua (BR-160, BR-164, BR-234).
   Dùng ở /operator/deliveries và ở mục "Đặt trước và giao hàng" của trang làm việc Lô. */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Ban, Truck } from 'lucide-react'
import type { CreateShipmentRequest, OrderDeliveriesResponse, ShipmentResponse, TrancheStatusResponse } from '../../../shared/api/api.gen'
import { Checkbox, Field, Input, OpBtn, OpConfirm, OpMore, OpTable, StatusBadge, TextArea, formatDate, useSend } from '../../../shared/ui/console'
import { batchHref, enc, toLocalInput } from './common'
import './sales.css'

export type TrancheRow = TrancheStatusResponse & { batchCode: string }

const isOpen = (t: TrancheStatusResponse) => t.status === 'Planned' || t.status === 'Allocated'

/** Đợt còn chờ lập chuyến giao. */
export const needsShipment = (t: TrancheStatusResponse) => isOpen(t) && !t.shipmentNo

/** Chuyến đang chạy: đã lập, chưa nghiệm thu. */
export const inTransit = (t: TrancheStatusResponse) => t.shipmentStatus === 'Scheduled' || t.shipmentStatus === 'Dispatched'

export function TrancheTable({ rows, showBatch = false, empty = 'Chưa có đợt giao nào' }: { rows: TrancheRow[]; showBatch?: boolean; empty?: string }) {
  const [ship, setShip] = useState<TrancheRow | null>(null)
  const [cancel, setCancel] = useState<TrancheRow | null>(null)

  return (
    <>
      <OpTable
        rows={rows}
        rowKey={(t) => t.trancheId}
        empty={empty}
        columns={[
          {
            key: 'order', header: 'Đợt giao', cell: (t) => (
              <>
                <b>Hạn {formatDate(t.dueDate)}</b>
                <span className="os-sub"><span className="op-mono">{t.orderNo}</span> · đợt {t.seq}{showBatch && <> · <a href={batchHref(t.batchCode, 'giao-hang')}>Lô {t.batchCode}</a></>}</span>
              </>
            ),
          },
          { key: 'to', header: 'Người nhận', cell: (t) => <>{t.recipientName}<span className="os-sub">{t.recipientPhone}</span></> },
          {
            key: 'lines', header: 'Đã phân bổ / đặt', cell: (t) => (
              <div className="os-lines">
                {t.lines.map((l) => (
                  <span key={l.lineId}>
                    <span className="op-mono">{l.specCode}</span>: <b className={l.allocatedCrabs < l.orderedCrabs ? 'op-warn' : 'op-ok'}>{l.allocatedCrabs}</b> / {l.orderedCrabs} con
                    {l.substitutedCrabs > 0 && <span className="op-muted"> · {l.substitutedCrabs} thay hạng</span>}
                  </span>
                ))}
              </div>
            ),
          },
          { key: 'status', header: 'Trạng thái', cell: (t) => (t.shipmentStatus ? <StatusBadge kind="shipment" value={t.shipmentStatus} /> : <StatusBadge kind="deliveryTranche" value={t.status} />) },
          {
            key: 'act', header: '', cell: (t) => (
              <div className="os-cellbtns">
                {t.shipmentNo && <a className="rd-btn rd-btn--ghost rd-btn--sm" href={`/operator/deliveries/${enc(t.shipmentNo)}`}><Truck size={15} /> Mở chuyến</a>}
                {needsShipment(t) && <OpBtn sm variant="ink" onClick={() => setShip(t)}><Truck size={15} /> Lập chuyến</OpBtn>}
                {isOpen(t) && <OpBtn sm variant="ghost" onClick={() => setCancel(t)} aria-label="Huỷ đợt giao" title="Huỷ đợt giao"><Ban size={15} /></OpBtn>}
              </div>
            ),
          },
        ]}
      />
      {ship && <CreateShipmentDialog tranche={ship} onClose={() => setShip(null)} />}
      {cancel && <CancelTrancheDialog tranche={cancel} onClose={() => setCancel(null)} />}
    </>
  )
}

function CreateShipmentDialog({ tranche, onClose }: { tranche: TrancheRow; onClose: () => void }) {
  const navigate = useNavigate()
  const [scheduledAt, setScheduledAt] = useState(() => toLocalInput(new Date(Date.now() + 3_600_000)))
  const [transport, setTransport] = useState('')
  const [substitute, setSubstitute] = useState(true)
  const create = useSend<ShipmentResponse, CreateShipmentRequest>('post', `/api/delivery-tranches/${tranche.trancheId}/shipments`, {
    success: (s) => `Đã lập chuyến giao ${s.shipmentNo}.`,
    quietError: true,
    onSuccess: (s) => navigate(`/operator/deliveries/${enc(s.shipmentNo)}`),
  })
  const when = scheduledAt ? new Date(scheduledAt) : null

  return (
    <OpConfirm
      title="Lập chuyến giao"
      sub={`${tranche.recipientName} · hạn ${formatDate(tranche.dueDate)}`}
      confirmLabel="Lập chuyến"
      pending={create.isPending}
      error={create.error}
      disabled={!when || Number.isNaN(when.getTime())}
      onConfirm={() => create.mutate({ scheduledAt: when!.toISOString(), transportCondition: transport.trim() || null, allowSubstitution: substitute })}
      onClose={onClose}
    >
      <Field label="Dự kiến xuất hàng lúc" required>
        <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} required />
      </Field>
      <OpMore label="Tuỳ chọn thêm">
        <div className="op-form">
          <Field label="Điều kiện vận chuyển">
            <Input value={transport} onChange={(e) => setTransport(e.target.value)} maxLength={300} placeholder="Thùng xốp, đá khô, xe lạnh" />
          </Field>
          <Checkbox checked={substitute} onChange={setSubstitute}>Thiếu cua thì thay bằng cua cùng size, hạng cao hơn</Checkbox>
        </div>
      </OpMore>
    </OpConfirm>
  )
}

function CancelTrancheDialog({ tranche, onClose }: { tranche: TrancheRow; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const cancel = useSend<OrderDeliveriesResponse, { reason: string }>('post', `/api/delivery-tranches/${tranche.trancheId}/cancel`, {
    success: 'Đã huỷ đợt giao.',
    quietError: true,
    onSuccess: onClose,
  })
  return (
    <OpConfirm
      title="Huỷ đợt giao vì thiếu cua"
      sub={`Đơn ${tranche.orderNo} · đợt ${tranche.seq}`}
      confirmLabel="Huỷ đợt giao"
      variant="danger"
      pending={cancel.isPending}
      error={cancel.error}
      disabled={reason.trim().length < 3}
      onConfirm={() => cancel.mutate({ reason: reason.trim() })}
      onClose={onClose}
    >
      <p>Cua đã phân bổ quay về tồn. Đợt cuối thì hoàn cọc chưa dùng.</p>
      <Field label="Lý do" required>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required />
      </Field>
    </OpConfirm>
  )
}
