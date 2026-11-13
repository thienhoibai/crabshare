/* /nha-dau-tu/ho-so — Ba mục, mỗi lúc một mục (?tab=): xác minh danh tính eKYC, tài khoản nhận tiền, hồ sơ đối tác (GET / PUT /api/me/party).
   Chưa xác minh thì mở sẵn mục xác minh. Đổi tên pháp lý, loại đối tác hoặc mã số đăng ký của hồ sơ đã xác minh thì hồ sơ phải
   xác minh lại (BR-013), nên có bước xác nhận. */
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import type { KycStatusResponse, PartyResponse, UpdatePartyRequest } from '../../shared/api/api.gen'
import KycVerification from '../accounts/KycVerification'
import PayoutAccountForm from '../accounts/PayoutAccountForm'
import {
  Field, Input, OpBadge, OpBtn, OpConfirm, OpHeading, OpKv, OpLoading, OpMore, OpNote, OpPanel, OpTabs, QueryView, Select, StatusBadge, errorMessage, label,
  options, useGet, useSend,
} from '../../shared/ui/console'

type Tab = 'xac-minh' | 'tai-khoan' | 'ho-so'
const TABS: { key: Tab; label: string }[] = [
  { key: 'xac-minh', label: 'Xác minh danh tính' },
  { key: 'tai-khoan', label: 'Tài khoản nhận tiền' },
  { key: 'ho-so', label: 'Hồ sơ đối tác' },
]

const clean = (text: string) => text.trim() || null

function PartyForm({ party }: { party: PartyResponse }) {
  const [legalName, setLegalName] = useState(party.legalName)
  const [partyType, setPartyType] = useState(party.partyType)
  const [registrationNo, setRegistrationNo] = useState(party.registrationNo ?? '')
  const [representative, setRepresentative] = useState(party.representative ?? '')
  const [phone, setPhone] = useState(party.phone ?? '')
  const [confirming, setConfirming] = useState(false)
  const save = useSend<PartyResponse, UpdatePartyRequest>('put', '/api/me/party', {
    success: 'Đã lưu hồ sơ.',
    quietError: true,
    onSuccess: () => setConfirming(false),
  })

  const organisation = partyType !== 'Individual'
  const body: UpdatePartyRequest = { legalName: legalName.trim(), partyType, registrationNo: clean(registrationNo), representative: clean(representative), phone: clean(phone) }
  const legalChanged = body.legalName !== party.legalName || partyType !== party.partyType || body.registrationNo !== (party.registrationNo ?? null)
  const valid = body.legalName.length > 0 && (!organisation || !!body.representative)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!valid || save.isPending) return
    save.reset()
    if (legalChanged && party.verificationStatus === 'Verified') setConfirming(true)
    else save.mutate(body)
  }

  return (
    <>
      <div className="op-inline">
        <StatusBadge kind="verification" value={party.verificationStatus} />
        {party.roles.map((r) => <OpBadge key={r.roleType}>{label('roleType', r.roleType)}</OpBadge>)}
      </div>
      {party.rejectReason && <OpNote tone="danger">Hồ sơ bị từ chối: {party.rejectReason}</OpNote>}

      <form className="op-form" onSubmit={submit}>
        <div className="op-form__row">
          <Field label="Tên pháp lý" required>
            <Input value={legalName} maxLength={200} onChange={(e) => setLegalName(e.target.value)} />
          </Field>
          <Field label="Loại đối tác">
            <Select value={partyType} onChange={(e) => setPartyType(e.target.value)}>
              {options('partyType').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
        </div>
        {organisation && (
          <Field label="Người đại diện" required>
            <Input value={representative} maxLength={150} onChange={(e) => setRepresentative(e.target.value)} />
          </Field>
        )}
        <OpMore label="Tuỳ chọn thêm">
          <div className="op-form__row">
            <Field label="Số điện thoại">
              <Input value={phone} maxLength={15} inputMode="tel" autoComplete="tel" onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Mã số thuế hoặc số đăng ký">
              <Input value={registrationNo} maxLength={30} onChange={(e) => setRegistrationNo(e.target.value)} />
            </Field>
            {!organisation && (
              <Field label="Người đại diện">
                <Input value={representative} maxLength={150} onChange={(e) => setRepresentative(e.target.value)} />
              </Field>
            )}
          </div>
          <OpKv items={[{ label: 'Mã đối tác', value: <span className="op-mono">{party.partyCode}</span> }]} />
        </OpMore>
        {save.isError && !confirming && <OpNote tone="danger">{errorMessage(save.error)}</OpNote>}
        <div className="op-formfoot">
          <OpBtn type="submit" disabled={!valid || save.isPending}>{save.isPending ? 'Đang lưu…' : 'Lưu hồ sơ'}</OpBtn>
        </div>
      </form>

      {confirming && (
        <OpConfirm
          title="Đổi thông tin pháp lý"
          confirmLabel="Lưu và xác minh lại"
          pending={save.isPending}
          error={save.error}
          onConfirm={() => save.mutate(body)}
          onClose={() => setConfirming(false)}
        >
          <p className="rd-muted">Hồ sơ đang ở trạng thái đã xác minh. Sau khi lưu, hồ sơ phải chờ Admin xác minh lại.</p>
        </OpConfirm>
      )}
    </>
  )
}

export default function ProfilePage() {
  const [params, setParams] = useSearchParams()
  const party = useGet<PartyResponse>('/api/me/party')
  const kyc = useGet<KycStatusResponse>('/api/me/kyc')
  const asked = TABS.find((t) => t.key === params.get('tab'))?.key
  // Chưa chọn mục: người chưa xác minh vào thẳng mục xác minh, người đã xác minh vào tài khoản nhận tiền.
  const tab = asked ?? (kyc.data && kyc.data.verificationStatus !== 'Verified' ? 'xac-minh' : 'tai-khoan')

  if (!asked && kyc.isPending) return <><OpHeading eyebrow="Giấy tờ và tiền" title="Hồ sơ và xác minh" /><OpLoading /></>

  return (
    <>
      <OpHeading eyebrow="Giấy tờ và tiền" title="Hồ sơ và xác minh" />
      <OpTabs<Tab> items={TABS} value={tab} onChange={(key) => setParams({ tab: key }, { replace: true })} label="Các mục của hồ sơ" />

      {tab === 'xac-minh' && <OpPanel title="Xác minh danh tính"><KycVerification /></OpPanel>}
      {tab === 'tai-khoan' && <OpPanel title="Tài khoản nhận tiền"><PayoutAccountForm owner="Investor" /></OpPanel>}
      {tab === 'ho-so' && (
        <OpPanel title="Hồ sơ đối tác">
          <QueryView query={party}>{(p) => <PartyForm key={`${p.partyId}-${p.legalName}-${p.verificationStatus}`} party={p} />}</QueryView>
        </OpPanel>
      )}
    </>
  )
}
