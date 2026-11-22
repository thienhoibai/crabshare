import { useState } from 'react'
import { Link } from 'react-router'
import type { KycStatusResponse, PartyDocumentResponse, PartyResponse, UpdatePartyRequest } from '../../shared/api/api.gen'
import { homePathFor, useAuthStore } from '../../shared/auth/authStore'
import { PartyDocuments } from '../../shared/party/PartyDocuments'
import { Field, Input, OpBtn, QueryView, RadioCards, errorMessage, options, useGet, useSend } from '../../shared/ui/console'
import KycVerification from '../accounts/KycVerification'
import './profile-setup.css'

const titles = ['Thông tin hồ sơ', 'Xác minh hồ sơ', 'Thông tin liên hệ']

function Steps({ party }: { party: PartyResponse }) {
  const user = useAuthStore((s) => s.user)!
  const [step, setStep] = useState(0)
  const [name, setName] = useState(party.legalName)
  const [type, setType] = useState(party.partyType)
  const [number, setNumber] = useState(party.registrationNo ?? '')
  const [representative, setRepresentative] = useState(party.representative ?? user.fullName)
  const [phone, setPhone] = useState(party.phone ?? user.phone ?? '')
  const [saved, setSaved] = useState(party)
  const save = useSend<PartyResponse, UpdatePartyRequest>('put', '/api/me/party', { quietError: true })
  const org = type !== 'Individual'
  const body = { legalName: name.trim(), partyType: type, registrationNo: org ? number.trim() || null : null,
    representative: org ? representative.trim() : null, phone: phone.trim() || null }
  const legalSaved = saved.partyType === type && saved.legalName === body.legalName &&
    (!org || (saved.registrationNo === body.registrationNo && saved.representative === body.representative))
  function persist(next: number) {
    save.mutate(body, { onSuccess: (result) => { setSaved(result); setStep(next) } })
  }
  const investorKyc = !org && user.roles.includes('Investor')
  const kyc = useGet<KycStatusResponse>(step === 1 && investorKyc ? '/api/me/kyc' : null)
  const documents = useGet<PartyDocumentResponse[]>(step === 1 && org && legalSaved ? '/api/me/party/documents' : null)
  const verificationReady = org ? saved.legalDossierVerified || !!documents.data?.length :
    !investorKyc || kyc.data?.verificationStatus === 'Verified'
  const help = ['Nhập họ tên hoặc tên đơn vị theo giấy tờ dùng để xác minh.',
    org ? 'Điền đúng tên trên giấy đăng ký. Lưu thông tin rồi gửi ảnh rõ chữ, đủ bốn góc để quản trị viên đối chiếu.' : 'Chọn tư cách của người đứng tên hồ sơ. Nhà đầu tư cá nhân cần xác minh danh tính trước khi giữ chỗ góp vốn.',
    'Kiểm tra email tài khoản và số điện thoại để CrabShare có thể liên hệ với bạn.']
  return <ol className="setup-steps">{titles.map((title, i) => <li key={title} aria-current={i === step ? 'step' : undefined}>
    <span className="setup-marker" aria-label={i < step ? 'Đã hoàn tất bước' : undefined}>{i < step ? '✓' : i + 1}</span>
    <section className="setup-card" data-locked={i > step || undefined} aria-disabled={i > step || undefined}>
      <h2>{title}</h2>
      {i > step && <fieldset disabled className="setup-preview">
        {i === 1 && <><legend>Bạn đăng ký với tư cách nào?</legend>
          <RadioCards value={null} onChange={() => {}} options={options('partyType')} /></>}
        {i === 2 && <><Field label="Email tài khoản" htmlFor="preview-email"><Input id="preview-email" value={user.email} readOnly /></Field>
          <Field label="Số điện thoại liên hệ" htmlFor="preview-phone"><Input id="preview-phone" value={phone} readOnly /></Field></>}
      </fieldset>}
      {i < step && <p>{[name, options('partyType').find(o => o.value === type)?.label, phone || user.email][i]}</p>}
      {i === step && <>
        <details className="setup-help"><summary aria-label={'Hướng dẫn ' + title}>?</summary><p>{help[i]}</p></details>
        {i === 0 && <Field label="Tên trên hồ sơ" htmlFor="setup-name"><Input id="setup-name" value={name} maxLength={200} onChange={e => setName(e.target.value)} /></Field>}
        {i === 1 && <>
          <fieldset className="auth-roles"><legend>Bạn đăng ký với tư cách nào?</legend>
            <RadioCards value={type} onChange={setType} options={options('partyType')} />
          </fieldset>
          {org && <div className="op-form">
            <Field label="Tên pháp lý" htmlFor="setup-legal"><Input id="setup-legal" value={name} maxLength={200} onChange={e => setName(e.target.value)} /></Field>
            <Field label="Mã số thuế hoặc số đăng ký" htmlFor="setup-number"><Input id="setup-number" value={number} maxLength={30} onChange={e => setNumber(e.target.value)} /></Field>
            <Field label="Người đại diện" htmlFor="setup-rep"><Input id="setup-rep" value={representative} maxLength={150} onChange={e => setRepresentative(e.target.value)} /></Field>
          </div>}
          {!legalSaved ? <OpBtn disabled={save.isPending || !name.trim() || (org && !representative.trim())} onClick={() => persist(1)}>Lưu thông tin hồ sơ</OpBtn>
            : org ? <PartyDocuments party={saved} /> : user.roles.includes('Investor') ? <KycVerification /> : <p>Khách hàng cá nhân có thể tiếp tục sang bước liên hệ.</p>}
        </>}
        {i === 2 && <><p>Email tài khoản · {user.email}</p><Field label="Số điện thoại liên hệ" htmlFor="setup-phone"><Input id="setup-phone" type="tel" maxLength={15} value={phone} onChange={e => setPhone(e.target.value)} /></Field></>}
        {save.isError && <p role="alert">{errorMessage(save.error)}</p>}
        <div className="setup-actions">
          {i > 0 && <OpBtn variant="ghost" disabled={save.isPending} onClick={() => setStep(i - 1)}>Quay lại</OpBtn>}
          {i === 0 && <OpBtn disabled={!name.trim()} onClick={() => setStep(1)}>Tiếp tục</OpBtn>}
          {i === 1 && legalSaved && <OpBtn disabled={!verificationReady} onClick={() => setStep(2)}>Tiếp tục</OpBtn>}
          {i === 2 && <OpBtn disabled={save.isPending} onClick={() => persist(3)}>Hoàn tất</OpBtn>}
        </div>
      </>}
      {step === 3 && i === 2 && <Link to={homePathFor(user)}>Vào trang chính</Link>}
    </section>
    {step === i && <aside>{help[i]}</aside>}
  </li>)}</ol>
}

export default function ProfileSetup() {
  const party = useGet<PartyResponse>('/api/me/party')
  return <div className="profile-setup"><h1>Hoàn thiện hồ sơ</h1>
    <QueryView query={party}>{p => <Steps key={p.partyId} party={p} />}</QueryView>
  </div>
}
