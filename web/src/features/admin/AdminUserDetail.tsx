/* /admin/users/:id — Chi tiết một tài khoản: vai trò, trạng thái, lịch sử kiểm tra danh tính, khoá và mở khoá kèm lý do.
   GET /api/admin/users/{id}; POST /api/admin/users/{id}/lock | unlock (AdminAccountDecisionRequest).
   Mở khoá trả tài khoản về trạng thái trước khi khoá; Quản trị không tự khoá tài khoản của mình (backend chặn). */
import { useState } from 'react'
import { useParams } from 'react-router'
import { ArrowLeft, Lock, LockOpen } from 'lucide-react'
import type { AdminAccountDecisionRequest, AdminUserDetailResponse, AdminUserResponse } from '../../shared/api/api.gen'
import {
  OpBack, OpBtn, OpConfirm, OpHeading, OpKv, OpMore, OpPanel, QueryView, StatusBadge, formatDateTime, useGet, useSend,
} from '../../shared/ui/console'
import { ReasonField, UserRoleBadge } from './adminPartA'
import AdminKycTable from './AdminKycTable'

export default function AdminUserDetail() {
  const { id = '' } = useParams()
  const base = `/api/admin/users/${encodeURIComponent(id)}`
  const detail = useGet<AdminUserDetailResponse>(base)
  const [action, setAction] = useState<'lock' | 'unlock' | null>(null)
  const [reason, setReason] = useState('')
  const close = () => setAction(null)

  const decide = useSend<AdminUserResponse, AdminAccountDecisionRequest>(
    'post',
    () => `${base}/${action}`,
    { success: () => (action === 'lock' ? 'Đã khoá tài khoản.' : 'Đã mở khoá tài khoản.'), quietError: true, onSuccess: close },
  )
  const open = (next: 'lock' | 'unlock') => { decide.reset(); setReason(''); setAction(next) }

  return (
    <QueryView query={detail}>
      {({ user, verifiedAt, kycChecks }) => {
        const locked = user.status === 'Locked'
        return (
          <>
            <OpHeading
              crumb={<OpBack href="/admin/users"><ArrowLeft size={16} /> Người dùng và eKYC</OpBack>}
              eyebrow={user.email}
              title={user.fullName}
              action={
                <>
                  <StatusBadge kind="user" value={user.status} />
                  {locked
                    ? <OpBtn sm onClick={() => open('unlock')}><LockOpen size={16} /> Mở khoá</OpBtn>
                    : <OpBtn sm variant="danger" onClick={() => open('lock')}><Lock size={16} /> Khoá tài khoản</OpBtn>}
                </>
              }
            />

            <OpPanel title="Tài khoản">
              <OpKv items={[
                { label: 'Vai trò', value: user.roles.length ? <span className="op-inline">{user.roles.map((r) => <UserRoleBadge key={r} code={r} />)}</span> : null },
                { label: 'Số điện thoại', value: user.phone },
                ...(user.verificationStatus ? [{ label: 'Xác minh nhà đầu tư', value: <StatusBadge kind="verification" value={user.verificationStatus} /> }] : []),
              ]} />
              <OpMore label="Chi tiết">
                <OpKv items={[
                  { label: 'Mã tài khoản', value: `#${user.userId}` },
                  { label: 'Tạo lúc', value: formatDateTime(user.createdAt) },
                  { label: 'Đăng nhập gần nhất', value: formatDateTime(user.lastLoginAt) || 'Chưa đăng nhập' },
                  { label: 'Xác minh lúc', value: formatDateTime(verifiedAt) },
                ]} />
                <a className="op-link" href="/admin/audit-log?entityType=AppUser">Nhật ký kiểm toán của tài khoản</a>
              </OpMore>
            </OpPanel>

            {kycChecks.length > 0 && (
              <OpPanel title="Lịch sử kiểm tra danh tính">
                <AdminKycTable rows={kycChecks} showUser={false} empty="Chưa có lần kiểm tra danh tính nào" />
              </OpPanel>
            )}

            {action && (
              <OpConfirm
                title={action === 'lock' ? 'Khoá tài khoản' : 'Mở khoá tài khoản'}
                sub={action === 'lock' ? `${user.fullName} · sẽ không đăng nhập được` : user.fullName}
                confirmLabel={action === 'lock' ? 'Khoá' : 'Mở khoá'}
                variant={action === 'lock' ? 'danger' : 'primary'}
                pending={decide.isPending}
                error={decide.error}
                disabled={!reason.trim()}
                onConfirm={() => decide.mutate({ reason: reason.trim() })}
                onClose={close}
              >
                <ReasonField value={reason} onChange={setReason} />
              </OpConfirm>
            )}
          </>
        )
      }}
    </QueryView>
  )
}
