/* /khach/dat-truoc/:code — Đặt trước theo quy cách ở một Lô, làm như một bước thanh toán ngắn (BR-087…092, BR-234):
   chọn quy cách và số lượng, chọn nơi nhận, xem tiền cọc, một nút. Chia nhiều đợt giao là tuỳ chọn, mặc định ẩn.
   GET /api/batches/{code}, GET /api/batches/{code}/availability, GET /api/me/sites, POST /api/preorders.
   Gửi xong, đơn được giữ trong thời gian giữ đơn để khách chuyển cọc qua VietQR; tiền về thì sang trang chi tiết đơn. */
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, MapPinPlus, ShoppingBag } from 'lucide-react'
import type { AvailabilityResponse, ExploreBatchResponse, PartySiteResponse, PreorderRequest, PreorderResponse, SpecAvailability } from '../../shared/api/api.gen'
import {
  DecimalInput, Money, NumberInput, OpAside, OpBack, OpBtn, OpDl, OpEmpty, OpError, OpHeading, OpLoading, OpModal, OpNote, OpPanel, OpTable, RadioCards, Select,
  errorMessage, formatDateTime, formatVnd, label, toast, useGet, useSend,
} from '../../shared/ui/console'
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
  const [siteId, setSiteId] = useState<number | null>(null)
  const [addingSite, setAddingSite] = useState(false)
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
  const back = <OpBack href={`/lo/${encodeURIComponent(code)}`}><ArrowLeft size={16} /> Lô {code}</OpBack>

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
  const located = (s: PartySiteResponse) => s.latitude !== null && s.longitude !== null
  const usable = (sites.data ?? []).filter(located)
  const chosen = usable.find((s) => s.siteId === siteId) ?? usable.find((s) => s.isDefault) ?? usable[0]
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

  if (!a.acceptingPreorders || a.specs.length === 0) {
    return (
      <>
        <OpHeading crumb={back} eyebrow={`${b.batchCode} · ${label('crabType', b.crabType)}`} title="Đặt trước" description={b.title} />
        <OpPanel>
          <OpEmpty title={a.acceptingPreorders ? 'Lô chưa có bảng chào giá' : 'Lô này hiện không nhận đặt trước'}>
            <a className="rd-btn rd-btn--primary" href="/lo">Xem Lô đang mở</a>
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
          <OpPanel title="Quy cách và số lượng" subtitle={`Đơn tối thiểu ${a.minOrderCrabs} con quy đổi. Tiền hàng thật tính theo kg nghiệm thu khi giao.`}>
            <OpTable
              rows={a.specs}
              rowKey={(s) => s.specCode}
              columns={[
                {
                  key: 'spec', header: 'Quy cách',
                  cell: (s) => <><b>{s.specName}</b><br /><small className="rd-muted">{formatVnd(s.pricePerKg)} / kg · {s.remaining > 0 ? `còn ${s.remaining} con` : 'đã hết'}</small></>,
                },
                {
                  key: 'qty', header: 'Số lượng', width: 220,
                  cell: (s) => {
                    const d = draft[s.specCode] ?? EMPTY
                    const off = s.remaining === 0
                    return (
                      <span className="op-inline" style={{ flexWrap: 'nowrap' }}>
                        {d.mode === 'ByKg'
                          ? <DecimalInput key="kg" sm aria-label={`Số kg ${s.specName}`} value={d.kg} disabled={off} onChange={(kg) => setLine(s.specCode, { kg })} />
                          : <NumberInput key="con" sm aria-label={`Số con ${s.specName}`} value={d.crabs} max={s.remaining} disabled={off} onChange={(crabs) => setLine(s.specCode, { crabs })} />}
                        <Select sm aria-label={`Đơn vị đặt ${s.specName}`} value={d.mode} disabled={off} style={{ width: 84, flex: 'none' }}
                          onChange={(e) => setLine(s.specCode, { mode: e.target.value as Mode, crabs: null, kg: null })}>
                          <option value="ByCount">con</option>
                          <option value="ByKg">kg</option>
                        </Select>
                      </span>
                    )
                  },
                },
                {
                  key: 'est', header: 'Ước tính', num: true,
                  cell: (s) => {
                    const l = lines.find((x) => x.spec.specCode === s.specCode)
                    return l ? <><Money value={l.value} /><br /><small className="rd-muted">{l.crabs} con · {fmtKg(l.kg)}</small></> : <span className="rd-muted">—</span>
                  },
                },
              ]}
            />
          </OpPanel>

          <OpPanel title="Giao tới" subtitle={b.deliveryRadiusKm ? `Lô giao trong bán kính ${fmtKm(b.deliveryRadiusKm)}.` : undefined}
            action={<OpBtn variant="ghost" sm onClick={() => setAddingSite(true)}><MapPinPlus size={15} /> Thêm địa chỉ</OpBtn>}>
            {sites.isPending ? <OpLoading /> : sites.isError ? <OpError error={sites.error} onRetry={() => void sites.refetch()} /> : sites.data.length > 0 && (
              <RadioCards<string>
                name="delivery-site"
                value={chosen ? String(chosen.siteId) : null}
                onChange={(v) => setSiteId(Number(v))}
                options={sites.data.map((s) => ({ value: String(s.siteId), label: s.name, hint: located(s) ? s.addressLine : 'Thiếu toạ độ', disabled: !located(s) }))}
              />
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
          <OpBtn full onClick={submit} disabled={!!problem || create.isPending}><ShoppingBag size={17} /> {create.isPending ? 'Đang gửi…' : 'Đặt trước'}</OpBtn>
          <small className="rd-muted">Đơn được giữ {a.holdMinutes} phút để bạn chuyển cọc.</small>
        </OpAside>
      </div>

      {addingSite && (
        <OpModal title="Thêm địa điểm nhận hàng" onClose={() => setAddingSite(false)} wide>
          <SiteForm onCancel={() => setAddingSite(false)} onDone={(site) => { setSiteId(site.siteId); setAddingSite(false) }} />
        </OpModal>
      )}
    </>
  )
}
