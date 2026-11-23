import { useState } from 'react'
import type { BatchResponse, CrabUnitResponse, GradeAiLabelsRequest, GradeAiLabelsResponse,
  OpenSessionRequest, SessionResponse } from '../../../shared/api/api.gen'
import { Field, Input, OpBtn, OpNote, useGet, useSend } from '../../../shared/ui/console'

function tagNumber(tag: string | null | undefined, prefix: string): number | null {
  if (!tag?.startsWith(`${prefix}-`)) return null
  const suffix = tag.slice(prefix.length + 1)
  return /^\d{3,6}$/.test(suffix) && Number(suffix) > 0 ? Number(suffix) : null
}

export function GradeAiOpenSessionForm({ batch, stationCode, measured, activeOpen, onOpened }: {
  batch: BatchResponse
  stationCode: string
  measured: Set<string>
  activeOpen?: SessionResponse
  onOpened: (no: string) => void
}) {
  const batchPath = `/api/batches/${encodeURIComponent(batch.batchCode)}`
  const crabs = useGet<CrabUnitResponse[]>(`${batchPath}/crab-units`, { status: batch.hasHolding ? 'Holding' : 'Received' })
  const [draftPrefix, setDraftPrefix] = useState<string>()
  const [number, setNumber] = useState('')
  const [review, setReview] = useState(false)
  const assign = useSend<GradeAiLabelsResponse, GradeAiLabelsRequest>('post', `${batchPath}/gradeai-labels`, {
    success: (result) => `Đã chuẩn bị ${result.assigned} mã cua.`,
    onSuccess: () => { setReview(false); void crabs.refetch() },
  })
  const open = useSend<SessionResponse, OpenSessionRequest>('post', '/api/measurement-sessions', {
    onSuccess: (result) => { setNumber(''); onOpened(result.sessionNo) },
  })

  const units = crabs.data ?? []
  const fixed = units.find((unit) => unit.gradeAiPrefix)?.gradeAiPrefix
  const prefix = (fixed ?? draftPrefix ?? batch.batchCode).trim().toUpperCase()
  const validPrefix = /^[A-Z][A-Z0-9-]{0,15}$/.test(prefix)
  const taken = new Set(units.flatMap((unit) => tagNumber(unit.gradeAiTag, prefix) ?? []))
  let next = 1
  const labels = units.filter((unit) => !unit.gradeAiTag && !measured.has(unit.crabCode))
    .sort((a, b) => a.crabCode.localeCompare(b.crabCode)).map((unit) => {
      while (taken.has(next)) next += 1
      return { crabCode: unit.crabCode, crabNumber: next++ }
    })
  const codeFor = (suffix: number) => `${prefix}-${String(suffix).padStart(3, '0')}`
  const value = /^\d{1,6}$/.test(number) ? Number(number) : 0
  const selected = value > 0 ? units.find((unit) => unit.gradeAiTag === codeFor(value)) : undefined
  const alreadyMeasured = !!selected && measured.has(selected.crabCode)

  if (activeOpen) return <OpNote>Lượt {activeOpen.sessionNo} đang mở cho {activeOpen.gradeAiTag ?? activeOpen.crabCode}.</OpNote>
  if (crabs.isPending) return <OpNote>Đang đọc danh sách cua…</OpNote>
  if (crabs.isError) return <OpNote tone="danger">Không đọc được cua trong lô. <button type="button" className="op-link" onClick={() => void crabs.refetch()}>Thử lại</button></OpNote>
  if (!units.length) return <OpNote>Chưa có cua đủ điều kiện để cân trong lô này.</OpNote>

  return (
    <div className="ga-label-form">
      <Field label="Mã đầu lô" hint="Dùng chung cho các mã cua trong lô.">
        <Input value={fixed ?? draftPrefix ?? batch.batchCode} onChange={(e) => { setDraftPrefix(e.target.value); setReview(false) }}
          readOnly={!!fixed} maxLength={16} />
      </Field>
      {labels.length > 0 && (
        <div>
          <OpBtn type="button" variant="outline" disabled={!validPrefix || assign.isPending || labels.length > 2000}
            onClick={() => setReview(!review)}>{review ? 'Đóng danh sách' : `Xem ${labels.length} mã cần gắn`}</OpBtn>
          {review && (
            <div>
              <p>Đối chiếu mã kiểm kê với mã GradeAI trước khi xác nhận.</p>
              <ul className="ga-label-list">
                {labels.map((item) => <li key={item.crabCode}>{item.crabCode} → {codeFor(item.crabNumber)}</li>)}
              </ul>
              <OpBtn type="button" disabled={assign.isPending} onClick={() => assign.mutate({ prefix, labels })}>
                {assign.isPending ? 'Đang lưu…' : 'Xác nhận gắn mã'}
              </OpBtn>
            </div>
          )}
        </div>
      )}
      <form onSubmit={(event) => {
        event.preventDefault()
        if (selected && !alreadyMeasured && !open.isPending && !assign.isPending) {
          open.mutate({ batchCode: batch.batchCode, gradeAiPrefix: prefix, crabNumber: value, stationCode })
        }
      }}>
        <Field label="Số thứ tự cua" hint={alreadyMeasured ? 'Mã đã có kết quả cân.' : selected ? `${selected.gradeAiTag} · kiểm kê ${selected.crabCode}` : 'Nhập số của mã đã gắn, ví dụ 012.'}>
          <Input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" maxLength={6} />
        </Field>
        <OpBtn type="submit" disabled={!selected || alreadyMeasured || open.isPending || assign.isPending}>
          {open.isPending ? 'Đang mở lượt…' : 'Mở lượt đo'}
        </OpBtn>
      </form>
    </div>
  )
}
