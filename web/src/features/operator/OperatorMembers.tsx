import { useRef, useState, type FormEvent } from 'react'
import { Plus, RefreshCw, Trash2, Users, ShieldCheck } from 'lucide-react'
import axios from 'axios'
import { Link } from 'react-router'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { formatDate } from '../../shared/lib/format'
import { ActionDialog } from '../../shared/ui/ActionDialog'
import OperatorLayout from './OperatorLayout'
import { OpHeading, OpPanel, OpBtn, OpBadge, OpNote } from './operatorUi'
import { useOperatorMembers, useManageOperatorMember, type OperatorMember } from './operatorsApi'

export default function OperatorMembers() {
  const query = useOperatorMembers()
  const mutation = useManageOperatorMember()
  const userId = useAuthStore(s => s.user?.userId)
  const canManage = !query.isError && query.data?.some(member => member.userId === userId && member.memberRole === 'Owner')
  const [dialog, setDialog] = useState<'add' | OperatorMember | null>(null)
  const [notice, setNotice] = useState('')
  const [localError, setLocalError] = useState('')
  const lock = useRef(false)
  const staffCount = query.data?.filter(member => member.memberRole === 'Staff').length ?? 0
  const open = (next: 'add' | OperatorMember) => { mutation.reset(); setLocalError(''); setNotice(''); setDialog(next) }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!dialog || !canManage || lock.current) return
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim()
    if (dialog === 'add' && !email) { setLocalError('Vui lòng nhập email tài khoản nhân viên.'); return }
    lock.current = true; setLocalError('')
    try {
      await mutation.mutateAsync(dialog === 'add' ? { action: 'add', email } : { action: 'remove', userId: dialog.userId })
      setNotice(dialog === 'add' ? `Đã thêm ${email} vào hộ nuôi với vai trò Nhân viên.` : `Đã xóa ${dialog.fullName} khỏi hộ nuôi.`)
      setDialog(null)
    } catch (error) {
      if (axios.isAxiosError(error) && [403, 404, 409].includes(error.response?.status ?? 0)) void query.refetch()
    } finally { lock.current = false }
  }
  return <OperatorLayout activeTab="members">
    <OpHeading eyebrow="Quản lý hộ nuôi" title="Nhân viên" description="Quản lý những người cùng vận hành hộ nuôi của bạn."
      action={<><OpBtn variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={16} className={query.isFetching ? 'animate-spin' : ''} />Làm mới</OpBtn>{canManage && <OpBtn onClick={() => open('add')}><Plus size={17} />Thêm nhân viên</OpBtn>}</>} />
    <div className="space-y-5">
      {notice && <div role="status"><OpNote>{notice}</OpNote></div>}
      <OpPanel title="Thành viên hộ nuôi" subtitle="Chủ hộ quản lý nhân sự; nhân viên tham gia vận hành trong phạm vi được cấp."
        action={query.data && !query.isError ? <OpBadge>{query.data.length} thành viên</OpBadge> : undefined}>
        {query.isPending ? <p role="status" className="py-8 text-center text-sm">Đang tải danh sách thành viên…</p> : query.isError ?
          <div className="space-y-3 py-4"><div role="alert"><OpNote tone="danger">{errorMessage(query.error)}</OpNote></div><OpBtn variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Thử lại</OpBtn><p className="text-sm"><Link to="/operator/register" className="underline">Xem hồ sơ hộ nuôi</Link></p></div> : <>
            {!canManage && <OpNote tone="info">Bạn có quyền xem danh sách. Chỉ chủ hộ nuôi được thêm hoặc xóa nhân viên.</OpNote>}
            {!query.data.length ? <div className="py-10 text-center"><Users className="mx-auto mb-3 opacity-50" size={28} /><p className="font-bold">Chưa có thành viên để hiển thị</p><p className="mt-2 text-sm">Làm mới danh sách để kiểm tra quyền truy cập hiện tại.</p></div> :
              <ul className="divide-y divide-[#e8dfd4]" aria-label="Danh sách thành viên">{query.data.map(member => <li key={member.userId} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f4efe8] text-sm font-bold" aria-hidden="true">{member.fullName.trim().slice(0, 1).toUpperCase()}</div>
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="break-words text-sm font-bold">{member.fullName}</p>{member.userId === userId && <span className="text-xs opacity-60">(Bạn)</span>}<OpBadge tone={member.memberRole === 'Owner' ? 'gold' : 'mute'}>{member.memberRole === 'Owner' ? 'Chủ hộ' : 'Nhân viên'}</OpBadge></div><p className="mt-1 break-all text-sm opacity-70">{member.email}</p><p className="mt-1 text-xs opacity-60">Tham gia {formatDate(member.joinedAt)}</p></div>
                </div>
                {member.memberRole === 'Owner' ? <span className="inline-flex shrink-0 items-center gap-1.5 text-xs opacity-60"><ShieldCheck size={15} />Chủ hộ nuôi</span> : canManage && <OpBtn variant="outline" className="relative" sm onClick={() => open(member)}><Trash2 size={15} />Xóa nhân viên<span className="sr-only"> {member.fullName}</span></OpBtn>}
              </li>)}</ul>}
            {query.data.length > 0 && staffCount === 0 && <div className="border-t border-[#e8dfd4] py-6 text-center"><Users className="mx-auto mb-2 opacity-50" size={24} /><p className="text-sm font-bold">Hộ nuôi chưa có nhân viên</p><p className="mt-1 text-sm opacity-70">{canManage ? 'Thêm tài khoản có sẵn bằng email để cùng vận hành hộ nuôi.' : 'Chủ hộ nuôi có thể thêm nhân viên bằng email.'}</p></div>}
          </>}
      </OpPanel>
      <OpNote>Nhân viên mới cần đăng nhập lại để nhận quyền trên giao diện. Khi bị xóa, tài khoản mất quyền truy cập dữ liệu hộ nuôi ngay.</OpNote>
    </div>
    {dialog && <ActionDialog theme="operator" title={dialog === 'add' ? 'Thêm nhân viên' : 'Xóa nhân viên khỏi hộ nuôi'} busy={mutation.isPending} onClose={() => setDialog(null)}>
      <form onSubmit={submit} className="space-y-5">
        {dialog === 'add' ? <><p className="text-sm leading-6 opacity-70">Nhập email của tài khoản CrabShare đang hoạt động và chưa thuộc hộ nuôi nào. Tài khoản sẽ được thêm với vai trò Nhân viên.</p><div className="op-field"><label htmlFor="staff-email">Email tài khoản</label><input autoFocus id="staff-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="nhanvien@example.com" className="op-input" disabled={mutation.isPending} /></div></> :
          <><div className="rounded-lg border border-[#e8dfd4] bg-[#f4efe8] p-4"><p className="break-words font-bold">{dialog.fullName}</p><p className="mt-1 break-all text-sm opacity-70">{dialog.email}</p></div><p className="text-sm leading-6">Xác nhận xóa nhân viên này khỏi hộ nuôi? Tài khoản sẽ mất quyền truy cập dữ liệu hộ nuôi ngay sau khi xóa.</p></>}
        {(localError || mutation.isError) && <div role="alert"><OpNote tone="danger">{localError || errorMessage(mutation.error)}</OpNote></div>}
        {!canManage && <div role="alert"><OpNote tone="danger">Bạn không còn quyền quản lý nhân viên. Hãy đóng hộp thoại và kiểm tra lại tài khoản.</OpNote></div>}
        <div className="flex flex-wrap justify-end gap-3"><OpBtn type="button" variant="outline" disabled={mutation.isPending} onClick={() => setDialog(null)}>Hủy</OpBtn><OpBtn type="submit" variant={dialog === 'add' ? 'primary' : 'danger'} disabled={mutation.isPending || !canManage}>{mutation.isPending ? 'Đang xử lý…' : dialog === 'add' ? 'Thêm nhân viên' : 'Xác nhận xóa'}</OpBtn></div>
      </form>
    </ActionDialog>}
  </OperatorLayout>
}
