/* Một chuyến giao của đơn và bảng hoá đơn (BR-164 – BR-171).
   Thẻ chuyến chỉ hiện việc khách cần làm: xác nhận nghiệm thu, trả phần còn lại; số liệu cân hai lần gấp trong "Số liệu cân".
   POST /api/shipments/{no}/acceptance/confirm → tiền hàng, trừ cọc, phần còn lại qua VietQR, hoá đơn đợt.
   POST /api/shipments/{no}/acceptance/refuse → mất cọc, cua quay về để bán lại (BR-169). */
import { useState } from 'react'
import { PackageCheck } from 'lucide-react'
import type { InvoiceResponse, RefuseDeliveryRequest, ShipmentResponse } from '../../shared/api/api.gen'
import {
  Field, Money, OpBadge, OpBtn, OpConfirm, OpDl, OpFacts, OpKv, OpMore, OpNote, OpPanel, OpTable, StatusBadge, TextArea, formatDateTime, formatVnd, useSend,
  type Fact,
} from '../../shared/ui/console'
import { fmtKg, shipmentStage } from './customerData'
import { PayBox } from './PayBox'

const pair = (crabs: number | null, kg: number | null) => (crabs === null ? '—' : `${crabs} con · ${fmtKg(kg)}`)

/** Còn dưới 12 giờ để trả phần còn lại: lúc này mới cần cảnh báo mất cọc. */
const dueSoon = (iso: string | null) => !!iso && Date.parse(iso) - Date.now() < 12 * 3_600_000

export function ShipmentCard({ s, credit, batchCode, specName }: { s: ShipmentResponse; credit: number; batchCode: string; specName: (code: string) => string }) {
  const [dialog, setDialog] = useState<'confirm' | 'refuse' | null>(null)
  const [reason, setReason] = useState('')
  const base = `/api/shipments/${encodeURIComponent(s.shipmentNo)}/acceptance`
  const confirm = useSend<ShipmentResponse, void>('post', `${base}/confirm`, { success: 'Đã xác nhận nghiệm thu.', quietError: true, onSuccess: () => setDialog(null) })
  const refuse = useSend<ShipmentResponse, RefuseDeliveryRequest>('post', `${base}/refuse`, { success: 'Đã ghi nhận từ chối nhận hàng.', quietError: true, onSuccess: () => setDialog(null) })

  const stage = shipmentStage(s)
  const a = s.acceptance
  const goods = s.lines.reduce((sum, l) => sum + (l.goodsValue ?? 0), 0)
  const applied = Math.min(credit, goods)
  const sent = pair(s.lines.reduce((sum, l) => sum + (l.dispatchedCrabs ?? 0), 0), s.lines.reduce((sum, l) => sum + (l.dispatchedKg ?? 0), 0))
  const open = (kind: 'confirm' | 'refuse') => { confirm.reset(); refuse.reset(); setReason(''); setDialog(kind) }
  const weighed = s.lines.some((l) => l.dispatchedCrabs !== null)

  const facts: Fact[] = stage === 'accept' && a ? [
    { label: 'Nghiệm thu', value: pair(a.acceptedCrabs, a.acceptedKg), tone: 'ok' },
    { label: 'Từ chối', value: `${a.rejectedCrabs} con`, tone: a.rejectedCrabs > 0 ? 'danger' : undefined },
    { label: 'Tiền hàng', value: formatVnd(goods) },
  ] : stage === 'done' && a ? [
    { label: 'Nghiệm thu', value: pair(a.acceptedCrabs, a.acceptedKg), tone: 'ok' },
    { label: 'Tiền hàng', value: formatVnd(a.goodsValue ?? 0) },
    { label: 'Cọc đã trừ', value: formatVnd(a.depositApplied ?? 0) },
    { label: 'Đã trả thêm', value: formatVnd(a.balanceDue ?? 0) },
  ] : stage === 'transit' ? [
    { label: 'Đã xuất', value: sent },
    { label: 'Xuất lúc', value: formatDateTime(s.dispatchedAt) },
  ] : stage === 'scheduled' ? [{ label: 'Hẹn giao', value: formatDateTime(s.scheduledAt) }] : []

  return (
    <div id={`chuyen-${s.shipmentNo}`} style={{ scrollMarginTop: 90 }}>
      <OpPanel accent={stage === 'accept' || stage === 'pay'}
        title={stage === 'accept' ? `Nghiệm thu chuyến ${s.shipmentNo}` : stage === 'pay' ? `Trả phần còn lại · ${s.shipmentNo}` : `Chuyến ${s.shipmentNo}`}
        action={<span className="op-inline"><OpBadge>Đợt {s.trancheSeq}</OpBadge><StatusBadge kind="shipment" value={s.status} /></span>}>
        {facts.length > 0 && <OpFacts items={facts} />}

        {stage === 'accept' && a?.discrepancyReason && <OpNote>Chênh lệch: {a.discrepancyReason}</OpNote>}

        {stage === 'pay' && a && (
          <>
            <OpDl items={[
              { label: `Tiền hàng (${fmtKg(a.acceptedKg)})`, value: formatVnd(a.goodsValue ?? 0) },
              { label: 'Tiền cọc đã trừ', value: formatVnd(a.depositApplied ?? 0) },
              { label: 'Hạn trả', value: formatDateTime(a.balanceDueAt) },
              { label: 'Còn phải trả', value: formatVnd(a.balanceDue ?? 0), total: true },
            ]} />
            {dueSoon(a.balanceDueAt) && <OpNote tone="danger">Sắp hết hạn trả. Quá hạn là mất cọc.</OpNote>}
            {s.balance && <PayBox start={{ ...s.balance, batchCode }} />}
          </>
        )}

        {(stage === 'accept' || stage === 'transit') && (
          <div className="op-formfoot">
            <OpBtn variant="ghost" sm={stage === 'transit'} onClick={() => open('refuse')}>Từ chối nhận</OpBtn>
            {stage === 'accept' && <OpBtn onClick={() => open('confirm')}><PackageCheck size={17} /> Xác nhận nghiệm thu</OpBtn>}
          </div>
        )}

        {weighed && (
          <OpMore label="Số liệu cân">
            <OpTable
              rows={s.lines}
              rowKey={(l) => l.lineId}
              columns={[
                { key: 'spec', header: 'Quy cách', cell: (l) => <><b>{specName(l.specCode)}</b><br /><small className="rd-muted">{formatVnd(l.pricePerKg)} / kg</small></> },
                { key: 'out', header: 'Xuất', num: true, cell: (l) => pair(l.dispatchedCrabs, l.dispatchedKg) },
                {
                  key: 'in', header: 'Nhận', num: true,
                  cell: (l) => <>{pair(l.receivedCrabs, l.receivedKg)}{l.transportLossKg ? <><br /><small className="rd-muted">hao hụt {fmtKg(l.transportLossKg)}</small></> : null}</>,
                },
                {
                  key: 'ok', header: 'Nghiệm thu', num: true,
                  cell: (l) => <><b>{pair(l.acceptedCrabs, l.acceptedKg)}</b>{l.rejectedCrabs ? <><br /><small className="op-danger">từ chối {l.rejectedCrabs} con</small></> : null}</>,
                },
                { key: 'value', header: 'Tiền hàng', num: true, cell: (l) => <Money value={l.goodsValue} /> },
              ]}
            />
            <OpKv items={[
              { label: 'Hẹn giao', value: formatDateTime(s.scheduledAt) },
              { label: 'Xuất hàng', value: formatDateTime(s.dispatchedAt) },
              { label: 'Nghiệm thu', value: formatDateTime(s.deliveredAt) },
              { label: 'Hạn đổi trả', value: formatDateTime(s.returnWindowEndsAt) },
              { label: 'Vận chuyển', value: s.transportCondition },
            ]} />
          </OpMore>
        )}
      </OpPanel>

      {dialog === 'confirm' && a && (
        <OpConfirm title={`Xác nhận nghiệm thu chuyến ${s.shipmentNo}`} confirmLabel="Xác nhận nghiệm thu" pending={confirm.isPending} error={confirm.error}
          onConfirm={() => confirm.mutate()} onClose={() => setDialog(null)}>
          <OpDl items={[
            { label: 'Nghiệm thu', value: pair(a.acceptedCrabs, a.acceptedKg) },
            { label: 'Tiền hàng', value: formatVnd(goods) },
            { label: 'Trừ vào tiền cọc', value: formatVnd(applied) },
            { label: 'Còn phải trả', value: formatVnd(goods - applied), total: true },
          ]} />
        </OpConfirm>
      )}

      {dialog === 'refuse' && (
        <OpConfirm title={`Từ chối nhận chuyến ${s.shipmentNo}`} confirmLabel="Từ chối và chịu mất cọc" variant="danger" pending={refuse.isPending} error={refuse.error}
          disabled={reason.trim().length < 3} onConfirm={() => refuse.mutate({ reason: reason.trim() })} onClose={() => setDialog(null)}>
          <OpNote tone="danger">Bạn mất tiền cọc chưa dùng ({formatVnd(credit)}). Các đợt chưa giao bị huỷ. Không rút lại được.</OpNote>
          <Field label="Lý do từ chối" required>
            <TextArea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </OpConfirm>
      )}
    </div>
  )
}

/** Hoá đơn của đơn: mỗi đợt nghiệm thu một hoá đơn. */
export function InvoiceTable({ invoices }: { invoices: InvoiceResponse[] }) {
  return (
    <OpTable
      rows={invoices}
      rowKey={(i) => i.invoiceNo}
      columns={[
        { key: 'no', header: 'Số hoá đơn', cell: (i) => <><b className="op-mono">{i.invoiceNo}</b><br /><small className="rd-muted">{formatDateTime(i.issuedAt)}</small></> },
        { key: 'seq', header: 'Đợt', cell: (i) => (i.trancheSeq ? `Đợt ${i.trancheSeq}` : '—') },
        { key: 'seller', header: 'Bên bán', cell: (i) => i.sellerName },
        { key: 'amount', header: 'Số tiền', num: true, cell: (i) => <Money value={i.amount} /> },
        { key: 'status', header: 'Trạng thái', cell: (i) => <StatusBadge kind="invoice" value={i.status} /> },
      ]}
    />
  )
}
