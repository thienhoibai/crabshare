/* /admin/batches/new — Quản trị tạo Lô T hoặc Lô A (BR-018…020) qua ba bước ngắn. POST /api/admin/batches (AdminBatchRequest).
   Lô T: CrabShare là đơn vị thực hiện. Lô A: nhà cung cấp đã xác minh là đơn vị thực hiện, CrabShare thu hoa hồng (BR-201).
   Lô tạo xong ở trạng thái nháp; trang chi tiết Lô có phần kế hoạch chi phí, gửi duyệt và duyệt.
   Địa điểm xuất hàng không chọn ở đây: backend lấy trại hoặc kho mặc định của đơn vị thực hiện hoặc hộ nuôi vận hành (BR-084). */
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import type {
  AdminBatchRequest, BatchResponse, PagedResultOfAdminOperatorResponse, PagedResultOfPartySummaryResponse,
} from '../../shared/api/api.gen'
import {
  Checkbox, DecimalInput, Field, Input, MoneyInput, NumberInput, OpBack, OpBtn, OpHeading, OpMore, OpNote, OpPanel, OpSteps, RadioCards, Select,
  errorMessage, formatVnd, label, useGet, useSend,
} from '../../shared/ui/console'
import { settlementBasisLabel, vnDate } from './adminPartA'
import AdminBatchOffersEditor, { offersFromDrafts, offersProblem, type OfferDrafts } from './AdminBatchOffersEditor'

/** Bảng phân loại cua đang dùng (BR-028). */
const CRAB_TYPES = ['FatteningMudCrab', 'RoeCrab', 'YoungFemaleCrab', 'OilRoeCrab']
const STEPS = ['Loại Lô và các bên', 'Kế hoạch', 'Chào giá']
type Mode = 'T' | 'A'

export default function AdminBatchCreate() {
  const navigate = useNavigate()
  const farms = useGet<PagedResultOfAdminOperatorResponse>('/api/admin/operators', { status: 'Approved', pageSize: 100 })
  const suppliers = useGet<PagedResultOfPartySummaryResponse>('/api/admin/parties', { roleType: 'Supplier', verificationStatus: 'Verified', pageSize: 100 })
  const buyers = useGet<PagedResultOfPartySummaryResponse>('/api/admin/parties', { roleType: 'OfftakeBuyer', verificationStatus: 'Verified', pageSize: 100 })

  const [step, setStep] = useState(1)
  const [mode, setMode] = useState<Mode>('T')
  const [operatorPick, setOperatorPick] = useState('')
  const [supplierPick, setSupplierPick] = useState('')
  const [buyerPick, setBuyerPick] = useState('')
  const [commissionPct, setCommissionPct] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [crabType, setCrabType] = useState(CRAB_TYPES[0])
  const [plannedQuantity, setPlannedQuantity] = useState<number | null>(null)
  const [hasHolding, setHasHolding] = useState(false)
  const [holdingDays, setHoldingDays] = useState<number | null>(null)
  const [expectedAvgWeightG, setExpectedAvgWeightG] = useState<number | null>(null)
  const [expectedGrade, setExpectedGrade] = useState('')
  const [saleDays, setSaleDays] = useState<number | null>(14)
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState<number | null>(50)
  const [expectedReceiptDate, setExpectedReceiptDate] = useState('')
  const [settlementBasis, setSettlementBasis] = useState('StandardCost')
  const [floorPricePerKg, setFloorPricePerKg] = useState<number | null>(null)
  const [offers, setOffers] = useState<OfferDrafts>({})
  const [message, setMessage] = useState('')

  // Chỉ có một lựa chọn thì chọn sẵn.
  const only = (ids: number[] | undefined) => (ids?.length === 1 ? String(ids[0]) : '')
  const operatorId = operatorPick || only(farms.data?.items.map((f) => f.operatorId))
  const supplierId = supplierPick || only(suppliers.data?.items.map((p) => p.partyId))
  const buyerId = buyerPick || only(buyers.data?.items.map((p) => p.partyId))

  const create = useSend<BatchResponse, AdminBatchRequest>('post', '/api/admin/batches', {
    success: (b) => `Đã tạo Lô ${b.batchCode}.`,
    quietError: true,
    onSuccess: (b) => navigate(`/admin/batches/${encodeURIComponent(b.batchCode)}`),
  })

  const offerList = offersFromDrafts(offers)
  const minOffer = offerList.length ? Math.min(...offerList.map((o) => o.pricePerKg ?? 0)) : null
  const offeredTotal = offerList.reduce((n, o) => n + (o.offeredQuantity ?? 0), 0)

  const problems: Record<number, () => string | null> = {
    1: () => {
      if (!operatorId) return 'Chọn hộ nuôi vận hành.'
      if (!buyerId) return 'Chọn bên cam kết thu mua.'
      if (mode === 'A' && !supplierId) return 'Lô A phải chọn nhà cung cấp.'
      if (mode === 'A' && commissionPct !== null && (commissionPct < 0 || commissionPct > 100)) return 'Tỷ lệ hoa hồng phải từ 0 đến 100%.'
      return null
    },
    2: () => {
      if (!title.trim()) return 'Nhập tên Lô.'
      if (!plannedQuantity || plannedQuantity > 100_000) return 'Số cua kế hoạch phải từ 1 đến 100.000 con.'
      if (!expectedAvgWeightG || expectedAvgWeightG < 50 || expectedAvgWeightG > 5000) return 'Khối lượng trung bình phải từ 50 đến 5.000 g.'
      if (!expectedReceiptDate || expectedReceiptDate <= vnDate()) return 'Ngày nhận cua phải ở tương lai.'
      if (hasHolding && !holdingDays) return 'Nhập số ngày lưu nuôi.'
      if (!saleDays || saleDays > 180) return 'Số ngày bán phải từ 1 đến 180.'
      if (!deliveryRadiusKm || deliveryRadiusKm < 0.1 || deliveryRadiusKm > 2000) return 'Bán kính giao phải từ 0,1 đến 2.000 km.'
      return null
    },
    3: () => {
      const offerIssue = offersProblem(offers)
      if (offerIssue) return offerIssue
      if (!floorPricePerKg) return 'Nhập giá sàn.'
      if (minOffer !== null && floorPricePerKg > minOffer) return 'Giá sàn không được cao hơn giá chào thấp nhất.'
      return null
    },
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const issue = problems[step]()
    setMessage(issue ?? '')
    if (issue) return
    if (step < 3) return setStep(step + 1)
    create.mutate({
      batchMode: mode,
      operatorId: Number(operatorId),
      supplierPartyId: mode === 'A' ? Number(supplierId) : null,
      commissionPct: mode === 'A' ? commissionPct ?? 0 : null,
      terms: {
        title: title.trim(),
        crabType,
        plannedQuantity: plannedQuantity ?? 0,
        hasHolding,
        holdingDays: hasHolding ? holdingDays : null,
        expectedAvgWeightG: expectedAvgWeightG ?? 0,
        expectedGrade: expectedGrade.trim() || null,
        saleDays: saleDays ?? 14,
        deliveryRadiusKm: deliveryRadiusKm ?? 50,
        expectedReceiptDate,
        floorPricePerKg: floorPricePerKg ?? 0,
        offtakeBuyerPartyId: Number(buyerId),
        settlementBasis,
        offers: offerList,
      },
    })
  }

  const loadError = farms.error ?? suppliers.error ?? buyers.error
  const lacking = buyers.data?.items.length === 0 ? 'bên cam kết thu mua' : mode === 'A' && suppliers.data?.items.length === 0 ? 'nhà cung cấp' : null
  // Một ghi chú mỗi bước: lỗi nhập, lỗi tải danh sách, hoặc lỗi nghiệp vụ từ API khi tạo.
  const danger = message || (step === 1 && loadError ? errorMessage(loadError) : '') || (create.isError ? errorMessage(create.error) : '')

  return (
    <>
      <OpHeading
        crumb={<OpBack href="/admin/batches"><ArrowLeft size={16} /> Duyệt và tạo Lô</OpBack>}
        eyebrow="Lô"
        title="Tạo Lô T hoặc Lô A"
      />

      <form className="op-form" onSubmit={submit} noValidate>
        <OpSteps step={step} total={3} />
        <OpPanel title={`Bước ${step}/3 · ${STEPS[step - 1]}`}>
          {step === 1 && (
            <>
              <RadioCards<Mode>
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'T', label: 'Lô T · thương mại', hint: 'CrabShare mua và bán' },
                  { value: 'A', label: 'Lô A · đại lý', hint: 'Nhà cung cấp bán, CrabShare thu hoa hồng' },
                ]}
              />
              <div className="op-form__row">
                <Field label="Hộ nuôi vận hành" required>
                  <Select value={operatorId} onChange={(e) => setOperatorPick(e.target.value)}>
                    <option value="">Chọn hộ nuôi</option>
                    {farms.data?.items.map((f) => <option key={f.operatorId} value={f.operatorId}>{f.legalName}</option>)}
                  </Select>
                </Field>
                <Field label="Bên cam kết thu mua" required>
                  <Select value={buyerId} onChange={(e) => setBuyerPick(e.target.value)}>
                    <option value="">Chọn bên cam kết thu mua</option>
                    {buyers.data?.items.map((p) => <option key={p.partyId} value={p.partyId}>{p.legalName}</option>)}
                  </Select>
                </Field>
              </div>
              {mode === 'A' && (
                <div className="op-form__row">
                  <Field label="Nhà cung cấp" required>
                    <Select value={supplierId} onChange={(e) => setSupplierPick(e.target.value)}>
                      <option value="">Chọn nhà cung cấp</option>
                      {suppliers.data?.items.map((p) => <option key={p.partyId} value={p.partyId}>{p.legalName}</option>)}
                    </Select>
                  </Field>
                  <Field label="Tỷ lệ hoa hồng" hint="Bỏ trống là 0%">
                    <DecimalInput value={commissionPct} onChange={setCommissionPct} unit="%" />
                  </Field>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="op-form__row">
                <Field label="Tên Lô" required>
                  <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} autoFocus />
                </Field>
                <Field label="Loại cua">
                  <Select value={crabType} onChange={(e) => { setCrabType(e.target.value); setOffers({}) }}>
                    {CRAB_TYPES.map((c) => <option key={c} value={c}>{label('crabType', c)}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="op-form__row">
                <Field label="Số cua kế hoạch" required>
                  <NumberInput value={plannedQuantity} onChange={setPlannedQuantity} unit="con" max={100_000} />
                </Field>
                <Field label="Khối lượng trung bình" required>
                  <NumberInput value={expectedAvgWeightG} onChange={setExpectedAvgWeightG} unit="g" max={5000} />
                </Field>
                <Field label="Ngày nhận cua dự kiến" required>
                  <Input type="date" value={expectedReceiptDate} min={vnDate(1)} onChange={(e) => setExpectedReceiptDate(e.target.value)} />
                </Field>
              </div>
              <Checkbox checked={hasHolding} onChange={setHasHolding}>Có lưu nuôi ở trại trước khi giao</Checkbox>
              {hasHolding && (
                <Field label="Số ngày lưu nuôi" required>
                  <NumberInput value={holdingDays} onChange={setHoldingDays} unit="ngày" max={365} />
                </Field>
              )}
              <OpMore label="Tuỳ chọn thêm">
                <div className="op-form__row">
                  <Field label="Số ngày bán">
                    <NumberInput value={saleDays} onChange={setSaleDays} unit="ngày" max={180} />
                  </Field>
                  <Field label="Bán kính giao">
                    <DecimalInput value={deliveryRadiusKm} onChange={setDeliveryRadiusKm} unit="km" />
                  </Field>
                  <Field label="Hạng dự kiến">
                    <Input value={expectedGrade} maxLength={50} onChange={(e) => setExpectedGrade(e.target.value)} />
                  </Field>
                </div>
                <Field label="Cơ sở quyết toán">
                  <Select value={settlementBasis} onChange={(e) => setSettlementBasis(e.target.value)}>
                    <option value="StandardCost">{settlementBasisLabel('StandardCost')}</option>
                    <option value="ActualCost">{settlementBasisLabel('ActualCost')}</option>
                  </Select>
                </Field>
              </OpMore>
            </>
          )}

          {step === 3 && (
            <>
              <AdminBatchOffersEditor crabType={crabType} defaultWeightG={expectedAvgWeightG} value={offers} onChange={setOffers} />
              <p className="rd-muted" style={{ fontSize: 13 }}>Đã chào {offeredTotal} / {plannedQuantity ?? 0} con kế hoạch.</p>
              <Field label="Giá sàn mỗi kg của đơn hàng cuối" required hint={minOffer !== null ? `Không cao hơn ${formatVnd(minOffer)}` : undefined}>
                <MoneyInput value={floorPricePerKg} onChange={setFloorPricePerKg} />
              </Field>
            </>
          )}

          {step === 1 && lacking
            ? <OpNote tone="info">Chưa có {lacking} đã xác minh. <a className="op-link" href="/admin/parties">Ghi nhận đối tác</a></OpNote>
            : danger && <OpNote tone="danger">{danger}</OpNote>}
        </OpPanel>

        <div className="op-formfoot">
          {step > 1
            ? <OpBtn type="button" variant="ghost" onClick={() => { setMessage(''); create.reset(); setStep(step - 1) }}>Quay lại</OpBtn>
            : <a className="rd-btn rd-btn--ghost" href="/admin/batches">Huỷ</a>}
          <OpBtn type="submit" disabled={create.isPending}>{step < 3 ? 'Tiếp tục' : create.isPending ? 'Đang tạo Lô…' : 'Tạo Lô nháp'}</OpBtn>
        </div>
      </form>
    </>
  )
}
