/* /khach/dat-truoc/:code — Đặt trước theo quy cách ở một Lô, làm như một bước thanh toán ngắn (BR-087…092, BR-234):
   chọn quy cách và số lượng, chọn nơi nhận, xem tiền cọc, một nút. Chia nhiều đợt giao là tuỳ chọn, mặc định ẩn.
   GET /api/batches/{code}, GET /api/batches/{code}/availability, GET /api/me/sites, POST /api/preorders.
   Gửi xong, đơn được giữ trong thời gian giữ đơn để khách chuyển cọc qua VietQR; tiền về thì sang trang chi tiết đơn. */
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, MapPinPlus, ShoppingBag } from 'lucide-react'
import type { AvailabilityResponse, ExploreBatchResponse, PartySiteResponse, PreorderRequest, PreorderResponse, SpecAvailability } from '../../shared/api/api.gen'
import {
  DecimalInput, Field, options, Money, NumberInput, OpAside, OpBack, OpBtn, OpDl, OpEmpty, OpError, OpHeading, OpLoading, OpModal, OpNote, OpPanel, RadioCards, Select,
  errorMessage, formatDateTime, formatVnd, label, toast, useGet, useSend,
} from '../../shared/ui/console'
import { preorderUnavailable } from '../public/batchView'
import { fmtKg, fmtKm, orderHref } from './customerData'
import { PayBox } from './PayBox'
import { SiteForm } from './SiteForm'
import { TrancheEditor, splitProblem, startSplit, toTrancheRequests, type SplitLine, type TrancheDraft } from './TrancheEditor'

type Mode = 'ByCount' | 'ByKg'
type Draft = { mode: Mode; crabs: number | null; kg: number | null }
const EMPTY: Draft = { mode: 'ByCount', crabs: null, kg: null }

/** Tính một dòng đúng như máy chủ (BR-087, BR-092): kg quy ra số con thì làm tròn lên; số con quy ra kg theo khối lượng quy đổi. */
function calc(spec: SpecAvailability, d: Draft) {
  const grams = d.mode === 'ByKg' ? Math.round((d.kg ?? 0) * 1000) : (d.crabs ?? 0) * spec.conversionWeightG
  const crabs = d.mode === 'ByKg' ? Math.ceil(grams / spec.conversionWeightG) : d.crabs ?? 0
  return { spec, mode: d.mode, qty: d.mode === 'ByKg' ? grams / 1000 : crabs, crabs, kg: grams / 1000, value: Math.round((grams * spec.pricePerKg) / 1000) }
}

export default function PreorderBuilderPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const path = `/api/batches/${encodeURIComponent(code)}`
  const batch = useGet<ExploreBatchResponse>(path)
  const availability = useGet<AvailabilityResponse>(`${path}/availability`)
  const sites = useGet<PartySiteResponse[]>('/api/me/sites', { siteType: 'DeliveryAddress' })

  const [draft, setDraft] = useState<Record<string, Draft>>({})
  const [customerType, setCustomerType] = useState('')
  const [siteId, setSiteId] = useState<number | null>(null)
  const [editingSite, setEditingSite] = useState<PartySiteResponse | 'new' | null>(null)
  const [split, setSplit] = useState<TrancheDraft[] | null>(null)
  const [created, setCreated] = useState<PreorderResponse | null>(null)

  const create = useSend<PreorderResponse, PreorderRequest>('post', '/api/preorders', {
    quietError: true,
    onSuccess: (order) => (order.deposit ? setCreated(order) : navigate(orderHref(order.orderNo))),
  })

  const specs = availability.data?.specs
  const lines = useMemo(() => (specs ?? []).map((s) => calc(s, draft[s.specCode] ?? EMPTY)).filter((l) => l.crabs > 0), [specs, draft])

  if (batch.isPending || availability.isPending) return <OpLoading />
  if (batch.isError) return <OpError error={batch.error} onRetry={() => void batch.refetch()} />
  if (availability.isError) return <OpError error={availability.error} onRetry={() => void availability.refetch()} />

  const b = batch.data
  const a = availability.data
  const back = <OpBack href={`/khach/lo/${encodeURIComponent(code)}`}><ArrowLeft size={16} /> Lô {code}</OpBack>

  if (created?.deposit) {
    const d = created.deposit
    return (
      <>
        <OpHeading crumb={back} eyebrow={`Đơn ${created.orderNo}`} title="Chuyển cọc để giữ đơn" description={`Giữ đơn tới ${formatDateTime(created.holdExpiresAt)}.`} />
        <div className="op-split">
          <div>
            <OpPanel>
              <PayBox
                start={{ ...d, accountNo: d.batchAccountNo, batchCode: created.batchCode }}
                onPaid={() => { toast('Đã nhận tiền cọc.'); navigate(orderHref(created.orderNo)) }}
              />
            </OpPanel>
          </div>
          <OpAside>
            <OpDl items={[
              { label: 'Số lượng', value: `${created.convertedCrabs} con` },
              { label: 'Giá trị ước tính', value: formatVnd(created.estimatedValue) },
              { label: `Tiền cọc ${created.depositRatePct}%`, value: formatVnd(created.depositAmount), total: true },
            ]} />
            <a className="rd-btn rd-btn--ghost rd-btn--block" href={orderHref(created.orderNo)}>Xem đơn</a>
          </OpAside>
        </div>
      </>
    )
  }

  const totalCrabs = lines.reduce((sum, l) => sum + l.crabs, 0)
  const totalKg = lines.reduce((sum, l) => sum + l.kg, 0)
  const totalValue = lines.reduce((sum, l) => sum + l.value, 0)
  const deposit = Math.round((totalValue * a.depositRatePct) / 100)
  const splitLines: SplitLine[] = lines.map((l) => ({ specCode: l.spec.specCode, specName: l.spec.specName, mode: l.mode, qty: l.qty }))
  const addresses = sites.data ?? []
  const chosen = siteId === null ? addresses.find((s) => s.isDefault) ?? addresses[0] : addresses.find((s) => s.siteId === siteId)
  // Gợi ý ngày của đợt đầu: ngày Lô dự kiến nhận cua nếu ngày đó chưa qua, không thì để khách tự chọn.
  const firstDate = b.expectedReceiptDate && b.expectedReceiptDate >= new Date().toISOString().slice(0, 10) ? b.expectedReceiptDate : ''

  const over = lines.find((l) => l.crabs > l.spec.remaining)
  const problem = lines.length === 0 ? 'Nhập số lượng cho ít nhất một quy cách.'
    : over ? `${over.spec.specName} chỉ còn ${over.spec.remaining} con.`
      : totalCrabs > a.remainingCrabs ? `Lô chỉ còn đặt được ${a.remainingCrabs} con.`
        : totalCrabs < a.minOrderCrabs ? `Đơn tối thiểu ${a.minOrderCrabs} con, hiện có ${totalCrabs} con.`
          : !chosen ? 'Chọn hoặc thêm nơi nhận hàng.'
            : split ? splitProblem(splitLines, split, b.expectedReceiptDate) : null

  const submit = () => {
    if (problem || !chosen) return
    create.mutate({
      batchCode: a.batchCode,
      customerType: customerType || undefined,
      deliverySiteId: chosen.siteId,
      lines: lines.map((l) => (l.mode === 'ByKg' ? { specCode: l.spec.specCode, mode: l.mode, qtyKg: l.kg } : { specCode: l.spec.specCode, mode: l.mode, qtyCrabs: l.crabs })),
      tranches: split ? toTrancheRequests(splitLines, split) : null,
    })
  }

  // Đổi số lượng thì bản chia đợt cũ không còn khớp: quay về giao một đợt.
  const setLine = (specCode: string, change: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, [specCode]: { ...(prev[specCode] ?? EMPTY), ...change } }))
    setSplit(null)
  }

  const unavailable = preorderUnavailable(a)
  if (unavailable) {
    return (
      <>
        <OpHeading crumb={back} eyebrow={`${b.batchCode} · ${label('crabType', b.crabType)}`} title="Đặt trước" description={b.title} />
        <OpPanel>
          <OpEmpty title={unavailable}>
            <a className="rd-btn rd-btn--primary" href="/khach/lo">Xem Lô nhận đặt trước</a>
          </OpEmpty>
        </OpPanel>
      </>
    )
  }

  return (
    <>
      <OpHeading crumb={back} eyebrow={`${b.batchCode} · ${label('crabType', b.crabType)}`} title="Đặt trước" description={b.title} />

      <div className="op-split">
        <div>
          <OpPanel title="Quy cách và số lượng" lead={`Đơn tối thiểu ${a.minOrderCrabs} con quy đổi. Tiền hàng tính theo kg khi nhận cua.`}>
            <div className="customer-order-lines">
              {a.specs.map((spec) => {
                const entry = draft[spec.specCode] ?? EMPTY
                const soldOut = spec.remaining === 0
                const estimate = lines.find((line) => line.spec.specCode === spec.specCode)
                return (
                  <div className="customer-order-line" key={spec.specCode} role="group" aria-label={spec.specName}>
                    <div className="customer-order-line__details">
                      <h3>{spec.specName}</h3>
                      <p>{formatVnd(spec.pricePerKg)} / kg · {soldOut ? 'Đã hết' : `Còn ${spec.remaining} con`}</p>
                    </div>
                    <div className="customer-order-line__fields">
                      <label>
                        <span>Số lượng</span>
                        {entry.mode === 'ByKg'
                          ? <DecimalInput key="kg" aria-label={`Số kg ${spec.specName}`} value={entry.kg} disabled={soldOut} onChange={(kg) => setLine(spec.specCode, { kg })} />
                          : <NumberInput key="con" aria-label={`Số con ${spec.specName}`} value={entry.crabs} max={spec.remaining} disabled={soldOut} onChange={(crabs) => setLine(spec.specCode, { crabs })} />}
                      </label>
                      <label>
                        <span>Đơn vị</span>
                        <Select aria-label={`Đơn vị đặt ${spec.specName}`} value={entry.mode} disabled={soldOut}
                          onChange={(e) => setLine(spec.specCode, { mode: e.target.value as Mode, crabs: null, kg: null })}>
                          <option value="ByCount">con</option>
                          <option value="ByKg">kg</option>
                        </Select>
                      </label>
                    </div>
                    <div className="customer-order-line__estimate">
                      <div>
                        <span>Ước tính</span>
                        {estimate && <small>{estimate.crabs} con · {fmtKg(estimate.kg)}</small>}
                      </div>
                      {estimate ? <strong><Money value={estimate.value} /></strong> : <span>Chưa chọn</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </OpPanel>

          <OpPanel title="Giao tới" subtitle={b.deliveryRadiusKm ? `Lô giao trong bán kính ${fmtKm(b.deliveryRadiusKm)}.` : undefined}
            action={<OpBtn variant="ghost" sm onClick={() => setEditingSite('new')}><MapPinPlus size={15} /> Thêm địa chỉ</OpBtn>}>
            {sites.isPending ? <OpLoading /> : sites.isError ? <OpError error={sites.error} onRetry={() => void sites.refetch()} /> : addresses.length > 0 && (
              <RadioCards<string>
                name="delivery-site"
                value={chosen ? String(chosen.siteId) : null}
                onChange={(v) => setSiteId(Number(v))}
                options={addresses.map((s) => ({ value: String(s.siteId), label: s.name, hint: s.addressLine }))}
              />
            )}
            {chosen && (chosen.latitude == null || chosen.longitude == null) && (
              <div className="op-inline">
                <small className="rd-muted">Khoảng cách giao chưa xác định.</small>
                <OpBtn className="max-w-full" variant="ghost" sm onClick={() => setEditingSite(chosen)}>
                  <span className="truncate">Bổ sung vị trí cho {chosen.name}</span>
                </OpBtn>
              </div>
            )}
            {!split && lines.length > 0 && (
              <div><OpBtn variant="ghost" sm onClick={() => setSplit(startSplit(splitLines, firstDate))}>Chia nhiều đợt giao</OpBtn></div>
            )}
          </OpPanel>

          {split && (
            <OpPanel title="Đợt giao" action={<OpBtn variant="ghost" sm onClick={() => setSplit(null)}>Giao một đợt</OpBtn>}>
              <TrancheEditor lines={splitLines} value={split} onChange={setSplit} minDate={b.expectedReceiptDate} />
            </OpPanel>
          )}
        </div>

        <OpAside>
          <b className="rd-h3">Đơn của bạn</b>
          <OpDl items={[
            { label: 'Số lượng', value: `${totalCrabs} con · ${fmtKg(totalKg)}` },
            { label: 'Giá trị ước tính', value: formatVnd(totalValue) },
            { label: `Tiền cọc ${a.depositRatePct}%`, value: formatVnd(deposit), total: true },
          ]} />
          {create.isError ? <OpNote tone="danger">{errorMessage(create.error)}</OpNote>
            : problem && lines.length > 0 ? <p className="op-danger" style={{ fontSize: 14 }}>{problem}</p> : null}
          <Field label="Bạn mua cho (không bắt buộc)">
            <Select value={customerType} onChange={(event) => setCustomerType(event.target.value)}>
              <option value="">Bỏ qua</option>
              {options('customerType').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </Field>
          <OpBtn full onClick={submit} disabled={!!problem || create.isPending}><ShoppingBag size={17} /> {create.isPending ? 'Đang gửi…' : 'Đặt trước'}</OpBtn>
          <small className="rd-muted">Đơn được giữ {a.holdMinutes} phút để bạn chuyển cọc.</small>
        </OpAside>
      </div>

      {editingSite && (
        <OpModal title={editingSite === 'new' ? 'Thêm địa điểm nhận hàng' : `Sửa ${editingSite.name}`} onClose={() => setEditingSite(null)} wide>
          <SiteForm site={editingSite === 'new' ? undefined : editingSite} onCancel={() => setEditingSite(null)}
            onDone={(site) => { setSiteId(site.siteId); setEditingSite(null) }} />
        </OpModal>
      )}
    </>
  )
}
