import { useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Building2, RefreshCw, Check, X, Pause } from 'lucide-react'
import axios from 'axios'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime } from '../../shared/lib/format'
import { ActionDialog } from '../../shared/ui/ActionDialog'
import { useAdminOperators, useOperatorDecision, type AdminOperator, type OperatorStatus, type OperatorDecision } from './adminOperatorsApi'

const statuses: Record<OperatorStatus, { label: string; color: string }> = {
  Draft: { label: 'Nháp', color: 'bg-slate-100 text-slate-700' },
  Submitted: { label: 'Chờ duyệt', color: 'bg-amber-50 text-amber-800' },
  Approved: { label: 'Đã duyệt', color: 'bg-emerald-50 text-emerald-800' },
  Rejected: { label: 'Từ chối', color: 'bg-red-50 text-red-800' },
  Suspended: { label: 'Đình chỉ', color: 'bg-slate-200 text-slate-800' },
}
const button = 'relative inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50'
const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm'
type Selection = { operator: AdminOperator; action: OperatorDecision['action'] }

export default function AdminOperators() {
  const [params, setParams] = useSearchParams()
  const rawStatus = params.get('status')
  const status: OperatorStatus | '' = rawStatus === 'all' ? '' : rawStatus && rawStatus in statuses ? rawStatus as OperatorStatus : 'Submitted'
  const rawPage = Number(params.get('page') || 1)
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const query = useAdminOperators(status, page)
  const mutation = useOperatorDecision()
  const lock = useRef(false)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [notice, setNotice] = useState('')
  const [localError, setLocalError] = useState('')
  const navigate = (nextStatus: OperatorStatus | '', nextPage: number) => setParams(previous => {
    const next = new URLSearchParams(previous)
    next.set('tab', 'operators'); next.set('status', nextStatus || 'all'); next.set('page', String(nextPage))
    return next
  })
  const open = (operator: AdminOperator, action: Selection['action']) => {
    mutation.reset(); setLocalError(''); setNotice(''); setSelection({ operator, action })
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selection || lock.current) return
    const data = new FormData(event.currentTarget)
    const capacityText = String(data.get('capacity') ?? '').trim()
    const capacity = Number(capacityText)
    const reason = String(data.get('reason') ?? '').trim()
    if (selection.action === 'approve' ? (!capacityText || !Number.isInteger(capacity) || capacity < 0 || capacity > 2147483647) : !reason) {
      setLocalError(selection.action === 'approve' ? 'Nhập sức chứa là số nguyên từ 0 đến 2.147.483.647.' : 'Vui lòng nhập lý do, không chỉ nhập khoảng trắng.')
      return
    }
    setLocalError(''); lock.current = true
    try {
      await mutation.mutateAsync(selection.action === 'approve'
        ? { operatorId: selection.operator.operatorId, action: 'approve', approvedSlotCapacity: capacity }
        : { operatorId: selection.operator.operatorId, action: selection.action, reason })
      setNotice(`Đã ${selection.action === 'approve' ? 'duyệt' : selection.action === 'reject' ? 'từ chối' : 'đình chỉ'} hộ nuôi ${selection.operator.legalName}.`)
      setSelection(null)
      if (query.data?.items.length === 1 && page > 1 && status) navigate(status, page - 1)
    } catch (error) {
      if (axios.isAxiosError(error) && [403, 409, 422].includes(error.response?.status ?? 0)) void query.refetch()
    } finally { lock.current = false }
  }
  return <section className="vi02 space-y-4" aria-label="Quản lý hộ nuôi">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 className="text-lg font-bold text-slate-900">Hồ sơ hộ nuôi</h2><p className="mt-1 text-sm text-slate-500">Xét duyệt hồ sơ, cấp sức chứa và quản lý trạng thái hoạt động.</p></div>
      <button className={button} disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={16} className={query.isFetching ? 'animate-spin' : ''} />Làm mới</button>
    </div>
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-3"><label htmlFor="operator-status" className="text-sm font-semibold text-slate-700">Trạng thái</label>
          <select id="operator-status" className={field + ' w-auto!'} value={status} onChange={e => navigate(e.target.value as OperatorStatus | '', 1)}>
            <option value="">Tất cả trạng thái</option>{Object.entries(statuses).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
          </select>
        </div>
        <p className="text-sm text-slate-500" role="status">{query.data ? `${query.data.total} hồ sơ` : 'Danh sách hộ nuôi'}</p>
      </div>
      {query.isPending ? <p className="p-8 text-center text-sm text-slate-500" role="status">Đang tải hồ sơ…</p> : query.isError ?
        <div className="p-6"><p role="alert" className="mb-3 text-sm text-red-700">{errorMessage(query.error)}</p><button className={button} disabled={query.isFetching} onClick={() => void query.refetch()}>Thử lại</button></div> : !query.data.items.length ?
        <div className="px-6 py-12 text-center"><Building2 className="mx-auto mb-3 text-slate-400" size={28} /><h3 className="font-bold text-slate-800">Không có hồ sơ trong danh sách này</h3><p className="mt-2 text-sm text-slate-500">Thử chọn trạng thái khác hoặc làm mới danh sách.</p>{page > 1 && <button className={button + ' mt-4'} onClick={() => navigate(status, 1)}>Về trang đầu</button>}</div> : <>
        <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500 sm:hidden">Vuốt ngang bảng để xem đầy đủ thông tin và thao tác.</p>
        <div className="relative overflow-x-auto" aria-busy={query.isFetching}>
          <table className="w-full min-w-[760px] text-left text-sm"><caption className="sr-only">Hồ sơ hộ nuôi và thao tác xét duyệt</caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{['Hộ nuôi', 'Hồ sơ pháp lý', 'Trạng thái', 'Sức chứa', 'Thao tác'].map(title => <th scope="col" className="p-4 font-bold" key={title}>{title}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{query.data.items.map(op => <tr key={op.operatorId} className="align-top hover:bg-slate-50/60">
              <td className="max-w-72 p-4"><span className="text-xs font-medium text-slate-500">HN-{op.operatorId}</span><p className="mt-1 break-words font-bold text-slate-900">{op.legalName}</p><p className="mt-1 break-words text-xs leading-5 text-slate-500">{op.farmAddress}</p></td>
              <td className="p-4 text-slate-600"><p>MST: {op.taxCode}</p><p className="mt-1">ĐKKD: {op.businessRegNo}</p><p className="mt-2 text-xs text-slate-500">{op.submittedAt ? `Gửi ${formatDateTime(op.submittedAt)}` : 'Chưa gửi hồ sơ'}</p></td>
              <td className="whitespace-nowrap p-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statuses[op.status].color}`}>{statuses[op.status].label}</span></td>
              <td className="whitespace-nowrap p-4 font-semibold text-slate-700">{op.approvedAt ? `${op.approvedSlotCapacity.toLocaleString('vi-VN')} ô` : 'Chưa cấp'}</td>
              <td className="p-4"><div className="flex flex-wrap gap-2">{op.status === 'Submitted' ? <>
                <button className={button + ' border-emerald-200! text-emerald-800'} onClick={() => open(op, 'approve')}><Check size={15} />Duyệt<span className="sr-only"> {op.legalName}</span></button>
                <button className={button + ' text-red-700'} onClick={() => open(op, 'reject')}><X size={15} />Từ chối<span className="sr-only"> {op.legalName}</span></button>
              </> : op.status === 'Approved' ? <button className={button + ' text-red-700'} onClick={() => open(op, 'suspend')}><Pause size={15} />Đình chỉ<span className="sr-only"> {op.legalName}</span></button> : <span className="text-xs text-slate-500">Không có thao tác</span>}</div></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 text-sm text-slate-600"><span>Trang {page} / {Math.max(1, Math.ceil(query.data.total / 10))}</span><div className="flex gap-2"><button className={button} disabled={page === 1 || query.isFetching} onClick={() => navigate(status, page - 1)}>Trước</button><button className={button} disabled={page * 10 >= query.data.total || query.isFetching} onClick={() => navigate(status, page + 1)}>Sau</button></div></div>
      </>}
    </div>
    {selection && <ActionDialog title={selection.action === 'approve' ? 'Duyệt hồ sơ hộ nuôi' : selection.action === 'reject' ? 'Từ chối hồ sơ hộ nuôi' : 'Đình chỉ hộ nuôi'} busy={mutation.isPending} onClose={() => setSelection(null)}>
      <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm"><p className="font-bold">{selection.operator.legalName}</p><p className="mt-1 text-slate-600">{selection.operator.farmAddress}</p><p className="mt-2 text-slate-600">MST: {selection.operator.taxCode} · ĐKKD: {selection.operator.businessRegNo}</p></div>
      <form onSubmit={submit} className="space-y-5">
        {selection.action === 'approve' ? <div><label htmlFor="approved-capacity" className="mb-2 block text-sm font-bold">Sức chứa được duyệt (ô nuôi)</label><input autoFocus id="approved-capacity" name="capacity" type="number" min={0} max={2147483647} step={1} required className={field} disabled={mutation.isPending} aria-describedby="capacity-help" /><p id="capacity-help" className="mt-2 text-xs leading-5 text-slate-500">Số ô tối đa hộ nuôi được phép vận hành. Nhập 0 nếu chưa cấp sức chứa.</p></div> :
          <div><label htmlFor="decision-reason" className="mb-2 block text-sm font-bold">Lý do {selection.action === 'reject' ? 'từ chối' : 'đình chỉ'}</label><textarea autoFocus id="decision-reason" name="reason" required rows={4} className={field} disabled={mutation.isPending} /></div>}
        <p className="text-sm leading-6 text-slate-600">{selection.action === 'approve' ? 'Xác nhận chuyển hồ sơ sang Đã duyệt với sức chứa đã nhập.' : selection.action === 'reject' ? 'Hồ sơ sẽ chuyển sang Từ chối. Hộ nuôi có thể sửa và lưu hồ sơ; gửi lại chưa được hỗ trợ.' : 'Hộ nuôi sẽ chuyển sang Đình chỉ. Thao tác này không tự hủy các lô nuôi đang tồn tại.'}</p>
        {(localError || mutation.isError) && <p role="alert" className="text-sm text-red-700">{localError || errorMessage(mutation.error)}</p>}
        <div className="flex flex-wrap justify-end gap-3"><button className={button} type="button" disabled={mutation.isPending} onClick={() => setSelection(null)}>Hủy</button><button className={button + ' border-red-600! bg-red-600! text-white hover:bg-red-700!'} disabled={mutation.isPending}>{mutation.isPending ? 'Đang xử lý…' : 'Xác nhận'}</button></div>
      </form>
    </ActionDialog>}
  </section>
}
