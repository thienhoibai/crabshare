/* /operator/members — Thành viên của hộ nuôi (GET /api/operators/me/members).
   Theo BR-007 mỗi hộ nuôi một tài khoản do người đại diện đứng tên; API chỉ còn cho xem danh sách có từ trước. */
import { ShieldCheck, UserRound } from 'lucide-react'
import type { OperatorMemberResponse } from '../../shared/api/api.gen'
import { useAuthStore } from '../../shared/auth/authStore'
import { OpBadge, OpHeading, OpIcon, OpPanel, OpTable, QueryView, formatDate, useGet } from '../../shared/ui/console'
import { memberRoleLabel } from './opA'

export default function OperatorMembers() {
  const members = useGet<OperatorMemberResponse[]>('/api/operators/me/members')
  const userId = useAuthStore((s) => s.user?.userId)

  return (
    <>
      <OpHeading eyebrow="Hồ sơ" title="Nhân viên" />
      <OpPanel title="Thành viên hộ nuôi" subtitle="Danh sách chỉ để xem. Mỗi hộ nuôi dùng một tài khoản do chủ hộ đứng tên.">
        <QueryView query={members} empty="Chưa có thành viên nào">
          {(rows) => (
            <OpTable
              rows={rows}
              rowKey={(m) => m.userId}
              columns={[
                {
                  key: 'name', header: 'Thành viên', cell: (m) => (
                    <span className="op-inline">
                      <OpIcon tone={m.memberRole === 'Owner' ? 'gold' : 'mute'} round>{m.memberRole === 'Owner' ? <ShieldCheck size={18} /> : <UserRound size={18} />}</OpIcon>
                      <span><b>{m.fullName}</b>{m.userId === userId && <span className="rd-muted"> (bạn)</span>}<br /><small className="rd-muted">{m.email}</small></span>
                    </span>
                  ),
                },
                { key: 'role', header: 'Vai trò', cell: (m) => <OpBadge tone={m.memberRole === 'Owner' ? 'gold' : 'mute'}>{memberRoleLabel(m.memberRole)}</OpBadge> },
                { key: 'joined', header: 'Tham gia', cell: (m) => formatDate(m.joinedAt) },
              ]}
            />
          )}
        </QueryView>
      </OpPanel>
    </>
  )
}
