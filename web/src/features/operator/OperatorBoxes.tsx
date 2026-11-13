/* /operator/boxes — Hộp nuôi của trại (UC44): GET /api/boxes?status=&search=&batchCode=, POST /api/boxes, POST /api/boxes/range,
   PATCH /api/boxes/{slotCode}. Mỗi hộp nuôi một con; vị trí dàn, tầng, cột là tuỳ chọn (camera chạy dàn cần ba số này).
   Tổng số hộp không vượt sức chứa Admin đã duyệt. Bấm một hộp để xem và đổi trạng thái bảo trì. */
import { useState } from 'react'
import { ListPlus, Plus } from 'lucide-react'
import type { BoxRangeRequest, CreateBoxRequest, PagedResultOfBatchResponse, UpdateBoxRequest } from '../../shared/api/api.gen'
import {
  Field, Input, NumberInput, OpBtn, OpConfirm, OpEmpty, OpFacts, OpHeading, OpKv, OpModal, OpMore, OpPanel, QueryView, Select, StatusBadge, formatDateTime,
  label, options, useGet, useSend,
} from '../../shared/ui/console'
import { boxPlace, isEnded, num, type FarmBox, type FarmBoxPage } from './opA'
import Pager from './Pager'

const PAGE_SIZE = 100
const boxClass = (status: string) => (status === 'Occupied' ? 'is-occupied' : status === 'Maintenance' ? 'is-warn' : 'is-empty')

function AddBoxDialog({ onClose }: { onClose: () => void }) {
  const [slotCode, setSlotCode] = useState('')
  const [rowCode, setRowCode] = useState('')
  const [rackNo, setRackNo] = useState<number | null>(null)
  const [tierNo, setTierNo] = useState<number | null>(null)
  const [columnNo, setColumnNo] = useState<number | null>(null)
  const create = useSend<FarmBox, CreateBoxRequest>('post', '/api/boxes', { success: (b) => `Đã thêm hộp ${b.slotCode}.`, onSuccess: onClose, quietError: true })
  const codeOk = /^[A-Za-z0-9 _-]+$/.test(slotCode.trim())
  return (
    <OpConfirm
      title="Thêm một hộp"
      confirmLabel="Thêm"
      pending={create.isPending}
      error={create.error}
      disabled={!codeOk}
      onClose={onClose}
      onConfirm={() => create.mutate({ slotCode: slotCode.trim(), rowCode: rowCode.trim() || null, rackNo, tierNo, columnNo })}
    >
      <Field label="Số hộp" required error={slotCode && !codeOk ? 'Chỉ dùng chữ, số, gạch ngang.' : undefined}>
        <Input value={slotCode} maxLength={30} onChange={(e) => setSlotCode(e.target.value)} placeholder="1741" autoFocus />
      </Field>
      <OpMore label="Vị trí trên dàn">
        <div className="op-form__row">
          <Field label="Dàn"><NumberInput value={rackNo} max={32767} onChange={setRackNo} /></Field>
          <Field label="Tầng"><NumberInput value={tierNo} max={32767} onChange={setTierNo} /></Field>
          <Field label="Cột"><NumberInput value={columnNo} max={32767} onChange={setColumnNo} /></Field>
          <Field label="Dãy"><Input value={rowCode} maxLength={10} onChange={(e) => setRowCode(e.target.value)} /></Field>
        </div>
      </OpMore>
    </OpConfirm>
  )
}

function RangeDialog({ onClose }: { onClose: () => void }) {
  const [from, setFrom] = useState<number | null>(null)
  const [to, setTo] = useState<number | null>(null)
  const [width, setWidth] = useState<number | null>(4)
  const create = useSend<{ created: number; from: string; to: string }, BoxRangeRequest>('post', '/api/boxes/range', {
    success: (r) => `Đã tạo ${r.created} hộp, từ ${r.from} tới ${r.to}.`, onSuccess: onClose, quietError: true,
  })
  const valid = !!from && !!to && to >= from && !!width && width <= 30
  const pad = (n: number) => String(n).padStart(width ?? 4, '0')
  return (
    <OpConfirm
      title="Đánh số nhiều hộp"
      sub={valid ? `Từ ${pad(from ?? 0)} tới ${pad(to ?? 0)}` : undefined}
      confirmLabel={valid ? `Tạo ${num((to ?? 0) - (from ?? 0) + 1)} hộp` : 'Tạo hộp'}
      pending={create.isPending}
      error={create.error}
      disabled={!valid}
      onClose={onClose}
      onConfirm={() => create.mutate({ from: from ?? 0, to: to ?? 0, width: width ?? 4 })}
    >
      <div className="op-form__row">
        <Field label="Từ số" required><NumberInput value={from} onChange={setFrom} /></Field>
        <Field label="Đến số" required error={from && to && to < from ? 'Phải từ số đầu trở lên.' : undefined}><NumberInput value={to} onChange={setTo} /></Field>
      </div>
      <OpMore label="Tuỳ chọn thêm">
        <Field label="Số chữ số" hint="Thêm số 0 ở đầu cho đủ"><NumberInput value={width} max={30} onChange={setWidth} /></Field>
      </OpMore>
    </OpConfirm>
  )
}

function BoxDialog({ box, onClose }: { box: FarmBox; onClose: () => void }) {
  const next = box.status === 'Available' ? 'Maintenance' : 'Available'
  const update = useSend<FarmBox, UpdateBoxRequest>('patch', `/api/boxes/${encodeURIComponent(box.slotCode)}`, {
    success: next === 'Maintenance' ? `Hộp ${box.slotCode} chuyển sang bảo trì.` : `Hộp ${box.slotCode} dùng lại được.`, onSuccess: onClose, quietError: true,
  })
  const facts = (
    <OpKv items={[
      { label: 'Trạng thái', value: <StatusBadge kind="box" value={box.status} /> },
      { label: 'Vị trí', value: [boxPlace(box), box.rowCode ? `dãy ${box.rowCode}` : ''].filter(Boolean).join(' · ') },
      { label: 'Lô đang dùng', value: box.batchCode ? <a className="op-link" href={`/operator/batches/${encodeURIComponent(box.batchCode)}/luu-nuoi`}>{box.batchCode}</a> : null },
      { label: 'Ảnh gần nhất', value: box.latestEvidence ? <>{formatDateTime(box.latestEvidence.receivedAt)} · {label('evidence', box.latestEvidence.reviewStatus)}</> : null },
    ]} />
  )
  // Hộp đang thuộc một Lô thì API không cho đổi trạng thái.
  if (box.status === 'Occupied' || box.batchCode) return <OpModal title={`Hộp ${box.slotCode}`} onClose={onClose}>{facts}</OpModal>
  return (
    <OpConfirm
      title={`Hộp ${box.slotCode}`}
      confirmLabel={next === 'Maintenance' ? 'Chuyển sang bảo trì' : 'Dùng lại hộp'}
      variant={next === 'Maintenance' ? 'ink' : 'primary'}
      pending={update.isPending}
      error={update.error}
      onClose={onClose}
      onConfirm={() => update.mutate({ status: next })}
    >
      {facts}
    </OpConfirm>
  )
}

export default function OperatorBoxes() {
  const [status, setStatus] = useState('')
  const [batchCode, setBatchCode] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState<'add' | 'range' | null>(null)
  const [selected, setSelected] = useState<FarmBox | null>(null)
  const boxes = useGet<FarmBoxPage>('/api/boxes', { status, batchCode, search: search.trim(), page, pageSize: PAGE_SIZE })
  const total = useGet<FarmBoxPage>('/api/boxes', { pageSize: 1 })
  const available = useGet<FarmBoxPage>('/api/boxes', { status: 'Available', pageSize: 1 })
  const occupied = useGet<FarmBoxPage>('/api/boxes', { status: 'Occupied', pageSize: 1 })
  const maintenance = useGet<FarmBoxPage>('/api/boxes', { status: 'Maintenance', pageSize: 1 })
  const batches = useGet<PagedResultOfBatchResponse>('/api/operators/me/batches', { pageSize: 100 })
  const filtered = !!status || !!batchCode || !!search.trim()
  const reset = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setPage(1) }

  return (
    <>
      <OpHeading
        eyebrow="Vận hành"
        title="Hộp nuôi"
        action={
          <>
            <OpBtn variant="ghost" onClick={() => setDialog('add')}><Plus size={16} /> Thêm một hộp</OpBtn>
            <OpBtn onClick={() => setDialog('range')}><ListPlus size={16} /> Đánh số nhiều hộp</OpBtn>
          </>
        }
      />

      <OpFacts items={[
        { label: 'Tổng số hộp', value: num(total.data?.total) },
        { label: 'Đang có cua', value: num(occupied.data?.total), tone: 'ok' },
        { label: 'Trống', value: num(available.data?.total) },
        { label: 'Bảo trì', value: num(maintenance.data?.total), tone: maintenance.data?.total ? 'warn' : undefined },
      ]} />

      <div className="op-toolbar">
        <Select value={status} onChange={(e) => reset(setStatus)(e.target.value)} aria-label="Lọc theo trạng thái hộp">
          <option value="">Mọi trạng thái</option>
          {options('box').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select value={batchCode} onChange={(e) => reset(setBatchCode)(e.target.value)} aria-label="Lọc theo Lô đang dùng">
          <option value="">Mọi Lô</option>
          {(batches.data?.items ?? []).filter((b) => b.hasHolding && !isEnded(b.status)).map((b) => <option key={b.batchCode} value={b.batchCode}>{b.batchCode}</option>)}
        </Select>
        <Input className="op-toolbar__grow" type="search" value={search} onChange={(e) => reset(setSearch)(e.target.value)} placeholder="Tìm số hộp" aria-label="Tìm hộp" />
      </div>

      <QueryView query={boxes}>
        {(data) => data.items.length === 0 ? (
          <OpEmpty title={filtered ? 'Không có hộp nào khớp bộ lọc' : 'Trại chưa có hộp nào'}>
            {!filtered && <OpBtn variant="ghost" sm onClick={() => setDialog('range')}><ListPlus size={15} /> Đánh số nhiều hộp</OpBtn>}
          </OpEmpty>
        ) : (
          <OpPanel>
            <div className="op-boxes">
              {data.items.map((box) => (
                <button key={box.slotCode} type="button" className={boxClass(box.status)} title={[label('box', box.status), boxPlace(box), box.batchCode ?? ''].filter(Boolean).join(' · ')} onClick={() => setSelected(box)}>
                  {box.slotCode}
                  <small>{box.status === 'Maintenance' ? 'Bảo trì' : box.batchCode ?? 'Trống'}</small>
                </button>
              ))}
            </div>
            <Pager page={data.page} pageSize={PAGE_SIZE} total={data.total} unit="hộp" onChange={setPage} />
          </OpPanel>
        )}
      </QueryView>

      {dialog === 'add' && <AddBoxDialog onClose={() => setDialog(null)} />}
      {dialog === 'range' && <RangeDialog onClose={() => setDialog(null)} />}
      {selected && <BoxDialog box={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
