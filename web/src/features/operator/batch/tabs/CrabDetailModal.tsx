/* Chi tiết một con cua (GET /api/crab-units/{crabCode}, BR-102, BR-142): trạng thái, các nút thao tác, sự kiện tồn.
   Ghi sự kiện (POST /api/crab-units/{crabCode}/events; chết phải kèm ảnh hộp, BR-127) và chuyển hộp (POST …/move, BR-128).
   Lô nguồn và các hộp đã ở nằm trong khối gấp. Mã cua là mã nội bộ trong sổ theo dõi, không in thành tem hay QR. */
import { useState } from 'react'
import { ArrowRightLeft, NotebookPen, Undo2 } from 'lucide-react'
import type { BoxStateResponse, CrabEventRequest, CrabUnitResponse, MoveRequest } from '../../../../shared/api/api.gen'
import {
  AuthImage, Field, Input, OpBadge, OpBtn, OpKv, OpModal, OpMore, OpNote, OpPhoto, OpTable, QueryView, RadioCards, Select, StatusBadge, formatDate,
  formatDateTime, http, label, useGet, useSend,
} from '../../../../shared/ui/console'
import {
  LocalError, RECORDABLE_EVENTS, actionError, boxPlace, boxReasonLabel, crabEventLabel, crabEventTone, eventSourceLabel, leaveReasonLabel, useAction,
  usePhotoUpload, type FarmBoxPage, type RecordableEvent,
} from '../../opA'

const CLOSED = ['Dead', 'Destroyed', 'Shipped', 'Delivered', 'Sold']
const evidenceImage = (id: number) => `/api/operators/me/evidence/${id}/image`

function EventForm({ crab, onBack }: { crab: CrabUnitResponse; onBack: () => void }) {
  const [eventType, setEventType] = useState<RecordableEvent>('Inspected')
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const upload = usePhotoUpload()
  const needsPhoto = eventType === 'Died'
  const record = useAction(async () => {
    let evidenceId: number | null = null
    if (needsPhoto) {
      if (!crab.currentSlotCode) throw new LocalError('Con cua không ở hộp nào nên không chụp được ảnh hộp.')
      evidenceId = await upload({ batchCode: crab.batchCode, slotCode: crab.currentSlotCode, image: photo })
    }
    const body: CrabEventRequest = { eventType, evidenceId, note: note.trim() || null }
    return (await http.post<CrabUnitResponse>(`/api/crab-units/${encodeURIComponent(crab.crabCode)}/events`, body)).data
  }, { success: 'Đã ghi sự kiện.', onSuccess: onBack })

  return (
    <form className="op-form" onSubmit={(e) => { e.preventDefault(); record.mutate() }}>
      <RadioCards<RecordableEvent> value={eventType} onChange={setEventType} options={RECORDABLE_EVENTS.map((o) => ({ ...o, disabled: o.value === 'Died' && !crab.currentSlotCode }))} />
      {needsPhoto && <OpPhoto value={photo} onChange={setPhoto} label={`Chụp hộp ${crab.currentSlotCode ?? ''}`} />}
      <Field label="Ghi chú">
        <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {record.isError && <OpNote tone="danger">{actionError(record.error)}</OpNote>}
      <div className="op-modal__foot">
        <OpBtn type="button" variant="ghost" onClick={onBack}><Undo2 size={15} /> Quay lại</OpBtn>
        <OpBtn type="submit" variant={needsPhoto ? 'danger' : 'primary'} disabled={record.isPending || (needsPhoto && !photo)}>
          {record.isPending ? 'Đang gửi…' : needsPhoto ? 'Ghi cua chết' : 'Ghi sự kiện'}
        </OpBtn>
      </div>
    </form>
  )
}

function MoveForm({ crab, boxes, onBack }: { crab: CrabUnitResponse; boxes: BoxStateResponse[]; onBack: () => void }) {
  const farmBoxes = useGet<FarmBoxPage>('/api/boxes', { status: 'Available', pageSize: 100 })
  const [slotCode, setSlotCode] = useState('')
  const [reason, setReason] = useState('')
  const move = useSend<CrabUnitResponse, MoveRequest>('post', `/api/crab-units/${encodeURIComponent(crab.crabCode)}/move`, { success: 'Đã chuyển hộp.', onSuccess: onBack, quietError: true })
  const emptyOfBatch = boxes.filter((b) => !b.crabCode && b.slotStatus !== 'Maintenance')
  const emptyOfFarm = (farmBoxes.data?.items ?? []).filter((b) => !emptyOfBatch.some((x) => x.slotCode === b.slotCode))
  const option = (b: { slotCode: string; rackNo: number | null; tierNo: number | null; columnNo: number | null }) =>
    <option key={b.slotCode} value={b.slotCode}>{b.slotCode}{boxPlace(b) ? ` · ${boxPlace(b)}` : ''}</option>
  return (
    <form className="op-form" onSubmit={(e) => { e.preventDefault(); if (slotCode) move.mutate({ slotCode, reason: reason.trim() || null }) }}>
      <Field label={`Chuyển từ hộp ${crab.currentSlotCode} sang`} required>
        <Select value={slotCode} onChange={(e) => setSlotCode(e.target.value)}>
          <option value="">Chọn hộp trống</option>
          {emptyOfBatch.length > 0 && <optgroup label="Hộp của Lô">{emptyOfBatch.map(option)}</optgroup>}
          <optgroup label="Hộp trống của trại">{emptyOfFarm.map(option)}</optgroup>
        </Select>
      </Field>
      <Field label="Lý do">
        <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Hộp rò nước, cần bảo trì" />
      </Field>
      {move.isError && <OpNote tone="danger">{actionError(move.error)}</OpNote>}
      <div className="op-modal__foot">
        <OpBtn type="button" variant="ghost" onClick={onBack}><Undo2 size={15} /> Quay lại</OpBtn>
        <OpBtn type="submit" disabled={!slotCode || move.isPending}>{move.isPending ? 'Đang gửi…' : 'Chuyển hộp'}</OpBtn>
      </div>
    </form>
  )
}

export default function CrabDetailModal({ crabCode, boxes, replaced, canRestock, onRestock, onClose }: {
  crabCode: string
  boxes: BoxStateResponse[]
  /** Con này đã chết và đã có con khác thả bù thay. */
  replaced: boolean
  canRestock: boolean
  onRestock: (deadCrabCode: string) => void
  onClose: () => void
}) {
  const crab = useGet<CrabUnitResponse>(`/api/crab-units/${encodeURIComponent(crabCode)}`)
  const [mode, setMode] = useState<'view' | 'event' | 'move'>('view')
  const title = mode === 'event' ? 'Ghi sự kiện' : mode === 'move' ? 'Chuyển hộp' : `Con cua ${crabCode}`

  return (
    <OpModal title={title} sub={mode === 'view' ? undefined : crabCode} onClose={onClose} wide>
      <QueryView query={crab}>
        {(c) => mode === 'event' ? <EventForm crab={c} onBack={() => setMode('view')} /> : mode === 'move' ? <MoveForm crab={c} boxes={boxes} onBack={() => setMode('view')} /> : (
          <div className="op-stack">
            <span className="op-inline">
              <StatusBadge kind="crabInventory" value={c.inventoryStatus} />
              <StatusBadge kind="crabCondition" value={c.condition} />
              {c.currentSlotCode && <OpBadge tone="info">Hộp {c.currentSlotCode}</OpBadge>}
              <OpBadge>{label('sex', c.sex)} · {c.receivedWeightG} g lúc nhận</OpBadge>
              {c.replacesCrabCode && <OpBadge tone="gold">Thả bù thay {c.replacesCrabCode}</OpBadge>}
            </span>
            <div className="op-actions">
              {!CLOSED.includes(c.inventoryStatus) && <OpBtn sm onClick={() => setMode('event')}><NotebookPen size={14} /> Ghi sự kiện</OpBtn>}
              {c.inventoryStatus === 'Holding' && <OpBtn variant="ghost" sm onClick={() => setMode('move')}><ArrowRightLeft size={14} /> Chuyển hộp</OpBtn>}
              {c.inventoryStatus === 'Dead' && !replaced && canRestock && c.boxes.length > 0 && <OpBtn sm onClick={() => onRestock(c.crabCode)}>Thả bù vào hộp này</OpBtn>}
            </div>

            <OpTable
              rows={[...c.events].reverse()}
              rowKey={(e, i) => `${e.eventType}-${e.occurredAt}-${i}`}
              empty="Chưa có sự kiện nào"
              columns={[
                { key: 'type', header: 'Sự kiện', cell: (e) => <OpBadge tone={crabEventTone(e.eventType)}>{crabEventLabel(e.eventType)}</OpBadge> },
                { key: 'at', header: 'Lúc', cell: (e) => <>{formatDateTime(e.occurredAt)}<br /><small className="rd-muted">{eventSourceLabel(e.source)}</small></> },
                { key: 'note', header: 'Ghi chú', cell: (e) => [e.slotCode ? `Hộp ${e.slotCode}` : '', e.reason ?? '', e.weightG !== null ? `${e.weightG} g` : ''].filter(Boolean).join(' · ') || '—' },
                { key: 'photo', header: 'Ảnh', width: 96, cell: (e) => (e.evidenceId ? <AuthImage path={evidenceImage(e.evidenceId)} alt={`Ảnh kèm sự kiện ${crabEventLabel(e.eventType)}`} square /> : '—') },
              ]}
            />

            {c.boxes.length > 0 && (
              <OpMore label="Các hộp đã ở" count={c.boxes.length}>
                <OpTable
                  rows={c.boxes}
                  rowKey={(b, i) => `${b.slotCode}-${i}`}
                  columns={[
                    { key: 'slot', header: 'Hộp', cell: (b) => <b className="op-mono">{b.slotCode}</b> },
                    { key: 'reason', header: 'Vào hộp', cell: (b) => <>{boxReasonLabel(b.reason)}<br /><small className="rd-muted">{formatDateTime(b.assignedAt)}</small></> },
                    { key: 'left', header: 'Rời hộp', cell: (b) => (b.leftAt ? <>{leaveReasonLabel(b.leaveReason)}<br /><small className="rd-muted">{formatDateTime(b.leftAt)}</small></> : <span className="op-ok">Đang ở</span>) },
                    { key: 'photo', header: 'Ảnh hộp', width: 96, cell: (b) => (b.evidenceId ? <AuthImage path={evidenceImage(b.evidenceId)} alt={`Ảnh hộp ${b.slotCode} lúc thả cua`} square /> : '—') },
                  ]}
                />
              </OpMore>
            )}
            <OpMore label="Lô nguồn">
              <OpKv items={[
                { label: 'Mã lô nguồn', value: <span className="op-mono">{c.lotCode}</span> },
                { label: 'Vùng xuất xứ', value: c.originRegion },
                { label: 'Ngày thu', value: formatDate(c.harvestedOn) },
                { label: 'Loài', value: <i>{c.species}</i> },
                { label: 'Độ trưởng thành', value: label('maturity', c.maturity) },
                { label: 'Nhận vào tồn', value: formatDateTime(c.receivedAt) },
              ]} />
            </OpMore>
          </div>
        )}
      </QueryView>
    </OpModal>
  )
}
