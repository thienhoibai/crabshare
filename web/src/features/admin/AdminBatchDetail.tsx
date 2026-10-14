import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, CheckCircle, FileText } from 'lucide-react'
import AdminLayout from './AdminLayout'
import { approveBatch, getAdminBatch, rejectBatch, requestBatchRevision } from './adminBatchesApi'
import { scheduleLabel } from '../operator/CostScheduleEditor'
import { batchStatuses, costCategories, crabTypes } from '../operator/batchesApi'
import { useAuthStore } from '../../shared/auth/authStore'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime, formatVnd } from '../../shared/lib/format'

export default function AdminBatchDetail() {
  const [params] = useSearchParams()
  const code = params.get('id') ?? params.get('code') ?? ''
  const userId = useAuthStore(s => s.user?.userId)
  const qc = useQueryClient()
  const key = ['admin-batch', userId, code]
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => getAdminBatch(code, signal), enabled: !!code, retry: false })
  const [open, setOpen] = useState('')
  const [deadline, setDeadline] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState('')
  const busy = useRef(false)
  const mutation = useMutation({ mutationFn: (action: 'approve' | 'reject' | 'revise') => action === 'approve'
    ? approveBatch(code, `${open}:00+07:00`, `${deadline}:00+07:00`) : action === 'revise' ? requestBatchRevision(code,reason.trim()) : rejectBatch(code, reason.trim()),
    onSuccess: async (result, action) => {
      qc.setQueryData(key, result)
      setMessage(action === 'approve' ? 'Đã duyệt lô, mở gọi vốn và khóa chi phí chuẩn.' : action === 'revise' ? 'Đã trả hồ sơ về nháp để hộ nuôi bổ sung và gửi lại.' : 'Đã từ chối dứt điểm lô và lưu lý do.')
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin-batches'] }), qc.invalidateQueries({ queryKey: ['operator-batches'] }), qc.invalidateQueries({ queryKey: ['operator-batch'] })])
    },
    onError: async error => { setProblem(errorMessage(error)); await query.refetch() },
  })
  const decide = async (event: FormEvent, action: 'approve' | 'reject' | 'revise') => {
    event.preventDefault()
    if (busy.current || query.isFetching || query.data?.batch.status !== 'PendingApproval') return
    setProblem(''); setMessage('')
    if (action !== 'approve' && !reason.trim()) { setProblem('Nhập lý do từ chối hoặc yêu cầu bổ sung.'); return }
    if (action === 'approve' && (!open || !deadline || open >= deadline)) { setProblem('Thời gian mở phải trước hạn gọi vốn.'); return }
    busy.current = true
    try { await mutation.mutateAsync(action) } catch { /* preserve inputs and show server error */ }
    finally { busy.current = false }
  }
  const detail = query.data
  const b = detail?.batch
  const cost = b?.standardCost
  const disabled = mutation.isPending || query.isFetching
  const inputClass = 'w-full border border-slate-300 rounded-lg p-2 text-sm'
  return <AdminLayout activeTab="batches">
    <Link to="/admin/batches" className="inline-flex items-center gap-2 text-sm text-slate-500 mb-4"><ArrowLeft size={16} /> Quay lại danh sách lô</Link>
    {!code && <p role="alert">Thiếu mã lô trên đường dẫn.</p>}
    {query.isPending && code && <p role="status">Đang tải hồ sơ…</p>}
    {query.isError && <div role="alert">{errorMessage(query.error)} <button className="underline" onClick={() => void query.refetch()}>Thử lại</button></div>}
    {message && <p className="p-4 mb-4 rounded-lg bg-emerald-50 text-emerald-800" role="status">{message}</p>}
    {problem && <p className="p-4 mb-4 rounded-lg bg-red-50 text-red-800" role="alert">{problem}</p>}
    {b && detail && <>
      <header className="mb-6"><h1 className="text-2xl font-extrabold text-slate-900">Hồ sơ dự án: {b.batchCode}</h1><p className="text-sm text-slate-500 mt-1">{b.title} · <strong>{detail.operator.legalName}</strong> · {batchStatuses[b.status]}</p></header>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 min-w-0 space-y-6">
          <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm"><h2 className="font-bold mb-4">Kế hoạch tài chính</h2><dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div><dt>Vốn mục tiêu</dt><dd className="text-xl font-bold">{formatVnd(b.targetCapital)}</dd></div><div><dt>Dải vốn khả thi</dt><dd>{formatVnd(b.minViableCapital)} – {formatVnd(b.maxCapital)}</dd></div>
            <div><dt>Quy mô và chu kỳ</dt><dd>{b.seedQuantity} con · {b.cycleDays} ngày · {crabTypes[b.crabType]}</dd></div><div><dt>Sản lượng dự kiến</dt><dd>{b.expectedOutputKg} kg</dd></div>
            <div><dt>Thù lao người nuôi</dt><dd>{b.operatorSharePct}%</dd></div><div><dt>Địa chỉ hộ nuôi</dt><dd>{detail.operator.farmAddress} · {detail.operator.status}</dd></div>
            {detail.platformFeeAmount !== null && <div><dt>Phí nền tảng · {detail.feeTierCode}</dt><dd>{formatVnd(detail.platformFeeAmount)} · hộ nuôi trả ngoài vốn lô</dd></div>}
          </dl></section>
          <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm min-w-0"><h2 className="font-bold mb-4 flex gap-2"><FileText size={18} /> Chi phí chuẩn</h2>
            {!cost ? <p>Chưa có bảng chi phí chuẩn.</p> : <>
              <p className="mb-3">Phiên bản {cost.versionNo} · <strong>{cost.status}</strong>{cost.lockedAt && ` · Khóa lúc ${formatDateTime(cost.lockedAt)}`}</p>
              <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Hạng mục', 'Mô tả', 'Số lượng', 'Đơn giá', 'Đợt', 'Thành tiền'].map(h => <th scope="col" key={h} className="p-2 whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{cost.items.map((i, n) => <tr key={n} className="border-t border-slate-100"><td className="p-2">{costCategories[i.category]}</td><td className="p-2">{i.description}</td><td className="p-2 whitespace-nowrap">{i.quantity} {i.unit}</td><td className="p-2 whitespace-nowrap">{formatVnd(i.unitPrice)}</td><td className="p-2">{i.category === 'MortalityReserve' ? 'Giữ lại' : i.category === 'Depreciation' ? 'Quyết toán' : i.trancheNo}</td><td className="p-2 whitespace-nowrap">{formatVnd(i.amount)}</td></tr>)}</tbody></table></div>
              <p className="font-bold mt-4">Tổng chi phí chuẩn: {formatVnd(cost.total)}</p>
            </>}
          </section>
          <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm"><h2 className="font-bold mb-4">Lịch giải ngân do hộ nuôi đề xuất</h2>
            {(cost?.tranches ?? []).length === 0 && <p>Chưa có lịch đợt. Nếu có khoản chi theo đợt, hộ nuôi cần bổ sung trước khi duyệt.</p>}
            {(cost?.tranches ?? []).map(p => { const actual=detail.tranches.find(t=>t.trancheNo===p.trancheNo); return <div className="border-t py-3 text-sm" key={p.trancheNo}><p className="font-bold">Đợt {p.trancheNo} · {formatVnd(p.amount)}</p><p>{scheduleLabel(p)}</p><p className="whitespace-pre-wrap break-words">{p.unlockCondition}</p>{actual && <p>{actual.status} · {actual.plannedDate ? `Ngày xác định: ${actual.plannedDate}` : 'Chờ mốc thực tế'}</p>}</div> })}
            <p className="text-sm text-slate-500 mt-3">Dự phòng hao hụt giữ lại theo sự kiện; khấu hao trả khi quyết toán. Chưa có mốc thực tế thì chưa có ngày cụ thể. Xác định ngày không đồng nghĩa với duyệt chi.</p>
          </section>
        </div>
        <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit space-y-4">
          <h2 className="font-bold">Xét duyệt</h2>
          {b.status === 'PendingApproval' ? <>
            <form className="space-y-3" onSubmit={e => void decide(e, 'approve')}>
              <label className="block text-sm">Mở gọi vốn (giờ Việt Nam)<input className={inputClass} type="datetime-local" required value={open} onChange={e => setOpen(e.target.value)} disabled={disabled} /></label>
              <label className="block text-sm">Hạn gọi vốn (giờ Việt Nam)<input className={inputClass} type="datetime-local" required value={deadline} onChange={e => setDeadline(e.target.value)} disabled={disabled} /></label>
              <button disabled={disabled} className="w-full flex items-center justify-center gap-2 bg-red-600 text-white p-3 rounded-lg font-bold disabled:opacity-50"><CheckCircle size={16} />{mutation.isPending ? 'Đang xử lý…' : 'Duyệt & Mở gọi vốn'}</button>
            </form>
            <form className="space-y-3 border-t pt-4" onSubmit={e => void decide(e, (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'revise' ? 'revise' : 'reject')}><label className="block text-sm">Lý do từ chối hoặc yêu cầu bổ sung<textarea className={inputClass} required maxLength={300} value={reason} onChange={e => setReason(e.target.value)} disabled={disabled} /></label><button value="revise" disabled={disabled} className="w-full border border-amber-400 p-3 rounded-lg font-bold disabled:opacity-50">Yêu cầu bổ sung</button><button disabled={disabled} className="w-full border border-slate-300 p-3 rounded-lg font-bold disabled:opacity-50">Từ chối lô</button></form>
          </> : <>
            <p>Lô đã được xử lý: {batchStatuses[b.status]}.</p>
            {detail.rejectionReason && <p className="whitespace-pre-wrap break-words">{detail.rejectionReason}</p>}
            {detail.fundingOpenAt && <p className="text-sm">Mở gọi vốn: {formatDateTime(detail.fundingOpenAt)}</p>}
            {detail.fundingDeadline && <p className="text-sm">Hạn gọi vốn: {formatDateTime(detail.fundingDeadline)}</p>}
          </>}
        </section>
      </div>
    </>}
  </AdminLayout>
}
