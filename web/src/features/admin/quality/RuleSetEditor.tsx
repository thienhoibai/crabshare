/* Sửa một bản nháp bộ quy tắc: bảng sửa trực tiếp theo từng loại quy tắc, lưu (PUT …/rules) và áp dụng (POST …/activate). */
import { useState, type ReactNode } from 'react'
import { AlertTriangle, Plus, Save, Trash2, Zap } from 'lucide-react'
import type { GradeRuleSetResponse, ReplaceRulesRequest } from '../../../shared/api/api.gen'
import {
  DecimalInput, Field, Input, OpBadge, OpBtn, OpConfirm, OpFlow, OpHeading, OpNote, OpPanel, OpTable, Select, StatusBadge, TextArea,
  errorMessage, label, useSend, type Column,
} from '../../../shared/ui/console'
import {
  BOUNDARIES, KIND_SPEC, RULE_KINDS, activationGaps, newRule, resultName, signature, toDrafts, toRequests, validate,
  type RuleDraft, type RuleKind,
} from './ruleSetModel'
import { extraLabel } from './shared'

export default function RuleSetEditor({ set, standardCode, activeVersion, crumb }: {
  set: GradeRuleSetResponse
  standardCode: string
  /** Phiên bản đang áp dụng của cùng loại cua, null khi chưa có. */
  activeVersion: number | null
  crumb: ReactNode
}) {
  const [drafts, setDrafts] = useState<RuleDraft[]>(() => toDrafts(set))
  const [nearPct, setNearPct] = useState<number | null>(set.nearThresholdPct)
  const [note, setNote] = useState(set.note ?? '')
  const [saved] = useState(() => signature(toDrafts(set), set.nearThresholdPct, set.note ?? ''))
  const [activating, setActivating] = useState(false)

  const save = useSend<GradeRuleSetResponse, ReplaceRulesRequest>('put', `/api/admin/grade-rule-sets/${set.id}/rules`, { quietError: true, success: 'Đã lưu bản nháp.' })
  const activate = useSend<GradeRuleSetResponse, void>('post', `/api/admin/grade-rule-sets/${set.id}/activate`, {
    quietError: true,
    success: `Đã áp dụng bộ quy tắc phiên bản ${set.versionNo}.`,
  })

  const check = validate(drafts, nearPct, note)
  const dirty = signature(drafts, nearPct, note) !== saved
  const gaps = activationGaps(set.crabType, drafts)
  const crab = label('crabType', set.crabType)

  const patch = (key: string, change: Partial<RuleDraft>) => setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...change } : d)))
  const remove = (key: string) => setDrafts((list) => list.filter((d) => d.key !== key))

  const columnsFor = (kind: RuleKind): Column<RuleDraft>[] => {
    const spec = KIND_SPEC[kind]
    const metric: Column<RuleDraft> = {
      key: 'metric', header: 'Chỉ tiêu',
      cell: (d) => spec.metrics.length > 1
        ? <Select sm aria-label="Chỉ tiêu" value={d.metric} onChange={(e) => patch(d.key, { metric: e.target.value })}>{spec.metrics.map((m) => <option key={m} value={m}>{label('metric', m)}</option>)}</Select>
        : label('metric', d.metric),
    }
    const result: Column<RuleDraft> = {
      key: 'result', header: 'Kết quả',
      cell: (d) => spec.results.length > 1
        ? <Select sm aria-label="Kết quả" value={d.resultLabel} onChange={(e) => patch(d.key, { resultLabel: e.target.value })}>{spec.results.map((r) => <option key={r} value={r}>{resultName(r)}</option>)}</Select>
        : resultName(d.resultLabel),
    }
    const noteCol: Column<RuleDraft> = {
      key: 'note', header: 'Ghi chú',
      cell: (d) => <Input sm aria-label="Ghi chú" value={d.note} maxLength={300} onChange={(e) => patch(d.key, { note: e.target.value })} />,
    }
    // Dòng có lỗi nhập hiện dấu cảnh báo cạnh nút xoá.
    const del: Column<RuleDraft> = {
      key: 'del', header: '', width: 84,
      cell: (d) => (
        <span className="op-inline">
          <button type="button" className="rd-iconbtn" aria-label="Xoá quy tắc này" onClick={() => remove(d.key)}><Trash2 size={16} /></button>
          {check.bad.has(d.key) && <span className="op-danger" title="Dòng này cần sửa"><AlertTriangle size={16} /></span>}
        </span>
      ),
    }
    if (kind === 'Exclusion') return [metric, result, noteCol, del]
    // Ba nhóm này mỗi nhóm một chỉ tiêu (đã ghi ở tiêu đề), đơn vị cố định theo chỉ tiêu nên hiện ngay trong ô nhập.
    return [
      { key: 'lower', header: 'Cận dưới', width: 150, cell: (d) => <DecimalInput sm aria-label="Cận dưới" unit={d.unit} value={d.lowerBound} onChange={(v) => patch(d.key, { lowerBound: v })} /> },
      { key: 'upper', header: 'Cận trên', width: 150, cell: (d) => <DecimalInput sm aria-label="Cận trên" unit={d.unit} value={d.upperBound} onChange={(v) => patch(d.key, { upperBound: v })} /> },
      {
        key: 'boundary', header: 'Giá trị ở cận', width: 170,
        cell: (d) => <Select sm aria-label="Giá trị ở cận" value={d.boundary} onChange={(e) => patch(d.key, { boundary: e.target.value })}>{BOUNDARIES.map((b) => <option key={b} value={b}>{extraLabel('boundary', b)}</option>)}</Select>,
      },
      result,
      noteCol,
      del,
    ]
  }

  // Một nút chính: còn thay đổi thì là Lưu, đã lưu thì là Áp dụng.
  const actions = (
    <>
      <OpBtn
        variant={dirty ? 'primary' : 'ghost'}
        disabled={!dirty || check.problems.length > 0 || save.isPending}
        onClick={() => save.mutate({ rules: toRequests(drafts), nearThresholdPct: nearPct, note: note.trim() })}
      >
        <Save size={17} /> {save.isPending ? 'Đang lưu…' : 'Lưu bản nháp'}
      </OpBtn>
      <OpBtn variant={dirty ? 'ghost' : 'primary'} disabled={dirty} title={dirty ? 'Lưu bản nháp trước khi áp dụng' : undefined} onClick={() => { activate.reset(); setActivating(true) }}>
        <Zap size={17} /> Áp dụng
      </OpBtn>
    </>
  )

  return (
    <>
      <OpHeading
        crumb={crumb}
        eyebrow={`${standardCode} · ${crab}`}
        title={`Bản nháp phiên bản ${set.versionNo}`}
        action={<>{dirty ? <OpBadge tone="warn">Chưa lưu</OpBadge> : <StatusBadge kind="ruleSet" value={set.status} />}{actions}</>}
      />
      {/* Chỉ một ghi chú: lỗi lưu, rồi lỗi nhập, rồi phần còn thiếu để áp dụng. */}
      {save.isError ? <OpNote tone="danger">{errorMessage(save.error)}</OpNote>
        : check.problems.length > 0 ? <OpNote tone="danger">{check.problems.join(' ')}</OpNote>
          : !dirty && gaps.length > 0 ? <OpNote>Chưa áp dụng được. {gaps.join(' ')}</OpNote>
            : null}

      <OpPanel title="Thông số chung">
        <div className="op-form__row">
          <Field label="Dải sát ngưỡng" required hint="Từ 0 đến 20%.">
            <DecimalInput value={nearPct} onChange={setNearPct} unit="%" />
          </Field>
          <Field label="Ghi chú">
            <TextArea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </OpPanel>

      {RULE_KINDS.map((kind) => (
        <OpPanel
          key={kind}
          title={label('ruleKind', kind)}
          subtitle={KIND_SPEC[kind].hint}
          action={<OpBtn variant="ghost" sm onClick={() => setDrafts((list) => [...list, newRule(kind)])}><Plus size={15} /> Thêm quy tắc</OpBtn>}
        >
          <OpTable rows={drafts.filter((d) => d.ruleKind === kind)} rowKey={(d) => d.key} columns={columnsFor(kind)} empty="Nhóm này chưa có quy tắc nào" />
        </OpPanel>
      ))}
      <div className="op-formfoot">{actions}</div>

      {activating && (
        <OpConfirm
          title={`Áp dụng phiên bản ${set.versionNo} cho ${crab}`}
          confirmLabel="Áp dụng"
          pending={activate.isPending}
          error={activate.error}
          disabled={gaps.length > 0}
          onClose={() => setActivating(false)}
          onConfirm={() => activate.mutate()}
        >
          {gaps.length > 0 && <OpNote tone="danger">{gaps.join(' ')}</OpNote>}
          <OpFlow steps={[
            { title: activeVersion === null ? `${crab} bắt đầu có bộ quy tắc áp dụng` : `Phiên bản ${activeVersion} chuyển sang "Đã thay thế"` },
            { title: 'Lô duyệt từ lúc này dùng bộ mới', sub: 'Lô đã duyệt trước đó giữ bộ cũ.' },
            { title: 'Bộ này không sửa được nữa' },
          ]} />
        </OpConfirm>
      )}
    </>
  )
}
