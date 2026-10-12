import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { formatDateTime } from '../../shared/lib/format'
import AdminLayout from './AdminLayout'
import { useAdminUserDetail } from './adminAccountsApi'
import { AdminAccountDecisionDialog, AdminStatusBadge, adminButton, checkTypes, identityStatuses, kycResults, roleLabels, userStatuses, type DecisionSelection } from './adminAccountUi'

function UserDetail({ id }: { id: number }) {
  const query = useAdminUserDetail(id)
  const actorId = useAuthStore(s => s.user?.userId)
  const [selection, setSelection] = useState<DecisionSelection | null>(null)
  const [notice, setNotice] = useState('')
  if (!Number.isSafeInteger(id) || id <= 0) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Mã người dùng không hợp lệ.</p>
  if (query.isPending) return <p role="status" className="p-8 text-center text-sm text-slate-500">Đang tải hồ sơ…</p>
  if (query.isError) return <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><p role="alert" className="mb-4 text-sm text-red-700">{errorMessage(query.error)}</p><button className={adminButton} onClick={() => void query.refetch()}>Thử lại</button></div>
  const { user, verifiedAt, kycChecks } = query.data
  const select = (decision: DecisionSelection) => { setNotice(''); setSelection(decision) }
  return <>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-xs font-semibold text-slate-500">Người dùng #{user.userId}</p><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{user.fullName}</h1><p className="mt-2 text-sm text-slate-500">{user.roles.map(r => roleLabels[r] ?? r).join(' · ') || 'Chưa có vai trò'}</p></div>
      {actorId !== user.userId && <button className={adminButton + ' text-red-700'} disabled={query.isFetching} onClick={() => select({ id: user.userId, fullName: user.fullName, action: user.status === 'Locked' ? 'unlock' : 'lock' })}>{user.status === 'Locked' ? 'Mở khoá tài khoản' : 'Khoá tài khoản'}</button>}</div>
    {notice && <p role="status" className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="mb-4 border-b border-slate-100 pb-2 text-base font-bold text-slate-900">Thông tin tài khoản</h2><dl className="grid grid-cols-1 gap-5 text-sm sm:grid-cols-2">{[
          ['Email', user.email], ['Số điện thoại', user.phone ?? 'Chưa cung cấp'], ['Ngày đăng ký', formatDateTime(user.createdAt)], ['Đăng nhập gần nhất', user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Chưa đăng nhập'],
        ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="mb-1 text-slate-500">{label}</dt><dd className="break-words font-semibold text-slate-900">{value}</dd></div>)}</dl></section>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><h2 className="flex items-center gap-2 border-b border-slate-100 p-5 text-base font-bold text-slate-900"><FileText size={18} className="text-slate-400" />Lịch sử xác minh</h2>
          {!kycChecks.length ? <p className="p-6 text-sm text-slate-500">Chưa có lần xác minh nào.</p> : <div className="divide-y divide-slate-100">{kycChecks.map(check => <article key={check.id} className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-bold text-slate-800">#{check.id} · {checkTypes[check.checkType] ?? check.checkType}</h3><AdminStatusBadge value={check.result} label={kycResults[check.result] ?? check.result} /></div>
            <dl className="grid grid-cols-1 gap-3 text-sm text-slate-600 sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Thời điểm xác minh</dt><dd>{formatDateTime(check.checkedAt)}</dd></div><div><dt className="text-xs text-slate-500">Đồng ý điều khoản</dt><dd>{check.consentAt ? formatDateTime(check.consentAt) : 'Không áp dụng / chưa ghi nhận'}</dd></div><div className="min-w-0"><dt className="text-xs text-slate-500">Mã tham chiếu</dt><dd className="break-words font-mono text-xs">{check.providerReference ?? '—'}</dd></div><div><dt className="text-xs text-slate-500">Người duyệt ngoại lệ</dt><dd>{check.reviewedBy ? `Quản trị viên #${check.reviewedBy}` : 'Chưa duyệt ngoại lệ'}</dd></div></dl>
            {check.failureReason && <p className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">Kết quả nhà cung cấp: {check.failureReason}</p>}
            {check.canApproveException && <button className={adminButton + ' text-red-700'} disabled={query.isFetching} onClick={() => select({ action: 'approve-exception', id: check.id, fullName: user.fullName })}>Duyệt ngoại lệ KYC<span className="sr-only"> lần #{check.id}</span></button>}
          </article>)}</div>}
        </section>
      </div>
      <aside className="space-y-6"><section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="mb-4 text-base font-bold text-slate-900">Trạng thái tài khoản</h2><AdminStatusBadge value={user.status} label={userStatuses[user.status] ?? user.status} /></section>
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900"><ShieldCheck size={18} />Xác minh danh tính</h2>{user.verificationStatus ? <><AdminStatusBadge value={user.verificationStatus} label={identityStatuses[user.verificationStatus] ?? user.verificationStatus} />{verifiedAt && <p className="mt-3 text-sm text-slate-600">Xác minh lúc {formatDateTime(verifiedAt)}</p>}</> : <p className="text-sm text-slate-500">Không áp dụng cho tài khoản này.</p>}<p className="mt-4 text-sm leading-6 text-slate-500">CrabShare chỉ lưu kết quả xác minh. Không lưu ảnh CCCD hoặc selfie để xem lại.</p></section>
      </aside>
    </div>
    {selection && <AdminAccountDecisionDialog selection={selection} onClose={() => setSelection(null)} onDone={setNotice} />}
  </>
}

export default function AdminUserDetail() {
  const [params] = useSearchParams()
  const actorId = useAuthStore(s => s.user?.userId)
  const id = Number(params.get('id'))
  return <AdminLayout activeTab="users"><Link className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900" to="/admin/users?tab=users"><ArrowLeft size={16} />Quay lại danh sách</Link><UserDetail key={`${actorId}-${id}`} id={id} /></AdminLayout>
}
