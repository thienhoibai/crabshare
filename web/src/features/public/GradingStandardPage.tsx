/* /chuan-phan-hang — Chuẩn phân hạng và bộ quy tắc đang áp dụng (GET /api/grading/standards).
   Đây là chuẩn nội bộ tham chiếu, không phải chứng nhận. Dùng chung cho trang công khai và cổng kiểm phẩm. */
import type { GradeRuleResponse, GradingStandardResponse } from '../../shared/api/api.gen'
import SiteShell from '../../shared/layout/SiteShell'
import { OpBadge, OpHeading, OpPanel, OpTable, QueryView, StatusBadge, formatDate, label, useGet } from '../../shared/ui/console'

const KIND_ORDER = ['Size', 'PhysicalFactor', 'Sensory', 'Exclusion']

/** "≥ 300 g", "250 – 300 g", "< 15 mm" từ cận dưới, cận trên và kiểu biên. */
function range(r: GradeRuleResponse): string {
  const lowerIn = r.boundary === 'LowerInclusive' || r.boundary === 'BothInclusive'
  const upperIn = r.boundary === 'UpperInclusive' || r.boundary === 'BothInclusive'
  const unit = r.unit ? ` ${r.unit}` : ''
  if (r.lowerBound !== null && r.upperBound !== null) return `${lowerIn ? 'từ' : 'trên'} ${r.lowerBound} ${upperIn ? 'đến' : 'tới dưới'} ${r.upperBound}${unit}`
  if (r.lowerBound !== null) return `${lowerIn ? '≥' : '>'} ${r.lowerBound}${unit}`
  if (r.upperBound !== null) return `${upperIn ? '≤' : '<'} ${r.upperBound}${unit}`
  return 'Theo ghi chú'
}

const resultLabel = (code: string) => (['M', 'L', 'XL', 'OUT'].includes(code) ? label('sizeCode', code) : label('gradeCode', code))

export function GradingStandards() {
  const standards = useGet<GradingStandardResponse[]>('/api/grading/standards')
  return (
    <QueryView query={standards} empty="Chưa có chuẩn phân hạng nào được công bố">
      {(list) => (
        <>
          {list.map((s) => (
            <div key={`${s.standardCode}-${s.revision}`} className="op-stack">
              <p className="rd-muted" style={{ fontSize: 14 }}>
                Tham chiếu <b>{s.standardCode}</b> · {s.issuer} · áp dụng từ {formatDate(s.effectiveFrom)}
              </p>
              {s.ruleSets.map((set) => (
                <OpPanel
                  key={set.id}
                  title={label('crabType', set.crabType)}
                  subtitle={`Phiên bản ${set.versionNo}, áp dụng từ ${formatDate(set.effectiveFrom)}. Số đo cách ngưỡng trong ${set.nearThresholdPct}% được đánh dấu để kiểm kỹ.`}
                  action={<StatusBadge kind="ruleSet" value={set.status} />}
                >
                  {KIND_ORDER.filter((k) => set.rules.some((r) => r.ruleKind === k)).map((kind) => (
                    <div key={kind} className="op-stack" style={{ gap: 8 }}>
                      <p className="rd-eyebrow">{label('ruleKind', kind)}</p>
                      <OpTable
                        rows={set.rules.filter((r) => r.ruleKind === kind).sort((a, b) => a.sortOrder - b.sortOrder)}
                        rowKey={(r) => r.id}
                        columns={[
                          { key: 'metric', header: 'Chỉ tiêu', cell: (r) => label('metric', r.metric) },
                          { key: 'range', header: 'Khoảng giá trị', cell: (r) => range(r) },
                          { key: 'result', header: 'Kết quả', cell: (r) => <OpBadge tone={r.resultLabel === 'REJECT' || r.resultLabel === 'OUT' ? 'danger' : r.resultLabel === 'BELOW' ? 'warn' : 'ok'}>{resultLabel(r.resultLabel)}</OpBadge> },
                        ]}
                      />
                    </div>
                  ))}
                </OpPanel>
              ))}
            </div>
          ))}
        </>
      )}
    </QueryView>
  )
}

export default function GradingStandardPage() {
  return (
    <SiteShell>
      <OpHeading
        eyebrow="Chuẩn phân hạng"
        title="Cua được chia size và hạng như thế nào"
        description="Chuẩn nội bộ tham chiếu, không phải giấy chứng nhận."
      />
      <GradingStandards />
    </SiteShell>
  )
}
