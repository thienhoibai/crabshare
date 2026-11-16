/* Tab Nguồn cua của một Lô (WF-05, BR-098…101): đơn mua nguồn, nhận từng lô nguồn bằng phiếu nhận hàng,
   hệ thống phân ngẫu nhiên Nhân viên kiểm phẩm kiểm từng con (BR-017). Người nuôi không tự kiểm và không tự đóng phiếu.
   GET/POST /api/batches/{code}/procurement-orders, POST /api/procurement-orders/{poNo}/receipts,
   GET /api/batches/{code}/goods-receipts, GET /api/goods-receipts/{receiptNo}. */
import { useState } from 'react'
import { PackagePlus, Plus } from 'lucide-react'
import type {
  GoodsReceiptRequest, GoodsReceiptResponse, HoldingResponse, PartySiteResponse, PartySummaryResponse, ProcurementOrderRequest, ProcurementOrderResponse,
} from '../../../../shared/api/api.gen'
import {
  DecimalInput, Field, Input, MoneyInput, NumberInput, OpBtn, OpConfirm, OpEmpty, OpFacts, OpKv, OpMeter, OpModal, OpMore, OpNote, OpPanel, OpTable, QueryView,
  Select, StatusBadge, TextArea, formatDate, formatDateTime, formatVnd, useGet, useSend,
} from '../../../../shared/ui/console'
import { num, todayIso } from '../../opA'
import type { BatchTabProps } from '../types'

const CAN_ORDER = ['Sourcing', 'InProduction', 'Harvesting', 'Selling']

function OrderDialog({ code, onClose }: { code: string; onClose: () => void }) {
  const suppliers = useGet<PartySummaryResponse[]>('/api/parties/directory', { roleType: 'Supplier' })
  const [supplierPartyId, setSupplierPartyId] = useState('')
  const [orderedOn, setOrderedOn] = useState(todayIso())
  const [agreedSpec, setAgreedSpec] = useState('')
  const [quantity, setQuantity] = useState<number | null>(null)
  const [unitPrice, setUnitPrice] = useState<number | null>(null)
  const create = useSend<ProcurementOrderResponse, ProcurementOrderRequest>('post', `/api/batches/${encodeURIComponent(code)}/procurement-orders`, {
    success: 'Đã lập đơn mua nguồn.', onSuccess: onClose, quietError: true,
  })
  return (
    <OpConfirm
      title="Lập đơn mua nguồn"
      confirmLabel={quantity && unitPrice ? `Lập đơn ${formatVnd(quantity * unitPrice)}` : 'Lập đơn'}
      pending={create.isPending}
      error={create.error}
      disabled={!supplierPartyId || !orderedOn || !agreedSpec.trim() || !quantity || unitPrice === null}
      onClose={onClose}
      onConfirm={() => create.mutate({ supplierPartyId: Number(supplierPartyId), orderedOn, agreedSpec: agreedSpec.trim(), quantity: quantity ?? 0, unitPrice: unitPrice ?? 0 })}
    >
      <Field label="Nhà cung cấp" required>
        <Select value={supplierPartyId} onChange={(e) => setSupplierPartyId(e.target.value)}>
          <option value="">Chọn nhà cung cấp</option>
          {(suppliers.data ?? []).map((p) => <option key={p.partyId} value={p.partyId}>{p.legalName}</option>)}
        </Select>
      </Field>
      {suppliers.data?.length === 0 && <OpNote tone="danger">Chưa có nhà cung cấp đã xác minh. <a className="op-link" href="/operator/partners">Thêm đối tác</a></OpNote>}
      <div className="op-form__row">
        <Field label="Số con" required>
          <NumberInput unit="con" max={100000} value={quantity} onChange={setQuantity} />
        </Field>
        <Field label="Giá mỗi con" required>
          <MoneyInput value={unitPrice} onChange={setUnitPrice} />
        </Field>
      </div>
      <Field label="Quy cách thoả thuận" required>
        <Input value={agreedSpec} maxLength={300} onChange={(e) => setAgreedSpec(e.target.value)} placeholder="Cua thịt 280–320 g, còn sống, đủ càng" />
      </Field>
      <OpMore label="Tuỳ chọn thêm">
        <Field label="Ngày đặt">
          <Input type="date" value={orderedOn} onChange={(e) => setOrderedOn(e.target.value)} />
        </Field>
      </OpMore>
    </OpConfirm>
  )
}

function ReceiptDialog({ order, onClose }: { order: ProcurementOrderResponse; onClose: () => void }) {
  const sites = useGet<PartySiteResponse[]>('/api/me/sites')
  const [originRegion, setOriginRegion] = useState('')
  const [harvestedOn, setHarvestedOn] = useState(todayIso())
  const [declaredSpecies, setDeclaredSpecies] = useState('Scylla paramamosain')
  const [declaredCount, setDeclaredCount] = useState<number | null>(null)
  const [declaredWeightKg, setDeclaredWeightKg] = useState<number | null>(null)
  const [lotCode, setLotCode] = useState('')
  const [siteId, setSiteId] = useState('')
  const [note, setNote] = useState('')
  const create = useSend<GoodsReceiptResponse, GoodsReceiptRequest>('post', `/api/procurement-orders/${encodeURIComponent(order.poNo)}/receipts`, {
    success: 'Đã lập phiếu nhận. Chờ Nhân viên kiểm phẩm kiểm đầu vào.', onSuccess: onClose, quietError: true,
  })
  const receivingSites = (sites.data ?? []).filter((s) => s.status === 'Active' && s.siteType !== 'DeliveryAddress')
  return (
    <OpConfirm
      title="Nhận lô nguồn"
      sub={`${order.supplierName} · đã nhận ${order.receivedCount}/${order.quantity} con`}
      confirmLabel="Lập phiếu nhận"
      pending={create.isPending}
      error={create.error}
      disabled={!originRegion.trim() || !harvestedOn || !declaredSpecies.trim() || !declaredCount || !declaredWeightKg}
      onClose={onClose}
      onConfirm={() => create.mutate({
        lotCode: lotCode.trim() || null, originRegion: originRegion.trim(), harvestedOn, declaredSpecies: declaredSpecies.trim(), declaredCount: declaredCount ?? 0,
        declaredWeightKg: declaredWeightKg ?? 0, siteId: siteId ? Number(siteId) : null, note: note.trim() || null,
      })}
    >
      <div className="op-form__row">
        <Field label="Số con" required>
          <NumberInput unit="con" max={100000} value={declaredCount} onChange={setDeclaredCount} />
        </Field>
        <Field label="Khối lượng" required>
          <DecimalInput unit="kg" value={declaredWeightKg} onChange={setDeclaredWeightKg} />
        </Field>
      </div>
      <div className="op-form__row">
        <Field label="Vùng xuất xứ" required>
          <Input value={originRegion} maxLength={150} onChange={(e) => setOriginRegion(e.target.value)} placeholder="Rạch Gốc, Ngọc Hiển" />
        </Field>
        <Field label="Ngày thu" required>
          <Input type="date" max={todayIso()} value={harvestedOn} onChange={(e) => setHarvestedOn(e.target.value)} />
        </Field>
      </div>
      <OpMore label="Tuỳ chọn thêm">
        <div className="op-form__row">
          <Field label="Loài">
            <Input value={declaredSpecies} maxLength={60} onChange={(e) => setDeclaredSpecies(e.target.value)} />
          </Field>
          <Field label="Mã lô nguồn" hint="Để trống: hệ thống tự cấp">
            <Input value={lotCode} maxLength={30} onChange={(e) => setLotCode(e.target.value)} />
          </Field>
          <Field label="Nơi nhận">
            <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Không ghi</option>
              {receivingSites.map((s) => <option key={s.siteId} value={s.siteId}>{s.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Ghi chú">
          <TextArea rows={2} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </OpMore>
    </OpConfirm>
  )
}

function ReceiptDetail({ receiptNo, onClose }: { receiptNo: string; onClose: () => void }) {
  const receipt = useGet<GoodsReceiptResponse>(`/api/goods-receipts/${encodeURIComponent(receiptNo)}`, undefined, { refetchInterval: 15_000 })
  return (
    <OpModal title="Phiếu nhận hàng" sub={receiptNo} onClose={onClose}>
      <QueryView query={receipt}>
        {(r) => {
          const checked = r.acceptedCount + r.rejectedCount
          return (
            <div className="op-stack">
              <div className="op-inline"><StatusBadge kind="receipt" value={r.status} /></div>
              <OpMeter label="Đã kiểm" value={checked} max={r.declaredCount} display={`${checked} / ${r.declaredCount} con`} tone="var(--ok)" />
              <OpFacts items={[
                { label: 'Đạt', value: `${r.acceptedCount} con`, tone: 'ok' },
                { label: 'Loại', value: `${r.rejectedCount} con`, tone: r.rejectedCount ? 'danger' : undefined },
                { label: 'Khối lượng đạt', value: `${num(r.acceptedWeightG / 1000)} kg` },
              ]} />
              {r.status === 'Inspecting' && !r.qcUserId && <OpNote tone="danger">Phiếu chưa được phân Nhân viên kiểm phẩm. Báo Admin.</OpNote>}
              <OpMore label="Chi tiết lô nguồn">
                <OpKv items={[
                  { label: 'Mã lô nguồn', value: <span className="op-mono">{r.lotCode}</span> },
                  { label: 'Đơn mua', value: <span className="op-mono">{r.poNo}</span> },
                  { label: 'Vùng xuất xứ', value: r.originRegion },
                  { label: 'Ngày thu', value: formatDate(r.harvestedOn) },
                  { label: 'Khai báo', value: `${r.declaredCount} con · ${num(r.declaredWeightKg)} kg` },
                  { label: 'Nhận lúc', value: formatDateTime(r.receivedAt) },
                  { label: 'Kiểm xong lúc', value: formatDateTime(r.completedAt) },
                ]} />
              </OpMore>
            </div>
          )
        }}
      </QueryView>
    </OpModal>
  )
}

export default function SourcingTab({ code, batch: b }: BatchTabProps) {
  const api = `/api/batches/${encodeURIComponent(code)}`
  const orders = useGet<ProcurementOrderResponse[]>(`${api}/procurement-orders`)
  const receipts = useGet<GoodsReceiptResponse[]>(`${api}/goods-receipts`)
  const holding = useGet<HoldingResponse>(b.hasHolding ? `${api}/holding` : null, undefined, { retry: false })
  const [ordering, setOrdering] = useState(false)
  const [receiving, setReceiving] = useState<ProcurementOrderResponse | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const canOrder = CAN_ORDER.includes(b.status)
  const funded = b.fundedQuantity ?? b.plannedQuantity
  const ordered = (orders.data ?? []).filter((o) => o.status !== 'Cancelled').reduce((sum, o) => sum + o.quantity, 0)
  const received = (orders.data ?? []).reduce((sum, o) => sum + o.receivedCount, 0)

  return (
    <>
      <OpFacts items={[
        { label: 'Được cấp vốn', value: `${funded} con` },
        { label: 'Thả bù tối đa', value: holding.data ? `${holding.data.maxRestock} con` : '—' },
        { label: 'Đã đặt mua', value: `${ordered} con`, tone: 'info' },
        { label: 'Đã nhận vào tồn', value: `${received} con`, tone: 'ok' },
      ]} />

      <OpPanel
        title="Đơn mua nguồn"
        subtitle="Tổng số con mua không vượt số con được cấp vốn cộng số con thả bù tối đa."
        action={canOrder && <OpBtn sm onClick={() => setOrdering(true)}><Plus size={15} /> Lập đơn</OpBtn>}
      >
        <QueryView query={orders}>
          {(rows) => rows.length === 0 ? <OpEmpty title="Chưa có đơn mua nguồn" /> : (
            <OpTable
              rows={rows}
              rowKey={(o) => o.poNo}
              columns={[
                { key: 'supplier', header: 'Nhà cung cấp', cell: (o) => <><b>{o.supplierName}</b><br /><small className="rd-muted">{formatDate(o.orderedOn)} · {formatVnd(o.unitPrice)} mỗi con · {o.agreedSpec}</small></> },
                { key: 'qty', header: 'Đã nhận', num: true, cell: (o) => `${o.receivedCount} / ${o.quantity}` },
                { key: 'status', header: 'Trạng thái', cell: (o) => <StatusBadge kind="procurement" value={o.status} /> },
                {
                  key: 'act', header: '', cell: (o) => (o.status === 'Ordered' || o.status === 'PartiallyReceived') && canOrder
                    ? <OpBtn variant="ghost" sm onClick={() => setReceiving(o)}><PackagePlus size={14} /> Nhận lô nguồn</OpBtn> : null,
                },
              ]}
            />
          )}
        </QueryView>
      </OpPanel>

      {(receipts.data?.length ?? 0) > 0 && (
        <OpPanel title="Phiếu nhận hàng" subtitle="Bấm một phiếu để xem kết quả kiểm đầu vào.">
          <OpTable
            rows={receipts.data ?? []}
            rowKey={(r) => r.receiptNo}
            onRowClick={(r) => setViewing(r.receiptNo)}
            columns={[
              { key: 'lot', header: 'Lô nguồn', cell: (r) => <><b>{r.originRegion}</b><br /><small className="rd-muted">{formatDateTime(r.receivedAt)} · {r.declaredCount} con</small></> },
              { key: 'ok', header: 'Đạt', num: true, cell: (r) => <b className="op-ok">{r.acceptedCount}</b> },
              { key: 'bad', header: 'Loại', num: true, cell: (r) => (r.rejectedCount ? <b className="op-danger">{r.rejectedCount}</b> : 0) },
              { key: 'status', header: 'Trạng thái', cell: (r) => <StatusBadge kind="receipt" value={r.status} /> },
            ]}
          />
        </OpPanel>
      )}

      {ordering && <OrderDialog code={code} onClose={() => setOrdering(false)} />}
      {receiving && <ReceiptDialog order={receiving} onClose={() => setReceiving(null)} />}
      {viewing && <ReceiptDetail receiptNo={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}
