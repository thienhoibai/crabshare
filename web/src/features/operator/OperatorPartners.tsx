/* /operator/partners — Nhà cung cấp cua và bên cam kết thu mua (BR-016).
   GET /api/parties/directory?roleType=&search= chỉ trả đối tác đã xác minh; POST /api/parties/external ghi nhận đối tác mới, chờ Admin xác minh. */
import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { ExternalPartyRequest, PartyResponse, PartySummaryResponse } from '../../shared/api/api.gen'
import {
  Field, Input, OpBtn, OpConfirm, OpEmpty, OpHeading, OpMore, OpPanel, OpTable, OpTabs, QueryView, RadioCards, Select, StatusBadge, label, options, useGet,
  useSend,
} from '../../shared/ui/console'

type RoleType = 'Supplier' | 'OfftakeBuyer'
const ROLE_TABS: { key: RoleType; label: string }[] = [{ key: 'Supplier', label: 'Nhà cung cấp cua' }, { key: 'OfftakeBuyer', label: 'Bên cam kết thu mua' }]

function RecordDialog({ roleType, onClose, onDone }: { roleType: RoleType; onClose: () => void; onDone: (party: PartyResponse) => void }) {
  const [role, setRole] = useState<RoleType>(roleType)
  const [legalName, setLegalName] = useState('')
  const [partyType, setPartyType] = useState('Household')
  const [registrationNo, setRegistrationNo] = useState('')
  const [representative, setRepresentative] = useState('')
  const [phone, setPhone] = useState('')
  const record = useSend<PartyResponse, ExternalPartyRequest>('post', '/api/parties/external', {
    success: 'Đã ghi nhận. Admin sẽ xác minh đối tác.', onSuccess: (party) => { onDone(party); onClose() }, quietError: true,
  })
  return (
    <OpConfirm
      title="Thêm đối tác"
      confirmLabel="Thêm"
      pending={record.isPending}
      error={record.error}
      disabled={!legalName.trim() || phone.trim().length < 8}
      onClose={onClose}
      onConfirm={() => record.mutate({
        legalName: legalName.trim(), partyType, registrationNo: registrationNo.trim() || null, representative: representative.trim() || null,
        phone: phone.trim(), roleType: role,
      })}
    >
      <RadioCards<RoleType> value={role} onChange={setRole} options={ROLE_TABS.map((t) => ({ value: t.key, label: t.label }))} />
      <Field label="Tên pháp lý" required>
        <Input value={legalName} maxLength={200} onChange={(e) => setLegalName(e.target.value)} placeholder="Vựa cua Rạch Gốc" />
      </Field>
      <Field label="Điện thoại" required>
        <Input type="tel" inputMode="tel" value={phone} maxLength={15} onChange={(e) => setPhone(e.target.value)} placeholder="09…" />
      </Field>
      <OpMore label="Tuỳ chọn thêm">
        <div className="op-form__row">
          <Field label="Loại đối tác">
            <Select value={partyType} onChange={(e) => setPartyType(e.target.value)}>
              {options('partyType').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Số đăng ký">
            <Input value={registrationNo} maxLength={30} onChange={(e) => setRegistrationNo(e.target.value)} />
          </Field>
        </div>
        <Field label="Người đại diện">
          <Input value={representative} maxLength={150} onChange={(e) => setRepresentative(e.target.value)} />
        </Field>
      </OpMore>
    </OpConfirm>
  )
}

export default function OperatorPartners() {
  const [roleType, setRoleType] = useState<RoleType>('Supplier')
  const [search, setSearch] = useState('')
  const [recording, setRecording] = useState(false)
  // API chưa có danh sách đối tác đang chờ xác minh, nên chỉ giữ các đối tác vừa ghi nhận trong phiên làm việc này.
  const [justRecorded, setJustRecorded] = useState<PartyResponse[]>([])
  const directory = useGet<PartySummaryResponse[]>('/api/parties/directory', { roleType, search: search.trim() })

  return (
    <>
      <OpHeading
        eyebrow="Hồ sơ"
        title="Nhà cung cấp, bên thu mua"
        description="Đối tác đã xác minh mới chọn được cho Lô."
        action={<OpBtn onClick={() => setRecording(true)}><Plus size={16} /> Thêm đối tác</OpBtn>}
      />

      <div className="op-toolbar">
        <OpTabs<RoleType> value={roleType} onChange={setRoleType} items={ROLE_TABS} />
        <Input className="op-toolbar__grow" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên" aria-label="Tìm đối tác" />
      </div>

      {justRecorded.length > 0 && (
        <OpPanel title="Chờ Admin xác minh">
          <OpTable
            rows={justRecorded}
            rowKey={(p) => p.partyId}
            columns={[
              { key: 'name', header: 'Đối tác', cell: (p) => <><b>{p.legalName}</b><br /><small className="rd-muted">{p.phone}</small></> },
              { key: 'role', header: 'Vai trò', cell: (p) => p.roles.map((r) => label('roleType', r.roleType)).join(', ') },
              { key: 'status', header: 'Xác minh', cell: (p) => <StatusBadge kind="verification" value={p.verificationStatus} /> },
            ]}
          />
        </OpPanel>
      )}

      <QueryView query={directory}>
        {(rows) => rows.length === 0 ? (
          <OpEmpty title={search.trim() ? 'Không tìm thấy đối tác' : 'Chưa có đối tác nào đã xác minh'}>
            <OpBtn variant="ghost" sm onClick={() => setRecording(true)}><Plus size={15} /> Thêm đối tác</OpBtn>
          </OpEmpty>
        ) : (
          <OpPanel>
            <OpTable
              rows={rows}
              rowKey={(p) => p.partyId}
              columns={[
                { key: 'name', header: 'Đối tác', cell: (p) => <><b>{p.legalName}</b><br /><small className="op-mono rd-muted">{p.partyCode}</small></> },
                { key: 'type', header: 'Loại', cell: (p) => label('partyType', p.partyType) },
                { key: 'status', header: 'Xác minh', cell: (p) => <StatusBadge kind="verification" value={p.verificationStatus} /> },
              ]}
            />
          </OpPanel>
        )}
      </QueryView>

      {recording && <RecordDialog roleType={roleType} onClose={() => setRecording(false)} onDone={(p) => setJustRecorded((old) => [p, ...old])} />}
    </>
  )
}
