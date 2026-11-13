/* Ghi nhật ký chăm sóc hôm nay cho một Lô (POST /api/batches/{code}/production-logs). Mỗi Lô một bản ghi tay mỗi ngày.
   API bắt buộc đủ bốn số: thức ăn, pH, nhiệt độ, độ mặn. Ba chỉ số nước được điền sẵn từ số đo cảm biến gần nhất của Lô
   (GET /api/batches/{code}/water-readings) để người nuôi chỉ cần nhập lượng thức ăn; vẫn sửa tay được. */
import { useState } from 'react'
import type { ProductionLogRequest, ProductionLogResponse, WaterReadingResponse } from '../../shared/api/api.gen'
import { DecimalInput, Field, OpConfirm, OpMore, TextArea, formatDateTime, useGet, useSend } from '../../shared/ui/console'

type Typed = number | null | undefined
const one = (value: number | null | undefined) => (value === null || value === undefined ? null : Math.round(value * 10) / 10)

export default function CareLogDialog({ batchCode, batchTitle, onClose }: { batchCode: string; batchTitle?: string; onClose: () => void }) {
  const [feedKg, setFeedKg] = useState<number | null>(null)
  // undefined: người dùng chưa gõ, lấy số của cảm biến.
  const [phTyped, setPh] = useState<Typed>(undefined)
  const [tempTyped, setTemp] = useState<Typed>(undefined)
  const [salinityTyped, setSalinity] = useState<Typed>(undefined)
  const [note, setNote] = useState('')
  const api = `/api/batches/${encodeURIComponent(batchCode)}`
  const readings = useGet<WaterReadingResponse[]>(`${api}/water-readings`, undefined, { retry: false })
  const latest = readings.data?.length ? readings.data[readings.data.length - 1] : null
  const record = useSend<ProductionLogResponse, ProductionLogRequest>('post', `${api}/production-logs`, { success: `Đã ghi nhật ký Lô ${batchCode}.`, onSuccess: onClose, quietError: true })
  const ph = phTyped === undefined ? one(latest?.ph) : phTyped
  const waterTempC = tempTyped === undefined ? one(latest?.temperatureC) : tempTyped
  const salinityPpt = salinityTyped === undefined ? one(latest?.salinityPpt) : salinityTyped
  const fromSensor = latest && phTyped === undefined && tempTyped === undefined && salinityTyped === undefined

  return (
    <OpConfirm
      title="Nhật ký hôm nay"
      sub={batchTitle ?? batchCode}
      confirmLabel="Ghi nhật ký"
      pending={record.isPending}
      error={record.error}
      disabled={feedKg === null || ph === null || waterTempC === null || salinityPpt === null}
      onClose={onClose}
      onConfirm={() => record.mutate({ feedKg, ph, waterTempC, salinityPpt, note: note.trim() || null })}
    >
      <Field label="Thức ăn đã cho" required>
        <DecimalInput unit="kg" value={feedKg} onChange={setFeedKg} autoFocus />
      </Field>
      <div className="op-form__row">
        <Field label="pH" required>
          <DecimalInput value={ph} onChange={setPh} />
        </Field>
        <Field label="Nhiệt độ" required>
          <DecimalInput unit="°C" value={waterTempC} onChange={setTemp} />
        </Field>
        <Field label="Độ mặn" required>
          <DecimalInput unit="‰" value={salinityPpt} onChange={setSalinity} />
        </Field>
      </div>
      {fromSensor && <small className="rd-muted">Chỉ số nước lấy từ cảm biến, đo lúc {formatDateTime(latest.measuredAt)}.</small>}
      <OpMore label="Ghi chú">
        <TextArea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Thay nước, vệ sinh hộp, cua bỏ ăn…" aria-label="Ghi chú chăm sóc" />
      </OpMore>
    </OpConfirm>
  )
}
