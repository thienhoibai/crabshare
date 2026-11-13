/* Điều khoản của một Lô P nháp (BatchRequest, BR-018…055): POST /api/batches khi tạo, PUT /api/batches/{code} khi sửa.
   Form chia hai bước ngắn dùng chung một trạng thái: "Lô" (thông tin và lưu nuôi) rồi "Giá và vốn" (chào giá, giá sàn, vốn, thù lao).
   Ô ít dùng có sẵn giá trị mặc định và nằm trong khối gấp. Vốn mục tiêu do hệ thống tính ở bước chi phí; hạn gọi vốn do Admin đặt khi duyệt. */
import { useState, type FormEvent } from 'react'
import { ArrowRight, Plus, Save, Trash2 } from 'lucide-react'
import type { BatchRequest, BatchResponse, PartySiteResponse, PartySummaryResponse } from '../../shared/api/api.gen'
import {
  DecimalInput, Field, Input, MoneyInput, NumberInput, OpBtn, OpMore, OpNote, OpPanel, RadioCards, Select, TextArea, errorMessage, formatVnd, label, useGet, useSend,
} from '../../shared/ui/console'
import BatchOffersEditor, { offersToRequest, type OfferDrafts } from './BatchOffersEditor'
import { todayIso } from './opA'

export type TermsPart = 'lo' | 'gia'
const CRAB_TYPES = ['FatteningMudCrab', 'RoeCrab', 'YoungFemaleCrab', 'OilRoeCrab']
type Tier = { id: number; from: number | null; to: number | null; rate: number | null }
let tierId = 1

function initial(b: BatchResponse | null) {
  const offers: OfferDrafts = {}
  b?.offers.forEach((o) => { offers[o.specCode] = { pricePerKg: o.pricePerKg, conversionWeightG: o.conversionWeightG, offeredQuantity: o.offeredQuantity } })
  return {
    title: b?.title ?? '',
    crabType: b?.crabType ?? 'FatteningMudCrab',
    plannedQuantity: b?.plannedQuantity ?? null as number | null,
    hasHolding: b?.hasHolding ?? true,
    holdingDays: b?.holdingDays ?? 30 as number | null,
    restockCutoffDays: b?.restockCutoffDays ?? 15 as number | null,
    expectedAvgWeightG: b?.expectedAvgWeightG ?? null as number | null,
    expectedGrade: b?.expectedGrade ?? '',
    saleDays: b?.saleDays ?? 14 as number | null,
    deliveryRadiusKm: b?.deliveryRadiusKm ?? 50 as number | null,
    dispatchSiteId: b?.dispatchSite ? String(b.dispatchSite.siteId) : '',
    expectedReceiptDate: b?.expectedReceiptDate ?? '',
    minViableCapital: b && b.minViableCapital > 1 ? b.minViableCapital : null as number | null,
    minViableBasis: b?.minViableBasis ?? '',
    survivalThresholdPct: b?.survivalThresholdPct ?? 85 as number | null,
    baseRemunerationPct: b?.baseRemunerationPct ?? null as number | null,
    floorPricePerKg: b?.floorPricePerKg ?? null as number | null,
    offtakeBuyerPartyId: b?.offtakeBuyer ? String(b.offtakeBuyer.partyId) : '',
    settlementBasis: b?.settlementBasis ?? 'StandardCost',
    offers,
  }
}

/** Bậc thù lao đã lưu có đúng là bộ mặc định (dưới ngưỡng nhận một nửa, từ ngưỡng nhận đủ) hay do người nuôi tự khai. */
function hasDefaultTiers(b: BatchResponse) {
  const t = b.remunerationTiers
  const threshold = b.survivalThresholdPct
  const base = b.baseRemunerationPct
  if (t.length === 0 || threshold === null || base === null) return true
  if (threshold <= 0) return t.length === 1
  return t.length === 2 && t[0].survivalToPct === threshold && t[1].ratePct === base && Math.abs(t[0].ratePct - base / 2) < 0.006
}

const half = (rate: number | null) => (rate === null ? null : Math.round(rate * 50) / 100)

export default function BatchTermsForm({ batch, part, onPart, onSaved }: {
  batch: BatchResponse | null
  part: TermsPart
  onPart: (next: TermsPart) => void
  onSaved: (saved: BatchResponse) => void
}) {
  const [f, setF] = useState(() => initial(batch))
  const [customTiers, setCustomTiers] = useState(() => !!batch && !hasDefaultTiers(batch))
  const [tiers, setTiers] = useState<Tier[]>(() => (batch?.remunerationTiers ?? []).map((t) => ({ id: tierId++, from: t.survivalFromPct, to: t.survivalToPct, rate: t.ratePct })))
  const sites = useGet<PartySiteResponse[]>('/api/me/sites')
  const buyers = useGet<PartySummaryResponse[]>('/api/parties/directory', { roleType: 'OfftakeBuyer' })
  const save = useSend<BatchResponse, BatchRequest>(batch ? 'put' : 'post', batch ? `/api/batches/${encodeURIComponent(batch.batchCode)}` : '/api/batches', {
    success: batch ? 'Đã lưu Lô.' : 'Đã tạo Lô nháp.', onSuccess: onSaved, quietError: true,
  })
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF((old) => ({ ...old, [key]: value }))
  const patchTier = (id: number, change: Partial<Tier>) => setTiers((old) => old.map((x) => (x.id === id ? { ...x, ...change } : x)))

  const dispatchSites = (sites.data ?? []).filter((s) => s.status === 'Active' && (s.siteType === 'Farm' || s.siteType === 'Warehouse'))
  const offers = offersToRequest(f.offers)
  const minOffer = offers && offers.length ? Math.min(...offers.map((o) => o.pricePerKg ?? 0)) : null
  const base = f.baseRemunerationPct
  const threshold = f.survivalThresholdPct
  // Điều còn thiếu của từng bước; chỉ hiện điều đầu tiên cạnh nút.
  const missingLot = [
    !f.title.trim() && 'Nhập tên Lô',
    !f.plannedQuantity && 'Nhập số con',
    (!f.expectedAvgWeightG || f.expectedAvgWeightG < 50) && 'Khối lượng trung bình từ 50 g',
    (!f.expectedReceiptDate || f.expectedReceiptDate <= todayIso()) && 'Ngày nhận cua phải sau hôm nay',
    f.hasHolding && !f.holdingDays && 'Nhập số ngày nuôi',
    !f.saleDays && 'Nhập số ngày bán',
    !f.deliveryRadiusKm && 'Nhập bán kính giao',
  ].filter(Boolean) as string[]
  const missingPrice = [
    (!offers || offers.length === 0) && 'Chọn ít nhất một quy cách và điền đủ ba ô',
    !f.floorPricePerKg && 'Nhập giá sàn',
    minOffer !== null && f.floorPricePerKg !== null && f.floorPricePerKg > minOffer && `Giá sàn không cao hơn ${formatVnd(minOffer)}`,
    !f.offtakeBuyerPartyId && 'Chọn bên cam kết thu mua',
    !f.minViableCapital && 'Nhập vốn tối thiểu khả thi',
    !f.minViableBasis.trim() && 'Ghi căn cứ của vốn tối thiểu',
    (threshold === null || base === null) && 'Nhập ngưỡng tỷ lệ sống và thù lao',
    customTiers && tiers.some((t) => t.from === null || t.to === null || t.rate === null) && 'Điền đủ các bậc thù lao',
  ].filter(Boolean) as string[]

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (part === 'lo') { if (missingLot.length === 0) onPart('gia'); return }
    if (missingLot.length) return onPart('lo')
    if (missingPrice.length || !offers) return
    save.mutate({
      title: f.title.trim(), crabType: f.crabType, plannedQuantity: f.plannedQuantity ?? 0, hasHolding: f.hasHolding,
      holdingDays: f.hasHolding ? f.holdingDays : null, restockCutoffDays: f.hasHolding ? f.restockCutoffDays : null,
      expectedAvgWeightG: f.expectedAvgWeightG ?? 0, expectedGrade: f.expectedGrade.trim() || null, saleDays: f.saleDays ?? 14,
      deliveryRadiusKm: f.deliveryRadiusKm ?? 50, dispatchSiteId: f.dispatchSiteId ? Number(f.dispatchSiteId) : null,
      expectedReceiptDate: f.expectedReceiptDate, minViableCapital: f.minViableCapital, minViableBasis: f.minViableBasis.trim(),
      survivalThresholdPct: threshold, baseRemunerationPct: base,
      remunerationTiers: customTiers ? tiers.map((t) => ({ survivalFromPct: t.from ?? 0, survivalToPct: t.to ?? 0, ratePct: t.rate ?? 0 })) : [],
      floorPricePerKg: f.floorPricePerKg ?? 0, offtakeBuyerPartyId: Number(f.offtakeBuyerPartyId), settlementBasis: f.settlementBasis, offers,
    })
  }
  const missing = part === 'lo' ? missingLot : missingPrice

  return (
    <form className="op-stack" onSubmit={submit} noValidate>
      {part === 'lo' ? (
        <OpPanel title="Thông tin Lô">
          <div className="op-form">
            <Field label="Tên Lô" required>
              <Input value={f.title} maxLength={200} onChange={(e) => set('title', e.target.value)} placeholder="Cua thịt hộp Năm Căn — đợt tháng 12" />
            </Field>
            <div className="op-form__row">
              <Field label="Loại cua" required>
                <Select value={f.crabType} onChange={(e) => setF((old) => ({ ...old, crabType: e.target.value, offers: {} }))}>
                  {CRAB_TYPES.map((c) => <option key={c} value={c}>{label('crabType', c)}</option>)}
                </Select>
              </Field>
              <Field label="Số con" required>
                <NumberInput unit="con" max={100000} value={f.plannedQuantity} onChange={(v) => set('plannedQuantity', v)} />
              </Field>
              <Field label="Khối lượng trung bình" required>
                <NumberInput unit="g" max={5000} value={f.expectedAvgWeightG} onChange={(v) => set('expectedAvgWeightG', v)} />
              </Field>
            </div>
            <div className="op-form__row">
              <Field label="Ngày nhận cua dự kiến" required>
                <Input type="date" min={todayIso()} value={f.expectedReceiptDate} onChange={(e) => set('expectedReceiptDate', e.target.value)} />
              </Field>
              {f.hasHolding && (
                <Field label="Số ngày nuôi" required>
                  <NumberInput unit="ngày" max={365} value={f.holdingDays} onChange={(v) => set('holdingDays', v)} />
                </Field>
              )}
            </div>
            <RadioCards<'yes' | 'no'>
              value={f.hasHolding ? 'yes' : 'no'}
              onChange={(v) => set('hasHolding', v === 'yes')}
              options={[{ value: 'yes', label: 'Có lưu nuôi', hint: 'Nuôi từng con trong hộp' }, { value: 'no', label: 'Không lưu nuôi', hint: 'Mua về, kiểm rồi giao' }]}
            />
            <OpMore label="Tuỳ chọn thêm">
              <div className="op-form__row">
                <Field label="Số ngày bán">
                  <NumberInput unit="ngày" max={180} value={f.saleDays} onChange={(v) => set('saleDays', v)} />
                </Field>
                <Field label="Bán kính giao">
                  <DecimalInput unit="km" value={f.deliveryRadiusKm} onChange={(v) => set('deliveryRadiusKm', v)} />
                </Field>
                {f.hasHolding && (
                  <Field label="Hạn thả bù" hint="Tính từ ngày thả đầu tiên">
                    <NumberInput unit="ngày" max={365} value={f.restockCutoffDays} onChange={(v) => set('restockCutoffDays', v)} />
                  </Field>
                )}
              </div>
              <div className="op-form__row">
                <Field label="Hạng dự kiến">
                  <Input value={f.expectedGrade} maxLength={50} onChange={(e) => set('expectedGrade', e.target.value)} placeholder="Đặc cấp, Cấp 1" />
                </Field>
                <Field label="Nơi xuất hàng">
                  <Select value={f.dispatchSiteId} onChange={(e) => set('dispatchSiteId', e.target.value)}>
                    <option value="">Trại mặc định</option>
                    {dispatchSites.map((s) => <option key={s.siteId} value={s.siteId} disabled={s.latitude === null}>{s.name}{s.latitude === null ? ' (chưa có toạ độ)' : ''}</option>)}
                  </Select>
                </Field>
                <Field label="Cơ sở quyết toán">
                  <Select value={f.settlementBasis} onChange={(e) => set('settlementBasis', e.target.value)}>
                    <option value="StandardCost">Theo Chi phí chuẩn</option>
                    <option value="ActualCost">Theo chi phí thực tế</option>
                  </Select>
                </Field>
              </div>
            </OpMore>
          </div>
        </OpPanel>
      ) : (
        <>
          <OpPanel title="Giá bán" subtitle="Chọn quy cách sẽ bán rồi điền giá, khối lượng mỗi con và số con.">
            <BatchOffersEditor crabType={f.crabType} value={f.offers} onChange={(next) => set('offers', next)} expectedWeightG={f.expectedAvgWeightG} />
            <div className="op-form__row">
              <Field label="Giá sàn mỗi kg" required hint="Không cao hơn giá chào thấp nhất">
                <MoneyInput value={f.floorPricePerKg} onChange={(v) => set('floorPricePerKg', v)} />
              </Field>
              <Field label="Bên cam kết thu mua" required>
                <Select value={f.offtakeBuyerPartyId} onChange={(e) => set('offtakeBuyerPartyId', e.target.value)}>
                  <option value="">Chọn đối tác</option>
                  {batch?.offtakeBuyer && !(buyers.data ?? []).some((p) => p.partyId === batch.offtakeBuyer?.partyId) && (
                    <option value={batch.offtakeBuyer.partyId}>{batch.offtakeBuyer.legalName}</option>
                  )}
                  {(buyers.data ?? []).map((p) => <option key={p.partyId} value={p.partyId}>{p.legalName}</option>)}
                </Select>
              </Field>
            </div>
            {buyers.data?.length === 0 && <OpNote tone="danger">Chưa có bên thu mua nào đã xác minh. <a className="op-link" href="/operator/partners">Thêm đối tác</a></OpNote>}
          </OpPanel>

          <OpPanel title="Vốn và thù lao" subtitle="Vốn mục tiêu tính ở bước chi phí. Hạn gọi vốn do Admin đặt khi duyệt.">
            <div className="op-form">
              <div className="op-form__row">
                <Field label="Vốn tối thiểu khả thi" required>
                  <MoneyInput value={f.minViableCapital} onChange={(v) => set('minViableCapital', v)} />
                </Field>
                <Field label="Ngưỡng tỷ lệ sống" required>
                  <DecimalInput unit="%" value={f.survivalThresholdPct} onChange={(v) => set('survivalThresholdPct', v)} />
                </Field>
                <Field label="Thù lao khi đạt ngưỡng" required>
                  <DecimalInput unit="%" value={f.baseRemunerationPct} onChange={(v) => set('baseRemunerationPct', v)} />
                </Field>
              </div>
              <Field label="Căn cứ của vốn tối thiểu" required>
                <TextArea rows={2} maxLength={300} value={f.minViableBasis} onChange={(e) => set('minViableBasis', e.target.value)} placeholder="Đủ nuôi 120 con, quy mô nhỏ nhất còn bù được chi phí cố định" />
              </Field>
              <OpMore label={customTiers ? 'Bậc thù lao tự khai' : `Bậc thù lao: dưới ngưỡng ${half(base) ?? '…'}%, đạt ngưỡng ${base ?? '…'}%`} defaultOpen={customTiers}>
                {!customTiers ? (
                  <div className="op-inline">
                    <OpBtn type="button" variant="ghost" sm onClick={() => {
                      setCustomTiers(true)
                      if (tiers.length === 0) setTiers([{ id: tierId++, from: 0, to: threshold, rate: half(base) }, { id: tierId++, from: threshold, to: 100, rate: base }])
                    }}>Tự khai các bậc</OpBtn>
                  </div>
                ) : (
                  <>
                    {tiers.map((t, index) => (
                      <div key={t.id} className="op-subform">
                        <Field label={`Bậc ${index + 1}: sống từ`}><DecimalInput sm unit="%" value={t.from} onChange={(v) => patchTier(t.id, { from: v })} /></Field>
                        <Field label="Đến dưới"><DecimalInput sm unit="%" value={t.to} onChange={(v) => patchTier(t.id, { to: v })} /></Field>
                        <Field label="Thù lao"><DecimalInput sm unit="%" value={t.rate} onChange={(v) => patchTier(t.id, { rate: v })} /></Field>
                        <OpBtn type="button" variant="ghost" sm disabled={tiers.length <= 1} onClick={() => setTiers((old) => old.filter((x) => x.id !== t.id))} aria-label={`Xoá bậc ${index + 1}`}><Trash2 size={14} /></OpBtn>
                      </div>
                    ))}
                    <div className="op-inline">
                      <OpBtn type="button" variant="ghost" sm onClick={() => setTiers((old) => [...old, { id: tierId++, from: old[old.length - 1]?.to ?? 0, to: 100, rate: base }])}><Plus size={15} /> Thêm bậc</OpBtn>
                      <OpBtn type="button" variant="ghost" sm onClick={() => setCustomTiers(false)}>Dùng bậc mặc định</OpBtn>
                    </div>
                  </>
                )}
              </OpMore>
            </div>
          </OpPanel>
        </>
      )}

      {save.isError && <OpNote tone="danger">{errorMessage(save.error)}</OpNote>}
      <div className="op-formfoot">
        {missing.length > 0 && <span className="op-warn" style={{ fontSize: 14, marginRight: 'auto' }}>{missing[0]}</span>}
        {part === 'gia' && <OpBtn type="button" variant="ghost" onClick={() => onPart('lo')}>Quay lại</OpBtn>}
        {part === 'lo'
          ? <OpBtn type="submit" disabled={missingLot.length > 0}>Tiếp tục <ArrowRight size={16} /></OpBtn>
          : <OpBtn type="submit" disabled={missingPrice.length > 0 || save.isPending}><Save size={16} /> {save.isPending ? 'Đang lưu…' : batch ? 'Lưu Lô' : 'Tạo Lô nháp'}</OpBtn>}
      </div>
    </form>
  )
}
