/* Tab "Người dùng" của /admin/users: lọc theo vai trò, trạng thái, tìm theo tên, email, điện thoại. GET /api/admin/users. */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Search } from 'lucide-react'
import type { PagedResultOfAdminUserResponse } from '../../shared/api/api.gen'
import { Input, OpBtn, OpPanel, OpTable, QueryView, Select, StatusBadge, options, useGet } from '../../shared/ui/console'
import { Pager, USER_ROLE_FILTERS, UserRoleBadge, useUrlFilters } from './adminPartA'

export default function AdminUserList() {
  const navigate = useNavigate()
  const filters = useUrlFilters()
  const role = filters.get('role')
  const status = filters.get('status')
  const q = filters.get('q')
  const [draft, setDraft] = useState(q)
  const list = useGet<PagedResultOfAdminUserResponse>('/api/admin/users', { role, status, q, page: filters.page, pageSize: 20 })

  return (
    <>
      <div className="op-toolbar">
        <Input
          className="op-toolbar__grow"
          type="search"
          aria-label="Tìm người dùng"
          placeholder="Họ tên, email hoặc số điện thoại"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') filters.set({ q: draft.trim() }) }}
        />
        <Select aria-label="Vai trò" value={role} onChange={(e) => filters.set({ role: e.target.value })}>
          <option value="">Mọi vai trò</option>
          {USER_ROLE_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select aria-label="Trạng thái tài khoản" value={status} onChange={(e) => filters.set({ status: e.target.value })}>
          <option value="">Mọi trạng thái</option>
          {options('user').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <OpBtn variant="ghost" sm onClick={() => filters.set({ q: draft.trim() })}><Search size={15} /> Tìm</OpBtn>
      </div>

      <OpPanel>
        <QueryView query={list}>
          {(page) => (
            <>
              <OpTable
                rows={page.items}
                rowKey={(u) => u.userId}
                empty="Không có người dùng nào khớp"
                onRowClick={(u) => navigate(`/admin/users/${u.userId}`)}
                columns={[
                  { key: 'name', header: 'Người dùng', cell: (u) => <><b>{u.fullName}</b><br /><small className="rd-muted">{[u.email, u.phone].filter(Boolean).join(' · ')}</small></> },
                  { key: 'roles', header: 'Vai trò', cell: (u) => <span className="op-inline">{u.roles.map((r) => <UserRoleBadge key={r} code={r} />)}</span> },
                  { key: 'status', header: 'Tài khoản', cell: (u) => <StatusBadge kind="user" value={u.status} /> },
                  { key: 'kyc', header: 'Xác minh', cell: (u) => (u.verificationStatus ? <StatusBadge kind="verification" value={u.verificationStatus} /> : '—') },
                ]}
              />
              <Pager page={page.page} pageSize={page.pageSize} total={page.total} onPage={(n) => filters.set({ page: n })} />
            </>
          )}
        </QueryView>
      </OpPanel>
    </>
  )
}
