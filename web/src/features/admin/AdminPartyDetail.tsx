/* /admin/parties/:partyId — Hồ sơ một đối tác: thông tin, vai trò kèm trạng thái, địa điểm.
   GET /api/admin/parties/{partyId}; POST …/verify; POST …/reject (lý do bắt buộc); POST …/roles (thêm vai trò hoặc đổi trạng thái).
   Xác minh thì vai trò nhà cung cấp, bên cam kết thu mua đang chờ có hiệu lực; từ chối thì các vai trò đang chờ đó bị thu hồi.
   Vai trò chỉ chuyển sang hoạt động được khi đối tác đã xác minh (backend trả lỗi nghiệp vụ nếu chưa). */
import { useState } from 'react'
import { useParams } from 'react-router'
import { ArrowLeft, BadgeCheck, Plus, XCircle } from 'lucide-react'
import type { PartnerRoleResponse, PartyDecisionRequest, PartyResponse, RoleChangeRequest } from '../../shared/api/api.gen'
import {
  Field, OpBack, OpBtn, OpConfirm, OpHeading, OpKv, OpNote, OpPanel, OpTable, QueryView, Select, StatusBadge, formatDate, label, options, useGet, useSend,
} from '../../shared/ui/console'
import { ReasonField } from './adminPartA'

type Dialog =
  | { kind: 'verify' }
  | { kind: 'reject' }
  | { kind: 'role'; roleType: string; status: string; fixedRole: boolean }

const ROLE_ACTION: Record<string, string> = { Active: 'Cho hoạt động', Suspended: 'Tạm dừng', Revoked: 'Thu hồi', Pending: 'Đưa về chờ duyệt' }

export default function AdminPartyDetail() {
  const { partyId = '' } = useParams()
  const base = `/api/admin/parties/${encodeURIComponent(partyId)}`
  const party = useGet<PartyResponse>(base)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [reason, setReason] = useState('')
  const close = () => { setDialog(null); setReason('') }

  const verify = useSend<PartyResponse, void>('post', `${base}/verify`, { success: 'Đã xác minh đối tác.', quietError: true, onSuccess: close })
  const reject = useSend<PartyResponse, PartyDecisionRequest>('post', `${base}/reject`, { success: 'Đã từ chối hồ sơ đối tác.', quietError: true, onSuccess: close })
  const changeRole = useSend<PartyResponse, RoleChangeRequest>('post', `${base}/roles`, { success: 'Đã cập nhật vai trò.', quietError: true, onSuccess: close })

  const open = (next: Dialog) => { verify.reset(); reject.reset(); changeRole.reset(); setReason(''); setDialog(next) }

  return (
    <QueryView query={party}>
      {(p) => {
        const verified = p.verificationStatus === 'Verified'
        const profile = [
          { label: 'Mã số thuế hoặc số đăng ký', value: p.registrationNo },
          { label: 'Người đại diện', value: p.representative },
          { label: 'Số điện thoại', value: p.phone },
        ].filter((i) => i.value)
        const removing = dialog?.kind === 'role' && (dialog.status === 'Suspended' || dialog.status === 'Revoked')

        return (
          <>
            <OpHeading
              crumb={<OpBack href="/admin/parties"><ArrowLeft size={16} /> Đối tác</OpBack>}
              eyebrow={`${p.partyCode} · ${label('partyType', p.partyType)}`}
              title={p.legalName}
              action={
                <>
                  <StatusBadge kind="verification" value={p.verificationStatus} />
                  {!p.isPlatform && !verified && <OpBtn sm onClick={() => open({ kind: 'verify' })}><BadgeCheck size={16} /> Xác minh</OpBtn>}
                  {!p.isPlatform && p.verificationStatus !== 'Rejected' && <OpBtn sm variant="danger" onClick={() => open({ kind: 'reject' })}><XCircle size={16} /> Từ chối</OpBtn>}
                </>
              }
            />
            {p.verificationStatus === 'Rejected' && p.rejectReason && <OpNote tone="danger">Lý do từ chối: {p.rejectReason}</OpNote>}

            <OpPanel
              title="Vai trò"
              action={(
                <OpBtn sm variant="ghost" onClick={() => open({ kind: 'role', roleType: 'Supplier', status: verified ? 'Active' : 'Pending', fixedRole: false })}>
                  <Plus size={15} /> Thêm vai trò
                </OpBtn>
              )}
            >
              <OpTable<PartnerRoleResponse>
                rows={p.roles}
                rowKey={(r, i) => `${r.roleType}-${r.validFrom}-${i}`}
                empty="Đối tác chưa có vai trò nào"
                columns={[
                  { key: 'role', header: 'Vai trò', cell: (r) => <StatusBadge kind="roleType" value={r.roleType} /> },
                  { key: 'status', header: 'Trạng thái', cell: (r) => <><StatusBadge kind="partyRole" value={r.status} />{r.note ? <><br /><small className="rd-muted">{r.note}</small></> : null}</> },
                  { key: 'from', header: 'Hiệu lực', cell: (r) => `${formatDate(r.validFrom)}${r.validTo ? ` – ${formatDate(r.validTo)}` : ''}` },
                  {
                    key: 'act', header: '', cell: (r) => r.validTo === null && (
                      <span className="op-inline">
                        {r.status !== 'Active' && <OpBtn sm variant="ghost" onClick={() => open({ kind: 'role', roleType: r.roleType, status: 'Active', fixedRole: true })}>Cho hoạt động</OpBtn>}
                        {r.status === 'Active' && <OpBtn sm variant="ghost" onClick={() => open({ kind: 'role', roleType: r.roleType, status: 'Suspended', fixedRole: true })}>Tạm dừng</OpBtn>}
                        {r.status !== 'Revoked' && <OpBtn sm variant="danger" onClick={() => open({ kind: 'role', roleType: r.roleType, status: 'Revoked', fixedRole: true })}>Thu hồi</OpBtn>}
                      </span>
                    ),
                  },
                ]}
              />
            </OpPanel>

            {profile.length > 0 && <OpPanel title="Hồ sơ"><OpKv items={profile} /></OpPanel>}

            {p.sites.length > 0 && (
              <OpPanel title="Địa điểm">
                <OpTable
                  rows={p.sites}
                  rowKey={(s) => s.siteId}
                  columns={[
                    { key: 'type', header: 'Loại', cell: (s) => <StatusBadge kind="siteType" value={s.siteType} /> },
                    {
                      key: 'name', header: 'Tên và địa chỉ',
                      cell: (s) => (
                        <>
                          <b>{s.name}</b>{s.isDefault ? ' · mặc định' : ''}
                          <br />
                          <small className="rd-muted">{[s.addressLine, s.province, s.contactName, s.contactPhone].filter(Boolean).join(' · ')}</small>
                        </>
                      ),
                    },
                    { key: 'geo', header: 'Vĩ độ, kinh độ', cell: (s) => (s.latitude !== null && s.longitude !== null ? <span className="op-mono">{s.latitude}, {s.longitude}</span> : <span className="op-warn">Chưa có</span>) },
                  ]}
                />
              </OpPanel>
            )}

            {dialog?.kind === 'verify' && (
              <OpConfirm
                title="Xác minh đối tác"
                sub={`${p.legalName} · đã đối chiếu giấy tờ`}
                confirmLabel="Xác minh"
                pending={verify.isPending}
                error={verify.error}
                onConfirm={() => verify.mutate()}
                onClose={close}
              />
            )}

            {dialog?.kind === 'reject' && (
              <OpConfirm
                title="Từ chối hồ sơ đối tác"
                sub={p.legalName}
                confirmLabel="Từ chối"
                variant="danger"
                pending={reject.isPending}
                error={reject.error}
                disabled={!reason.trim()}
                onConfirm={() => reject.mutate({ reason: reason.trim() })}
                onClose={close}
              >
                <ReasonField value={reason} onChange={setReason} label="Lý do từ chối" />
              </OpConfirm>
            )}

            {dialog?.kind === 'role' && (
              <OpConfirm
                title={dialog.fixedRole ? `${ROLE_ACTION[dialog.status] ?? 'Đổi trạng thái'}: ${label('roleType', dialog.roleType)}` : 'Thêm vai trò'}
                sub={p.legalName}
                confirmLabel={dialog.fixedRole ? ROLE_ACTION[dialog.status] ?? 'Lưu' : 'Thêm vai trò'}
                variant={removing ? 'danger' : 'primary'}
                pending={changeRole.isPending}
                error={changeRole.error}
                disabled={removing && !reason.trim()}
                onConfirm={() => changeRole.mutate({ roleType: dialog.roleType, status: dialog.status, note: reason.trim() || null })}
                onClose={close}
              >
                {!dialog.fixedRole && (
                  <div className="op-form__row">
                    <Field label="Vai trò">
                      <Select value={dialog.roleType} onChange={(e) => setDialog({ ...dialog, roleType: e.target.value })}>
                        {options('roleType').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                    </Field>
                    <Field label="Trạng thái">
                      <Select value={dialog.status} onChange={(e) => setDialog({ ...dialog, status: e.target.value })}>
                        {verified && <option value="Active">{label('partyRole', 'Active')}</option>}
                        <option value="Pending">{label('partyRole', 'Pending')}</option>
                      </Select>
                    </Field>
                  </div>
                )}
                <ReasonField value={reason} onChange={setReason} label={removing ? 'Lý do' : 'Ghi chú'} required={removing} />
              </OpConfirm>
            )}
          </>
        )
      }}
    </QueryView>
  )
}
