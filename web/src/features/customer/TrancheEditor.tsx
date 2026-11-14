/* Chia một đơn đặt trước thành các đợt giao (BR-234). Dùng khi đặt (POST /api/preorders, trường tranches)
   và khi sửa trước lúc Lô chuyển sang bán và giao (PUT /api/preorders/{orderNo}/tranches).
   Quy tắc của API: mỗi đợt một ngày đến hạn không trước ngày nhận cua dự kiến của Lô; mỗi đợt có ít nhất một dòng;
   tổng các đợt của một quy cách bằng đúng số lượng đã đặt, cùng đơn vị với dòng đơn (con hoặc kg). */
import { Plus, Trash2 } from 'lucide-react'
import type { TrancheRequest } from '../../shared/api/api.gen'
import { DecimalInput, Field, Input, NumberInput, OpBadge, OpBtn, formatDate } from '../../shared/ui/console'
import { fmtKg } from './customerData'

export interface SplitLine {
  specCode: string
  specName: string
  mode: string
  /** Số lượng đã đặt của dòng, theo đơn vị của dòng (con hoặc kg). */
  qty: number
}

export interface TrancheDraft {
  dueDate: string
  /** Số lượng của từng quy cách trong đợt này; null là không giao quy cách đó ở đợt này. */
  qty: Record<string, number | null>
}

const grams = (n: number) => Math.round(n * 1000)
const show = (line: SplitLine, n: number) => (line.mode === 'ByKg' ? fmtKg(n) : `${n} con`)
const sumOf = (line: SplitLine, tranches: TrancheDraft[]) => tranches.reduce((sum, t) => sum + grams(t.qty[line.specCode] ?? 0), 0) / 1000

/** Hai đợt đầu tiên gợi ý: chia đôi từng dòng, đợt sau nhận phần lẻ. */
export function startSplit(lines: SplitLine[], firstDate: string): TrancheDraft[] {
  const half = (l: SplitLine) => (l.mode === 'ByKg' ? Math.round((l.qty / 2) * 1000) / 1000 : Math.floor(l.qty / 2))
  const first: TrancheDraft = { dueDate: firstDate, qty: Object.fromEntries(lines.map((l) => [l.specCode, half(l) || null])) }
  const second: TrancheDraft = { dueDate: '', qty: Object.fromEntries(lines.map((l) => [l.specCode, (grams(l.qty) - grams(half(l))) / 1000 || null])) }
  return [first, second]
}

/** Câu báo lỗi đầu tiên của bản chia, hoặc null khi gửi được. */
export function splitProblem(lines: SplitLine[], tranches: TrancheDraft[], minDate?: string | null): string | null {
  if (tranches.length === 0) return 'Cần ít nhất một đợt giao.'
  for (const [i, t] of tranches.entries()) {
    if (!t.dueDate) return `Chọn ngày đến hạn cho đợt ${i + 1}.`
    if (minDate && t.dueDate < minDate) return `Đợt ${i + 1} không được trước ngày nhận cua dự kiến của Lô (${formatDate(minDate)}).`
    if (!lines.some((l) => (t.qty[l.specCode] ?? 0) > 0)) return `Đợt ${i + 1} chưa có quy cách nào. Nhập số lượng hoặc xoá đợt.`
  }
  for (const l of lines) {
    if (grams(sumOf(l, tranches)) !== grams(l.qty)) return `Tổng các đợt của ${l.specName} phải bằng đúng ${show(l, l.qty)}.`
  }
  return null
}

/** Đổi bản chia thành body của API; thứ tự đợt theo ngày đến hạn. */
export function toTrancheRequests(lines: SplitLine[], tranches: TrancheDraft[]): TrancheRequest[] {
  return [...tranches]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((t, i) => ({
      seq: i + 1,
      dueDate: t.dueDate,
      lines: lines
        .filter((l) => (t.qty[l.specCode] ?? 0) > 0)
        .map((l) => {
          const n = t.qty[l.specCode] ?? 0
          return l.mode === 'ByKg' ? { specCode: l.specCode, qtyKg: grams(n) / 1000 } : { specCode: l.specCode, qtyCrabs: n }
        }),
    }))
}

export function TrancheEditor({ lines, value, onChange, minDate }: {
  lines: SplitLine[]
  value: TrancheDraft[]
  onChange: (next: TrancheDraft[]) => void
  minDate?: string | null
}) {
  const patch = (index: number, change: Partial<TrancheDraft>) => onChange(value.map((t, i) => (i === index ? { ...t, ...change } : t)))
  return (
    <div className="op-stack" style={{ gap: 12 }}>
      {value.map((t, i) => (
        <div key={i} className="op-subform">
          <div className="is-wide op-between">
            <b>Đợt {i + 1}</b>
            {value.length > 1 && (
              <OpBtn type="button" variant="ghost" sm onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 size={15} /> Xoá đợt</OpBtn>
            )}
          </div>
          <Field label="Ngày đến hạn giao" required>
            <Input type="date" sm value={t.dueDate} min={minDate ?? undefined} onChange={(e) => patch(i, { dueDate: e.target.value })} />
          </Field>
          {lines.map((l) => (
            <Field key={l.specCode} label={l.specName}>
              {l.mode === 'ByKg' ? (
                <DecimalInput sm unit="kg" value={t.qty[l.specCode] ?? null} onChange={(n) => patch(i, { qty: { ...t.qty, [l.specCode]: n } })} />
              ) : (
                <NumberInput sm unit="con" value={t.qty[l.specCode] ?? null} onChange={(n) => patch(i, { qty: { ...t.qty, [l.specCode]: n } })} />
              )}
            </Field>
          ))}
        </div>
      ))}
      <div className="op-between">
        <div className="op-inline">
          {lines.map((l) => {
            const done = sumOf(l, value)
            const ok = grams(done) === grams(l.qty)
            return <OpBadge key={l.specCode} tone={ok ? 'ok' : 'warn'}>{l.specCode}: đã chia {show(l, done)} / {show(l, l.qty)}</OpBadge>
          })}
        </div>
        <OpBtn type="button" variant="ghost" sm onClick={() => onChange([...value, { dueDate: '', qty: {} }])}><Plus size={15} /> Thêm đợt</OpBtn>
      </div>
    </div>
  )
}
