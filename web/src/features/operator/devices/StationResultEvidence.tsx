import type { SessionMeasurementsResponse, SessionResponse } from '../../../shared/api/api.gen'
import { AuthImage } from '../../../shared/ui/console'

const format = (value: number, unit: string) =>
  `${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ${unit}`

export function StationResultEvidence({ session, data, gradingLength, zoom = true }: {
  session: SessionResponse
  data?: SessionMeasurementsResponse
  gradingLength?: number | null
  zoom?: boolean
}) {
  const metric = (name: string) => data?.values.filter(value => value.metric === name).at(-1)?.value
  const items = [
    { label: 'Cân nặng', value: session.weightG, unit: 'g' },
    { label: 'Chiều dài mai (CL)', value: gradingLength ?? metric('CarapaceLengthCm'), unit: 'cm' },
    { label: 'Chiều rộng mai (CW)', value: metric('CarapaceWidthCm'), unit: 'cm' },
    { label: 'Khoảng cách cảm biến', value: session.tofMm, unit: 'mm' },
  ]
  const area = metric('CarapaceAreaCm2')
  const band = metric('EdgeBandMm')
  const tag = session.gradeAiTag ?? session.crabCode
  const path = `/api/measurement-sessions/${encodeURIComponent(session.sessionNo)}/images`

  return <>
    <dl className="ga-completion-metrics" aria-label="Chỉ số của lượt đo">
      {items.map(item => <div key={item.label}>
        <dt>{item.label}</dt>
        <dd>{item.value == null ? '—' : format(item.value, item.unit)}</dd>
      </div>)}
    </dl>
    <div className="ga-completion-images">
      {(['white', 'red'] as const).map(channel => {
        const white = channel === 'white'
        const detail = white
          ? area == null ? null : `Diện tích mai ${format(area, 'cm²')}`
          : band == null ? null : `Dải viền ${format(band, 'mm')}`
        return <figure key={channel}>
          <figcaption>{white ? 'Ảnh đèn trắng' : 'Ảnh đèn soi'}{detail && <small>{detail}</small>}</figcaption>
          {(white ? session.hasWhiteImage : session.hasRedImage)
            ? <AuthImage path={`${path}/${channel}`} alt={`${white ? 'Ảnh trắng' : 'Ảnh soi'} · ${tag}`} zoom={zoom} />
            : <div className="ga-completion-no-image">Lượt này chưa có ảnh</div>}
        </figure>
      })}
    </div>
  </>
}
