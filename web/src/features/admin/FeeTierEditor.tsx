import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http, errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { formatVnd } from '../../shared/lib/format'

type Tier = { feeTierId?: number; tierCode: string; minCapital: number; maxCapital: number | null; minInclusive: boolean; maxInclusive: boolean; feeAmount: number; effectiveFrom: string; effectiveTo: string | null }
const blank: Tier = { tierCode: '', minCapital: 0, maxCapital: null, minInclusive: true, maxInclusive: false, feeAmount: 0, effectiveFrom: '', effectiveTo: null }
export default function FeeTierEditor() {
  const userId = useAuthStore(s => s.user?.userId)
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['fee-tiers', userId], queryFn: async () => (await http.get<Tier[]>('/api/admin/fee-tiers')).data, retry: false })
  const [form, setForm] = useState<Tier | null>(null)
  const [notice, setNotice] = useState('')
  const [validation, setValidation] = useState('')
  const busy = useRef(false)
  const mutation = useMutation({ mutationFn: async (tier: Tier) => tier.feeTierId
    ? http.put(`/api/admin/fee-tiers/${tier.feeTierId}`, tier) : http.post('/api/admin/fee-tiers', tier),
    onSuccess: async () => { setForm(null); setNotice('Đã lưu bậc phí. Phí đã chốt của các lô cũ giữ nguyên.'); await qc.invalidateQueries({ queryKey: ['fee-tiers'] }) },
  })
  const edit = (tier: Tier) => { setForm({ ...tier }); setValidation(''); setNotice(''); mutation.reset() }
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!form || busy.current) return
    if (![form.minCapital, form.maxCapital ?? 0, form.feeAmount].every(Number.isSafeInteger)) { setValidation('Tiền phải là số nguyên trong giới hạn chính xác.'); return }
    setValidation(''); busy.current = true
    try { await mutation.mutateAsync(form) } catch { /* retain inputs */ } finally { busy.current = false }
  }
  return <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6 min-w-0">
    <h2 className="text-lg font-bold mb-3">Bậc phí nền tảng</h2><p className="text-sm text-slate-500 mb-4">Phí cố định bằng đồng, do hộ nuôi trả ngoài tiền lô. Ngày hiệu lực tính theo giờ Việt Nam, bao gồm cả ngày kết thúc.</p>
    {query.isPending && <p role="status">Đang tải bậc phí…</p>}
    {query.isError && <p role="alert">{errorMessage(query.error)} <button onClick={() => void query.refetch()}>Thử lại</button></p>}
    {notice && <p role="status">{notice}</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{['Bậc', 'Khoảng vốn (đồng)', 'Phí', 'Hiệu lực', ''].map((h,n) => <th className="p-2" key={n} scope="col">{h}</th>)}</tr></thead><tbody>{query.data?.map(t => <tr key={t.feeTierId}><td className="p-2">{t.tierCode}</td><td className="p-2 whitespace-nowrap">{t.minInclusive ? '[' : '('}{t.minCapital.toLocaleString('vi-VN')}; {t.maxCapital?.toLocaleString('vi-VN') ?? '∞'}{t.maxInclusive ? ']' : ')'}</td><td className="p-2 whitespace-nowrap">{formatVnd(t.feeAmount)}</td><td className="p-2">{t.effectiveFrom} → {t.effectiveTo ?? 'Không giới hạn'}</td><td className="p-2"><button className="text-red-600 underline" disabled={mutation.isPending} onClick={() => edit(t)}>Sửa {t.tierCode}</button></td></tr>)}</tbody></table></div>
    <p className="text-xs text-slate-500 my-2">Dấu [ hoặc ] nghĩa là bao gồm giá trị tại cận; ( hoặc ) nghĩa là không bao gồm.</p>
    <button className="border rounded-lg p-2 mt-2" disabled={mutation.isPending} onClick={() => edit(blank)}>Thêm bậc phí</button>
    {form && <form className="mt-4 space-y-4" onSubmit={e => void save(e)}><fieldset className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" disabled={mutation.isPending}>
      <label className="text-sm">Mã bậc<input className="w-full border border-slate-300 rounded-lg p-2 mt-1" required maxLength={20} pattern="[A-Za-z0-9_-]+" value={form.tierCode} onChange={e => setForm({ ...form, tierCode: e.target.value })} /></label>
      <label className="text-sm">Vốn từ (đồng)<input className="w-full border border-slate-300 rounded-lg p-2 mt-1" type="number" min={0} step={1} max={Number.MAX_SAFE_INTEGER} required value={Number.isNaN(form.minCapital) ? '' : form.minCapital} onChange={e => setForm({ ...form, minCapital: e.target.valueAsNumber })} /></label>
      <label className="text-sm">Vốn đến (trống nếu không giới hạn)<input className="w-full border border-slate-300 rounded-lg p-2 mt-1" type="number" min={0} step={1} max={Number.MAX_SAFE_INTEGER} value={form.maxCapital ?? ''} onChange={e => setForm({ ...form, maxCapital: e.target.value === '' ? null : e.target.valueAsNumber })} /></label>
      <label className="text-sm">Phí cố định (đồng)<input className="w-full border border-slate-300 rounded-lg p-2 mt-1" type="number" min={0} step={1} max={Number.MAX_SAFE_INTEGER} required value={Number.isNaN(form.feeAmount) ? '' : form.feeAmount} onChange={e => setForm({ ...form, feeAmount: e.target.valueAsNumber })} /></label>
      <label className="text-sm">Hiệu lực từ<input className="w-full border border-slate-300 rounded-lg p-2 mt-1" type="date" required value={form.effectiveFrom} onChange={e => setForm({ ...form, effectiveFrom: e.target.value })} /></label>
      <label className="text-sm">Hiệu lực đến (không bắt buộc)<input className="w-full border border-slate-300 rounded-lg p-2 mt-1" type="date" value={form.effectiveTo ?? ''} onChange={e => setForm({ ...form, effectiveTo: e.target.value || null })} /></label>
      <label><input type="checkbox" checked={form.minInclusive} onChange={e => setForm({ ...form, minInclusive: e.target.checked })} /> Bao gồm cận dưới</label>
      <label><input type="checkbox" checked={form.maxInclusive} onChange={e => setForm({ ...form, maxInclusive: e.target.checked })} /> Bao gồm cận trên</label>
    </fieldset>
      {(mutation.isError || validation) && <p role="alert">{validation || errorMessage(mutation.error)}</p>}
      <div className="flex gap-3"><button className="bg-red-600 text-white rounded-lg p-2 disabled:opacity-50" disabled={mutation.isPending}>{mutation.isPending ? 'Đang lưu…' : 'Lưu bậc phí'}</button><button type="button" disabled={mutation.isPending} onClick={() => setForm(null)}>Hủy</button></div>
    </form>}
  </section>
}
