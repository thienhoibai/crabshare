/* Mô hình sửa bộ quy tắc phân hạng (BR-038): loại quy tắc, chỉ số và nhãn kết quả được phép, kiểm tra nhẹ trước khi gửi.
   Máy chủ kiểm tra lại đầy đủ (khoảng chồng nhau, đủ ngưỡng khi áp dụng). */
import type { GradeRuleRequest, GradeRuleResponse, GradeRuleSetResponse, GradingStandardResponse } from '../../../shared/api/api.gen'
import { label } from '../../../shared/ui/console'

export const RULE_KINDS = ['Size', 'PhysicalFactor', 'Sensory', 'Exclusion'] as const
export type RuleKind = (typeof RULE_KINDS)[number]

export const KIND_SPEC: Record<RuleKind, { metrics: string[]; results: string[]; unit: string; hint: string }> = {
  Size: { metrics: ['WeightG'], results: ['M', 'L', 'XL', 'OUT'], unit: 'g', hint: 'Size theo khối lượng cân từng con.' },
  PhysicalFactor: { metrics: ['CIndex'], results: ['SPECIAL', 'G1', 'BELOW'], unit: 'g/cm3', hint: 'Mức C = khối lượng (g) chia dài mai (cm) mũ ba.' },
  Sensory: { metrics: ['EdgeBandMm'], results: ['SPECIAL', 'G1', 'BELOW'], unit: 'mm', hint: 'Dải xuyên sáng ở viền mai khi soi đỏ, dùng cho cua gạch.' },
  Exclusion: { metrics: ['Alive', 'FoodSafe'], results: ['REJECT'], unit: 'flag', hint: 'Điều kiện bắt buộc. Con không đạt thì bị loại bỏ.' },
}

export const BOUNDARIES = ['LowerInclusive', 'UpperInclusive', 'BothInclusive'] as const

/** Loại cua được lập bộ quy tắc (khớp CreateRuleSetRequest). */
export const RULE_CRAB_TYPES = ['FatteningMudCrab', 'RoeCrab', 'YoungFemaleCrab', 'OilRoeCrab'] as const

/** Loại cua bắt buộc có đủ mức C Đặc cấp và Cấp 1 khi áp dụng. */
const C_REQUIRED = ['FatteningMudCrab', 'YoungFemaleCrab']

export interface RuleDraft {
  key: string
  ruleKind: RuleKind
  metric: string
  lowerBound: number | null
  upperBound: number | null
  unit: string
  resultLabel: string
  boundary: string
  note: string
}

let seq = 0
const nextKey = () => `r${++seq}`

const kindIndex = (kind: string) => RULE_KINDS.indexOf(kind as RuleKind)

export const sortRules = <T extends { ruleKind: string; sortOrder: number }>(rules: T[]) =>
  [...rules].sort((a, b) => kindIndex(a.ruleKind) - kindIndex(b.ruleKind) || a.sortOrder - b.sortOrder)

export const toDrafts = (set: GradeRuleSetResponse): RuleDraft[] =>
  sortRules(set.rules).map((r) => ({
    key: nextKey(),
    ruleKind: r.ruleKind as RuleKind,
    metric: r.metric,
    lowerBound: r.lowerBound,
    upperBound: r.upperBound,
    unit: r.unit,
    resultLabel: r.resultLabel,
    boundary: r.boundary,
    note: r.note ?? '',
  }))

export function newRule(kind: RuleKind): RuleDraft {
  const spec = KIND_SPEC[kind]
  return {
    key: nextKey(),
    ruleKind: kind,
    metric: spec.metrics[0],
    lowerBound: kind === 'Exclusion' ? 1 : null,
    upperBound: null,
    unit: spec.unit,
    resultLabel: spec.results[0],
    boundary: 'LowerInclusive',
    note: '',
  }
}

/** Thứ tự trong từng nhóm thành sortOrder (1, 2, 3…). */
export const toRequests = (drafts: RuleDraft[]): GradeRuleRequest[] =>
  RULE_KINDS.flatMap((kind) =>
    drafts.filter((d) => d.ruleKind === kind).map((d, i) => ({
      ruleKind: d.ruleKind,
      metric: d.metric,
      lowerBound: d.lowerBound,
      upperBound: d.upperBound,
      unit: d.unit.trim(),
      resultLabel: d.resultLabel,
      boundary: d.boundary,
      sortOrder: i + 1,
      note: d.note.trim() || null,
    })))

/** Chữ ký để biết bản đang sửa có khác bản đã lưu không. */
export const signature = (drafts: RuleDraft[], nearPct: number | null, note: string) => JSON.stringify([toRequests(drafts), nearPct, note.trim()])

export const resultName = (code: string) => (['M', 'L', 'XL', 'OUT'].includes(code) ? label('sizeCode', code) : label('gradeCode', code))

export const resultTone = (code: string) => (code === 'REJECT' || code === 'OUT' ? 'danger' : code === 'BELOW' ? 'warn' : 'ok')

/** "từ 300 tới dưới 350 g", "≥ 0,66 g/cm3", "< 0,62 g/cm3". */
export function rangeText(r: Pick<GradeRuleResponse, 'lowerBound' | 'upperBound' | 'boundary' | 'unit' | 'ruleKind'>): string {
  if (r.ruleKind === 'Exclusion') return 'Bắt buộc đạt'
  const lowerIn = r.boundary === 'LowerInclusive' || r.boundary === 'BothInclusive'
  const upperIn = r.boundary === 'UpperInclusive' || r.boundary === 'BothInclusive'
  const n = (v: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(v)
  const unit = r.unit ? ` ${r.unit}` : ''
  if (r.lowerBound !== null && r.upperBound !== null) return `${lowerIn ? 'từ' : 'trên'} ${n(r.lowerBound)} ${upperIn ? 'đến' : 'tới dưới'} ${n(r.upperBound)}${unit}`
  if (r.lowerBound !== null) return `${lowerIn ? '≥' : '>'} ${n(r.lowerBound)}${unit}`
  if (r.upperBound !== null) return `${upperIn ? '≤' : '<'} ${n(r.upperBound)}${unit}`
  return 'Mọi giá trị'
}

export interface Validation {
  problems: string[]
  /** Khoá của các dòng có lỗi, để tô viền. */
  bad: Set<string>
}

/** Kiểm tra nhẹ phía trình duyệt; quy tắc chồng khoảng do máy chủ báo. */
export function validate(drafts: RuleDraft[], nearPct: number | null, note: string): Validation {
  const problems: string[] = []
  const bad = new Set<string>()
  const flag = (d: RuleDraft, text: string) => {
    bad.add(d.key)
    if (!problems.includes(text)) problems.push(text)
  }
  if (drafts.length === 0) problems.push('Bộ quy tắc cần ít nhất một quy tắc.')
  if (nearPct === null || nearPct < 0 || nearPct > 20) problems.push('Dải sát ngưỡng phải từ 0 đến 20%.')
  if (note.trim().length > 500) problems.push('Ghi chú của bộ quy tắc tối đa 500 ký tự.')
  for (const kind of RULE_KINDS) {
    const rows = drafts.filter((d) => d.ruleKind === kind)
    if (rows.length > 100) problems.push(`Nhóm "${label('ruleKind', kind)}" tối đa 100 quy tắc.`)
    for (const d of rows) {
      const name = `"${label('ruleKind', kind)}"`
      if (d.lowerBound !== null && d.upperBound !== null && d.lowerBound >= d.upperBound) flag(d, `Nhóm ${name}: cận dưới phải nhỏ hơn cận trên.`)
      if (kind !== 'Exclusion' && d.lowerBound === null && d.upperBound === null) flag(d, `Nhóm ${name}: mỗi quy tắc cần ít nhất một cận.`)
      if (!d.unit.trim() || d.unit.trim().length > 20) flag(d, `Nhóm ${name}: đơn vị cần từ 1 đến 20 ký tự.`)
      if (d.note.trim().length > 300) flag(d, `Nhóm ${name}: ghi chú của một quy tắc tối đa 300 ký tự.`)
    }
  }
  return { problems, bad }
}

/** Những gì còn thiếu để áp dụng được (máy chủ kiểm tra lại khi bấm Áp dụng). */
export function activationGaps(crabType: string, rules: { ruleKind: string; metric: string; resultLabel: string }[]): string[] {
  const gaps: string[] = []
  const sizes = new Set(rules.filter((r) => r.ruleKind === 'Size' && r.metric === 'WeightG').map((r) => r.resultLabel))
  const missingSizes = ['M', 'L', 'XL'].filter((s) => !sizes.has(s))
  if (missingSizes.length) gaps.push(`Thiếu ngưỡng size ${missingSizes.join(', ')} theo khối lượng.`)
  if (C_REQUIRED.includes(crabType)) {
    const levels = new Set(rules.filter((r) => r.ruleKind === 'PhysicalFactor' && r.metric === 'CIndex').map((r) => r.resultLabel))
    const missing = ['SPECIAL', 'G1'].filter((l) => !levels.has(l))
    if (missing.length) gaps.push(`Thiếu mức C ${missing.map((m) => label('gradeCode', m)).join(', ')}.`)
  }
  return gaps
}

export interface FoundRuleSet {
  standard: GradingStandardResponse
  set: GradeRuleSetResponse
}

export const findRuleSet = (standards: GradingStandardResponse[], id: number): FoundRuleSet | null => {
  for (const standard of standards) {
    const set = standard.ruleSets.find((s) => s.id === id)
    if (set) return { standard, set }
  }
  return null
}
