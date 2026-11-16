/* /qc/kiem-dau-vao/:receiptNo — Kiểm đầu vào một phiếu nhận hàng (BR-100, BR-101), làm bằng điện thoại ở trại.
   Mỗi con: nhập khối lượng rồi bấm Ghi. Giới tính và độ trưởng thành lấy mặc định theo loại cua của Lô và giữ cho con sau;
   năm điều kiện mặc định đạt, bấm vào ô nào thì ô đó thành không đạt. Con bị loại hỏi lại một lần.
   GET /api/goods-receipts/{no}; POST …/inspections (kết luận do máy chủ tính, con đạt được cấp mã cua nội bộ);
   POST …/complete do chính Nhân viên kiểm phẩm được phân bấm. Mã Lô lấy từ ?lo= hoặc tra qua việc đang chờ của tôi. */
import { useState, type FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { ArrowLeft, Check, CheckCircle2, X } from 'lucide-react'
import type {
  CrabUnitResponse, GoodsReceiptResponse, IncomingInspectionRequest, InspectionResponse, ProcurementOrderResponse,
} from '../../shared/api/api.gen'
import {
  DecimalInput, Field, Input, OpAside, OpBack, OpBtn, OpConfirm, OpFacts, OpHeading, OpKv, OpMeter, OpMore, OpNote, OpPanel, QueryView, RadioCards,
  StatusBadge, errorMessage, formatDate, formatDateTime, label, options, useGet, useSend,
} from '../../shared/ui/console'
import { Group } from './parts'
import { num, useBatchHead, useIncomingReceipts, useMyId, useQcTasks } from './qc'

/** Năm điều kiện của DTO, mặc định đạt. ok: chữ khi đạt, bad: chữ khi không đạt. */
const CHECKS = [
  { key: 'speciesOk', ok: 'Đúng loài', bad: 'Sai loài' },
  { key: 'alive', ok: 'Còn sống', bad: 'Đã chết' },
  { key: 'healthy', ok: 'Khoẻ', bad: 'Yếu' },
  { key: 'twoClaws', ok: 'Đủ hai càng', bad: 'Thiếu càng' },
  { key: 'foodSafe', ok: 'An toàn', bad: 'Mất an toàn' },
] as const
type CheckKey = (typeof CHECKS)[number]['key']
const ALL_PASS: Record<CheckKey, boolean> = { speciesOk: true, alive: true, healthy: true, twoClaws: true, foodSafe: true }

/** BR-028: cua gạch, cua gạch dầu là cua cái trưởng thành; cua cái non là cua cái chưa trưởng thành. Loại khác: thường là cua đực trưởng thành. */
const expected = (crabType: string | undefined) =>
  crabType === 'RoeCrab' || crabType === 'OilRoeCrab' ? { sex: 'Female', maturity: 'Mature', strict: true }
    : crabType === 'YoungFemaleCrab' ? { sex: 'Female', maturity: 'Immature', strict: true }
      : { sex: 'Male', maturity: 'Mature', strict: false }

const WEIGHT_ID = 'qc-incoming-weight'

export default function IncomingReceiptPage() {
  const { receiptNo = '' } = useParams()
  const [search] = useSearchParams()
  const me = useMyId()
  const base = `/api/goods-receipts/${encodeURIComponent(receiptNo)}`
  const receipt = useGet<GoodsReceiptResponse>(base)
  const tasks = useQcTasks()
  const index = useIncomingReceipts(search.get('lo') ? undefined : tasks.data)
  const batchCode = search.get('lo') ?? index.rows.find((r) => r.receipt?.receiptNo === receiptNo)?.task.batchCode ?? null
  const batchPath = batchCode ? `/api/batches/${encodeURIComponent(batchCode)}` : null
  const batch = useBatchHead(batchCode)
  const orders = useGet<ProcurementOrderResponse[]>(batchPath && `${batchPath}/procurement-orders`, undefined, { retry: false })
  const crabs = useGet<CrabUnitResponse[]>(batchPath && `${batchPath}/crab-units`, undefined, { retry: false })

  const usual = expected(batch.data?.crabType)
  const [pickedSex, setSex] = useState<string | null>(null)
  const [pickedMaturity, setMaturity] = useState<string | null>(null)
  const sex = pickedSex ?? usual.sex
  const maturity = pickedMaturity ?? usual.maturity
  const [species, setSpecies] = useState('Scylla paramamosain')
  const [checks, setChecks] = useState(ALL_PASS)
  const [weight, setWeight] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [log, setLog] = useState<InspectionResponse[]>([])
  const [completing, setCompleting] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const inspect = useSend<InspectionResponse, IncomingInspectionRequest>('post', `${base}/inspections`, {
    quietError: true,
    onSuccess: (res) => {
      // Giữ loài, giới tính, độ trưởng thành cho con kế tiếp; xoá khối lượng và ghi chú, trả các ô về "đạt".
      setLog((old) => [res, ...old])
      setRejecting(false)
      setWeight(null)
      setNote('')
      setChecks(ALL_PASS)
      window.setTimeout(() => document.getElementById(WEIGHT_ID)?.focus(), 0)
    },
  })
  const complete = useSend<GoodsReceiptResponse, void>('post', `${base}/complete`, {
    quietError: true,
    success: 'Đã hoàn tất phiếu nhận hàng.',
    onSuccess: () => setCompleting(false),
  })

  return (
    <QueryView query={receipt}>
      {(r) => {
        const inspected = r.acceptedCount + r.rejectedCount
        const left = Math.max(r.declaredCount - inspected, 0)
        const open = r.status === 'Inspecting'
        const mine = r.qcUserId === me
        const po = orders.data?.find((o) => o.poNo === r.poNo)
        const accepted = (crabs.data ?? []).filter((c) => c.lotCode === r.lotCode).sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
        const rejectedNow = log.filter((i) => i.conclusion !== 'Accepted')
        const last = log[0]

        const fails = [
          ...CHECKS.filter((c) => !checks[c.key]).map((c) => c.bad.toLowerCase()),
          ...(usual.strict && (sex !== usual.sex || maturity !== usual.maturity) ? ['không đúng loại cua của Lô'] : []),
        ]
        const ready = !!species.trim() && weight !== null && weight >= 1 && weight <= 5000
        const send = () => {
          if (!ready || weight === null || inspect.isPending) return
          inspect.mutate({ species: species.trim(), sex, maturity, ...checks, weightG: weight, note: note.trim() || null })
        }
        // Con đạt ghi ngay để kiểm nhanh; con bị loại hỏi lại một lần vì không sửa được.
        const submit = (event: FormEvent<HTMLFormElement>) => {
          event.preventDefault()
          if (!ready) return
          if (fails.length > 0) {
            // Hộp xác nhận mở ra chưa gửi gì: bỏ lỗi của lần ghi trước để không hiện nhầm trong hộp.
            inspect.reset()
            setRejecting(true)
          } else send()
        }

        return (
          <>
            <OpHeading
              crumb={<OpBack href="/qc/kiem-dau-vao"><ArrowLeft size={16} /> Kiểm đầu vào</OpBack>}
              eyebrow={[batchCode && `Lô ${batchCode}`, batch.data && label('crabType', batch.data.crabType)].filter(Boolean).join(' · ') || 'Phiếu nhận hàng'}
              title={r.receiptNo}
              action={<StatusBadge kind="receipt" value={r.status} />}
            />
            <OpMeter
              label={`Đã kiểm ${inspected} / ${r.declaredCount} con`}
              value={inspected}
              max={r.declaredCount}
              display={<>Đạt {r.acceptedCount} · <span className={r.rejectedCount > 0 ? 'op-danger' : ''}>Loại {r.rejectedCount}</span></>}
            />

            <div className="op-split">
              <div>
                {open && !mine && <OpNote tone="info">Phiếu này phân cho người kiểm khác.</OpNote>}
                {open && mine && inspect.isError && !rejecting && <OpNote tone="danger">{errorMessage(inspect.error)}</OpNote>}
                {open && mine && !inspect.isError && last && (
                  <OpNote tone={last.conclusion === 'Accepted' ? 'ok' : 'danger'}>
                    {last.conclusion === 'Accepted'
                      ? <>Đạt · {num(last.weightG, 1)} g · <b className="op-mono">{last.crabCode}</b></>
                      : <>Loại · {num(last.weightG, 1)} g · {last.rejectReason}</>}
                  </OpNote>
                )}

                {open && mine && left > 0 && (
                  <OpPanel title={`Con thứ ${inspected + 1}`} accent>
                    <form className="op-form" onSubmit={submit} noValidate>
                      <Field label="Khối lượng" required>
                        <DecimalInput id={WEIGHT_ID} value={weight} onChange={setWeight} unit="g" autoFocus enterKeyHint="done" />
                      </Field>
                      <Group title="Giới tính">
                        <RadioCards<string> value={sex} onChange={setSex} options={options('sex')} />
                      </Group>
                      <div className="qc-toggles" role="group" aria-label="Điều kiện kiểm">
                        {CHECKS.map((c) => (
                          <label key={c.key} className="qc-toggle">
                            <input type="checkbox" checked={checks[c.key]} onChange={(e) => setChecks((old) => ({ ...old, [c.key]: e.target.checked }))} />
                            {checks[c.key] ? <Check size={20} /> : <X size={20} />}
                            {checks[c.key] ? c.ok : c.bad}
                          </label>
                        ))}
                      </div>
                      <OpMore label="Tuỳ chọn thêm">
                        <Group title="Độ trưởng thành">
                          <RadioCards<string> value={maturity} onChange={setMaturity} options={options('maturity')} />
                        </Group>
                        <Field label="Loài">
                          <Input value={species} maxLength={60} onChange={(e) => setSpecies(e.target.value)} />
                        </Field>
                        <Field label="Ghi chú">
                          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
                        </Field>
                      </OpMore>
                      <OpBtn type="submit" full className="rd-btn--lg" variant={fails.length > 0 ? 'danger' : 'primary'} disabled={!ready || inspect.isPending}>
                        {inspect.isPending ? 'Đang ghi…' : fails.length > 0 ? 'Ghi: loại' : 'Ghi: đạt'}
                      </OpBtn>
                    </form>
                  </OpPanel>
                )}

                {open && mine && (
                  <OpBtn variant={left === 0 ? 'primary' : 'ghost'} full className="rd-btn--lg" disabled={inspected === 0} onClick={() => setCompleting(true)}>
                    <CheckCircle2 size={18} /> Hoàn tất phiếu
                  </OpBtn>
                )}

                {accepted.length > 0 && (
                  <OpMore label="Cua đã đạt" count={accepted.length} defaultOpen={!open}>
                    <ul className="qc-lines">
                      {accepted.map((c) => (
                        <li key={c.crabCode}>
                          <span><b className="op-mono">{c.crabCode}</b><small>{label('sex', c.sex)} · {label('maturity', c.maturity)}</small></span>
                          <span className="qc-lines__end"><b>{num(c.receivedWeightG, 1)} g</b></span>
                        </li>
                      ))}
                    </ul>
                  </OpMore>
                )}
                {rejectedNow.length > 0 && (
                  <OpMore label="Vừa loại" count={rejectedNow.length}>
                    <ul className="qc-lines">
                      {rejectedNow.map((i) => <li key={i.inspectionNo}><span><b>{num(i.weightG, 1)} g</b><small>{i.rejectReason}</small></span></li>)}
                    </ul>
                  </OpMore>
                )}
              </div>

              <OpAside>
                <h2 className="rd-h3">Lô nguồn</h2>
                <OpKv items={[
                  { label: 'Nhà cung cấp', value: po?.supplierName },
                  { label: 'Vùng xuất xứ', value: r.originRegion },
                  { label: 'Ngày thu', value: formatDate(r.harvestedOn) },
                  { label: 'Khai báo', value: `${r.declaredCount} con · ${num(r.declaredWeightKg, 3)} kg` },
                ]} />
                <OpMore label="Chi tiết">
                  <OpKv items={[
                    { label: 'Quy cách thoả thuận', value: po?.agreedSpec },
                    { label: 'Mã lô nguồn', value: <span className="op-mono">{r.lotCode}</span> },
                    { label: 'Đơn mua nguồn', value: <span className="op-mono">{r.poNo}</span> },
                    { label: 'Nhận lúc', value: formatDateTime(r.receivedAt) },
                    { label: 'Kiểm xong lúc', value: formatDateTime(r.completedAt) },
                    { label: 'Khối lượng cua đạt', value: `${num(r.acceptedWeightG / 1000, 2)} kg` },
                  ]} />
                </OpMore>
              </OpAside>
            </div>

            {rejecting && (
              <OpConfirm
                title="Loại con cua này"
                sub={`Không đạt: ${fails.join(', ')}. Ghi rồi không sửa được.`}
                confirmLabel="Ghi: loại"
                variant="danger"
                pending={inspect.isPending}
                error={inspect.error}
                onConfirm={send}
                onClose={() => { inspect.reset(); setRejecting(false) }}
              />
            )}

            {completing && (
              <OpConfirm
                title="Hoàn tất phiếu"
                sub={r.receiptNo}
                confirmLabel="Hoàn tất"
                pending={complete.isPending}
                error={complete.error}
                onConfirm={() => complete.mutate()}
                onClose={() => { complete.reset(); setCompleting(false) }}
              >
                <OpFacts items={[
                  { label: 'Đạt', value: `${r.acceptedCount} con`, tone: 'ok' },
                  { label: 'Loại', value: `${r.rejectedCount} con`, tone: r.rejectedCount > 0 ? 'danger' : undefined },
                  { label: 'Chưa kiểm', value: `${left} con`, tone: left > 0 ? 'warn' : undefined },
                ]} />
                {left > 0 && <OpNote tone="danger">Còn {left} con chưa kiểm. Hoàn tất rồi không kiểm thêm được.</OpNote>}
              </OpConfirm>
            )}
          </>
        )
      }}
    </QueryView>
  )
}
