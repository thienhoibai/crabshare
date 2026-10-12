import { useState, type FormEvent } from 'react'
import { useSearchParams, Link } from 'react-router'
import { RefreshCw, Search, Users } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime } from '../../shared/lib/format'
import { useAuthStore } from '../../shared/auth/authStore'
import { useAdminUsers } from './adminAccountsApi'
import { AdminAccountDecisionDialog, AdminPagination, AdminStatusBadge, adminButton, adminField, identityStatuses, roleLabels, userStatuses, type DecisionSelection } from './adminAccountUi'

export default function AdminUserList() {
  const [params, setParams] = useSearchParams()
  const userId = useAuthStore(s => s.user?.userId)
  const role = params.get('role') ?? ''; const status = params.get('status') ?? ''; const q = params.get('q') ?? ''
  const rawPage = Number(params.get('page') || 1); const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const query = useAdminUsers(role, status, q, page)
  const [selection, setSelection] = useState<DecisionSelection | null>(null)
  const [notice, setNotice] = useState('')
  function navigate(next: { role?: string; status?: string; q?: string; page?: number }) {
    setParams({ tab: 'users', role: next.role ?? role, status: next.status ?? status, q: next.q ?? q, page: String(next.page ?? 1) })
  }
  function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); navigate({ q: String(new FormData(event.currentTarget).get('q') ?? '').trim() }) }
  return <section className="space-y-4" aria-label="Danh sách người dùng">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-900">Người dùng trên nền tảng</h2><button className={adminButton} disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={16} />Làm mới</button></div>
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end gap-4 border-b border-slate-200 bg-slate-50 p-4">
        <form key={q} onSubmit={search} className="flex flex-1 gap-2"><label className="min-w-40 flex-1"><span className="mb-1 block text-xs font-semibold text-slate-600">Tìm người dùng</span><input name="q" defaultValue={q} maxLength={150} className={adminField} placeholder="Tên, email, điện thoại hoặc ID" /></label><button type="submit" className={adminButton + ' self-end'}><Search size={16} />Tìm</button></form>
        <label className="min-w-40"><span className="mb-1 block text-xs font-semibold text-slate-600">Vai trò</span><select aria-label="Vai trò" className={adminField} value={role} onChange={e => navigate({ role: e.target.value })}><option value="">Tất cả vai trò</option>{Object.entries(roleLabels).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</select></label>
        <label className="min-w-40"><span className="mb-1 block text-xs font-semibold text-slate-600">Trạng thái tài khoản</span><select aria-label="Trạng thái tài khoản" className={adminField} value={status} onChange={e => navigate({ status: e.target.value })}><option value="">Tất cả trạng thái</option>{Object.entries(userStatuses).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</select></label>
      </div>
      {query.isPending ? <p role="status" className="p-8 text-center text-sm text-slate-500">Đang tải người dùng…</p> : query.isError ? <div className="p-6"><p role="alert" className="mb-3 text-sm text-red-700">{errorMessage(query.error)}</p><button className={adminButton} onClick={() => void query.refetch()}>Thử lại</button></div> : <>
        {!query.data.items.length ? <div className="p-10 text-center"><Users className="mx-auto mb-3 text-slate-400" /><h3 className="font-bold text-slate-800">Không tìm thấy người dùng</h3><p className="mt-2 text-sm text-slate-500">Thử đổi bộ lọc hoặc từ khoá tìm kiếm.</p></div> : <div className="overflow-x-auto" aria-busy={query.isFetching}><table className="w-full min-w-[800px] text-left text-sm"><caption className="sr-only">Người dùng, trạng thái tài khoản và xác minh danh tính</caption><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Người dùng', 'Vai trò', 'Tài khoản', 'Danh tính', 'Thao tác'].map(label => <th key={label} scope="col" className="p-4 font-bold">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{query.data.items.map(user => <tr key={user.userId} className="align-top hover:bg-slate-50">
          <td className="max-w-72 break-words p-4"><span className="text-xs text-slate-500">#{user.userId}</span><p className="mt-1 font-bold text-slate-900">{user.fullName}</p><p className="mt-1 text-slate-600">{user.email}</p><p className="mt-1 text-xs text-slate-500">{user.phone ?? 'Chưa có số điện thoại'}</p><p className="mt-1 text-xs text-slate-500">Đăng ký {formatDateTime(user.createdAt)}</p></td>
          <td className="p-4"><div className="flex max-w-48 flex-wrap gap-1">{user.roles.map(r => <span key={r} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{roleLabels[r] ?? r}</span>)}</div></td>
          <td className="whitespace-nowrap p-4"><AdminStatusBadge value={user.status} label={userStatuses[user.status] ?? user.status} /></td>
          <td className="whitespace-nowrap p-4">{user.verificationStatus ? <AdminStatusBadge value={user.verificationStatus} label={identityStatuses[user.verificationStatus] ?? user.verificationStatus} /> : <span className="text-slate-500">Không áp dụng</span>}</td>
          <td className="p-4"><div className="flex flex-wrap gap-2"><Link className={adminButton} to={`/admin/users/detail?id=${user.userId}`}>Xem hồ sơ<span className="sr-only"> {user.fullName}</span></Link>{user.userId !== userId && <button className={adminButton + ' text-red-700'} onClick={() => { setNotice(''); setSelection({ id: user.userId, fullName: user.fullName, action: user.status === 'Locked' ? 'unlock' : 'lock' }) }}>{user.status === 'Locked' ? 'Mở khoá' : 'Khoá'}<span className="sr-only"> {user.fullName}</span></button>}</div></td>
        </tr>)}</tbody></table></div>}
        <AdminPagination page={page} total={query.data.total} busy={query.isFetching} onChange={page => navigate({ page })} />
      </>}
    </div>
    {selection && <AdminAccountDecisionDialog selection={selection} onClose={() => setSelection(null)} onDone={setNotice} />}
  </section>
}
