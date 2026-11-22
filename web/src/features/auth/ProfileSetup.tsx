import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { KycStatusResponse, PartyDocumentResponse, PartyResponse, UpdatePartyRequest } from '../../shared/api/api.gen'
import { homePathFor, useAuthStore } from '../../shared/auth/authStore'
import { PartyDocuments } from '../../shared/party/PartyDocuments'
import { Field, Input, OpBtn, QueryView, RadioCards, errorMessage, options, useGet, useSend } from '../../shared/ui/console'
import { AccountMenu } from '../../shared/layout/SiteShell'
import { Logo, Shell } from '../../shared/ui/kit/kit'
import KycVerification from '../accounts/KycVerification'
import './profile-setup.css'

const titles = ['Thông tin hồ sơ', 'Xác minh hồ sơ', 'Thông tin liên hệ']

type HelpTopic = 'name' | 'type' | 'verification' | 'contact'

function defaultHelp(topic: HelpTopic | null) {
  return window.matchMedia('(max-width: 780px)').matches ? null : topic
}

function FieldHelp({ title, open, toggle, children }: { title: string; open: boolean; toggle: () => void; children: ReactNode }) {
  return <div className="setup-field-help">
    <button type="button" aria-label={'Hướng dẫn ' + title.toLowerCase()} aria-expanded={open} onClick={toggle}>?</button>
    {open && <aside><h3>{title}</h3>{children}</aside>}
  </div>
}

function Steps({ party }: { party: PartyResponse }) {
  const user = useAuthStore((s) => s.user)!
  const [step, setStep] = useState(0)
  const [name, setName] = useState(party.legalName)
  const [type, setType] = useState(party.partyType)
  const [number, setNumber] = useState(party.registrationNo ?? '')
  const [representative, setRepresentative] = useState(party.representative ?? user.fullName)
  const [phone, setPhone] = useState(party.phone ?? user.phone ?? '')
  const [helpTopic, setHelpTopic] = useState(() => defaultHelp('name'))
  const save = useSend<PartyResponse, UpdatePartyRequest>('put', '/api/me/party', { quietError: true })
  const org = type !== 'Individual'
  const body = { legalName: name.trim(), partyType: type, registrationNo: org ? number.trim() || null : null,
    representative: org ? representative.trim() : null, phone: phone.trim() || null }
  const legalSaved = party.partyType === type && party.legalName === body.legalName &&
    (!org || (party.registrationNo === body.registrationNo && party.representative === body.representative))
  function persist(next: number) {
    const payload = next === 3 ? { legalName: party.legalName, partyType: party.partyType,
      registrationNo: party.registrationNo, representative: party.representative, phone: body.phone } : body
    save.mutate(payload, { onSuccess: () => { if (next === 3) goTo(next) } })
  }
  const investorKyc = !org && user.roles.includes('Investor')
  const kyc = useGet<KycStatusResponse>(step === 1 && investorKyc ? '/api/me/kyc' : null)
  const documents = useGet<PartyDocumentResponse[]>(step === 1 && org && legalSaved ? '/api/me/party/documents' : null)
  const verificationReady = org
    ? party.legalDossierVerified || (party.verificationStatus === 'Pending' && !!documents.data?.length)
    : !investorKyc || kyc.data?.verificationStatus === 'Verified'
  const documentTitle = type === 'Household' ? 'Giấy chứng nhận đăng ký hộ kinh doanh'
    : type === 'Cooperative' ? 'Giấy chứng nhận đăng ký hợp tác xã' : 'Giấy chứng nhận đăng ký doanh nghiệp'

  function goTo(next: number) {
    setStep(next)
    setHelpTopic(defaultHelp(next === 0 ? 'name' : next === 1 ? (investorKyc ? 'verification' : 'type') : next === 2 ? 'contact' : null))
  }

  function help(topic: HelpTopic, title: string, content: ReactNode) {
    return <FieldHelp title={title} open={helpTopic === topic}
      toggle={() => setHelpTopic(helpTopic === topic ? null : topic)}>{content}</FieldHelp>
  }
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
        {i === 0 && <div className="setup-field">{help('name', 'Tên trên hồ sơ', <p>Nhập họ tên hoặc tên đơn vị theo giấy tờ dùng để xác minh.</p>)}<Field label="Tên trên hồ sơ" htmlFor="setup-name"><Input id="setup-name" value={name} maxLength={200} onChange={e => setName(e.target.value)} /></Field></div>}
        {i === 1 && <>
          <div className="setup-field">{help('type', 'Tư cách đăng ký', <p>Chọn cá nhân nếu đứng tên bằng giấy tờ tùy thân. Nếu có đăng ký kinh doanh, chọn loại hình ghi trên giấy chứng nhận.</p>)}<fieldset className="auth-roles"><legend>Bạn đăng ký với tư cách nào?</legend>
            <RadioCards value={type} onChange={value => { setType(value); setHelpTopic(defaultHelp(value !== 'Individual' || user.roles.includes('Investor') ? 'verification' : 'type')) }} options={options('partyType')} />
          </fieldset></div>
          {org && <div className="op-form setup-field">{!legalSaved && help('verification', documentTitle, <p>Điền thông tin theo giấy chứng nhận. Sau khi lưu, bạn có thể tải ảnh giấy tờ để gửi duyệt.</p>)}
            <Field label="Tên pháp lý" htmlFor="setup-legal"><Input id="setup-legal" value={name} maxLength={200} onChange={e => setName(e.target.value)} /></Field>
            <Field label="Mã số thuế hoặc số đăng ký" htmlFor="setup-number"><Input id="setup-number" value={number} maxLength={30} onChange={e => setNumber(e.target.value)} /></Field>
            <Field label="Người đại diện" htmlFor="setup-rep"><Input id="setup-rep" value={representative} maxLength={150} onChange={e => setRepresentative(e.target.value)} /></Field>
          </div>}
          {!legalSaved ? <OpBtn disabled={save.isPending || !name.trim() || (org && !representative.trim())} onClick={() => persist(1)}>Lưu thông tin hồ sơ</OpBtn>
            : org || investorKyc ? <div className="setup-field">
              {help('verification', org ? documentTitle : 'Xác minh danh tính', org ? <ul>
                <li>Chụp đủ các trang, giữ trọn bốn góc và tránh mờ hoặc lóa.</li>
                <li>Định dạng JPEG, PNG hoặc WebP. Tối đa 5 MB mỗi ảnh.</li>
              </ul> : <ul>
                <li>Chuẩn bị thẻ căn cước và chọn nơi đủ sáng.</li>
                <li>Dùng ứng dụng CrabShare để chụp hai mặt thẻ và ảnh khuôn mặt.</li>
                <li>Sau khi xác minh trên điện thoại, kiểm tra kết quả trên trang này.</li>
              </ul>)}
              {org ? <PartyDocuments party={party} /> : <KycVerification />}
              {org && party.verificationStatus === 'Rejected' && <p role="status">Hồ sơ bị từ chối. {party.rejectReason} Hãy gửi lại giấy tờ.</p>}
            </div> : <p>Khách hàng cá nhân có thể tiếp tục sang bước liên hệ.</p>}
        </>}
        {i === 2 && <div className="setup-field">{help('contact', 'Thông tin liên hệ', <p>Kiểm tra email tài khoản và cập nhật số điện thoại liên hệ của đối tác.</p>)}<Field label="Email tài khoản" htmlFor="setup-email"><Input id="setup-email" value={user.email} readOnly /></Field><Field label="Số điện thoại liên hệ" htmlFor="setup-phone"><Input id="setup-phone" type="tel" maxLength={15} value={phone} onChange={e => setPhone(e.target.value)} /></Field></div>}
        {save.isError && <p role="alert">{errorMessage(save.error)}</p>}
        <div className="setup-actions">
          {i > 0 && <OpBtn variant="ghost" disabled={save.isPending} onClick={() => goTo(i - 1)}>Quay lại</OpBtn>}
          {i === 0 && <OpBtn disabled={!name.trim()} onClick={() => goTo(1)}>Tiếp tục</OpBtn>}
          {i === 1 && legalSaved && <OpBtn disabled={!verificationReady} onClick={() => goTo(2)}>Tiếp tục</OpBtn>}
          {i === 2 && <OpBtn disabled={save.isPending} onClick={() => persist(3)}>Hoàn tất</OpBtn>}
        </div>
      </>}
      {step === 3 && i === 2 && <Link to={homePathFor(user)}>Vào trang chính</Link>}
    </section>
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
