import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpHeading, OpModal, OpPanel } from './operatorUi'
import { useOperatorApplication } from './operatorsApi'
import { useAuthStore } from '../../shared/auth/authStore'
import { errorMessage } from '../../shared/api/http'
import { boxLabels, createBox, createBoxRange, listBoxes, updateBox, type Box } from './boxesApi'

function CreateBoxes({ mode, onClose, onCreated }: { mode: 'single' | 'range'; onClose: () => void; onCreated: (message: string) => void }) {
  const [from, setFrom] = useState('1')
  const [to, setTo] = useState('1200')
  const [width, setWidth] = useState('4')
  const [code, setCode] = useState('')
  const [row, setRow] = useState('')
  const [rack, setRack] = useState('')
  const [tier, setTier] = useState('')
  const [column, setColumn] = useState('')
  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'range') {
        const result = await createBoxRange({ from: Number(from), to: Number(to), width: Number(width) })
        return `Đã tạo ${result.created.toLocaleString('vi-VN')} hộp (${result.from}–${result.to}).`
      }
      const result = await createBox({ slotCode: code.trim(), rowCode: row.trim() || null, rackNo: rack ? Number(rack) : null, tierNo: tier ? Number(tier) : null, columnNo: column ? Number(column) : null })
      return `Đã tạo hộp ${result.slotCode}.`
    },
    onSuccess: onCreated,
  })
  const validRange = Number(to) >= Number(from)
  function submit(event: FormEvent) { event.preventDefault(); if (!mutation.isPending && (mode === 'single' || validRange)) mutation.mutate() }
  return <OpModal title={mode === 'range' ? 'Tạo hàng loạt' : 'Thêm hộp'} onClose={() => { if (!mutation.isPending) onClose() }}>
    <form onSubmit={submit} className="op-box-form">
      <fieldset disabled={mutation.isPending} className="op-box-fields">
        {mode === 'range' ? <>
          <label className="op-field">Từ số<input className="op-input" type="number" min="1" max="2147483647" required value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label className="op-field">Đến số<input className="op-input" type="number" min={from || 1} max="2147483647" required value={to} onChange={e => setTo(e.target.value)} /></label>
          <label className="op-field">Số chữ số<input className="op-input" type="number" min="1" max="30" required value={width} onChange={e => setWidth(e.target.value)} /></label>
          <p className="op-muted">Ví dụ: 1 đến 1200, 4 chữ số → 0001…1200. Toàn bộ dãy phải chưa tồn tại và nằm trong sức chứa được duyệt.</p>
        </> : <>
          <label className="op-field">Số hộp<input className="op-input" maxLength={30} pattern="[A-Za-z0-9 _-]+" required value={code} onChange={e => setCode(e.target.value)} /></label>
          <label className="op-field">Dãy (tuỳ chọn)<input className="op-input" maxLength={10} pattern="[A-Za-z0-9 _-]+" value={row} onChange={e => setRow(e.target.value)} /></label>
          <div className="op-box-layout">
            <label className="op-field">Kệ (tuỳ chọn)<input className="op-input" type="number" min="1" max="32767" value={rack} onChange={e => setRack(e.target.value)} /></label>
            <label className="op-field">Tầng (tuỳ chọn)<input className="op-input" type="number" min="1" max="32767" value={tier} onChange={e => setTier(e.target.value)} /></label>
            <label className="op-field">Cột (tuỳ chọn)<input className="op-input" type="number" min="1" max="32767" value={column} onChange={e => setColumn(e.target.value)} /></label>
          </div>
        </>}
      </fieldset>
      {mutation.isError && <p role="alert">{errorMessage(mutation.error)}</p>}
      <OpBtn type="submit" disabled={mutation.isPending || (mode === 'range' ? !validRange : !code.trim())}>{mutation.isPending ? 'Đang tạo…' : 'Tạo hộp'}</OpBtn>
    </form>
  </OpModal>
}

function BoxDetail({ box, canManage, onClose, onUpdated }: { box: Box; canManage: boolean; onClose: () => void; onUpdated: () => void }) {
  const mutation = useMutation({ mutationFn: () => updateBox(box.slotCode, box.status === 'Available' ? 'Maintenance' : 'Available'), onSuccess: onUpdated })
  return <OpModal title={`Hộp ${box.slotCode}`} onClose={() => { if (!mutation.isPending) onClose() }}>
    <OpBadge tone={box.status === 'Available' ? 'ok' : box.status === 'Maintenance' ? 'warn' : 'info'}>{boxLabels[box.status]}</OpBadge>
    <dl className="op-facts">
      <div><dt>Dãy</dt><dd>{box.rowCode || '—'}</dd></div>
      <div><dt>Kệ</dt><dd>{box.rackNo ?? '—'}</dd></div>
      <div><dt>Tầng</dt><dd>{box.tierNo ?? '—'}</dd></div>
      <div><dt>Cột</dt><dd>{box.columnNo ?? '—'}</dd></div>
    </dl>
    {mutation.isError && <p role="alert">{errorMessage(mutation.error)}</p>}
    {canManage && box.status !== 'Occupied' && <OpBtn disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Đang lưu…' : box.status === 'Available' ? 'Chuyển bảo trì' : 'Chuyển sẵn sàng'}</OpBtn>}
    {box.status === 'Occupied' && <p className="op-muted">Hộp đang nuôi, cần giải phóng trước khi bảo trì.</p>}
  </OpModal>
}

export default function OperatorFarmMap() {
  const application = useOperatorApplication()
  const userId = useAuthStore(s => s.user?.userId)
  const qc = useQueryClient()
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [mode, setMode] = useState<'range' | 'single' | null>(null)
  const [selected, setSelected] = useState<Box | null>(null)
  const [message, setMessage] = useState('')
  const boxes = useQuery({ queryKey: ['boxes', userId, status, search.trim(), page], queryFn: ({ signal }) => listBoxes(status, search, page, signal), retry: false })
  const canManage = application.data?.memberRole === 'Owner' && application.data.status === 'Approved'
  const totalPages = Math.max(1, Math.ceil((boxes.data?.total ?? 0) / 50))
  useEffect(() => {
    if (boxes.isSuccess && !boxes.isFetching && page > totalPages) setPage(totalPages)
  }, [boxes.isSuccess, boxes.isFetching, page, totalPages])
  function refresh() { void qc.invalidateQueries({ queryKey: ['boxes', userId] }) }
  return <OperatorLayout activeTab="boxes">
    <OpHeading eyebrow="Vận hành" title="Hộp nuôi" description="Đánh số hộp theo nhãn tại trại. Dãy, kệ, tầng và cột là thông tin tuỳ chọn." action={canManage && <><OpBtn variant="ghost" onClick={() => setMode('single')}>Thêm hộp</OpBtn><OpBtn onClick={() => setMode('range')}>Tạo hàng loạt</OpBtn></>} />
    {message && <p role="status">{message}</p>}
    <OpPanel title="Danh sách hộp" subtitle={boxes.data ? `${boxes.data.total.toLocaleString('vi-VN')} hộp phù hợp` : undefined}>
      <div className="op-box-filters">
        <label className="op-field">Tìm số hộp<input className="op-input" type="search" maxLength={30} placeholder="Ví dụ: 0001" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} /></label>
        <label className="op-field">Trạng thái hộp<select className="op-select" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">Tất cả</option>{Object.entries(boxLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {boxes.isPending && <p role="status">Đang tải hộp nuôi…</p>}
      {boxes.isError && <div role="alert"><p>{errorMessage(boxes.error)}</p><OpBtn variant="ghost" onClick={() => void boxes.refetch()}>Thử lại</OpBtn></div>}
      {boxes.isSuccess && <>
        {!boxes.data.items.length && <p>Không có hộp phù hợp.</p>}
        <div className="op-slots" aria-label="Lưới hộp nuôi">{boxes.data.items.map(box => <button type="button" key={box.slotCode} className={`op-slot op-box is-${box.status.toLowerCase()}`} onClick={() => setSelected(box)} aria-label={`Hộp ${box.slotCode}, ${boxLabels[box.status]}`}><b>{box.slotCode}</b><small>{boxLabels[box.status]}</small></button>)}</div>
        {totalPages > 1 && <div className="op-pager"><span>Trang {page} / {totalPages}</span><div><button className="rd-iconbtn" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={18} /></button><button className="rd-iconbtn" aria-label="Trang sau" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={18} /></button></div></div>}
      </>}
    </OpPanel>
    {mode && <CreateBoxes mode={mode} onClose={() => setMode(null)} onCreated={result => { setMode(null); setMessage(result); setPage(1); refresh() }} />}
    {selected && <BoxDetail box={selected} canManage={canManage} onClose={() => setSelected(null)} onUpdated={() => { setSelected(null); setMessage('Đã cập nhật trạng thái hộp.'); refresh() }} />}
  </OperatorLayout>
}
