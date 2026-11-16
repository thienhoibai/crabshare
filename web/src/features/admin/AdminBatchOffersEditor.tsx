/* Bảng nhập chào giá theo quy cách cho form tạo Lô T, A (BR-043). Quy cách lấy từ GET /api/specs?crabType=.
   Một dòng được tính là có chào giá khi đã nhập giá; khi đó phải nhập đủ khối lượng quy đổi và số con chào bán.
   Nhập giá lần đầu thì khối lượng mỗi con tự lấy khối lượng trung bình dự kiến của Lô. */
import type { OfferRequest, SpecResponse } from '../../shared/api/api.gen'
import { MoneyInput, NumberInput, OpEmpty, QueryView, useGet } from '../../shared/ui/console'

export interface OfferDraft { pricePerKg: number | null; conversionWeightG: number | null; offeredQuantity: number | null }
export type OfferDrafts = Record<string, OfferDraft>

const EMPTY: OfferDraft = { pricePerKg: null, conversionWeightG: null, offeredQuantity: null }

/** Các dòng đã nhập giá, đổi sang OfferRequest. */
export const offersFromDrafts = (drafts: OfferDrafts): OfferRequest[] =>
  Object.entries(drafts)
    .filter(([, d]) => d.pricePerKg !== null)
    .map(([specCode, d]) => ({ specCode, pricePerKg: d.pricePerKg ?? 0, conversionWeightG: d.conversionWeightG ?? 0, offeredQuantity: d.offeredQuantity ?? 0 }))

/** Câu báo lỗi đầu tiên của bảng chào giá, hoặc null khi hợp lệ. */
export function offersProblem(drafts: OfferDrafts): string | null {
  const offers = offersFromDrafts(drafts)
  if (offers.length === 0) return 'Nhập giá cho ít nhất một quy cách.'
  for (const o of offers) {
    if ((o.conversionWeightG ?? 0) < 50 || (o.conversionWeightG ?? 0) > 5000) return `${o.specCode}: khối lượng mỗi con phải từ 50 đến 5.000 g.`
    if ((o.offeredQuantity ?? 0) < 1) return `${o.specCode}: nhập số con chào bán.`
  }
  return null
}

export default function AdminBatchOffersEditor({ crabType, defaultWeightG, value, onChange }: {
  crabType: string
  defaultWeightG: number | null
  value: OfferDrafts
  onChange: (next: OfferDrafts) => void
}) {
  const specs = useGet<SpecResponse[]>('/api/specs', { crabType })
  const patch = (code: string, part: Partial<OfferDraft>) => {
    const next = { ...(value[code] ?? EMPTY), ...part }
    if (part.pricePerKg != null && next.conversionWeightG === null) next.conversionWeightG = defaultWeightG
    onChange({ ...value, [code]: next })
  }

  return (
    <QueryView query={specs}>
      {(rows) => (rows.length === 0
        ? <OpEmpty title="Loại cua này chưa có quy cách để chào giá" />
        : (
          <div className="op-tablewrap">
            <table className="op-table">
              <thead>
                <tr>
                  <th>Quy cách</th>
                  <th>Giá mỗi kg</th>
                  <th>Mỗi con</th>
                  <th>Số con chào bán</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const d = value[s.specCode] ?? EMPTY
                  return (
                    <tr key={s.specCode}>
                      <td><b>{s.name}</b></td>
                      <td><MoneyInput sm aria-label={`Giá mỗi kg của ${s.name}`} value={d.pricePerKg} onChange={(v) => patch(s.specCode, { pricePerKg: v })} placeholder="Không chào" /></td>
                      <td><NumberInput sm unit="g" max={5000} aria-label={`Khối lượng mỗi con của ${s.name}`} value={d.conversionWeightG} onChange={(v) => patch(s.specCode, { conversionWeightG: v })} disabled={d.pricePerKg === null} /></td>
                      <td><NumberInput sm unit="con" max={100_000} aria-label={`Số con chào bán của ${s.name}`} value={d.offeredQuantity} onChange={(v) => patch(s.specCode, { offeredQuantity: v })} disabled={d.pricePerKg === null} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
    </QueryView>
  )
}
