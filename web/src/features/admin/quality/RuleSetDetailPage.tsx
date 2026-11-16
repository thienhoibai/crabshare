/* /admin/grading/:id — Một bộ quy tắc phân hạng. Bản nháp thì sửa và áp dụng được (RuleSetEditor); bộ đang áp dụng và bộ đã thay thế chỉ để xem. */
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, CopyPlus } from 'lucide-react'
import type { CreateRuleSetRequest, GradeRuleSetResponse, GradingStandardResponse } from '../../../shared/api/api.gen'
import {
  OpBack, OpBadge, OpBtn, OpConfirm, OpEmpty, OpFacts, OpHeading, OpPanel, OpTable, QueryView, StatusBadge,
  formatDate, label, useGet, useSend,
} from '../../../shared/ui/console'
import RuleSetEditor from './RuleSetEditor'
import { KIND_SPEC, RULE_KINDS, findRuleSet, rangeText, resultName, resultTone, sortRules } from './ruleSetModel'

const crumb = <OpBack href="/admin/grading"><ArrowLeft size={16} /> Bộ quy tắc phân hạng</OpBack>

/** Chép một bộ đã áp dụng thành bản nháp mới của cùng loại cua. */
function CopyAsDraft({ set, onClose }: { set: GradeRuleSetResponse; onClose: () => void }) {
  const navigate = useNavigate()
  const create = useSend<GradeRuleSetResponse, CreateRuleSetRequest>('post', '/api/admin/grade-rule-sets', {
    quietError: true,
    success: 'Đã tạo bản nháp bộ quy tắc.',
    onSuccess: (draft) => navigate(`/admin/grading/${draft.id}`),
  })
  return (
    <OpConfirm
      title={`Tạo bản nháp từ phiên bản ${set.versionNo}`}
      confirmLabel="Tạo bản nháp"
      pending={create.isPending}
      error={create.error}
      onClose={onClose}
      onConfirm={() => create.mutate({
        crabType: set.crabType,
        nearThresholdPct: set.nearThresholdPct,
        rules: sortRules(set.rules).map((r) => ({
          ruleKind: r.ruleKind, metric: r.metric, lowerBound: r.lowerBound, upperBound: r.upperBound, unit: r.unit,
          resultLabel: r.resultLabel, boundary: r.boundary, sortOrder: r.sortOrder, note: r.note,
        })),
      })}
    >
      <p>Chép {set.rules.length} quy tắc của {label('crabType', set.crabType)} sang bản nháp mới để sửa.</p>
    </OpConfirm>
  )
}

function RuleSetView({ set, standardCode, draftId }: { set: GradeRuleSetResponse; standardCode: string; draftId: number | null }) {
  const [copying, setCopying] = useState(false)
  return (
    <>
      <OpHeading
        crumb={crumb}
        eyebrow={`${standardCode} · ${label('crabType', set.crabType)}`}
        title={`Bộ quy tắc phiên bản ${set.versionNo}`}
        action={
          <>
            <StatusBadge kind="ruleSet" value={set.status} />
            {draftId === null
              ? <OpBtn onClick={() => setCopying(true)}><CopyPlus size={17} /> Sửa thành bản nháp mới</OpBtn>
              : <a className="rd-btn rd-btn--primary" href={`/admin/grading/${draftId}`}>Mở bản nháp</a>}
          </>
        }
      />
      <OpFacts items={[
        { label: 'Áp dụng từ', value: formatDate(set.effectiveFrom) },
        { label: 'Dải sát ngưỡng', value: `${set.nearThresholdPct}%` },
        { label: 'Số quy tắc', value: set.rules.length },
      ]} />
      {set.note && <p className="op-muted">{set.note}</p>}
      {RULE_KINDS.filter((kind) => set.rules.some((r) => r.ruleKind === kind)).map((kind) => (
        <OpPanel key={kind} title={label('ruleKind', kind)} subtitle={KIND_SPEC[kind].hint}>
          <OpTable
            rows={sortRules(set.rules).filter((r) => r.ruleKind === kind)}
            rowKey={(r) => r.id}
            columns={[
              { key: 'metric', header: 'Chỉ tiêu', cell: (r) => label('metric', r.metric) },
              { key: 'range', header: 'Khoảng giá trị', cell: (r) => rangeText(r) },
              { key: 'result', header: 'Kết quả', cell: (r) => <OpBadge tone={resultTone(r.resultLabel)}>{resultName(r.resultLabel)}</OpBadge> },
              { key: 'note', header: 'Ghi chú', cell: (r) => r.note ?? '' },
            ]}
          />
        </OpPanel>
      ))}
      {set.rules.length === 0 && <OpEmpty title="Bộ này không có quy tắc nào" />}
      {copying && <CopyAsDraft set={set} onClose={() => setCopying(false)} />}
    </>
  )
}

export default function RuleSetDetailPage() {
  const { id } = useParams()
  const standards = useGet<GradingStandardResponse[]>('/api/admin/grade-rule-sets')
  return (
    <QueryView query={standards}>
      {(list) => {
        const found = findRuleSet(list, Number(id))
        if (!found) {
          return (
            <>
              <OpHeading crumb={crumb} eyebrow="Chất lượng" title="Không tìm thấy bộ quy tắc" />
              <OpEmpty title="Bộ quy tắc này không tồn tại" />
            </>
          )
        }
        const { set, standard } = found
        const siblings = list.flatMap((s) => s.ruleSets).filter((s) => s.crabType === set.crabType)
        if (set.status !== 'Draft') {
          return <RuleSetView set={set} standardCode={standard.standardCode} draftId={siblings.find((s) => s.status === 'Draft')?.id ?? null} />
        }
        // Sau khi lưu, máy chủ thay toàn bộ quy tắc (mã mới) nên khoá đổi và bảng sửa nạp lại đúng bản đã lưu.
        const stamp = `${set.id}:${set.rules.map((r) => r.id).join(',')}:${set.nearThresholdPct}:${set.note ?? ''}`
        return (
          <RuleSetEditor
            key={stamp}
            set={set}
            standardCode={standard.standardCode}
            activeVersion={siblings.find((s) => s.status === 'Active')?.versionNo ?? null}
            crumb={crumb}
          />
        )
      }}
    </QueryView>
  )
}
