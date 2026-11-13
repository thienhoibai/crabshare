/* /khach/ho-so — Hồ sơ đối tác của tôi (GET, PUT /api/me/party): tên pháp lý, loại đối tác, số đăng ký, người đại diện,
   vai trò và trạng thái xác minh. Đổi tên pháp lý, loại đối tác hoặc số đăng ký của hồ sơ đã xác minh thì phải xác minh lại (BR-013);
   cảnh báo này chỉ hiện trong hộp sửa hồ sơ khi người dùng thật sự đổi các ô đó. */
import { useState } from 'react'
import { MapPin, Pencil } from 'lucide-react'
import type { PartyResponse, UpdatePartyRequest } from '../../shared/api/api.gen'
import { useAuthStore } from '../../shared/auth/authStore'
import {
  Field, Input, OpAside, OpBadge, OpBtn, OpConfirm, OpHeading, OpKv, OpMore, OpNote, OpPanel, OpTable, QueryView, Select, StatusBadge, formatDate, label, options,
  tone, useGet, useSend,
} from '../../shared/ui/console'

function EditForm({ party, onClose }: { party: PartyResponse; onClose: () => void }) {
  const [legalName, setLegalName] = useState(party.legalName)
  const [partyType, setPartyType] = useState(party.partyType)
  const [registrationNo, setRegistrationNo] = useState(party.registrationNo ?? '')
  const [representative, setRepresentative] = useState(party.representative ?? '')
  const [phone, setPhone] = useState(party.phone ?? '')
  const save = useSend<PartyResponse, UpdatePartyRequest>('put', '/api/me/party', { success: 'Đã lưu hồ sơ.', quietError: true, onSuccess: onClose })

  const organisation = partyType !== 'Individual'
  const legalChanged = legalName.trim() !== party.legalName || partyType !== party.partyType || (registrationNo.trim() || null) !== party.registrationNo
  const invalid = !legalName.trim() || (organisation && !representative.trim())

  return (
    <OpConfirm wide title="Sửa hồ sơ" confirmLabel="Lưu hồ sơ" pending={save.isPending} error={save.error} disabled={invalid} onClose={onClose}
      onConfirm={() => save.mutate({
        legalName: legalName.trim(), partyType, registrationNo: registrationNo.trim() || null, representative: representative.trim() || null, phone: phone.trim() || null,
      })}>
      <div className="op-form__row">
        <Field label="Tên pháp lý" required>
          <Input value={legalName} maxLength={200} onChange={(e) => setLegalName(e.target.value)} />
        </Field>
        <Field label="Số điện thoại">
          <Input type="tel" inputMode="tel" value={phone} maxLength={15} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      <div className="op-form__row">
        <Field label="Loại đối tác">
          <Select value={partyType} onChange={(e) => setPartyType(e.target.value)}>
            {options('partyType').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        {organisation && (
          <Field label="Người đại diện" required>
            <Input value={representative} maxLength={150} onChange={(e) => setRepresentative(e.target.value)} />
          </Field>
        )}
        <Field label="Mã số thuế, số đăng ký">
          <Input value={registrationNo} maxLength={30} onChange={(e) => setRegistrationNo(e.target.value)} />
        </Field>
      </div>
      {legalChanged && party.verificationStatus === 'Verified' && <OpNote tone="danger">Đổi thông tin pháp lý thì hồ sơ phải chờ xác minh lại.</OpNote>}
    </OpConfirm>
  )
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const party = useGet<PartyResponse>('/api/me/party')
  const [editing, setEditing] = useState(false)

  return (
    <>
      <OpHeading eyebrow="Tài khoản" title="Hồ sơ"
        action={party.data ? <OpBtn onClick={() => setEditing(true)}><Pencil size={17} /> Sửa hồ sơ</OpBtn> : undefined} />
      <QueryView query={party}>
        {(p) => (
          <div className="op-split">
            <div>
              <OpPanel title={p.legalName} action={<StatusBadge kind="verification" value={p.verificationStatus} />}>
                {p.verificationStatus === 'Rejected' && p.rejectReason && <OpNote tone="danger">Bị từ chối xác minh: {p.rejectReason}</OpNote>}
                <OpKv items={[
                  { label: 'Loại đối tác', value: label('partyType', p.partyType) },
                  { label: 'Số điện thoại', value: p.phone },
                  ...(p.partyType !== 'Individual' ? [{ label: 'Người đại diện', value: p.representative }] : []),
                  ...(p.registrationNo ? [{ label: 'Mã số thuế, số đăng ký', value: p.registrationNo }] : []),
                ]} />
                <div className="op-inline">
                  {p.roles.map((r) => <OpBadge key={r.roleType} tone={tone('partyRole', r.status)}>{label('roleType', r.roleType)} · {label('partyRole', r.status)}</OpBadge>)}
                </div>
                <OpMore label="Chi tiết">
                  <OpKv items={[{ label: 'Mã đối tác', value: <span className="op-mono">{p.partyCode}</span> }]} />
                  <OpTable
                    rows={p.roles}
                    rowKey={(r) => r.roleType}
                    empty="Hồ sơ chưa có vai trò nào"
                    columns={[
                      { key: 'role', header: 'Vai trò', cell: (r) => label('roleType', r.roleType) },
                      { key: 'from', header: 'Hiệu lực', cell: (r) => `${formatDate(r.validFrom)}${r.validTo ? ` – ${formatDate(r.validTo)}` : ''}` },
                      { key: 'note', header: 'Ghi chú', cell: (r) => r.note ?? '—' },
                    ]}
                  />
                </OpMore>
              </OpPanel>
            </div>

            <OpAside>
              <OpKv items={[
                { label: 'Họ tên', value: user?.fullName },
                { label: 'Email đăng nhập', value: user?.email },
              ]} />
              <a className="op-tile" href="/khach/dia-diem">
                <MapPin size={20} />
                <span><b>{p.sites.filter((s) => s.siteType === 'DeliveryAddress' && s.status === 'Active').length} địa điểm nhận hàng</b></span>
              </a>
              {user?.roles.includes('Investor') && <a className="op-link" href="/nha-dau-tu/ho-so">Xác minh danh tính ở cổng nhà đầu tư</a>}
            </OpAside>
          </div>
        )}
      </QueryView>
      {editing && party.data && <EditForm party={party.data} onClose={() => setEditing(false)} />}
    </>
  )
}
