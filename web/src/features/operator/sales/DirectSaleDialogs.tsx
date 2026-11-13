/* Hộp thoại của mục "Bán có hoá đơn": lập đơn có hoá đơn (BR-169, BR-177, BR-182), lập đơn hàng cuối (BR-179…181),
   xem một đơn kèm mã VietQR để bên mua chuyển khoản vào tài khoản của Lô, huỷ đơn chưa thu tiền. */
import { useState } from 'react'
import type {
  BatchResponse, CancelDirectSaleRequest, DirectSaleResponse, FinalOrderRequest, InvoicedSaleRequest, SellableCrab,
} from '../../../shared/api/api.gen'
import type { PaymentStatus } from '../../../shared/payments/paymentsApi'
import { VietQrBox } from '../../../shared/payments/VietQrBox'
import {
  Checkbox, DecimalInput, Field, Input, MoneyInput, OpBtn, OpConfirm, OpDl, OpModal, OpMore, QueryView, RadioCards, Select, StatusBadge, TextArea,
  formatVnd, label, useGet, useSend,
} from '../../../shared/ui/console'
import { enc, fmtKg } from './common'
import './sales.css'

export type SaleReason = 'LowGrade' | 'ForfeitResale' | 'Surplus'

const round3 = (n: number) => Math.round(n * 1000) / 1000

/** Lập đơn có hoá đơn. Chỉ lý do đang áp dụng được mới chọn được; lý do đầu tiên áp dụng được chọn sẵn. */
export function InvoicedSaleDialog({ code, crabs, forfeitedOrders, surplusBlocked, onClose }: {
  code: string
  crabs: SellableCrab[]
  /** Mã các đơn đặt trước đã mất cọc của Lô. */
  forfeitedOrders: string[]
  /** Vì sao chưa bán phần dư được (một cụm ngắn); null khi bán được. */
  surplusBlocked: string | null
  onClose: () => void
}) {
  const substandard = crabs.filter((c) => c.isSubstandard)
  const [reason, setReason] = useState<SaleReason | null>(substandard.length ? 'LowGrade' : forfeitedOrders.length ? 'ForfeitResale' : surplusBlocked ? null : 'Surplus')
  const [picked, setPicked] = useState<string[]>([])
  const [buyerName, setBuyerName] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [kg, setKg] = useState<number | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [source, setSource] = useState(forfeitedOrders.length === 1 ? forfeitedOrders[0] : '')
  const create = useSend<DirectSaleResponse, InvoicedSaleRequest>('post', `/api/batches/${enc(code)}/invoiced-sales`, {
    success: (o) => `Đã lập đơn ${o.orderNo}.`,
    quietError: true,
    onSuccess: onClose,
  })

  const pool = reason === 'LowGrade' ? substandard : crabs
  const chosen = pool.filter((c) => picked.includes(c.crabCode))
  const weighed = round3(chosen.reduce((n, c) => n + (c.weightG ?? 0), 0) / 1000)
  const valid = !!reason && chosen.length > 0 && buyerName.trim().length >= 2 && (kg ?? 0) > 0 && (price ?? 0) > 0
    && (reason !== 'ForfeitResale' || !!source)
  const toggle = (crabCode: string, on: boolean) => setPicked(on ? [...picked, crabCode] : picked.filter((c) => c !== crabCode))

  return (
    <OpConfirm
      title="Lập đơn có hoá đơn"
      sub={`Lô ${code}`}
      confirmLabel="Lập đơn"
      pending={create.isPending}
      error={create.error}
      disabled={!valid}
      onConfirm={() => create.mutate({
        saleReason: reason!, buyerName: buyerName.trim(), buyerPhone: buyerPhone.trim() || null, crabCodes: chosen.map((c) => c.crabCode),
        kg: kg ?? 0, pricePerKg: price ?? 0, sourceOrderNo: reason === 'ForfeitResale' ? source : null,
      })}
      onClose={onClose}
      wide
    >
      <RadioCards
        value={reason}
        onChange={(r) => { setReason(r); setPicked([]) }}
        options={[
          { value: 'LowGrade', label: 'Cua dưới chuẩn', hint: `${substandard.length} con`, disabled: substandard.length === 0 },
          { value: 'ForfeitResale', label: 'Bán lại do mất cọc', hint: `${forfeitedOrders.length} đơn mất cọc`, disabled: forfeitedOrders.length === 0 },
          { value: 'Surplus', label: 'Phần dư', hint: surplusBlocked ?? `${crabs.length} con`, disabled: !!surplusBlocked },
        ]}
      />
      {reason === 'ForfeitResale' && forfeitedOrders.length > 1 && (
        <Field label="Đơn đã mất cọc" required>
          <Select value={source} onChange={(e) => setSource(e.target.value)} required>
            <option value="">Chọn đơn</option>
            {forfeitedOrders.map((no) => <option key={no} value={no}>{no}</option>)}
          </Select>
        </Field>
      )}

      {reason && pool.length > 0 && (
        <div className="op-field">
          <span className="op-between">
            <span className="op-label">Cua bán trong đơn: {chosen.length} / {pool.length} con</span>
            <OpBtn type="button" sm variant="ghost" onClick={() => setPicked(chosen.length === pool.length ? [] : pool.map((c) => c.crabCode))}>{chosen.length === pool.length ? 'Bỏ chọn' : 'Chọn tất cả'}</OpBtn>
          </span>
          <div className="os-pick">
            {pool.map((c) => (
              <Checkbox key={c.crabCode} checked={picked.includes(c.crabCode)} onChange={(on) => toggle(c.crabCode, on)}>
                <span className="op-mono">{c.crabCode}</span>{' '}
                <small>{label('sizeCode', c.finalSize)} · {label('gradeCode', c.finalGrade)}{c.weightG ? ` · ${c.weightG} g` : ''}</small>
              </Checkbox>
            ))}
          </div>
        </div>
      )}

      <Field label="Bên mua" required><Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} maxLength={200} required /></Field>
      <div className="op-form__row">
        <Field label="Khối lượng bán" required hint={weighed > 0 ? `Lúc phân hạng: ${fmtKg(weighed)}` : undefined}>
          <DecimalInput value={kg} onChange={setKg} unit="kg" />
        </Field>
        <Field label="Giá mỗi kg" required><MoneyInput value={price} onChange={setPrice} /></Field>
      </div>
      {(kg ?? 0) > 0 && (price ?? 0) > 0 && <OpDl items={[{ label: 'Tiền hàng', value: formatVnd(round3(kg ?? 0) * (price ?? 0)), total: true }]} />}
      <OpMore label="Tuỳ chọn thêm">
        <Field label="Điện thoại bên mua"><Input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} maxLength={15} inputMode="tel" /></Field>
      </OpMore>
    </OpConfirm>
  )
}

/** Đơn hàng cuối cho bên cam kết thu mua: toàn bộ cua còn lại, đơn giá không dưới giá sàn. */
export function FinalOrderDialog({ batch, crabs, onClose }: { batch: BatchResponse; crabs: SellableCrab[]; onClose: () => void }) {
  const floor = batch.floorPricePerKg ?? 0
  const weighed = round3(crabs.reduce((n, c) => n + (c.weightG ?? 0), 0) / 1000)
  const [kg, setKg] = useState<number | null>(weighed > 0 ? weighed : null)
  const [price, setPrice] = useState<number | null>(floor > 0 ? floor : null)
  const create = useSend<DirectSaleResponse, FinalOrderRequest>('post', `/api/batches/${enc(batch.batchCode)}/final-order`, {
    success: (o) => `Đã lập đơn hàng cuối ${o.orderNo}.`,
    quietError: true,
    onSuccess: onClose,
  })
  const below = price !== null && price < floor

  return (
    <OpConfirm
      title="Lập đơn hàng cuối"
      sub={`${batch.offtakeBuyer?.legalName ?? ''} · ${crabs.length} con còn lại`}
      confirmLabel="Lập đơn hàng cuối"
      pending={create.isPending}
      error={create.error}
      disabled={(kg ?? 0) <= 0 || (price ?? 0) <= 0 || below}
      onConfirm={() => create.mutate({ kg: kg ?? 0, pricePerKg: price ?? 0 })}
      onClose={onClose}
    >
      <Field label="Khối lượng" required>
        <DecimalInput value={kg} onChange={setKg} unit="kg" />
      </Field>
      <Field label="Giá mỗi kg" required error={below ? `Không dưới giá sàn ${formatVnd(floor)}` : undefined} hint={floor > 0 ? `Giá sàn ${formatVnd(floor)}` : undefined}>
        <MoneyInput value={price} onChange={setPrice} />
      </Field>
      {(kg ?? 0) > 0 && (price ?? 0) > 0 && <OpDl items={[{ label: 'Tiền hàng', value: formatVnd(round3(kg ?? 0) * (price ?? 0)), total: true }]} />}
    </OpConfirm>
  )
}

/** Xem một đơn: số liệu, hoá đơn và mã VietQR khi đơn còn chờ thanh toán. Tự hỏi lại để biết tiền đã về. */
export function DirectSaleDetail({ orderNo, batchCode, onClose }: { orderNo: string; batchCode: string; onClose: () => void }) {
  const order = useGet<DirectSaleResponse>(`/api/direct-sales/${enc(orderNo)}`, undefined, {
    refetchInterval: (q) => (q.state.data?.status === 'PendingPayment' ? 5000 : false),
  })
  return (
    <OpModal title={`Đơn ${orderNo}`} onClose={onClose} wide>
      <QueryView query={order}>
        {(o) => (
          <>
            <div className="op-inline">
              <StatusBadge kind="order" value={o.status} />
              <StatusBadge kind={o.saleReason ? 'saleReason' : 'orderType'} value={o.saleReason ?? o.orderType} />
            </div>
            {o.payment && <VietQrBox payment={{ ...o.payment, batchCode }} status={o.payment.status as PaymentStatus} />}
            <OpDl items={[
              { label: 'Bên mua', value: o.buyerName },
              { label: 'Số lượng', value: `${o.crabs} con · ${fmtKg(o.kg)}` },
              { label: 'Giá mỗi kg', value: formatVnd(o.pricePerKg) },
              { label: 'Hoá đơn', value: o.invoiceNo ?? '—' },
              { label: 'Tiền hàng', value: formatVnd(o.totalAmount), total: true },
            ]} />
          </>
        )}
      </QueryView>
    </OpModal>
  )
}

export function CancelSaleDialog({ order, onClose }: { order: DirectSaleResponse; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const final = order.orderType === 'FinalOrder'
  const cancel = useSend<DirectSaleResponse, CancelDirectSaleRequest>('post', `/api/direct-sales/${enc(order.orderNo)}/cancel`, {
    success: final ? 'Đã ghi nhận bên cam kết không mua.' : `Đã huỷ đơn ${order.orderNo}.`,
    quietError: true,
    onSuccess: onClose,
  })
  return (
    <OpConfirm
      title={final ? 'Bên cam kết không mua' : 'Huỷ đơn'}
      sub={`${order.buyerName} · ${formatVnd(order.totalAmount)}`}
      confirmLabel={final ? 'Ghi nhận không mua' : 'Huỷ đơn'}
      variant="danger"
      pending={cancel.isPending}
      error={cancel.error}
      disabled={reason.trim().length < 3}
      onConfirm={() => cancel.mutate({ reason: reason.trim() })}
      onClose={onClose}
    >
      <p>Hoá đơn và mã chuyển khoản bị huỷ, cua quay về tồn.</p>
      <Field label="Lý do" required>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required />
      </Field>
    </OpConfirm>
  )
}
