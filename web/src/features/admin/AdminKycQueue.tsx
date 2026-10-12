import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime } from '../../shared/lib/format'
import { useAdminKycChecks } from './adminAccountsApi'
import { AdminAccountDecisionDialog, AdminPagination, AdminStatusBadge, adminButton, adminField, checkTypes, kycResults, type DecisionSelection } from './adminAccountUi'

export default function AdminKycQueue() {
  const [params, setParams] = useSearchParams()
  const result = params.get('result') === 'all' ? '' : params.get('result') ?? 'Failed'
  const checkType = params.get('checkType') === 'all' ? '' : params.get('checkType') ?? 'EkycIdFace'
  const rawPage = Number(params.get('page') || 1); const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const query = useAdminKycChecks(result, checkType, page)
  const [selection, setSelection] = useState<DecisionSelection | null>(null)
  const [notice, setNotice] = useState('')
  function navigate(nextResult: string, nextType: string, nextPage = 1) { setParams({ tab: 'kyc', result: nextResult || 'all', checkType: nextType || 'all', page: String(nextPage) }) }
  return <section className="space-y-4" aria-label="Hàng đợi ngoại lệ KYC">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Ngoại lệ xác minh danh tính</h2><p className="mt-1 text-sm text-slate-500">Chỉ lần eKYC thất bại mới nhất của nhà đầu tư đang hoạt động được duyệt ngoại lệ.</p></div><button className={adminButton} disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={16} />Làm mới</button></div>
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap gap-4 border-b border-slate-200 bg-slate-50 p-4"><label><span className="mb-1 block text-xs font-semibold text-slate-600">Kết quả xác minh</span><select aria-label="Kết quả xác minh" className={adminField} value={result} onChange={e => navigate(e.target.value, checkType)}><option value="">Tất cả kết quả</option>{Object.entries(kycResults).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label><span className="mb-1 block text-xs font-semibold text-slate-600">Loại xác minh</span><select aria-label="Loại xác minh" className={adminField} value={checkType} onChange={e => navigate(result, e.target.value)}><option value="">Tất cả loại</option>{Object.entries(checkTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      {query.isPending ? <p role="status" className="p-8 text-center text-sm text-slate-500">Đang tải lịch sử xác minh…</p> : query.isError ? <div className="p-6"><p role="alert" className="mb-3 text-sm text-red-700">{errorMessage(query.error)}</p><button className={adminButton} onClick={() => void query.refetch()}>Thử lại</button></div> : <>
        {!query.data.items.length ? <div className="p-10 text-center"><ShieldCheck className="mx-auto mb-3 text-slate-400" /><h3 className="font-bold text-slate-800">Không có lần xác minh trong danh sách này</h3></div> : <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><caption className="sr-only">Lịch sử KYC và quyền duyệt ngoại lệ</caption><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Người dùng', 'Lần xác minh', 'Kết quả', 'Lý do không đạt', 'Thao tác'].map(label => <th key={label} scope="col" className="p-4 font-bold">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{query.data.items.map(check => <tr key={check.id} className="align-top hover:bg-slate-50">
          <td className="max-w-64 break-words p-4"><Link className="font-bold text-slate-900 hover:text-red-700" to={`/admin/users/detail?id=${check.userId}`}>{check.fullName}</Link><p className="mt-1 text-xs text-slate-500">{check.email}</p></td>
          <td className="p-4"><p className="font-semibold text-slate-700">#{check.id} · {checkTypes[check.checkType] ?? check.checkType}</p><p className="mt-1 text-xs text-slate-500">{formatDateTime(check.checkedAt)}</p>{check.reviewedBy && <p className="mt-1 text-xs text-slate-500">Người duyệt #{check.reviewedBy}</p>}</td>
          <td className="whitespace-nowrap p-4"><AdminStatusBadge value={check.result} label={kycResults[check.result] ?? check.result} /></td>
          <td className="max-w-72 break-words p-4 text-slate-600">{check.failureReason ?? '—'}</td>
          <td className="p-4">{check.canApproveException ? <button className={adminButton + ' text-red-700'} onClick={() => { setNotice(''); setSelection({ action: 'approve-exception', id: check.id, fullName: check.fullName }) }}>Duyệt ngoại lệ<span className="sr-only"> {check.fullName}</span></button> : <span className="text-xs text-slate-500">Không được duyệt ngoại lệ</span>}</td>
        </tr>)}</tbody></table></div>}
        <AdminPagination page={page} total={query.data.total} busy={query.isFetching} onChange={page => navigate(result, checkType, page)} />
      </>}
    </div>
    {selection && <AdminAccountDecisionDialog selection={selection} onClose={() => setSelection(null)} onDone={setNotice} />}
  </section>
}
