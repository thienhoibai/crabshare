/* Mục "Bán có hoá đơn" của một Lô: bốn con số, nút lập đơn chỉ hiện khi có lý do bán áp dụng được (cua dưới chuẩn, đơn mất cọc, phần dư),
   khối đơn hàng cuối chỉ hiện khi Lô đang bán và có bên cam kết, danh sách đơn; cua còn bán được gấp lại.
   GET /api/batches/{code}/sellable-crabs, /direct-sales; POST /invoiced-sales, /final-order; POST /api/direct-sales/{orderNo}/cancel (BR-177…182). */
import { useState } from 'react'
import { Ban, HandCoins, QrCode, Receipt } from 'lucide-react'
import type { DecisionResponse, DirectSaleResponse, PagedResultOfPreorderResponse, SellableCrab } from '../../../../shared/api/api.gen'
import {
  Money, OpBadge, OpBtn, OpEmpty, OpFacts, OpLoading, OpMore, OpNote, OpPanel, OpTable, QueryView, StatusBadge, formatDate, formatVnd, useGet,
} from '../../../../shared/ui/console'
import { CancelSaleDialog, DirectSaleDetail, FinalOrderDialog, InvoicedSaleDialog } from '../../sales/DirectSaleDialogs'
import { batchHref, enc, fmtKg } from '../../sales/common'
import '../../sales/sales.css'
import type { BatchTabProps } from '../types'

const SELLING = ['Sourcing', 'Harvesting', 'Selling', 'Liquidating']

export default function SalesTab({ code, batch }: BatchTabProps) {
  const base = `/api/batches/${enc(code)}`
  const isP = batch.batchMode === 'P'
  const sellable = useGet<SellableCrab[]>(`${base}/sellable-crabs`)
  const sales = useGet<DirectSaleResponse[]>(`${base}/direct-sales`)
  const decisions = useGet<DecisionResponse[]>(isP ? `${base}/decisions` : null)
  const preorders = useGet<PagedResultOfPreorderResponse>('/api/operators/me/preorders', { batchCode: code, pageSize: 100 })
  const [dialog, setDialog] = useState<'invoiced' | 'final' | null>(null)
  const [view, setView] = useState<string | null>(null)
  const [cancel, setCancel] = useState<DirectSaleResponse | null>(null)

  const crabs = sellable.data ?? []
  const canSell = SELLING.includes(batch.status)
  const forfeited = (preorders.data?.items ?? []).filter((o) => o.status === 'Forfeited').map((o) => o.orderNo)
  const substandard = crabs.filter((c) => c.isSubstandard).length
  const votePassed = (decisions.data ?? []).some((d) => d.kind === 'SurplusSale' && d.status === 'Passed')

  return (
    <QueryView query={sales}>
      {(orders) => {
        const finalOrder = orders.find((o) => o.orderType === 'FinalOrder' && o.status !== 'Cancelled')
        const finalDeclined = orders.some((o) => o.orderType === 'FinalOrder' && o.status === 'Cancelled')
        // BR-182, BR-210, BR-211: phần dư chỉ bán khi bên cam kết không mua; lô P cần biểu quyết thông qua; thanh lý sớm thì bán được.
        const surplusBlocked = batch.status === 'Liquidating' ? null
          : !finalDeclined ? 'Bên cam kết chưa từ chối'
            : isP && !votePassed ? 'Cần biểu quyết thông qua'
              : null
        const needVote = isP && finalDeclined && !votePassed && batch.status !== 'Liquidating'
        const canInvoice = canSell && crabs.length > 0 && (substandard > 0 || forfeited.length > 0 || !surplusBlocked)
        const canFinal = batch.status === 'Selling' && !!batch.offtakeBuyer && !finalOrder && !finalDeclined && crabs.length > 0
        if (sellable.isPending) return <OpLoading />
        if (orders.length === 0 && crabs.length === 0) return <OpEmpty title="Chưa có cua đã duyệt hạng để bán" />
        return (
          <>
            <OpFacts items={[
              { label: 'Cua còn bán được', value: `${crabs.length} con`, tone: 'info' },
              { label: 'Dưới chuẩn', value: `${substandard} con`, tone: substandard ? 'warn' : undefined },
              { label: 'Đơn chờ thu tiền', value: orders.filter((o) => o.status === 'PendingPayment').length },
              { label: 'Đã thu', value: formatVnd(orders.filter((o) => o.status === 'Completed').reduce((n, o) => n + o.totalAmount, 0)), tone: 'ok' },
            ]} />

            {needVote && <OpNote tone="danger">Bên cam kết không mua. <a className="op-link" href={batchHref(code, 'tien')}>Mở biểu quyết bán phần dư</a></OpNote>}

            {(canInvoice || canFinal) && (
              <div className="op-inline">
                {canInvoice && <OpBtn onClick={() => setDialog('invoiced')}><Receipt size={17} /> Lập đơn có hoá đơn</OpBtn>}
                {canFinal && <OpBtn variant="ghost" onClick={() => setDialog('final')}><HandCoins size={17} /> Đơn hàng cuối cho {batch.offtakeBuyer?.legalName}</OpBtn>}
              </div>
            )}

            {orders.length > 0 && (
              <OpPanel title="Đơn đã lập">
                <OpTable
                  rows={orders}
                  rowKey={(o) => o.orderNo}
                  columns={[
                    {
                      key: 'no', header: 'Đơn', cell: (o) => (
                        <>
                          <StatusBadge kind={o.saleReason ? 'saleReason' : 'orderType'} value={o.saleReason ?? o.orderType} />
                          <span className="os-sub"><span className="op-mono">{o.orderNo}</span> · {formatDate(o.placedAt)}</span>
                        </>
                      ),
                    },
                    { key: 'buyer', header: 'Bên mua', cell: (o) => o.buyerName },
                    { key: 'qty', header: 'Số lượng', num: true, cell: (o) => <>{o.crabs} con<span className="os-sub">{fmtKg(o.kg)}</span></> },
                    { key: 'total', header: 'Tiền hàng', num: true, cell: (o) => <><b><Money value={o.totalAmount} /></b><span className="os-sub">{formatVnd(o.pricePerKg)} / kg</span></> },
                    { key: 'status', header: 'Trạng thái', cell: (o) => <StatusBadge kind="order" value={o.status} /> },
                    {
                      key: 'act', header: '', cell: (o) => (
                        <div className="os-cellbtns">
                          <OpBtn sm variant="ghost" onClick={() => setView(o.orderNo)}><QrCode size={15} /> {o.status === 'PendingPayment' ? 'Mã thanh toán' : 'Xem'}</OpBtn>
                          {o.status === 'PendingPayment' && <OpBtn sm variant="ghost" onClick={() => setCancel(o)} aria-label={o.orderType === 'FinalOrder' ? 'Bên cam kết không mua' : 'Huỷ đơn'} title={o.orderType === 'FinalOrder' ? 'Bên cam kết không mua' : 'Huỷ đơn'}><Ban size={15} /></OpBtn>}
                        </div>
                      ),
                    },
                  ]}
                />
              </OpPanel>
            )}

            {crabs.length > 0 && (
              <OpMore label="Cua còn bán được" count={crabs.length}>
                <OpTable
                  rows={crabs}
                  rowKey={(c) => c.crabCode}
                  columns={[
                    { key: 'code', header: 'Mã cua', cell: (c) => <b className="op-mono">{c.crabCode}</b> },
                    { key: 'grade', header: 'Size và hạng', cell: (c) => <span className="op-inline"><StatusBadge kind="sizeCode" value={c.finalSize} /><StatusBadge kind="gradeCode" value={c.finalGrade} /></span> },
                    { key: 'spec', header: 'Quy cách', cell: (c) => (c.isSubstandard ? <OpBadge tone="warn">Dưới chuẩn</OpBadge> : <span className="op-mono">{c.specCode ?? '—'}</span>) },
                    { key: 'weight', header: 'Khối lượng', num: true, cell: (c) => (c.weightG === null ? '—' : `${c.weightG} g`) },
                    { key: 'stock', header: 'Tồn', cell: (c) => <StatusBadge kind="crabInventory" value={c.inventoryStatus} /> },
                  ]}
                />
              </OpMore>
            )}

            {dialog === 'invoiced' && <InvoicedSaleDialog code={code} crabs={crabs} forfeitedOrders={forfeited} surplusBlocked={surplusBlocked} onClose={() => setDialog(null)} />}
            {dialog === 'final' && <FinalOrderDialog batch={batch} crabs={crabs} onClose={() => setDialog(null)} />}
            {view && <DirectSaleDetail orderNo={view} batchCode={code} onClose={() => setView(null)} />}
            {cancel && <CancelSaleDialog order={cancel} onClose={() => setCancel(null)} />}
          </>
        )
      }}
    </QueryView>
  )
}
