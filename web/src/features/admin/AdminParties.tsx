/* /admin/parties — Danh sách đối tác (BR-001): lọc theo vai trò, trạng thái xác minh, tìm theo tên, mã đối tác hoặc số đăng ký.
   GET /api/admin/parties. Nút "Ghi nhận đối tác" mở form ghi nhà cung cấp hoặc bên cam kết thu mua (POST /api/admin/parties). */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Plus, Search } from 'lucide-react'
import type { PagedResultOfPartySummaryResponse } from '../../shared/api/api.gen'
import { Input, OpBtn, OpHeading, OpPanel, OpTable, QueryView, Select, StatusBadge, label, options, useGet } from '../../shared/ui/console'
import { Pager, useUrlFilters } from './adminPartA'
import AdminPartyRecordDialog from './AdminPartyRecordDialog'

/** GET /api/admin/parties chỉ nhận bốn trạng thái xác minh này ở bộ lọc. */
const VERIFICATION_FILTERS = ['Unverified', 'Pending', 'Verified', 'Rejected']

export default function AdminParties() {
  const navigate = useNavigate()
  const filters = useUrlFilters()
  const search = filters.get('search')
  const roleType = filters.get('roleType')
  const verificationStatus = filters.get('verificationStatus')
  const [draft, setDraft] = useState(search)
  const [recording, setRecording] = useState(false)
  const list = useGet<PagedResultOfPartySummaryResponse>('/api/admin/parties', { search, roleType, verificationStatus, page: filters.page, pageSize: 20 })

  return (
    <>
      <OpHeading
        eyebrow="Đối tác và tài khoản"
        title="Đối tác"
        action={<OpBtn onClick={() => setRecording(true)}><Plus size={17} /> Ghi nhận đối tác</OpBtn>}
      />
      <div className="op-toolbar">
        <Input
          className="op-toolbar__grow"
          type="search"
          aria-label="Tìm đối tác"
          placeholder="Tên pháp lý, mã đối tác hoặc số đăng ký"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') filters.set({ search: draft.trim() }) }}
        />
        <Select aria-label="Vai trò" value={roleType} onChange={(e) => filters.set({ roleType: e.target.value })}>
          <option value="">Mọi vai trò</option>
          {options('roleType').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select aria-label="Trạng thái xác minh" value={verificationStatus} onChange={(e) => filters.set({ verificationStatus: e.target.value })}>
          <option value="">Mọi trạng thái xác minh</option>
          {VERIFICATION_FILTERS.map((v) => <option key={v} value={v}>{label('verification', v)}</option>)}
        </Select>
        <OpBtn variant="ghost" sm onClick={() => filters.set({ search: draft.trim() })}><Search size={15} /> Tìm</OpBtn>
      </div>

      <OpPanel>
        <QueryView query={list}>
          {(page) => (
            <>
              <OpTable
                rows={page.items}
                rowKey={(p) => p.partyId}
                empty="Không có đối tác nào khớp bộ lọc"
                onRowClick={(p) => navigate(`/admin/parties/${p.partyId}`)}
                columns={[
                  { key: 'code', header: 'Mã đối tác', cell: (p) => <span className="op-mono">{p.partyCode}</span> },
                  { key: 'name', header: 'Tên pháp lý', cell: (p) => <><b>{p.legalName}</b><br /><small className="rd-muted">{label('partyType', p.partyType)}</small></> },
                  { key: 'verify', header: 'Xác minh', cell: (p) => <StatusBadge kind="verification" value={p.verificationStatus} /> },
                  {
                    key: 'roles', header: 'Vai trò đang hoạt động',
                    cell: (p) => p.activeRoles.length
                      ? <span className="op-inline">{p.activeRoles.map((r) => <StatusBadge key={r} kind="roleType" value={r} />)}</span>
                      : <span className="rd-muted">Chưa có</span>,
                  },
                ]}
              />
              <Pager page={page.page} pageSize={page.pageSize} total={page.total} onPage={(n) => filters.set({ page: n })} />
            </>
          )}
        </QueryView>
      </OpPanel>

      {recording && <AdminPartyRecordDialog onClose={() => setRecording(false)} />}
    </>
  )
}
