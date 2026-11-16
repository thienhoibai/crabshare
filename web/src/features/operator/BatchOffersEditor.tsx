/* Bảng chào giá theo quy cách của một Lô (BR-043): chọn quy cách từ GET /api/specs?crabType=, khai giá mỗi kg,
   khối lượng quy đổi mỗi con và số con chào bán. Cùng size thì hạng cao hơn không rẻ hơn; cùng hạng thì size lớn hơn không rẻ hơn. */
import type { OfferRequest, SpecResponse } from '../../shared/api/api.gen'
import { Checkbox, MoneyInput, NumberInput, OpEmpty, QueryView, useGet } from '../../shared/ui/console'

export type OfferDraft = { pricePerKg: number | null; conversionWeightG: number | null; offeredQuantity: number | null }
export type OfferDrafts = Record<string, OfferDraft>

/** Gom các dòng đã chọn và đã điền đủ thành body gửi API; trả null khi còn dòng thiếu số. */
export function offersToRequest(drafts: OfferDrafts): OfferRequest[] | null {
  const rows = Object.entries(drafts)
  if (rows.some(([, o]) => !o.pricePerKg || !o.conversionWeightG || !o.offeredQuantity)) return null
  return rows.map(([specCode, o]) => ({ specCode, pricePerKg: o.pricePerKg!, conversionWeightG: o.conversionWeightG!, offeredQuantity: o.offeredQuantity! }))
}

export default function BatchOffersEditor({ crabType, value, onChange, expectedWeightG }: {
  crabType: string
  value: OfferDrafts
  onChange: (next: OfferDrafts) => void
  /** Khối lượng trung bình dự kiến của Lô, điền sẵn vào ô quy đổi khi chọn một quy cách. */
  expectedWeightG: number | null
}) {
  const specs = useGet<SpecResponse[]>('/api/specs', { crabType })
  const offered = Object.values(value).reduce((sum, o) => sum + (o.offeredQuantity ?? 0), 0)

  const toggle = (spec: SpecResponse, on: boolean) => {
    const next = { ...value }
    if (on) next[spec.specCode] = { pricePerKg: null, conversionWeightG: expectedWeightG, offeredQuantity: null }
    else delete next[spec.specCode]
    onChange(next)
  }
  const patch = (code: string, part: Partial<OfferDraft>) => onChange({ ...value, [code]: { ...value[code], ...part } })

  return (
    <QueryView query={specs}>
      {(rows) => rows.length === 0 ? <OpEmpty title="Loại cua này chưa có quy cách nào" /> : (
        <div className="op-tablewrap">
          <table className="op-table">
            <thead>
              <tr>
                <th>Quy cách</th>
                <th className="is-num" style={{ width: 180 }}>Giá mỗi kg</th>
                <th className="is-num" style={{ width: 140 }}>Mỗi con</th>
                <th className="is-num" style={{ width: 140 }}>Số con</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const o = value[s.specCode]
                return (
                  <tr key={s.specCode}>
                    <td><Checkbox checked={!!o} onChange={(on) => toggle(s, on)}><b style={{ color: 'var(--fg)' }}>{s.name}</b></Checkbox></td>
                    <td className="is-num">{o && <MoneyInput sm value={o.pricePerKg} onChange={(v) => patch(s.specCode, { pricePerKg: v })} aria-label={`Giá mỗi kg của ${s.name}`} />}</td>
                    <td className="is-num">{o && <NumberInput sm unit="g" max={5000} value={o.conversionWeightG} onChange={(v) => patch(s.specCode, { conversionWeightG: v })} aria-label={`Khối lượng quy đổi mỗi con của ${s.name}`} />}</td>
                    <td className="is-num">{o && <NumberInput sm unit="con" max={100000} value={o.offeredQuantity} onChange={(v) => patch(s.specCode, { offeredQuantity: v })} aria-label={`Số con chào bán của ${s.name}`} />}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr><td colSpan={3}>Tổng số con chào bán</td><td className="is-num"><b>{offered} con</b></td></tr>
            </tfoot>
          </table>
        </div>
      )}
    </QueryView>
  )
}
