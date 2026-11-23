import { useEffect, useRef, useState } from 'react'
import { RotateCcw, Scale } from 'lucide-react'
import type {
  BatchResponse, CrabUnitResponse, GradeAiLabelsRequest, GradeAiLabelsResponse,
  OpenSessionRequest, SessionResponse,
} from '../../../shared/api/api.gen'
import { http, errorMessage } from '../../../shared/api/http'
import { Checkbox, Input, OpBtn, OpNote, Select, useGet, useSend } from '../../../shared/ui/console'

function tagNumber(tag: string | null | undefined, prefix: string): number | null {
  if (!tag?.toUpperCase().startsWith(`${prefix}-`)) return null
  const suffix = tag.slice(prefix.length + 1)
  return /^\d{1,6}$/.test(suffix) && Number(suffix) > 0 ? Number(suffix) : null
}

export function GradeAiOpenSessionForm({
  batch,
  stationCode,
  measured,
  activeOpen,
  onOpened,
  onInspect,
  busy = false,
}: {
  batch: BatchResponse
  stationCode: string
  measured: Set<string>
  activeOpen?: SessionResponse
  onOpened: (no: string) => void
  onInspect?: (no: string) => void
  busy?: boolean
}) {
  const batchPath = `/api/batches/${encodeURIComponent(batch.batchCode)}`
  const crabs = useGet<CrabUnitResponse[]>(`${batchPath}/crab-units`, {
    status: batch.hasHolding ? 'Holding' : 'Received',
  })

  const [startFromNumber, setStartFromNumber] = useState<number | null>(null)
  const [customDraft, setCustomDraft] = useState('')
  const [autoAdvance, setAutoAdvance] = useState(false)
  const [jumpError, setJumpError] = useState<unknown>(null)
  const [switching, setSwitching] = useState(false)
  const autoLabeledBatchRef = useRef('')
  const lastAutoOpenedTagRef = useRef('')

  const assign = useSend<GradeAiLabelsResponse, GradeAiLabelsRequest>('post', `${batchPath}/gradeai-labels`, {
    quietError: true,
    onSuccess: () => { void crabs.refetch() },
  })
  const open = useSend<SessionResponse, OpenSessionRequest>('post', '/api/measurement-sessions', {
    onSuccess: (result) => {
      void crabs.refetch()
      onOpened(result.sessionNo)
    },
  })

  const units = [...(crabs.data ?? [])].sort((a, b) => a.crabCode.localeCompare(b.crabCode))
  const prefix = (units.find(unit => unit.gradeAiPrefix)?.gradeAiPrefix ?? batch.batchCode).trim().toUpperCase()
  const codeFor = (n: number) => `${prefix}-${String(n).padStart(3, '0')}`

  const takenNumbers = new Set(units.map(unit => tagNumber(unit.gradeAiTag, prefix)).filter((n): n is number => n !== null))
  let nextNumber = 1
  const entries = units.map((unit) => {
    const parsed = tagNumber(unit.gradeAiTag, prefix)
    while (takenNumbers.has(nextNumber)) nextNumber += 1
    const num = parsed ?? nextNumber++
    takenNumbers.add(num)
    const tag = codeFor(num)
    return { unit, num, tag, isMeasured: measured.has(unit.crabCode) }
  })

  const allTagged = entries.length > 0 && entries.every((e) => e.isMeasured || e.unit.gradeAiTag?.toUpperCase() === e.tag)

  useEffect(() => {
    if (!autoAdvance || busy || !crabs.isSuccess || entries.length === 0 || allTagged || activeOpen) return
    if (assign.isPending || autoLabeledBatchRef.current === prefix) return
    autoLabeledBatchRef.current = prefix
    assign.mutate({
      prefix,
      labels: entries.filter(e => !e.isMeasured && !e.unit.gradeAiTag).map((e) => ({ crabCode: e.unit.crabCode, crabNumber: e.num })),
    })
  }, [autoAdvance, busy, crabs.isSuccess, entries, allTagged, activeOpen, assign, prefix])

  const completedNums = entries.filter((e) => e.isMeasured).map((e) => e.num)
  const lastCompletedNum = completedNums.length > 0 ? Math.max(...completedNums) : 0
  const unmeasured = entries.filter((e) => !e.isMeasured)

  const defaultNext =
    unmeasured.find((e) => e.num > lastCompletedNum) ??
    unmeasured[0] ??
    null

  const target =
    (startFromNumber !== null
      ? unmeasured.find((e) => e.num >= startFromNumber) ?? entries.find((e) => e.num === startFromNumber)
      : defaultNext) ?? defaultNext

  useEffect(() => {
    if (!autoAdvance || busy || !stationCode || activeOpen || !target || target.isMeasured) return
    if (!allTagged || open.isPending || assign.isPending || switching) return
    if (lastAutoOpenedTagRef.current === target.tag) return
    lastAutoOpenedTagRef.current = target.tag
    open.mutate({
      batchCode: batch.batchCode,
      gradeAiPrefix: prefix,
      crabNumber: target.num,
      stationCode,
      procedure: 'Station',
    })
  }, [autoAdvance, busy, stationCode, activeOpen, target, allTagged, open, assign.isPending, switching, batch.batchCode, prefix])

  async function jumpToPosition(num: number | null) {
    if (busy || switching || open.isPending) return
    setStartFromNumber(num)
    setCustomDraft(num !== null ? String(num) : '')

    const chosen =
      (num !== null
        ? unmeasured.find((e) => e.num >= num) ?? entries.find((e) => e.num === num)
        : defaultNext) ?? defaultNext

    if (!chosen || chosen.isMeasured || !stationCode) return
    if (activeOpen && activeOpen.gradeAiTag?.toUpperCase() === chosen.tag) return

    try {
      setJumpError(null)
      setSwitching(true)
      if (activeOpen && activeOpen.status === 'Open') {
        await http.post(`/api/measurement-sessions/${encodeURIComponent(activeOpen.sessionNo)}/cancel`)
      }
      lastAutoOpenedTagRef.current = chosen.tag
      open.mutate({
        crabCode: allTagged ? null : chosen.unit.crabCode,
        batchCode: batch.batchCode,
        gradeAiPrefix: prefix,
        crabNumber: chosen.num,
        stationCode,
        procedure: 'Station',
      })
    } catch (error) {
      setJumpError(error)
    } finally {
      setSwitching(false)
    }
  }

  if (crabs.isPending) return <OpNote>Đang đồng bộ danh sách cua của lô {prefix}…</OpNote>
  if (crabs.isError) {
    return (
      <OpNote tone="danger">
        Không đọc được cua trong lô.{' '}
        <button type="button" className="op-link" onClick={() => void crabs.refetch()}>
          Thử lại
        </button>
      </OpNote>
    )
  }
  if (!units.length) return <OpNote>Chưa có cua đủ điều kiện để cân trong lô này.</OpNote>

  const activeDisplayTag = activeOpen?.gradeAiTag ?? target?.tag ?? codeFor(1)
  const canManualOpen = !busy && !activeOpen && !!target && !target.isMeasured && !open.isPending && !assign.isPending && !switching

  return (
    <div className="ga-auto-single">
      <div className="ga-auto-pill" title={`Tiến độ lô: đã xong ${completedNums.length}/${entries.length} con`}>
        <b>{activeDisplayTag}</b>
        <span>{completedNums.length}/{entries.length}</span>
      </div>

      <Select disabled={busy || switching || open.isPending}
        className="ga-auto-select"
        aria-label="Tuỳ chọn bắt đầu từ vị trí"
        value={startFromNumber === null ? '' : String(startFromNumber)}
        onChange={(e) => {
          const val = e.target.value ? Number(e.target.value) : null
          void jumpToPosition(val)
        }}
      >
        <option value="">
          Vị trí: Tự tiếp nối (#{String(defaultNext?.num ?? 1).padStart(3, '0')})
        </option>
        {entries.map((e) => (
          <option key={e.unit.crabCode} value={String(e.num)} disabled={e.isMeasured}>
            Bắt đầu từ #{String(e.num).padStart(3, '0')} ({e.isMeasured ? 'Đã xong' : 'Chưa chụp'})
          </option>
        ))}
      </Select>

      <div className="ga-jump-inline">
        <Input
          aria-label="Nhập nhanh số thứ tự bắt đầu"
          value={customDraft}
          onChange={(e) => setCustomDraft(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          maxLength={6}
          placeholder={`#${String(defaultNext?.num ?? 1).padStart(3, '0')}`}
        />
        <OpBtn
          type="button"
          sm
          variant="ghost"
          disabled={busy || !customDraft || switching || open.isPending}
          onClick={() => {
            const n = Number(customDraft)
            if (n >= 1) void jumpToPosition(n)
          }}
        >
          Đặt
        </OpBtn>
        {startFromNumber !== null && (
          <OpBtn
            type="button"
            sm
            variant="ghost"
            title="Quay về mặc định tự tiếp nối"
            onClick={() => void jumpToPosition(null)}
          >
            <RotateCcw size={13} />
          </OpBtn>
        )}
      </div>

      <label className="ga-auto-check" title="Tự động mở lượt kế tiếp sau mỗi con hoàn thành và khi khởi động lại">
        <Checkbox checked={autoAdvance} onChange={setAutoAdvance}>
          Tự nối lượt
        </Checkbox>
      </label>

      <div className="ga-auto-action">
        {activeOpen ? (
          <OpBtn type="button" sm variant="ghost" onClick={() => (onInspect ?? onOpened)(activeOpen.sessionNo)}>
            Chi tiết / Huỷ
          </OpBtn>
        ) : unmeasured.length === 0 ? (
          <span className="ga-tag ga-tag--good">Đủ {entries.length}/{entries.length} con</span>
        ) : (
          <button
            type="button"
            className="ga-btn-grad"
            disabled={!canManualOpen}
            onClick={() => {
              if (!target) return
              lastAutoOpenedTagRef.current = target.tag
              open.mutate({
                crabCode: allTagged ? null : target.unit.crabCode,
                batchCode: batch.batchCode,
                gradeAiPrefix: prefix,
                crabNumber: target.num,
                stationCode,
                procedure: 'Station',
              })
            }}
          >
            <Scale size={14} /> {open.isPending || switching ? 'Đang mở…' : `Mở lượt ${target?.tag}`}
          </button>
        )}
      </div>
      {!!(assign.error || open.error || jumpError) && <OpNote tone="danger">{errorMessage(jumpError ?? assign.error ?? open.error)}</OpNote>}
    </div>
  )
}
