import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Save } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { OpBtn, OpNote, OpPanel } from './operatorUi'
import {
  createProductionLog,
  productionDate,
  productionProblemCode,
  type DailyLog,
  type ProductionBatch,
  type ThresholdState
} from './productionApi'

const metrics = [
  { key: 'ph', label: 'Độ pH', min: 0, max: 14, step: '0.1' },
  { key: 'waterTempC', label: 'Nhiệt độ nước (°C)', min: -273.1, max: 999.9, step: '0.1' },
  { key: 'salinityPpt', label: 'Độ mặn (ppt)', min: 0, max: 999.9, step: '0.1' },
  { key: 'feedKg', label: 'Lượng thức ăn (kg)', min: 0, max: 999999999.999, step: '0.001' }
] as const

export default function ProductionLogForm({
  batch,
  state,
  busy,
  onBusy,
  onSaved,
  onRefresh
}: {
  batch: ProductionBatch
  state: ThresholdState
  busy: boolean
  onBusy: (value: boolean) => void
  onSaved: (log: DailyLog) => void
  onRefresh: () => void
}) {
  const [draft, setDraft] = useState({ ph: '', waterTempC: '', salinityPpt: '', feedKg: '', note: '' })
  const [duplicateDate, setDuplicateDate] = useState('')
  const mutation = useMutation({
    mutationFn: () =>
      createProductionLog(batch.batchCode, {
        ph: Number(draft.ph),
        waterTempC: Number(draft.waterTempC),
        salinityPpt: Number(draft.salinityPpt),
        feedKg: Number(draft.feedKg),
        ...(draft.note.trim() ? { note: draft.note.trim() } : {})
      }),
    onMutate: () => onBusy(true),
    onSuccess: onSaved,
    onError: (error) => {
      if (productionProblemCode(error) === 'production.log_exists') setDuplicateDate(state.businessDate)
      if (
        ['production.log_exists', 'production.thresholds_required'].includes(
          productionProblemCode(error) ?? ''
        )
      )
        onRefresh()
    },
    onSettled: () => onBusy(false)
  })
  const savedToday =
    (batch.loggedToday && batch.businessDate === state.businessDate) ||
    (mutation.data !== undefined && mutation.data.logDate >= state.businessDate) ||
    duplicateDate === state.businessDate
  const running = batch.status === 'InProduction' || batch.status === 'Harvesting'
  const canRecord = running && state.canRecord && !!state.current && !savedToday
  const disabled = busy || mutation.isPending
  // Ngưỡng chỉ để đối chiếu. Số đo ngoài ngưỡng vẫn được lưu và tạo cảnh báo.
  const current = state.current
  const hints = {
    ph: current ? `Ngưỡng đang áp dụng: ${current.phMin} - ${current.phMax}` : '',
    waterTempC: current ? `Ngưỡng đang áp dụng: ${current.waterTempMinC} - ${current.waterTempMaxC} °C` : '',
    salinityPpt: current
      ? `Ngưỡng đang áp dụng: ${current.salinityMinPpt} - ${current.salinityMaxPpt} ppt`
      : '',
    feedKg: ''
  }
  return (
    <OpPanel title="Nhật ký hôm nay" subtitle={`Ngày ghi: ${productionDate(state.businessDate)} · UTC+7`}>
      {!running ? (
        <OpNote tone="info">Chỉ ghi nhật ký khi lô đang sản xuất hoặc đang thu hoạch.</OpNote>
      ) : !state.current ? (
        <OpNote tone="info">
          {state.canConfigure
            ? 'Cấu hình ngưỡng nước ở bên dưới trước khi ghi nhật ký.'
            : 'Liên hệ chủ hộ nuôi để cấu hình ngưỡng trước khi ghi nhật ký.'}
        </OpNote>
      ) : savedToday ? (
        <OpNote tone="ok">Lô đã có nhật ký thủ công hôm nay. Xem bản ghi trong lịch sử.</OpNote>
      ) : (
        !state.canRecord && (
          <OpNote tone="info">
            Lô hiện không cho phép ghi nhật ký. Làm mới dữ liệu để kiểm tra trạng thái.
          </OpNote>
        )
      )}
      <form
        className="op-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (canRecord && !disabled) mutation.mutate()
        }}
      >
        <fieldset className="production-fieldset" disabled={disabled}>
          <div className="op-form__row">
            {metrics.map((metric) => (
              <div className="op-field" key={metric.key}>
                <label htmlFor={`log-${metric.key}`}>{metric.label}</label>
                <input
                  id={`log-${metric.key}`}
                  className="op-input"
                  type="number"
                  inputMode="decimal"
                  required
                  min={metric.min}
                  max={metric.max}
                  step={metric.step}
                  value={draft[metric.key]}
                  onChange={(event) => setDraft({ ...draft, [metric.key]: event.target.value })}
                  aria-describedby={hints[metric.key] ? `log-${metric.key}-hint` : undefined}
                />
                {hints[metric.key] && (
                  <small id={`log-${metric.key}-hint`} className="rd-note">
                    {hints[metric.key]}
                  </small>
                )}
              </div>
            ))}
          </div>
          <div className="op-field">
            <label htmlFor="log-note">Ghi chú</label>
            <textarea
              id="log-note"
              className="op-textarea"
              rows={3}
              maxLength={500}
              value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              placeholder="Hoạt động chăm sóc hoặc nhận xét trong ngày"
            />
            <small className="rd-note">{draft.note.length}/500 ký tự · Không bắt buộc</small>
          </div>
        </fieldset>
        <p className="rd-note">
          Nhập số đo thực tế. Số đo ngoài ngưỡng vẫn được lưu và tạo cảnh báo chất lượng nước. Ngày ghi do máy
          chủ xác định khi lưu.
        </p>
        {mutation.isError && (
          <div role="alert">
            <OpNote tone="danger">
              {errorMessage(mutation.error)} <span>Bản nhập của bạn được giữ lại.</span>
            </OpNote>
          </div>
        )}
        {mutation.data && (
          <div role="status">
            <OpNote tone={mutation.data.plausibilityFlag === 'OutOfRange' ? 'info' : 'ok'}>
              Đã lưu nhật ký lên máy chủ cho ngày {productionDate(mutation.data.logDate)}.
              {mutation.data.plausibilityFlag === 'OutOfRange' && (
                <>
                  {' '}
                  Số đo ngoài ngưỡng đã được ghi nhận và tạo cảnh báo.{' '}
                  <Link className="production-link" to="/operator/alerts">
                    Xem cảnh báo
                  </Link>
                </>
              )}
            </OpNote>
          </div>
        )}
        <OpBtn type="submit" variant="ink" disabled={!canRecord || disabled}>
          <Save size={16} />
          {mutation.isPending ? 'Đang lưu nhật ký…' : 'Lưu nhật ký'}
        </OpBtn>
      </form>
    </OpPanel>
  )
}
