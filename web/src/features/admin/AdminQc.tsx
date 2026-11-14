/* /admin/qc — Pool Nhân viên kiểm phẩm (BR-017): danh sách kèm thống kê uy tín, thêm và gỡ khỏi pool.
   GET /api/admin/qc-inspectors; POST /api/admin/qc-inspectors { userId }; DELETE /api/admin/qc-inspectors/{userId}.
   Chọn tài khoản để thêm bằng GET /api/admin/users (tìm theo tên, email). Người thuộc hộ nuôi không thêm được. */
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { GrantQcRequest, PagedResultOfAdminUserResponse, QcInspectorResponse } from '../../shared/api/api.gen'
import {
  Field, Input, OpBtn, OpConfirm, OpFacts, OpHeading, OpNote, OpPanel, OpTable, QueryView, RadioCards, formatDate, useGet, useSend,
} from '../../shared/ui/console'

export default function AdminQc() {
  const pool = useGet<QcInspectorResponse[]>('/api/admin/qc-inspectors')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<QcInspectorResponse | null>(null)
  const remove = useSend<void, void>('delete', () => `/api/admin/qc-inspectors/${removing?.userId}`, {
    success: 'Đã gỡ khỏi pool kiểm phẩm.', quietError: true, onSuccess: () => setRemoving(null),
  })

  return (
    <>
      <OpHeading
        eyebrow="Đối tác và tài khoản"
        title="Nhân viên kiểm phẩm"
        description="Hệ thống phân việc ngẫu nhiên cho người trong pool."
        action={<OpBtn onClick={() => setAdding(true)}><Plus size={17} /> Thêm vào pool</OpBtn>}
      />

      <QueryView query={pool}>
        {(rows) => (
          <>
            {rows.length < 2 && <OpNote tone="danger">Pool cần ít nhất hai người để có người xác nhận lần hai.</OpNote>}
            <OpPanel>
              <OpFacts items={[
                { label: 'Người trong pool', value: rows.length, tone: rows.length < 2 ? 'warn' : 'ok' },
                { label: 'Cua đã duyệt hạng', value: rows.reduce((n, r) => n + r.approvedCount, 0) },
                { label: 'Khiếu nại được chấp nhận', value: rows.reduce((n, r) => n + r.acceptedClaimCount, 0), tone: rows.some((r) => r.acceptedClaimCount > 0) ? 'danger' : undefined },
              ]} />
              <OpTable
                rows={rows}
                rowKey={(r) => r.userId}
                empty="Pool chưa có ai"
                columns={[
                  { key: 'name', header: 'Nhân viên kiểm phẩm', cell: (r) => <><a className="op-link" href={`/admin/users/${r.userId}`}><b>{r.fullName}</b></a><br /><small className="rd-muted">{r.email} · từ {formatDate(r.grantedAt)}</small></> },
                  { key: 'approved', header: 'Cua đã duyệt hạng', num: true, cell: (r) => r.approvedCount },
                  { key: 'claims', header: 'Khiếu nại được chấp nhận', num: true, cell: (r) => <span className={r.acceptedClaimCount > 0 ? 'op-danger' : ''}>{r.acceptedClaimCount}</span> },
                  { key: 'act', header: '', cell: (r) => <OpBtn sm variant="danger" onClick={() => { remove.reset(); setRemoving(r) }}><Trash2 size={15} /> Gỡ</OpBtn> },
                ]}
              />
            </OpPanel>
          </>
        )}
      </QueryView>

      {adding && <AddInspectorDialog current={pool.data ?? []} onClose={() => setAdding(false)} />}

      {removing && (
        <OpConfirm
          title="Gỡ khỏi pool kiểm phẩm"
          sub={`${removing.fullName} · không được phân việc mới nữa`}
          confirmLabel="Gỡ khỏi pool"
          variant="danger"
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate()}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  )
}

function AddInspectorDialog({ current, onClose }: { current: QcInspectorResponse[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const term = q.trim()
  const found = useGet<PagedResultOfAdminUserResponse>(term.length >= 2 ? '/api/admin/users' : null, { q: term, status: 'Active', pageSize: 20 })
  const grant = useSend<void, GrantQcRequest>('post', '/api/admin/qc-inspectors', { success: 'Đã thêm vào pool kiểm phẩm.', quietError: true, onSuccess: onClose })
  const inPool = new Set(current.map((c) => c.userId))

  return (
    <OpConfirm
      title="Thêm Nhân viên kiểm phẩm"
      confirmLabel="Thêm vào pool"
      pending={grant.isPending}
      error={grant.error}
      disabled={userId === null}
      onConfirm={() => grant.mutate({ userId: Number(userId) })}
      onClose={onClose}
    >
      <Field label="Tìm tài khoản" hint="Họ tên hoặc email">
        <Input type="search" value={q} onChange={(e) => { setQ(e.target.value); setUserId(null) }} autoFocus />
      </Field>
      {term.length >= 2 && (
        <QueryView query={found}>
          {(page) => (page.items.length === 0
            ? <OpNote tone="info">Không tìm thấy tài khoản đang hoạt động nào khớp.</OpNote>
            : (
              <RadioCards<string>
                value={userId}
                onChange={setUserId}
                options={page.items.map((u) => {
                  const blocked = inPool.has(u.userId) ? 'Đã ở trong pool' : u.roles.includes('OperatorMember') ? 'Thuộc hộ nuôi, không thêm được' : null
                  return { value: String(u.userId), label: u.fullName, hint: blocked ?? u.email, disabled: blocked !== null }
                })}
              />
            ))}
        </QueryView>
      )}
    </OpConfirm>
  )
}
