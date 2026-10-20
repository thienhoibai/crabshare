import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { errorMessage } from '../../shared/api/http'
import { OpBtn, OpNote, OpPanel } from './operatorUi'
import { productionProblemCode, productionTime, saveProductionThresholds, type ThresholdState, type ThresholdVersion } from './productionApi'

const fields = [
  { min: 'phMin', max: 'phMax', title: 'pH', minLabel: 'pH tối thiểu', maxLabel: 'pH tối đa', floor: 0, ceiling: 14 },
  { min: 'waterTempMinC', max: 'waterTempMaxC', title: 'Nhiệt độ nước (°C)', minLabel: 'Nhiệt độ tối thiểu (°C)', maxLabel: 'Nhiệt độ tối đa (°C)', floor: -273.1, ceiling: 999.9 },
  { min: 'salinityMinPpt', max: 'salinityMaxPpt', title: 'Độ mặn (ppt)', minLabel: 'Độ mặn tối thiểu (ppt)', maxLabel: 'Độ mặn tối đa (ppt)', floor: 0, ceiling: 999.9 },
] as const
type RangeKey = typeof fields[number]['min' | 'max']
type RangeDraft = Record<RangeKey, string>
const draftFor = (current: ThresholdVersion | null): RangeDraft => ({
  phMin: current ? String(current.phMin) : '', phMax: current ? String(current.phMax) : '',
  waterTempMinC: current ? String(current.waterTempMinC) : '', waterTempMaxC: current ? String(current.waterTempMaxC) : '',
  salinityMinPpt: current ? String(current.salinityMinPpt) : '', salinityMaxPpt: current ? String(current.salinityMaxPpt) : '',
})

export function AppliedRanges({ version }: { version: ThresholdVersion }) {
  return <dl className="production-ranges">
    <div><dt>pH</dt><dd>{version.phMin}–{version.phMax}</dd></div>
    <div><dt>Nhiệt độ nước</dt><dd>{version.waterTempMinC}–{version.waterTempMaxC} °C</dd></div>
    <div><dt>Độ mặn</dt><dd>{version.salinityMinPpt}–{version.salinityMaxPpt} ppt</dd></div>
  </dl>
}

export default function ProductionThresholds({ code, state, busy, onBusy, onSaved, onReload }: {
  code: string; state: ThresholdState; busy: boolean; onBusy: (value: boolean) => void;
  onSaved: (version: ThresholdVersion) => void; onReload: () => Promise<ThresholdState>
}) {
  const [draft, setDraft] = useState(() => draftFor(state.current))
  const [expectedVersionNo, setExpectedVersionNo] = useState(state.current?.versionNo ?? 0)
  const [validation, setValidation] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadError, setReloadError] = useState('')
  const [reloading, setReloading] = useState(false)
  const mutation = useMutation({
    mutationFn: () => saveProductionThresholds(code, {
      expectedVersionNo, phMin: Number(draft.phMin), phMax: Number(draft.phMax), waterTempMinC: Number(draft.waterTempMinC),
      waterTempMaxC: Number(draft.waterTempMaxC), salinityMinPpt: Number(draft.salinityMinPpt), salinityMaxPpt: Number(draft.salinityMaxPpt),
    }),
    onMutate: () => { setNotice(''); onBusy(true) },
    onSuccess: version => { setExpectedVersionNo(version.versionNo); setDraft(draftFor(version)); setNotice(`Đã lưu ngưỡng phiên bản ${version.versionNo}.`); onSaved(version) },
    onSettled: () => onBusy(false),
  })
  const conflict = productionProblemCode(mutation.error) === 'production.thresholds_changed'
  const disabled = busy || mutation.isPending || reloading
  const reload = async () => {
    setReloading(true); setReloadError(''); onBusy(true)
    try {
      const next = await onReload()
      setDraft(draftFor(next.current)); setExpectedVersionNo(next.current?.versionNo ?? 0); mutation.reset(); setValidation(''); setNotice('Đã tải cấu hình hiện tại. Kiểm tra ngưỡng trước khi lưu.')
    } catch (error) { setReloadError(errorMessage(error)) }
    finally { setReloading(false); onBusy(false) }
  }
  return <OpPanel title="Ngưỡng nước của lô" subtitle="Chủ hộ nuôi tự đặt khoảng vận hành phù hợp với lô. Giá trị tại hai biên vẫn nằm trong ngưỡng.">
    {state.current ? <>
      <p className="rd-note">Cấu hình hiện tại: phiên bản {state.current.versionNo} · {productionTime(state.current.createdAt)} · Người cấu hình: #{state.current.createdBy}</p>
      <AppliedRanges version={state.current} />
    </> : <OpNote tone="info">{state.canConfigure ? 'Nhập đầy đủ ba khoảng ngưỡng trước nhật ký đầu tiên.' : 'Liên hệ chủ hộ nuôi để cấu hình ngưỡng trước khi ghi nhật ký.'}</OpNote>}
    {state.canConfigure ? <form className="op-form" onSubmit={event => {
      event.preventDefault()
      if (disabled || conflict) return
      if (fields.some(field => Number(draft[field.min]) > Number(draft[field.max]))) { setValidation('Ngưỡng tối thiểu phải nhỏ hơn hoặc bằng ngưỡng tối đa.'); return }
      setValidation(''); mutation.mutate()
    }}>
      <fieldset disabled={disabled} className="production-fieldset">
        {fields.map(field => <div className="production-range-row" key={field.title}>
          <span className="production-range-title">{field.title}</span>
          {(['min', 'max'] as const).map(bound => <div className="op-field" key={bound}>
            <label htmlFor={`threshold-${field[bound]}`}>{field[`${bound}Label`]}</label>
            <input className="op-input" id={`threshold-${field[bound]}`} type="number" inputMode="decimal" required min={field.floor} max={field.ceiling} step="0.1" value={draft[field[bound]]} onChange={event => setDraft({ ...draft, [field[bound]]: event.target.value })} />
          </div>)}
        </div>)}
      </fieldset>
      <p className="rd-note">Mỗi lần thay đổi tạo một phiên bản mới, áp dụng cho nhật ký ghi sau đó. Nhật ký cũ giữ nguyên ngưỡng đã dùng.</p>
      {validation && <p role="alert" className="production-error">{validation}</p>}
      {mutation.isError && <div role="alert"><OpNote tone="danger">{errorMessage(mutation.error)}{conflict && <p>Bản nhập được giữ lại. Tải cấu hình mới để kiểm tra trước khi lưu tiếp.</p>}</OpNote></div>}
      {reloadError && <p role="alert" className="production-error">{reloadError}</p>}
      {notice && <p role="status" className="production-success">{notice}</p>}
      <div className="production-actions">
        {conflict && <OpBtn type="button" variant="outline" disabled={disabled} onClick={() => { void reload() }}>{reloading ? 'Đang tải…' : 'Tải cấu hình mới'}</OpBtn>}
        <OpBtn type="submit" variant="ink" disabled={disabled || conflict}>{mutation.isPending ? 'Đang lưu ngưỡng…' : 'Lưu ngưỡng'}</OpBtn>
      </div>
    </form> : state.current && <p className="rd-note">Bạn có quyền xem ngưỡng. Chủ hộ nuôi quản lý thay đổi cấu hình.</p>}
  </OpPanel>
}
