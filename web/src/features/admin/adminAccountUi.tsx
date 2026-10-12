import { useRef, useState, type FormEvent } from 'react'
import { errorMessage } from '../../shared/api/http'
import { ActionDialog } from '../../shared/ui/ActionDialog'
import { useAdminAccountDecision, type AdminAccountDecision } from './adminAccountsApi'

export const adminButton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50'
export const adminField = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm'
export const roleLabels: Record<string, string> = { Investor: 'Nhà đầu tư', Customer: 'Khách hàng', OperatorMember: 'Thành viên hộ nuôi', PlatformAdmin: 'Quản trị viên', EvidenceReviewer: 'Thẩm định bằng chứng' }
export const userStatuses: Record<string, string> = { Active: 'Hoạt động', Locked: 'Đã khoá', PendingVerification: 'Chờ xác minh' }
export const kycResults: Record<string, string> = { Pending: 'Đang xử lý', Passed: 'Đạt', Failed: 'Không đạt', ExceptionApproved: 'Đã duyệt ngoại lệ' }
export const identityStatuses: Record<string, string> = { Unverified: 'Chưa xác minh', Rejected: 'Không đạt', Verified: 'Đã xác minh' }
export const checkTypes: Record<string, string> = { OtpDeclaration: 'OTP / khai báo', EkycIdFace: 'CCCD và khuôn mặt', BankNameMatch: 'Tên tài khoản ngân hàng' }
export function AdminStatusBadge({ value, label }: { value: string; label: string }) {
  const color = ['Verified', 'Passed', 'ExceptionApproved', 'Active'].includes(value) ? 'bg-emerald-50 text-emerald-800'
    : ['Locked', 'Failed', 'Rejected'].includes(value) ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${color}`}>{label}</span>
}
export function AdminPagination({ page, total, busy, onChange }: { page: number; total: number; busy: boolean; onChange: (page: number) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 text-sm text-slate-600"><span>Trang {page} / {Math.max(1, Math.ceil(total / 10))} · {total} kết quả</span><div className="flex gap-2"><button className={adminButton} disabled={page === 1 || busy} onClick={() => onChange(page - 1)}>Trước</button><button className={adminButton} disabled={page * 10 >= total || busy} onClick={() => onChange(page + 1)}>Sau</button></div></div>
}
export interface DecisionSelection { action: AdminAccountDecision['action']; id: number; fullName: string }
export function AdminAccountDecisionDialog({ selection, onClose, onDone }: { selection: DecisionSelection; onClose: () => void; onDone: (message: string) => void }) {
  const mutation = useAdminAccountDecision()
  const busy = useRef(false)
  const [error, setError] = useState('')
  const title = selection.action === 'lock' ? 'Khoá tài khoản' : selection.action === 'unlock' ? 'Mở khoá tài khoản' : 'Duyệt ngoại lệ KYC'
  const verb = title[0].toLowerCase() + title.slice(1)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim()
    if (!reason) { setError('Vui lòng nhập lý do, không chỉ nhập khoảng trắng.'); return }
    busy.current = true; setError('')
    try { await mutation.mutateAsync({ action: selection.action, id: selection.id, reason }); onDone(`Đã ${verb} cho ${selection.fullName}.`); onClose() }
    catch (failure) { setError(errorMessage(failure)) }
    finally { busy.current = false }
  }
  return <ActionDialog title={title} busy={mutation.isPending} onClose={onClose}>
    <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-bold">{selection.fullName}</div>
    <form className="space-y-5" onSubmit={submit} aria-busy={mutation.isPending}>
      <div><label className="mb-2 block text-sm font-bold" htmlFor="account-decision-reason">Lý do {verb}</label><textarea id="account-decision-reason" name="reason" className={adminField} rows={4} required maxLength={300} disabled={mutation.isPending} /></div>
      <p className="text-sm leading-6 text-slate-600">{selection.action === 'lock' ? 'Tài khoản sẽ không thể đăng nhập và các JWT hiện tại sẽ bị từ chối.' : selection.action === 'unlock' ? 'Tài khoản sẽ được khôi phục về trạng thái trước khi khoá.' : 'Xác nhận duyệt ngoại lệ của lần eKYC thất bại này. Nhà đầu tư sẽ chuyển thành Đã xác minh. Quyết định và lý do được ghi vào nhật ký kiểm toán.'}</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-3"><button type="button" className={adminButton} disabled={mutation.isPending} onClick={onClose}>Huỷ</button><button type="submit" className={adminButton + ' border-red-600! bg-red-600! text-white hover:bg-red-700!'} disabled={mutation.isPending}>{mutation.isPending ? 'Đang xử lý…' : 'Xác nhận'}</button></div>
    </form>
  </ActionDialog>
}
