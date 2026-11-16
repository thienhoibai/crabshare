/* Tab Lưu nuôi của một Lô (WF-05, BR-104…111, 120–128): sơ đồ hộp là chính, bấm một hộp để xem con cua hoặc xếp cua vào hộp trống.
   GET /api/batches/{code}/holding, /boxes, /crab-units. Xếp hộp và thả bù ở AssignBoxDialog; sự kiện và chuyển hộp ở CrabDetailModal.
   Danh sách từng con và thông tin đợt lưu nuôi nằm trong khối gấp. */
import { useState } from 'react'
import { PackagePlus } from 'lucide-react'
import type { BoxStateResponse, CrabUnitResponse, HoldingResponse } from '../../../../shared/api/api.gen'
import {
  Input, OpBadge, OpBtn, OpEmpty, OpFacts, OpKv, OpMore, OpPanel, OpTable, QueryView, Select, StatusBadge, formatDate, formatDateTime, label, options, useGet,
} from '../../../../shared/ui/console'
import { boxPlace, holdingStatusLabel } from '../../opA'
import Pager from '../../Pager'
import type { BatchTabProps } from '../types'
import AssignBoxDialog from './AssignBoxDialog'
import CrabDetailModal from './CrabDetailModal'

const CAN_BOX = ['Sourcing', 'InProduction']
const PAGE_SIZE = 25

const boxClass = (b: BoxStateResponse, needsRestock: boolean) =>
  needsRestock ? 'is-alert'
    : !b.crabCode ? 'is-empty'
      : b.crabCondition === 'Weak' || b.crabCondition === 'Molting' ? 'is-warn'
        : 'is-occupied'

export default function HoldingTab({ code, batch: b }: BatchTabProps) {
  const api = `/api/batches/${encodeURIComponent(code)}`
  const holding = useGet<HoldingResponse>(`${api}/holding`, undefined, { retry: false })
  const boxes = useGet<BoxStateResponse[]>(`${api}/boxes`)
  const crabs = useGet<CrabUnitResponse[]>(`${api}/crab-units`)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [viewing, setViewing] = useState<string | null>(null)
  const [assigning, setAssigning] = useState<{ slot?: string; replaces?: string } | null>(null)

  const canBox = CAN_BOX.includes(b.status)
  const all = crabs.data ?? []
  const replacedCodes = new Set(all.map((c) => c.replacesCrabCode).filter(Boolean) as string[])
  // Hộp có con đã chết mà chưa thả bù: hộp cuối cùng của con đó.
  const restockSlots = new Map(all
    .filter((c) => c.inventoryStatus === 'Dead' && c.boxes.length > 0 && !replacedCodes.has(c.crabCode))
    .map((c) => [c.boxes[c.boxes.length - 1].slotCode, c.crabCode]))
  const waiting = all.filter((c) => c.inventoryStatus === 'Received').length
  const term = search.trim().toUpperCase()
  const shown = all.filter((c) => (!status || c.inventoryStatus === status) && (!term || c.crabCode.includes(term) || (c.currentSlotCode ?? '').includes(term)))
  const h = holding.data

  return (
    <>
      <OpFacts items={[
        { label: 'Đang ở hộp', value: `${h?.boxed ?? all.filter((c) => c.inventoryStatus === 'Holding').length} con`, tone: 'ok' },
        { label: 'Chờ xếp hộp', value: `${waiting} con`, tone: waiting ? 'info' : undefined },
        { label: 'Đã chết', value: `${h?.dead ?? all.filter((c) => c.inventoryStatus === 'Dead').length} con`, tone: h?.dead ? 'danger' : undefined },
        { label: 'Đã thả bù', value: h ? `${h.restocked} / ${h.maxRestock}` : '—', tone: h && h.maxRestock > 0 && h.restocked >= h.maxRestock ? 'warn' : undefined },
      ]} />

      <OpPanel
        title="Hộp của Lô"
        subtitle="Bấm hộp có cua để xem, ghi sự kiện hoặc chuyển hộp. Bấm hộp trống để xếp cua. Hộp đỏ có cua chết chưa thả bù."
        action={canBox && waiting > 0 && <OpBtn sm onClick={() => setAssigning({})}><PackagePlus size={15} /> Xếp cua vào hộp</OpBtn>}
      >
        <QueryView query={boxes}>
          {(rows) => rows.length === 0 ? (
            <OpEmpty title="Lô chưa dùng hộp nào">
              {canBox && waiting > 0 ? <OpBtn variant="ghost" sm onClick={() => setAssigning({})}>Xếp con cua đầu tiên</OpBtn> : 'Cua vào tồn sau khi kiểm đầu vào đạt.'}
            </OpEmpty>
          ) : (
            <div className="op-boxes">
              {rows.map((box) => {
                const deadCrab = restockSlots.get(box.slotCode)
                const needsRestock = !box.crabCode && !!deadCrab
                return (
                  <button
                    key={box.slotCode}
                    type="button"
                    className={boxClass(box, needsRestock)}
                    title={[boxPlace(box), box.crabCode ?? (needsRestock ? `Cua ${deadCrab} đã chết` : 'Trống')].filter(Boolean).join(' · ')}
                    onClick={() => (box.crabCode ? setViewing(box.crabCode) : needsRestock && deadCrab ? setViewing(deadCrab) : canBox ? setAssigning({ slot: box.slotCode }) : undefined)}
                  >
                    {box.slotCode}
                    <small>{box.crabCode ? label('crabCondition', box.crabCondition) : needsRestock ? 'Chết' : 'Trống'}</small>
                  </button>
                )
              })}
            </div>
          )}
        </QueryView>

        {all.length > 0 && (
          <OpMore label="Từng con cua" count={all.length}>
            <div className="op-toolbar">
              <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Lọc theo trạng thái">
                <option value="">Mọi trạng thái</option>
                {options('crabInventory').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
              <Input className="op-toolbar__grow" type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Mã cua hoặc số hộp" aria-label="Tìm con cua" />
            </div>
            <OpTable
              rows={shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
              rowKey={(c) => c.crabCode}
              onRowClick={(c) => setViewing(c.crabCode)}
              empty="Không có con cua nào khớp bộ lọc"
              columns={[
                { key: 'code', header: 'Mã cua', cell: (c) => <><b className="op-mono">{c.crabCode}</b>{c.replacesCrabCode && <><br /><small className="rd-muted">Thả bù</small></>}</> },
                { key: 'box', header: 'Hộp', cell: (c) => c.currentSlotCode ?? '—' },
                { key: 'weight', header: 'Lúc nhận', num: true, cell: (c) => `${c.receivedWeightG} g` },
                { key: 'condition', header: 'Tình trạng', cell: (c) => <StatusBadge kind="crabCondition" value={c.condition} /> },
                { key: 'status', header: 'Trạng thái', cell: (c) => <StatusBadge kind="crabInventory" value={c.inventoryStatus} /> },
              ]}
            />
            <Pager page={page} pageSize={PAGE_SIZE} total={shown.length} unit="con" onChange={setPage} />
          </OpMore>
        )}

        {h && (
          <OpMore label="Đợt lưu nuôi">
            <div className="op-inline"><OpBadge tone={h.status === 'Active' ? 'ok' : 'info'}>{holdingStatusLabel(h.status)}</OpBadge></div>
            <OpKv items={[
              { label: 'Ngày thả đầu tiên', value: formatDate(h.stockedAt) },
              { label: 'Dự kiến kết thúc', value: formatDate(h.expectedEndDate) },
              { label: 'Kết thúc thực tế', value: formatDateTime(h.actualEndAt) },
              { label: 'Hạn thả bù', value: `${b.restockCutoffDays} ngày đầu` },
              { label: 'Đã nhận vào tồn', value: `${h.received} con` },
              { label: 'Cách nuôi', value: h.method },
              { label: 'Mã đợt', value: <span className="op-mono">{h.holdingCode}</span> },
            ]} />
          </OpMore>
        )}
      </OpPanel>

      {viewing && (
        <CrabDetailModal
          crabCode={viewing}
          boxes={boxes.data ?? []}
          replaced={replacedCodes.has(viewing)}
          canRestock={canBox}
          onRestock={(dead) => { setViewing(null); setAssigning({ replaces: dead }) }}
          onClose={() => setViewing(null)}
        />
      )}
      {assigning && (
        <AssignBoxDialog code={code} boxes={boxes.data ?? []} crabs={all} presetSlot={assigning.slot} presetReplaces={assigning.replaces} onClose={() => setAssigning(null)} />
      )}
    </>
  )
}
