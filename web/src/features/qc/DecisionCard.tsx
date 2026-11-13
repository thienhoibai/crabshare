/* Thẻ của một quyết định phân hạng đang chờ, cho điện thoại ở trại: mã cua, hai ảnh của trạm, size và hạng đề xuất,
   ba số chính (ô vàng khi sát ngưỡng), rồi tới nút thao tác (children). Số đo thô, kết quả AI và thông tin lượt đo
   nằm trong phần gấp lại; extra là phần thêm ở cuối phần gấp đó.
   GET /api/measurement-sessions/{no}/measurements, …/images/white|red, GET /api/crab-units/{crabCode}. */
import type { ReactNode } from 'react'
import type { CrabUnitResponse, GradeDecisionResponse, GradeRuleSetResponse, SessionMeasurementsResponse } from '../../shared/api/api.gen'
import {
  AuthImage, OpBadge, OpFacts, OpKv, OpMore, OpNote, OpPanel, StatusBadge, formatDateTime, label, useGet, type Fact,
} from '../../shared/ui/console'
import { nearHits, num } from './qc'

const UNIT: Record<string, string> = { cm2: 'cm²', 'g/cm3': 'g/cm³' }
const unit = (code: string) => UNIT[code] ?? code
const pct = (confidence: number | null) => (confidence === null ? '' : ` · ${num(confidence * 100, 0)}%`)

export function DecisionCard({ decision: d, ruleSet, children, extra }: {
  decision: GradeDecisionResponse
  /** Bộ quy tắc mà quyết định đã dùng; có thì chỉ ra số đo nào sát ngưỡng nào. */
  ruleSet: GradeRuleSetResponse | undefined
  children?: ReactNode
  extra?: ReactNode
}) {
  const sessionPath = `/api/measurement-sessions/${encodeURIComponent(d.sessionNo)}`
  const measured = useGet<SessionMeasurementsResponse>(`${sessionPath}/measurements`)
  const crab = useGet<CrabUnitResponse>(`/api/crab-units/${encodeURIComponent(d.crabCode)}`, undefined, { retry: false })
  const near = nearHits(d, ruleSet)
  const s = measured.data?.session

  /** Một ô số: nhãn kèm ngưỡng đang sát, ô vàng khi sát ngưỡng, ô đỏ khi chưa có số. */
  const fact = (metric: string, name: string, value: number | null, digits: number, suffix: string): Fact => {
    const hit = near.find((h) => h.metric === metric)
    return {
      label: hit ? `${name} · sát ngưỡng ${num(hit.bound, 4)}` : name,
      value: value === null ? 'Chưa có' : `${num(value, digits)} ${suffix}`,
      tone: value === null ? 'danger' : hit ? 'warn' : undefined,
    }
  }

  return (
    <OpPanel accent>
      <div className="qc-head">
        <div>
          <b className="qc-code">{d.crabCode}</b>
          {crab.data?.currentSlotCode && <small className="rd-muted">Hộp {crab.data.currentSlotCode}</small>}
        </div>
        <span className="op-inline">
          {d.holdReasons.length === 0
            ? <StatusBadge kind="grade" value={d.status} />
            : d.holdReasons.map((code) => <StatusBadge key={code} kind="holdReason" value={code} />)}
        </span>
      </div>

      {s && (s.hasWhiteImage || s.hasRedImage) && (
        <div className="qc-shots">
          <figure>
            <AuthImage path={s.hasWhiteImage ? `${sessionPath}/images/white` : null} alt={`Ảnh đèn trắng của ${d.crabCode}`} />
            <figcaption>Đèn trắng</figcaption>
          </figure>
          <figure>
            <AuthImage path={s.hasRedImage ? `${sessionPath}/images/red` : null} alt={`Ảnh soi đỏ của ${d.crabCode}`} />
            <figcaption>Soi đỏ</figcaption>
          </figure>
        </div>
      )}

      <div className="qc-proposal">
        <span className="rd-eyebrow">Đề xuất</span>
        {d.proposedSize ? <StatusBadge kind="sizeCode" value={d.proposedSize} /> : <OpBadge tone="warn">Chưa có size</OpBadge>}
        {d.proposedGrade ? <StatusBadge kind="gradeCode" value={d.proposedGrade} /> : <OpBadge tone="warn">Chưa có hạng</OpBadge>}
        {s && !s.hasWhiteImage && !s.hasRedImage && <OpBadge>Đo tay, không có ảnh</OpBadge>}
      </div>

      <OpFacts items={[
        fact('WeightG', 'Khối lượng', d.weightG, 1, 'g'),
        fact('CIndex', 'Chỉ số C', d.cIndex, 4, 'g/cm³'),
        d.edgeBandMm === null ? fact('CarapaceLengthCm', 'Dài mai', d.carapaceLengthCm, 2, 'cm') : fact('EdgeBandMm', 'Dải mép soi đỏ', d.edgeBandMm, 2, 'mm'),
      ]} />

      {d.holdReasons.includes('QcHold') && d.reason && <OpNote>Lý do giữ lại: {d.reason}</OpNote>}

      {children}

      <OpMore label="Số đo, AI và lượt đo">
        {measured.data && measured.data.values.length > 0 && (
          <ul className="qc-lines">
            {measured.data.values.map((v, i) => (
              <li key={`${v.metric}-${i}`}>
                <span>
                  <b>{label('metric', v.metric)}</b>
                  <small>
                    {label('measureMethod', v.method)}{pct(v.confidence)}
                    {v.method === 'Scale' && v.verificationStatus !== 'Verified' ? ' · cân chưa hiệu chuẩn' : ''}
                  </small>
                </span>
                <span className="qc-lines__end"><b>{num(v.value)} {unit(v.unit)}</b></span>
              </li>
            ))}
          </ul>
        )}
        {measured.data && measured.data.inferences.length > 0 && (
          <ul className="qc-lines">
            {measured.data.inferences.map((inf) => (
              <li key={inf.imageKind}>
                <span>
                  <b>AI · {inf.imageKind === 'White' ? 'đèn trắng' : 'soi đỏ'}</b>
                  <small>{inf.modelName} {inf.modelVersion}{pct(inf.confidence)}{inf.errorReason ? ` · ${inf.errorReason}` : ''}</small>
                </span>
                <span className="qc-lines__end">
                  {inf.isSimulated && <OpBadge tone="info">Giả lập</OpBadge>}
                  <StatusBadge kind="imageQuality" value={inf.imageQuality} />
                  <StatusBadge kind="ai" value={inf.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <OpKv items={[
          { label: 'Theo chỉ số C', value: d.proposedCLevel ? label('gradeCode', d.proposedCLevel) : null },
          { label: 'Theo soi đỏ', value: d.proposedSensory ? label('gradeCode', d.proposedSensory) : null },
          { label: 'Cách đo', value: s ? (s.procedure === 'Manual' ? 'Đo tay' : `Trạm ${s.stationCode ?? ''}`) : null },
          { label: 'Đo lúc', value: formatDateTime(s?.capturedAt ?? s?.receivedAt) },
          { label: 'Lúc nhận', value: crab.data ? `${num(crab.data.receivedWeightG, 1)} g · ${label('sex', crab.data.sex)}` : null },
          { label: 'Lô nguồn', value: crab.data?.originRegion },
          { label: 'Lượt đo', value: <span className="op-mono">{d.sessionNo}</span> },
          { label: 'Bộ quy tắc', value: `Phiên bản ${d.ruleSetVersion} · đề xuất ${d.versionNo}` },
        ].filter((i) => i.value !== null && i.value !== undefined && i.value !== '')} />
        {extra}
      </OpMore>
    </OpPanel>
  )
}
