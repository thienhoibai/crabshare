import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router'
import axios from 'axios'
import { ArrowLeft, Plus, Save, Send, Trash2 } from 'lucide-react'
import { errorMessage, type ApiProblem } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { formatVnd } from '../../shared/lib/format'
import { costAmount } from '../../shared/lib/money'
import OperatorLayout from './OperatorLayout'
import { OpAside, OpBack, OpBtn, OpHeading, OpNote, OpPanel, crabImg } from './operatorUi'
import CostScheduleEditor, { scheduleNumbers, hasTiming } from './CostScheduleEditor'
import { useOperatorApplication } from './operatorsApi'
import { batchStatuses, costCategories, crabTypes, getBatch, offtakeGradeOptions, saveBatch, saveStandardCost, submitBatch, type Batch, type BatchRequest, type CostItem, type CostTranche } from './batchesApi'

const initial: BatchRequest = { title: 'Lô cua lột tháng 11', crabType: 'SoftShellCrab', seedQuantity: 1500, expectedOutputKg: 300, cycleDays: 45,
  restockCutoffDays: 10, minViableCapital: 60_000_000, targetCapital: 75_000_000, maxCapital: 90_000_000, minContribution: 1_000_000, operatorSharePct: 7,
  offtakePrices: offtakeGradeOptions.map(g => ({ gradeCode: g.code, unitPrice: 0 })) }
const initialItems: CostItem[] = [
  { category: 'Seed', description: 'Con giống', quantity: 1500, unit: 'con', unitPrice: 20000, trancheNo: 1 },
  { category: 'MortalityReserve', description: 'Dự phòng hao hụt', quantity: 1, unit: 'khoản', unitPrice: 5_000_000, trancheNo: 1 },
]
const numericFields: { key: Exclude<keyof BatchRequest, 'title' | 'crabType' | 'offtakePrices'>; label: string; min: number; max?: number; step?: number }[] = [
  { key: 'seedQuantity', label: 'Số con giống', min: 1, max: 2147483647 },
  { key: 'expectedOutputKg', label: 'Sản lượng dự kiến (kg)', min: 0.001, max: 999999999.999, step: 0.001 },
  { key: 'cycleDays', label: 'Chu kỳ (ngày)', min: 1, max: 32767 },
  { key: 'restockCutoffDays', label: 'Hạn bổ sung giống (ngày)', min: 1, max: 32767 },
  { key: 'minViableCapital', label: 'Vốn tối thiểu khả thi (đồng)', min: 1 },
  { key: 'targetCapital', label: 'Vốn mục tiêu (đồng)', min: 1 },
  { key: 'maxCapital', label: 'Vốn tối đa (đồng)', min: 1 },
  { key: 'minContribution', label: 'Góp tối thiểu (đồng)', min: 1 },
  { key: 'operatorSharePct', label: 'Thù lao người nuôi (%)', min: 5, max: 10, step: 0.01 },
]

function BatchEditor({ existing }: { existing?: Batch }) {
  const navigate = useNavigate()
  const [, setParams] = useSearchParams()
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.user?.userId)
  const profile = useOperatorApplication()
  const [form, setForm] = useState<BatchRequest>(() => {
    if (!existing) return initial
    const byCode = new Map((existing.offtakePrices ?? []).map(p => [p.gradeCode, p.unitPrice]))
    return {
      ...existing,
      offtakePrices: offtakeGradeOptions.map(g => ({ gradeCode: g.code, unitPrice: byCode.get(g.code) ?? 0 })),
    }
  })
  const [items, setItems] = useState<(CostItem & { key: number })[]>(() => (existing?.standardCost?.items ?? initialItems).map((i, key) => ({ ...i, key })))
  const nextKey = useRef(items.length)
  const [plans, setPlans] = useState<CostTranche[]>(existing?.standardCost?.tranches ?? [])
  const [code, setCode] = useState(existing?.batchCode ?? null)
  const [status, setStatus] = useState(existing?.status ?? 'Draft')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const busy = useRef(false)
  const canWrite = profile.data?.status === 'Approved' && profile.data.memberRole === 'Owner'
    && status === 'Draft' && (!existing || existing.canEdit)
  const total = items.reduce((sum, i) => sum + costAmount(i.quantity, i.unitPrice), 0)
  const mutation = useMutation({
    mutationFn: async (submit: boolean) => {
      const payload: BatchRequest = {
        ...form,
        offtakePrices: (form.offtakePrices ?? [])
          .filter(p => p.unitPrice > 0)
          .map(p => ({ gradeCode: p.gradeCode, unitPrice: p.unitPrice })),
      }
      const saved = await saveBatch(code, payload)
      // Remember the code before cost/submit: retry must update the same batch after any later failure.
      setCode(saved.batchCode)
      setParams({ code: saved.batchCode }, { replace: true })
      qc.setQueryData(['operator-batch', userId, saved.batchCode], saved)
      void qc.invalidateQueries({ queryKey: ['operator-batches'] })
      const costs: CostItem[] = items.map(i => ({ category: i.category, description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, trancheNo: i.trancheNo }))
      const costSaved = await saveStandardCost(saved.batchCode, costs, plans.filter(p => scheduleNumbers(items).includes(p.trancheNo) && hasTiming(p) && p.unlockCondition.trim()))
      qc.setQueryData(['operator-batch', userId, saved.batchCode], costSaved)
      return submit ? await submitBatch(saved.batchCode) : costSaved
    },
    onSuccess: (saved, submit) => {
      setStatus(saved.status)
      qc.setQueryData(['operator-batch', userId, saved.batchCode], saved)
      void qc.invalidateQueries({ queryKey: ['operator-batches'] })
      if (submit) navigate('/operator/batch')
      else setNotice(`Đã lưu nháp ${saved.batchCode}.`)
    },
    onError: error => {
      if (axios.isAxiosError<ApiProblem>(error) && error.response?.data.errors)
        setErrors(Object.fromEntries(Object.entries(error.response.data.errors).map(([key, messages]) => [key.charAt(0).toLowerCase() + key.slice(1), messages.join(' ')])))
    },
  })

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy.current || !canWrite) return
    const submit = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'submit'
    const problems: Record<string, string> = {}
    if (form.minViableCapital > form.targetCapital || form.targetCapital > form.maxCapital)
      for (const key of ['minViableCapital', 'targetCapital', 'maxCapital']) problems[key] = 'Vốn phải thỏa tối thiểu khả thi ≤ mục tiêu ≤ tối đa.'
    for (const { key } of numericFields)
      if (!['expectedOutputKg', 'operatorSharePct'].includes(key) && !Number.isSafeInteger(form[key])) problems[key] = 'Nhập số nguyên trong giới hạn chính xác.'
    if (!form.title.trim()) problems.title = 'Nhập tên lô.'
    if (submit && !(form.offtakePrices ?? []).some(p => p.unitPrice > 0))
      problems.offtakePrices = 'Cần khai ít nhất một giá chốt bao tiêu theo hạng trước khi gửi duyệt.'
    if (submit && scheduleNumbers(items).some(n => !plans.some(p => p.trancheNo === n && hasTiming(p) && p.unlockCondition.trim())))
      problems.schedule = 'Chọn mốc, số ngày sau mốc và điều kiện cho từng đợt trước khi gửi duyệt.'
    if (plans.some(p => scheduleNumbers(items).includes(p.trancheNo) && (p.anchorCode || p.offsetDays != null || p.plannedDate || p.unlockCondition.trim()) && (!hasTiming(p) || !p.unlockCondition.trim())))
      problems.schedule = 'Hoàn thành mốc, số ngày và điều kiện của lịch đang nhập; hoặc để trống lịch để lưu nháp.'
    if (!items.some(i => i.category === 'MortalityReserve')) problems.items = 'Chi phí chuẩn bắt buộc có dự phòng hao hụt (MortalityReserve).'
    if (items.some(i => !Number.isSafeInteger(i.unitPrice)) || !Number.isSafeInteger(total)) problems.items = 'Tiền và tổng chi phí phải là số nguyên trong giới hạn chính xác.'
    setErrors(problems); setNotice(''); mutation.reset()
    if (Object.keys(problems).length) return
    busy.current = true
    try { await mutation.mutateAsync(submit) } catch { /* Keep form and show API error. */ }
    finally { busy.current = false }
  }
  const updateItem = (key: number, values: Partial<CostItem>) => setItems(current => current.map(i => i.key === key ? { ...i, ...values } : i))
  const disabled = mutation.isPending || !canWrite

  return <>
    <OpHeading crumb={<OpBack href="/operator/batch"><ArrowLeft size={16} /> Quay lại danh sách lô</OpBack>} eyebrow="Standard Cost"
      title={code ? `Lô ${code}` : 'Đề xuất lô nuôi mới'} description={code ? `Trạng thái: ${batchStatuses[status]}` : 'Lên kế hoạch ngân sách trước khi mở gọi vốn.'} />
    <form className="op-split" onSubmit={save}>
      <div className="min-w-0 space-y-4">
        {profile.isPending && <p role="status">Đang kiểm tra hồ sơ hộ nuôi…</p>}
        {profile.isError && <div role="alert"><OpNote tone="danger">{errorMessage(profile.error)}</OpNote><OpBtn type="button" onClick={() => void profile.refetch()}>Thử lại</OpBtn></div>}
        {profile.isSuccess && !canWrite && <OpNote tone="info">Chỉ chủ hộ nuôi Approved được sửa lô Draft. Rejected là từ chối dứt điểm. <a className="underline" href="/operator/register">Xem hồ sơ hộ nuôi</a></OpNote>}
        {notice && <div role="status"><OpNote tone="ok">{notice}</OpNote></div>}
        {existing?.rejectionReason && <OpNote tone="danger">{status === 'Draft' ? 'Yêu cầu bổ sung' : 'Lý do từ chối'}: {existing.rejectionReason}</OpNote>}
        {(Object.keys(errors).length > 0 || mutation.isError) && <div role="alert"><OpNote tone="danger">{mutation.isError ? errorMessage(mutation.error) : [...new Set(Object.values(errors))].join(' ')}</OpNote></div>}
        <OpPanel>
          <fieldset className="op-form border-0 p-0 m-0 min-w-0" disabled={disabled}>
            <div className="op-form__group"><h2 className="rd-h3">Thông tin lô</h2><div className="op-form__row">
              <div className="op-field"><label htmlFor="cb-title">Tên lô (tiêu đề gọi vốn)</label><input id="cb-title" className="op-input" required maxLength={200} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} aria-invalid={!!errors.title} />{errors.title && <small>{errors.title}</small>}</div>
              <div className="op-field"><label htmlFor="cb-type">Loại cua</label><select id="cb-type" className="op-select" value={form.crabType} onChange={e => setForm({ ...form, crabType: e.target.value as BatchRequest['crabType'] })}>{Object.entries(crabTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            </div></div>
            <div className="op-form__group"><h2 className="rd-h3">Quy mô & vốn</h2><div className="grid gap-4 sm:grid-cols-2">
              {numericFields.map(({ key, label, min, max, step }) => <div className="op-field" key={key}><label htmlFor={`cb-${key}`}>{label}</label><input id={`cb-${key}`} className="op-input" type="number" required min={min} max={max ?? Number.MAX_SAFE_INTEGER} step={step ?? 1} value={Number.isNaN(form[key]) ? '' : form[key]} onChange={e => setForm({ ...form, [key]: e.target.valueAsNumber })} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `err-${key}` : undefined} />{errors[key] && <small id={`err-${key}`}>{errors[key]}</small>}</div>)}
            </div></div>
            <div className="op-form__group">
              <h2 className="rd-h3">Giá chốt bao tiêu (đồng/kg)</h2>
              <p className="rd-muted text-sm mb-2">Công khai với nhà đầu tư trước khi gọi vốn (TL-30). Chỉ hạng có giá &gt; 0 được lưu. Khóa sau khi gửi duyệt.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {offtakeGradeOptions.map((g, index) => {
                  const row = form.offtakePrices?.[index] ?? { gradeCode: g.code, unitPrice: 0 }
                  return (
                    <div className="op-field" key={g.code}>
                      <label htmlFor={`cb-offtake-${g.code}`}>{g.name}</label>
                      <input
                        id={`cb-offtake-${g.code}`}
                        className="op-input"
                        type="number"
                        min={0}
                        step={1}
                        value={Number.isNaN(row.unitPrice) ? '' : row.unitPrice}
                        onChange={e => {
                          const unitPrice = e.target.valueAsNumber
                          setForm({
                            ...form,
                            offtakePrices: offtakeGradeOptions.map((opt, i) =>
                              i === index
                                ? { gradeCode: opt.code, unitPrice: Number.isNaN(unitPrice) ? 0 : unitPrice }
                                : (form.offtakePrices?.[i] ?? { gradeCode: opt.code, unitPrice: 0 })),
                          })
                        }}
                        aria-invalid={!!errors.offtakePrices}
                      />
                    </div>
                  )
                })}
              </div>
              {errors.offtakePrices && <small className="text-red-600">{errors.offtakePrices}</small>}
            </div>
          </fieldset>
        </OpPanel>
        <OpPanel title="Chi phí chuẩn" subtitle="Khấu hao và dự phòng hao hụt không giải ngân theo lịch.">
          <fieldset disabled={disabled} className="border-0 p-0 m-0 min-w-0">
            <div className="overflow-x-auto"><table className="w-full text-sm" style={{ minWidth: 850 }}><caption className="sr-only">Các khoản chi phí chuẩn</caption><thead><tr>{['Hạng mục', 'Mô tả', 'Số lượng', 'Đơn vị', 'Đơn giá (đồng)', 'Đợt', 'Thành tiền', ''].map((h, n) => <th className="p-2 text-left" scope="col" key={n}>{h}</th>)}</tr></thead>
              <tbody>{items.map((item, index) => <tr key={item.key}>
                <td className="p-1"><select aria-label={`Hạng mục ${index + 1}`} className="op-select" value={item.category} onChange={e => updateItem(item.key, { category: e.target.value as CostItem['category'], trancheNo: e.target.value === 'Depreciation' ? null : item.trancheNo ?? 1 })}>{Object.entries(costCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                <td className="p-1"><input aria-label={`Mô tả ${index + 1}`} className="op-input" required maxLength={200} value={item.description} onChange={e => updateItem(item.key, { description: e.target.value })} /></td>
                <td className="p-1"><input aria-label={`Số lượng ${index + 1}`} className="op-input" type="number" required min={0.001} max={999999999.999} step={0.001} value={Number.isNaN(item.quantity) ? '' : item.quantity} onChange={e => updateItem(item.key, { quantity: e.target.valueAsNumber })} /></td>
                <td className="p-1"><input aria-label={`Đơn vị ${index + 1}`} className="op-input" required maxLength={20} value={item.unit} onChange={e => updateItem(item.key, { unit: e.target.value })} /></td>
                <td className="p-1"><input aria-label={`Đơn giá ${index + 1}`} className="op-input" type="number" required min={0} max={Number.MAX_SAFE_INTEGER} step={1} value={Number.isNaN(item.unitPrice) ? '' : item.unitPrice} onChange={e => updateItem(item.key, { unitPrice: e.target.valueAsNumber })} /></td>
                <td className="p-1">{item.category === 'Depreciation' ? 'Quyết toán' : item.category === 'MortalityReserve' ? 'Giữ lại' : <input aria-label={`Đợt ${index + 1}`} className="op-input" type="number" required min={1} max={255} step={1} value={item.trancheNo ?? ''} onChange={e => updateItem(item.key, { trancheNo: e.target.valueAsNumber })} />}</td>
                <td className="p-2 whitespace-nowrap">{formatVnd(costAmount(item.quantity, item.unitPrice))}</td>
                <td><OpBtn type="button" variant="ghost" aria-label={`Xóa khoản chi ${index + 1}`} onClick={() => setItems(items.filter(i => i.key !== item.key))}><Trash2 size={16} /></OpBtn></td>
              </tr>)}</tbody></table></div>
            <OpBtn className="mt-4" type="button" variant="outline" onClick={() => setItems([...items, { key: nextKey.current++, category: 'Other', description: '', quantity: 1, unit: 'khoản', unitPrice: 0, trancheNo: 1 }])}><Plus size={16} /> Thêm khoản chi</OpBtn>
          </fieldset>
          <p className="mt-4 font-bold">Tổng chi phí: {formatVnd(Number.isFinite(total) ? total : 0)}</p>
          <OpNote>Thành tiền được làm tròn đến đồng cho từng khoản chi trước khi cộng tổng.</OpNote>
        </OpPanel>
        <OpPanel title="Lịch giải ngân dự kiến"><CostScheduleEditor items={items} plans={plans} onChange={setPlans} disabled={disabled} /></OpPanel>
      </div>
      <OpAside>
        <div className="op-cover" style={{ aspectRatio: '16 / 9' }}><img src={crabImg(form.crabType, 720)} alt="" /></div>
        <p className="rd-eyebrow">Vốn mục tiêu</p><p className="op-big">{formatVnd(form.targetCapital || 0)}</p>
        <dl className="op-dl"><dt>Vốn tối thiểu khả thi</dt><dd>{formatVnd(form.minViableCapital || 0)}</dd><dt>Vốn tối đa</dt><dd>{formatVnd(form.maxCapital || 0)}</dd><dt>Tổng chi phí chuẩn</dt><dd>{formatVnd(Number.isFinite(total) ? total : 0)}</dd><dt>Thù lao người nuôi</dt><dd>{form.operatorSharePct || 0}%</dd></dl>
        <div className="space-y-3"><OpBtn full variant="outline" type="submit" value="draft" disabled={disabled}><Save size={16} /> Lưu nháp</OpBtn><OpBtn full type="submit" value="submit" disabled={disabled || status !== 'Draft'}><Send size={16} /> Gửi duyệt</OpBtn></div>
        {mutation.isPending && <p role="status">Đang lưu dữ liệu…</p>}
        <p className="rd-note">Sau khi gửi duyệt, lô và chi phí chuẩn chờ Admin xét duyệt.</p>
      </OpAside>
    </form>
  </>
}

export default function OperatorCreateBatch() {
  const [params] = useSearchParams()
  // Replacing the URL after creation must not remount or clear the active form.
  const [initialCode] = useState(() => params.get('code'))
  const userId = useAuthStore(s => s.user?.userId)
  const query = useQuery({ queryKey: ['operator-batch', userId, initialCode], enabled: !!initialCode, retry: false,
    queryFn: ({ signal }) => getBatch(initialCode!, signal) })
  return <OperatorLayout activeTab="batch">
    {initialCode && query.isPending ? <p role="status">Đang tải lô…</p> : initialCode && query.isError ?
      <div role="alert"><OpNote tone="danger">{errorMessage(query.error)}</OpNote><OpBtn disabled={query.isFetching} onClick={() => void query.refetch()}>Thử lại</OpBtn></div> : <BatchEditor existing={query.data} />}
  </OperatorLayout>
}
