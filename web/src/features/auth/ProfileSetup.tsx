import { useState } from 'react'
import { Link } from 'react-router'
import type { PartyResponse } from '../../shared/api/api.gen'
import { homePathFor, useAuthStore } from '../../shared/auth/authStore'
import { PartyDocuments } from '../../shared/party/PartyDocuments'
import { label, OpBtn, OpKv, QueryView, useGet } from '../../shared/ui/console'
import KycVerification from '../accounts/KycVerification'
import { EditForm } from '../customer/ProfilePage'
import './profile-setup.css'

const titles = ['Thông tin hồ sơ', 'Xác minh', 'Thông tin liên hệ']

export default function ProfileSetup() {
  const user = useAuthStore((state) => state.user)!
  const party = useGet<PartyResponse>('/api/me/party')
  const [step, setStep] = useState(0)
  const [editing, setEditing] = useState(false)
  return <main className="profile-setup">
    <h1>Hoàn thiện hồ sơ</h1>
    <ol aria-label="Tiến độ hoàn thiện hồ sơ">
      {titles.map((title, index) => <li key={title} aria-current={step === index ? 'step' : undefined}>{title}</li>)}
    </ol>
    <QueryView query={party}>{(p) => {
      const organization = p.partyType !== 'Individual'
      const investor = user.roles.includes('Investor')
      const help = [
        'Đối chiếu tên pháp lý với tên trên giấy đăng ký của tổ chức hoặc giấy tờ tùy thân của cá nhân.',
        organization ? 'Chụp đủ bốn góc của giấy chứng nhận. Kiểm tra chữ rõ nét, không bị lóa. Mỗi ảnh JPEG, PNG hoặc WebP tối đa 5 MB.' :
          investor ? 'Chuẩn bị giấy tờ tùy thân và chụp ảnh ở nơi đủ sáng. Cần xác minh đạt trước khi giữ chỗ góp vốn.' : 'Khách hàng cá nhân có thể tiếp tục đặt hàng mà không cần xác minh eKYC.',
        'Kiểm tra email tài khoản và số điện thoại liên hệ của đối tác.',
      ]
      return <div className="setup-columns">
        <section>
          <h2>{titles[step]}</h2>
          {step === 0 && <OpKv items={[{ label: 'Tư cách đăng ký', value: label('partyType', p.partyType) }, { label: 'Tên pháp lý', value: p.legalName }]} />}
          {step === 1 && (organization ? <PartyDocuments party={p} /> : investor ? <KycVerification /> : <p>Hồ sơ cá nhân của bạn có thể tiếp tục sang bước liên hệ.</p>)}
          {step === 2 && <OpKv items={[{ label: 'Email tài khoản', value: user.email }, { label: 'Số điện thoại liên hệ', value: p.phone || 'Chưa cung cấp' }]} />}
          {step !== 1 && <OpBtn variant="ghost" onClick={() => setEditing(true)}>Sửa hồ sơ</OpBtn>}
          <div className="setup-actions">
            {step > 0 && <OpBtn variant="ghost" onClick={() => setStep(step - 1)}>Quay lại</OpBtn>}
            {step < 2 ? <OpBtn onClick={() => setStep(step + 1)}>Tiếp tục</OpBtn> : <Link className="op-link" to={homePathFor(user)}>Vào trang chính</Link>}
          </div>
          {editing && <EditForm party={p} onClose={() => setEditing(false)} />}
        </section>
        <aside><details key={step}><summary aria-label={'Hướng dẫn ' + titles[step]}>? <span>Hướng dẫn</span></summary><p>{help[step]}</p></details><p className="setup-desktop-help">{help[step]}</p></aside>
      </div>
    }}</QueryView>
  </main>
}
