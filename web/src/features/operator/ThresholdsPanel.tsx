/* Khoảng chỉ số nước của một Lô (GET/PUT /api/batches/{code}/production-thresholds). Mỗi lần đổi tạo một phiên bản mới.
   Theo BR-115 chỉ số nước chỉ để theo dõi: khoảng này chỉ dùng để đánh dấu dòng nhật ký nằm ngoài khoảng, không sinh cảnh báo.
   Thành phần là một khối gấp, đặt trong tab Nhật ký của Lô. */
import { useState } from 'react'
import { Save } from 'lucide-react'
import type { ProductionThresholdRequest, ProductionThresholdResponse, ProductionThresholdState } from '../../shared/api/api.gen'
import { DecimalInput, Field, OpBtn, OpMore, OpNote, errorMessage, useGet, useSend } from '../../shared/ui/console'

type Draft = Omit<ProductionThresholdRequest, 'expectedVersionNo'>

function ThresholdForm({ code, state }: { code: string; state: ProductionThresholdState }) {
  const c = state.current
  const [f, setF] = useState<Draft>({
    phMin: c?.phMin ?? null, phMax: c?.phMax ?? null, waterTempMinC: c?.waterTempMinC ?? null, waterTempMaxC: c?.waterTempMaxC ?? null,
    salinityMinPpt: c?.salinityMinPpt ?? null, salinityMaxPpt: c?.salinityMaxPpt ?? null,
  })
  const save = useSend<ProductionThresholdResponse, ProductionThresholdRequest>('put', `/api/batches/${encodeURIComponent(code)}/production-thresholds`, {
    success: 'Đã lưu khoảng chỉ số nước.', quietError: true,
  })
  const set = (key: keyof Draft) => (value: number | null) => setF((old) => ({ ...old, [key]: value }))
  const complete = Object.values(f).every((v) => v !== null)
  const ordered = (f.phMin ?? 0) <= (f.phMax ?? 0) && (f.waterTempMinC ?? 0) <= (f.waterTempMaxC ?? 0) && (f.salinityMinPpt ?? 0) <= (f.salinityMaxPpt ?? 0)
  const disabled = !state.canConfigure

  return (
    <form className="op-form" onSubmit={(e) => { e.preventDefault(); if (complete && ordered) save.mutate({ expectedVersionNo: c?.versionNo ?? 0, ...f }) }}>
      <div className="op-form__row">
        <Field label="pH từ"><DecimalInput sm value={f.phMin} disabled={disabled} onChange={set('phMin')} /></Field>
        <Field label="pH đến"><DecimalInput sm value={f.phMax} disabled={disabled} onChange={set('phMax')} /></Field>
        <Field label="Nhiệt độ từ"><DecimalInput sm unit="°C" value={f.waterTempMinC} disabled={disabled} onChange={set('waterTempMinC')} /></Field>
        <Field label="Nhiệt độ đến"><DecimalInput sm unit="°C" value={f.waterTempMaxC} disabled={disabled} onChange={set('waterTempMaxC')} /></Field>
        <Field label="Độ mặn từ"><DecimalInput sm unit="‰" value={f.salinityMinPpt} disabled={disabled} onChange={set('salinityMinPpt')} /></Field>
        <Field label="Độ mặn đến"><DecimalInput sm unit="‰" value={f.salinityMaxPpt} disabled={disabled} onChange={set('salinityMaxPpt')} /></Field>
      </div>
      {save.isError && <OpNote tone="danger">{errorMessage(save.error)}</OpNote>}
      {state.canConfigure && (
        <div className="op-formfoot">
          {complete && !ordered && <span className="op-warn" style={{ fontSize: 14, marginRight: 'auto' }}>Số “từ” phải nhỏ hơn số “đến”</span>}
          <OpBtn type="submit" variant="ghost" disabled={!complete || !ordered || save.isPending}><Save size={15} /> {save.isPending ? 'Đang lưu…' : 'Lưu khoảng'}</OpBtn>
        </div>
      )}
    </form>
  )
}

export default function ThresholdsPanel({ code }: { code: string }) {
  const state = useGet<ProductionThresholdState>(`/api/batches/${encodeURIComponent(code)}/production-thresholds`)
  if (!state.data) return null
  return (
    <OpMore label={state.data.current ? 'Khoảng chỉ số nước để đối chiếu' : 'Đặt khoảng chỉ số nước để đối chiếu'}>
      <ThresholdForm key={state.data.current?.versionNo ?? 0} code={code} state={state.data} />
    </OpMore>
  )
}
