/* Xếp một con cua vừa nhận vào hộp trống kèm ảnh hộp, hoặc thả bù thay một con đã chết trong đúng hộp đó (BR-106…108, BR-120, BR-121).
   Ảnh gửi trước qua POST /api/evidence để lấy mã bằng chứng, rồi POST /api/batches/{code}/box-assignments { crabCode, slotCode, evidenceId, replacesCrabCode }. */
import { useState } from 'react'
import type { BoxRequest, BoxStateResponse, CrabUnitResponse } from '../../../../shared/api/api.gen'
import { Field, OpConfirm, OpNote, OpPhoto, RadioCards, Select, http, useGet } from '../../../../shared/ui/console'
import { actionError, boxPlace, useAction, usePhotoUpload, type FarmBoxPage } from '../../opA'

type Mode = 'stock' | 'restock'

export default function AssignBoxDialog({ code, boxes, crabs, presetSlot, presetReplaces, onClose }: {
  code: string
  boxes: BoxStateResponse[]
  crabs: CrabUnitResponse[]
  presetSlot?: string
  presetReplaces?: string
  onClose: () => void
}) {
  const farmBoxes = useGet<FarmBoxPage>('/api/boxes', { status: 'Available', pageSize: 100 })
  const waiting = crabs.filter((c) => c.inventoryStatus === 'Received')
  // Con đã chết mà chưa có con nào thả bù thay; hộp thả bù là hộp cuối cùng con đó đã ở.
  const unreplaced = crabs.filter((c) => c.inventoryStatus === 'Dead' && c.boxes.length > 0 && !crabs.some((n) => n.replacesCrabCode === c.crabCode))
  const [mode, setMode] = useState<Mode>(presetReplaces ? 'restock' : 'stock')
  const [pickedCrab, setCrabCode] = useState('')
  const [slotCode, setSlotCode] = useState(presetSlot ?? '')
  const [pickedDead, setReplaces] = useState(presetReplaces ?? '')
  const [photo, setPhoto] = useState<File | null>(null)
  const upload = usePhotoUpload()

  // Chưa chọn thì lấy dòng đầu của danh sách, đúng như ô chọn đang hiện.
  const crabCode = pickedCrab || waiting[0]?.crabCode || ''
  const replaces = pickedDead || unreplaced[0]?.crabCode || ''
  const dead = unreplaced.find((c) => c.crabCode === replaces)
  const targetSlot = mode === 'restock' ? dead?.boxes[dead.boxes.length - 1]?.slotCode ?? '' : slotCode
  const emptyOfBatch = boxes.filter((b) => !b.crabCode && b.slotStatus !== 'Maintenance')
  const emptyOfFarm = (farmBoxes.data?.items ?? []).filter((b) => !emptyOfBatch.some((x) => x.slotCode === b.slotCode))
  const option = (b: { slotCode: string; rackNo: number | null; tierNo: number | null; columnNo: number | null }) =>
    <option key={b.slotCode} value={b.slotCode}>{b.slotCode}{boxPlace(b) ? ` · ${boxPlace(b)}` : ''}</option>

  const assign = useAction(async () => {
    const evidenceId = await upload({ batchCode: code, slotCode: targetSlot, image: photo, boxing: true })
    const body: BoxRequest = { crabCode, slotCode: targetSlot, evidenceId, replacesCrabCode: mode === 'restock' ? replaces : null }
    return (await http.post<CrabUnitResponse>(`/api/batches/${encodeURIComponent(code)}/box-assignments`, body)).data
  }, { success: mode === 'restock' ? 'Đã thả bù vào hộp.' : 'Đã xếp cua vào hộp.', onSuccess: onClose })

  return (
    <OpConfirm
      title={mode === 'restock' ? 'Thả bù' : 'Xếp cua vào hộp'}
      sub={targetSlot ? `Hộp ${targetSlot}` : undefined}
      confirmLabel={mode === 'restock' ? 'Thả bù' : 'Xếp vào hộp'}
      pending={assign.isPending}
      disabled={!crabCode || !targetSlot || !photo}
      onClose={onClose}
      onConfirm={() => assign.mutate()}
    >
      {unreplaced.length > 0 && (
        <RadioCards<Mode> value={mode} onChange={setMode} options={[{ value: 'stock', label: 'Thả ban đầu' }, { value: 'restock', label: 'Thả bù', hint: 'Thay con đã chết' }]} />
      )}
      {waiting.length === 0 ? <OpNote tone="danger">Không còn con nào chờ xếp hộp.</OpNote> : (
        <>
          <Field label="Con cua" required>
            <Select value={crabCode} onChange={(e) => setCrabCode(e.target.value)}>
              {waiting.map((c) => <option key={c.crabCode} value={c.crabCode}>{c.crabCode} · {c.receivedWeightG} g</option>)}
            </Select>
          </Field>
          {mode === 'stock' ? (
            <Field label="Hộp trống" required>
              <Select value={slotCode} onChange={(e) => setSlotCode(e.target.value)}>
                <option value="">Chọn hộp</option>
                {emptyOfBatch.length > 0 && <optgroup label="Hộp của Lô">{emptyOfBatch.map(option)}</optgroup>}
                <optgroup label="Hộp trống của trại">{emptyOfFarm.map(option)}</optgroup>
              </Select>
            </Field>
          ) : (
            <Field label="Thay cho con đã chết" required>
              <Select value={replaces} onChange={(e) => setReplaces(e.target.value)}>
                {unreplaced.map((c) => <option key={c.crabCode} value={c.crabCode}>{c.crabCode} · hộp {c.boxes[c.boxes.length - 1]?.slotCode}</option>)}
              </Select>
            </Field>
          )}
          <OpPhoto value={photo} onChange={setPhoto} label="Chụp hộp đã có cua" />
        </>
      )}
      {assign.isError && <OpNote tone="danger">{actionError(assign.error)}</OpNote>}
    </OpConfirm>
  )
}
