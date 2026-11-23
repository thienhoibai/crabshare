import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { KycStatusResponse, PartyDocumentResponse, PartyResponse, UpdatePartyRequest } from '../../shared/api/api.gen'
import { homePathFor, useAuthStore } from '../../shared/auth/authStore'
import { PartyDocuments } from '../../shared/party/PartyDocuments'
import { Field, Input, OpBtn, QueryView, RadioCards, errorMessage, options, useGet, useSend } from '../../shared/ui/console'
import { AccountMenu } from '../../shared/layout/SiteShell'
import { Logo, Shell } from '../../shared/ui/kit/kit'
import KycVerification from '../accounts/KycVerification'
import PartyVerificationGuide, { organizationGuides } from './PartyVerificationGuide'
import './profile-setup.css'

const titles = ['Thông tin hồ sơ', 'Xác minh hồ sơ', 'Thông tin liên hệ']

function FieldHelp({ title, children }: { title: string; children: ReactNode }) {
  return <aside className="setup-field-help"><h3>{title}</h3>{children}</aside>
}

function Steps({ party }: { party: PartyResponse }) {
  const user = useAuthStore((s) => s.user)!
  const [step, setStep] = useState(0)
  const [name, setName] = useState(party.legalName)
  const [type, setType] = useState(party.partyType)
  const [number, setNumber] = useState(party.registrationNo ?? '')
  const [representative, setRepresentative] = useState(party.representative ?? user.fullName)
  const [phone, setPhone] = useState(party.phone ?? user.phone ?? '')
  const save = useSend<PartyResponse, UpdatePartyRequest>('put', '/api/me/party', { quietError: true })
  const org = type !== 'Individual'
  const certificate = organizationGuides[type as keyof typeof organizationGuides]?.document
  const body = { legalName: name.trim(), partyType: type, registrationNo: org ? number.trim() || null : null,
    representative: org ? representative.trim() : null, phone: phone.trim() || null }
  const legalSaved = party.partyType === type && party.legalName === body.legalName &&
    (!org || (party.registrationNo === body.registrationNo && party.representative === body.representative))
  function persist(next: number) {
    const payload = next === 3 ? { legalName: party.legalName, partyType: party.partyType,
      registrationNo: party.registrationNo, representative: party.representative, phone: body.phone, completeCustomerProfile: user.customerProfileRequired } : body
    save.mutate(payload, {
      onSuccess: () => {
        if (next !== 3) return
        useAuthStore.setState(({ user: current }) => current?.userId === user.userId
          ? { user: { ...current, customerProfileRequired: false } }
          : {})
        setStep(next)
      },
    })
  }
  const investorKyc = !org && user.roles.includes('Investor')
  const kyc = useGet<KycStatusResponse>(step === 1 && investorKyc ? '/api/me/kyc' : null)
  const documents = useGet<PartyDocumentResponse[]>(step === 1 && org && legalSaved ? '/api/me/party/documents' : null)
  const verificationReady = org
    ? party.legalDossierVerified || (party.verificationStatus === 'Pending' && !!documents.data?.length)
    : !investorKyc || kyc.data?.verificationStatus === 'Verified'

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
      {i === 0 && i < step && <Field label="Tên trên hồ sơ" htmlFor="setup-name-completed"><Input id="setup-name-completed" value={name} readOnly /></Field>}
      {i > 0 && i < step && <p>{i === 1 ? options('partyType').find(o => o.value === type)?.label : phone || user.email}</p>}
      {i === step && <>
        {i === 0 && <div className="setup-field"><FieldHelp title="Tên trên hồ sơ"><p>Nhập họ tên hoặc tên đơn vị theo giấy tờ dùng để xác minh.</p></FieldHelp><Field label="Tên trên hồ sơ" htmlFor="setup-name"><Input id="setup-name" value={name} maxLength={200} onChange={e => setName(e.target.value)} /></Field></div>}
        {i === 1 && <>
          <div className="setup-field"><fieldset className="auth-roles"><legend>Bạn đăng ký với tư cách nào?</legend>
            <RadioCards value={type} onChange={setType} options={options('partyType')} />
          </fieldset></div>
          {org && <div className="op-form setup-field">
            <Field label="Tên pháp lý" htmlFor="setup-legal"><Input id="setup-legal" value={name} maxLength={200} onChange={e => setName(e.target.value)} /></Field>
            <Field label="Mã số thuế hoặc số đăng ký" htmlFor="setup-number"><Input id="setup-number" value={number} maxLength={30} onChange={e => setNumber(e.target.value)} /></Field>
            <Field label="Người đại diện" htmlFor="setup-rep"><Input id="setup-rep" value={representative} maxLength={150} onChange={e => setRepresentative(e.target.value)} /></Field>
          </div>}
          {org ? <div className="setup-field">
            <PartyDocuments key={type} party={party} title={certificate} draft={legalSaved ? undefined : {
              canSave: !save.isPending && !!body.legalName && !!body.representative,
              save: () => save.mutateAsync(body),
            }} />
            {legalSaved && party.verificationStatus === 'Rejected' && <p role="status">Hồ sơ bị từ chối. {party.rejectReason} Hãy gửi lại giấy tờ.</p>}
          </div> : !legalSaved ? <OpBtn disabled={save.isPending || !name.trim()} onClick={() => persist(1)}>Lưu thông tin hồ sơ</OpBtn>
            : investorKyc ? <KycVerification /> : <p>Khách hàng cá nhân có thể tiếp tục sang bước liên hệ.</p>}
        </>}
        {i === 2 && <div className="setup-field"><FieldHelp title="Thông tin liên hệ"><p>Kiểm tra email tài khoản và cập nhật số điện thoại liên hệ của đối tác.</p></FieldHelp><Field label="Email tài khoản" htmlFor="setup-email"><Input id="setup-email" value={user.email} readOnly /></Field><Field label="Số điện thoại liên hệ" htmlFor="setup-phone"><Input id="setup-phone" type="tel" maxLength={15} value={phone} onChange={e => setPhone(e.target.value)} /></Field></div>}
        {save.isError && !(i === 1 && org) && <p role="alert">{errorMessage(save.error)}</p>}
        <div className="setup-actions">
          {i > 0 && <OpBtn variant="ghost" disabled={save.isPending} onClick={() => setStep(i - 1)}>Quay lại</OpBtn>}
          {i === 0 && <OpBtn disabled={!name.trim()} onClick={() => setStep(1)}>Tiếp tục</OpBtn>}
          {i === 1 && legalSaved && <OpBtn disabled={!verificationReady} onClick={() => setStep(2)}>Tiếp tục</OpBtn>}
          {i === 2 && <OpBtn disabled={save.isPending} onClick={() => persist(3)}>Hoàn tất</OpBtn>}
        </div>
      </>}
      {step === 3 && i === 2 && <Link to={homePathFor(user)}>Vào trang chính</Link>}
    </section>
    {i === 1 && step === i && <PartyVerificationGuide type={type} investor={investorKyc} />}
  </li>)}</ol>
}

export default function ProfileSetup() {
  const party = useGet<PartyResponse>('/api/me/party')
  return <Shell theme="light">
    <div className="setup-workspace">
      <header className="setup-header">
        <div className="setup-header-inner">
          <Logo />
          <h1>Hoàn thiện hồ sơ</h1>
          <AccountMenu />
        </div>
      </header>
      <main className="profile-setup">
        <QueryView query={party}>{p => <Steps key={p.partyId} party={p} />}</QueryView>
      </main>
    </div>
  </Shell>
}
